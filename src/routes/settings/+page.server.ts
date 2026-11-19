import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { LLM_BASE_URL, LLM_MODEL, SOURCE_CODE_URL } from '$app/env/private';
import {
	invalidateUserSessions,
	MIN_PASSWORD_LENGTH,
	randomToken,
	verifyPassword
} from '#lib/server/auth.ts';
import {
	DuplicateEmailError,
	countActiveAdmins,
	createUser,
	getPasswordHash,
	getUser,
	listUsers,
	regenerateCalendarToken,
	setActive,
	setPassword,
	setRole,
	updateProfile
} from '#lib/server/users.ts';
import { getSettings, saveSettings } from '#lib/server/settings.ts';
import { isEmail, isUuid, str } from '#lib/server/forms.ts';
import { isValidTimeZone } from '#lib/deadlines/dates.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	const isAdmin = locals.user!.role === 'admin';
	const [me, settings, team] = await Promise.all([
		getUser(locals.user!.id),
		getSettings(),
		isAdmin ? listUsers() : Promise.resolve([])
	]);
	return {
		title: 'Settings',
		me,
		settings,
		team,
		isAdmin,
		calendarUrl: new URL(`/calendar/${locals.user!.calendarToken}.ics`, url).href,
		sourceUrl: SOURCE_CODE_URL,
		llm: LLM_BASE_URL ? { model: LLM_MODEL, host: new URL(LLM_BASE_URL).host } : null
	};
};

function admin(locals: App.Locals) {
	return locals.user?.role === 'admin';
}

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		const form = await request.formData();
		const name = str(form, 'name', 120);
		const email = str(form, 'email', 200);
		if (!name) return fail(400, { section: 'profile', message: 'Enter your name.' });
		if (!isEmail(email)) return fail(400, { section: 'profile', message: 'Enter a valid email.' });
		try {
			await updateProfile(locals.user!.id, { name, email, phone: str(form, 'phone', 60) || null });
		} catch (err) {
			if (err instanceof DuplicateEmailError)
				return fail(400, { section: 'profile', message: err.message });
			throw err;
		}
		return { section: 'profile', saved: 'Profile saved' };
	},
	password: async ({ request, locals }) => {
		const form = await request.formData();
		const current = str(form, 'current', 200);
		const next = str(form, 'next', 200);
		const hash = await getPasswordHash(locals.user!.id);
		if (!hash || !(await verifyPassword(current, hash)))
			return fail(400, { section: 'password', message: 'Your current password is wrong.' });
		if (next.length < MIN_PASSWORD_LENGTH)
			return fail(400, {
				section: 'password',
				message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`
			});
		await setPassword(locals.user!.id, next);
		await invalidateUserSessions(locals.user!.id, locals.sessionId ?? undefined);
		return { section: 'password', saved: 'Password changed. Other devices were signed out.' };
	},
	calendar: async ({ locals }) => {
		await regenerateCalendarToken(locals.user!.id);
		return {
			section: 'calendar',
			saved: 'New calendar link created. The old one no longer works.'
		};
	},
	local: async ({ request, locals }) => {
		if (!admin(locals)) return fail(403, { section: 'local', message: 'Admins only.' });
		const form = await request.formData();
		const localName = str(form, 'localName', 120);
		const timezone = str(form, 'timezone', 64);
		if (!localName) return fail(400, { section: 'local', message: 'The local needs a name.' });
		if (!isValidTimeZone(timezone))
			return fail(400, { section: 'local', message: 'Choose a valid timezone.' });
		await saveSettings({ localName, unionName: str(form, 'unionName', 160), timezone });
		return { section: 'local', saved: 'Local settings saved' };
	},
	addUser: async ({ request, locals }) => {
		if (!admin(locals)) return fail(403, { section: 'team', message: 'Admins only.' });
		const form = await request.formData();
		const name = str(form, 'name', 120);
		const email = str(form, 'email', 200);
		const role = str(form, 'role') === 'admin' ? 'admin' : 'steward';
		if (!name || !isEmail(email))
			return fail(400, { section: 'team', message: 'Enter a name and a valid email.' });
		const password = randomToken(9);
		try {
			await createUser({ name, email, password, role, phone: str(form, 'phone', 60) || null });
		} catch (err) {
			if (err instanceof DuplicateEmailError)
				return fail(400, { section: 'team', message: err.message });
			throw err;
		}
		return {
			section: 'team',
			saved: `${name} can now sign in.`,
			tempPassword: { email, password }
		};
	},
	resetPassword: async ({ request, locals }) => {
		if (!admin(locals)) return fail(403, { section: 'team', message: 'Admins only.' });
		const userId = str(await request.formData(), 'userId');
		const user = isUuid(userId) ? await getUser(userId) : null;
		if (!user) return fail(404, { section: 'team', message: 'Unknown user.' });
		const password = randomToken(9);
		await setPassword(user.id, password);
		await invalidateUserSessions(user.id);
		return {
			section: 'team',
			saved: `Password reset for ${user.name}.`,
			tempPassword: { email: user.email, password }
		};
	},
	toggleActive: async ({ request, locals }) => {
		if (!admin(locals)) return fail(403, { section: 'team', message: 'Admins only.' });
		const userId = str(await request.formData(), 'userId');
		const user = isUuid(userId) ? await getUser(userId) : null;
		if (!user) return fail(404, { section: 'team', message: 'Unknown user.' });
		if (user.id === locals.user!.id)
			return fail(400, { section: 'team', message: 'You can’t deactivate yourself.' });
		if (user.active && user.role === 'admin' && (await countActiveAdmins()) <= 1) {
			return fail(400, { section: 'team', message: 'Keep at least one active admin.' });
		}
		await setActive(user.id, !user.active);
		if (user.active) await invalidateUserSessions(user.id);
		return {
			section: 'team',
			saved: user.active
				? `${user.name} deactivated. Their cases stay with the local.`
				: `${user.name} reactivated.`
		};
	},
	toggleRole: async ({ request, locals }) => {
		if (!admin(locals)) return fail(403, { section: 'team', message: 'Admins only.' });
		const userId = str(await request.formData(), 'userId');
		const user = isUuid(userId) ? await getUser(userId) : null;
		if (!user) return fail(404, { section: 'team', message: 'Unknown user.' });
		if (user.role === 'admin' && (await countActiveAdmins()) <= 1)
			return fail(400, { section: 'team', message: 'Keep at least one admin.' });
		await setRole(user.id, user.role === 'admin' ? 'steward' : 'admin');
		return {
			section: 'team',
			saved: `${user.name} is now ${user.role === 'admin' ? 'a steward' : 'an admin'}.`
		};
	}
};
