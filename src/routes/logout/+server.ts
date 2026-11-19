import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { invalidateSession } from '#lib/server/auth.ts';
import { clearSessionCookie } from '#lib/server/session-cookie.ts';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.sessionId) await invalidateSession(locals.sessionId);
	clearSessionCookie(cookies);
	redirect(303, '/login');
};
