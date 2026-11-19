import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCase, updateCase } from '#lib/server/cases.ts';
import { listArticles } from '#lib/server/contracts.ts';
import { readCaseForm } from '#lib/server/case-form.ts';
import { isUuid } from '#lib/server/forms.ts';

export const load: PageServerLoad = async ({ params, parent }) => {
	if (!isUuid(params.id)) error(404, 'Case not found');
	const { today } = await parent();
	const c = await getCase(params.id, today);
	if (!c) error(404, 'Case not found');
	return {
		title: `Edit ${c.number}`,
		case: {
			id: c.id,
			number: c.number,
			title: c.title,
			grievantName: c.grievantName,
			grievantContact: c.grievantContact,
			department: c.department,
			supervisor: c.supervisor,
			incidentDate: c.incidentDate,
			awareDate: c.awareDate,
			summary: c.summary,
			remedy: c.remedy,
			articles: c.articles.map((a) => ({ id: a.id, note: a.note }))
		},
		articles: await listArticles(c.contractId)
	};
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		const { values, errors } = readCaseForm(await request.formData());
		if (Object.keys(errors).length) return fail(400, { values, errors });
		const { contractId: _c, stewardId: _s, ...rest } = values;
		void _c;
		void _s;
		await updateCase(params.id, rest, locals.user!.id);
		redirect(303, `/cases/${params.id}`);
	}
};
