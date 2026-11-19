import type { LayoutServerLoad } from './$types';
import { getSettings, today } from '#lib/server/settings.ts';

export const load: LayoutServerLoad = async ({ locals }) => {
	const settings = locals.user ? await getSettings() : null;
	return {
		user: locals.user
			? {
					id: locals.user.id,
					name: locals.user.name,
					email: locals.user.email,
					role: locals.user.role
				}
			: null,
		localName: settings?.localName ?? 'Stewardbook',
		today: await today()
	};
};
