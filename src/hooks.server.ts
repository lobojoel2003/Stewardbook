import path from 'node:path';
import { json, redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { DATABASE_URL, DEFAULT_TIMEZONE, MIGRATE_ON_START } from '$app/env/private';
import { connect, runMigrations } from '#lib/server/db/index.ts';
import { SESSION_COOKIE, validateSession } from '#lib/server/auth.ts';
import { countUsers } from '#lib/server/users.ts';
import { setFallbackTimezone } from '#lib/server/settings.ts';

export const init: ServerInit = async () => {
	if (building) return;
	connect(DATABASE_URL);
	setFallbackTimezone(DEFAULT_TIMEZONE);
	if (MIGRATE_ON_START) {
		await runMigrations(path.resolve(process.env.MIGRATIONS_DIR ?? 'drizzle'));
	}
};

/** Routes that work without signing in. */
function isPublic(pathname: string): boolean {
	return (
		pathname === '/login' ||
		pathname === '/setup' ||
		pathname === '/healthz' ||
		pathname.startsWith('/calendar/') ||
		pathname.startsWith('/_app/')
	);
}

/** Cached once true: after first-run setup there is always at least one user. */
let hasUsers = false;

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.sessionId = null;
	const { pathname } = event.url;

	if (pathname !== '/healthz' && !hasUsers) {
		hasUsers = (await countUsers()) > 0;
		if (!hasUsers && pathname !== '/setup') redirect(303, '/setup');
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = await validateSession(token);
		if (session) {
			event.locals.user = session.user;
			event.locals.sessionId = session.sessionId;
			if (session.renewedExpiry) {
				event.cookies.set(SESSION_COOKIE, token, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure: event.url.protocol === 'https:',
					expires: session.renewedExpiry
				});
			}
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	if (!event.locals.user && !isPublic(pathname)) {
		if (pathname.startsWith('/api/') || pathname.startsWith('/attachments/')) {
			return json({ message: 'Sign in required' }, { status: 401 });
		}
		const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + event.url.search)}`;
		redirect(303, `/login${next}`);
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
	if (event.locals.user && !response.headers.has('cache-control')) {
		response.headers.set('Cache-Control', 'private, no-cache');
	}
	return response;
};

export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind === 'unknown') {
		console.error(`[stewardbook] ${event.request.method} ${event.url.pathname}`, error);
		return { message: 'Something went wrong on our side. The error has been logged.' };
	}
};
