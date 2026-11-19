import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSession, hashPassword, loginThrottle, verifyPassword } from '#lib/server/auth.ts';
import { findUserForLogin, normalizeEmail } from '#lib/server/users.ts';
import { safeNext, setSessionCookie } from '#lib/server/session-cookie.ts';
import { str } from '#lib/server/forms.ts';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	return { title: 'Sign in' };
};

// Compare against a real hash so unknown emails take as long to reject as wrong passwords.
let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ??= hashPassword('stewardbook-timing-equalizer'));

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const email = normalizeEmail(str(form, 'email', 200));
		const password = str(form, 'password', 200);
		const keys = [`ip:${getClientAddress()}`, `email:${email}`];
		if (keys.some((k) => loginThrottle.blocked(k))) {
			return fail(429, { email, message: 'Too many attempts. Wait 15 minutes and try again.' });
		}
		const user = email ? await findUserForLogin(email) : null;
		const ok = await verifyPassword(password, user?.passwordHash ?? (await dummy()));
		if (!user || !ok || !user.active) {
			keys.forEach((k) => loginThrottle.fail(k));
			return fail(400, {
				email,
				message:
					user && ok && !user.active
						? 'This account has been deactivated.'
						: 'That email and password don’t match.'
			});
		}
		keys.forEach((k) => loginThrottle.reset(k));
		const session = await createSession(user.id, request.headers.get('user-agent'));
		setSessionCookie(cookies, url, session.token, session.expiresAt);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
