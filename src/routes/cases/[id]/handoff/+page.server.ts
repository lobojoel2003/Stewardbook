import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { CaseError, getCase, handoffCase } from '#lib/server/cases.ts';
import { listActiveStewards } from '#lib/server/users.ts';
import { isUuid, str } from '#lib/server/forms.ts';

export const load: PageServerLoad = async ({ params, parent }) => {
	if (!isUuid(params.id)) error(404, 'Case not found');
	const { today } = await parent();
	const c = await getCase(params.id, today);
	if (!c) error(404, 'Case not found');
	return {
		title: `Hand off ${c.number}`,
		case: c,
		stewards: (await listActiveStewards()).filter((s) => s.id !== c.steward?.id)
	};
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		const form = await request.formData();
		const toUserId = str(form, 'toUserId');
		const notes = str(form, 'notes', 20_000);
		if (!isUuid(toUserId)) return fail(400, { notes, message: 'Choose who is taking the case.' });
		try {
			await handoffCase(params.id, { toUserId, notes }, locals.user!.id);
		} catch (err) {
			if (err instanceof CaseError) return fail(400, { notes, message: err.message });
			throw err;
		}
		redirect(303, `/cases/${params.id}/packet?handoff=1`);
	}
};
