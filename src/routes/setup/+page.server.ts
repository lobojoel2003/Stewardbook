import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { DEFAULT_TIMEZONE } from '$app/env/private';
import { countUsers, createUser } from '#lib/server/users.ts';
import { createSession, MIN_PASSWORD_LENGTH } from '#lib/server/auth.ts';
import { saveSettings } from '#lib/server/settings.ts';
import { setSessionCookie } from '#lib/server/session-cookie.ts';
import { isEmail, str } from '#lib/server/forms.ts';
import { isValidTimeZone } from '#lib/deadlines/dates.ts';

export const load: PageServerLoad = async () => {
	if ((await countUsers()) > 0) redirect(303, '/login');
	return { title: 'Set up', defaultTimezone: DEFAULT_TIMEZONE };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		if ((await countUsers()) > 0) redirect(303, '/login');
		const form = await request.formData();
		const values = {
			localName: str(form, 'localName', 120),
			unionName: str(form, 'unionName', 160),
			timezone: str(form, 'timezone', 64),
			name: str(form, 'name', 120),
			email: str(form, 'email', 200)
		};
		const password = str(form, 'password', 200);
		const errors: Record<string, string> = {};
		if (!values.localName) errors.localName = 'Give your local a name, e.g. "Local 512".';
		if (!values.name) errors.name = 'Enter your name.';
		if (!isEmail(values.email)) errors.email = 'Enter a valid email address.';
		if (password.length < MIN_PASSWORD_LENGTH)
			errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
		if (!isValidTimeZone(values.timezone)) errors.timezone = 'Choose a timezone from the list.';
		if (Object.keys(errors).length) return fail(400, { values, errors });

		await saveSettings({
			localName: values.localName,
			unionName: values.unionName,
			timezone: values.timezone
		});
		const user = await createUser({
			email: values.email,
			name: values.name,
			password,
			role: 'admin'
		});
		const session = await createSession(user.id, request.headers.get('user-agent'));
		setSessionCookie(cookies, url, session.token, session.expiresAt);
		redirect(303, '/contracts/new?welcome=1');
	}
};
