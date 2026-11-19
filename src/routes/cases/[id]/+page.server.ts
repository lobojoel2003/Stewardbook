import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { MAX_UPLOAD_MB } from '$app/env/private';
import {
	CaseError,
	adjustStepStart,
	closeCase,
	completeStep,
	deleteCase,
	extendStep,
	getCase,
	reopenCase,
	undoLastStep
} from '#lib/server/cases.ts';
import { deleteEntry } from '#lib/server/timeline.ts';
import { isUuid, optionalDate, str } from '#lib/server/forms.ts';
import { OUTCOMES, type Outcome } from '#lib/labels.ts';
import type { StepCompletion } from '#lib/deadlines/chain.ts';

export const load: PageServerLoad = async ({ params, parent, url }) => {
	if (!isUuid(params.id)) error(404, 'Case not found');
	const { today } = await parent();
	const detail = await getCase(params.id, today);
	if (!detail) error(404, 'Case not found');
	return {
		title: `${detail.number} · ${detail.title}`,
		case: detail,
		created: url.searchParams.has('created'),
		maxUploadMb: MAX_UPLOAD_MB
	};
};

async function guard<T>(fn: () => Promise<T>) {
	try {
		await fn();
		return { ok: true };
	} catch (err) {
		if (err instanceof CaseError) return fail(400, { message: err.message });
		throw err;
	}
}

export const actions: Actions = {
	complete: async ({ request, params, locals }) => {
		const form = await request.formData();
		const stepId = str(form, 'stepId');
		const completion = str(form, 'completion') as StepCompletion;
		const date = optionalDate(form, 'date');
		if (!isUuid(stepId) || !['done', 'no_response', 'skipped'].includes(completion))
			return fail(400, { message: 'Unknown step.' });
		if (!date) return fail(400, { message: 'Enter the date.' });
		return guard(() =>
			completeStep(
				params.id,
				stepId,
				{ date, completion, note: str(form, 'note', 10_000) },
				locals.user!.id
			)
		);
	},
	undo: async ({ params, locals }) => guard(() => undoLastStep(params.id, locals.user!.id)),
	extend: async ({ request, params, locals }) => {
		const form = await request.formData();
		const stepId = str(form, 'stepId');
		const remove = str(form, 'remove') === '1';
		const extendedTo = optionalDate(form, 'extendedTo');
		if (!isUuid(stepId)) return fail(400, { message: 'Unknown step.' });
		if (!remove && !extendedTo) return fail(400, { message: 'Enter the new deadline.' });
		return guard(() =>
			extendStep(
				params.id,
				stepId,
				{ extendedTo: remove ? null : extendedTo, note: str(form, 'note', 10_000) },
				locals.user!.id
			)
		);
	},
	adjust: async ({ request, params, locals }) => {
		const form = await request.formData();
		const stepId = str(form, 'stepId');
		const startedOn = optionalDate(form, 'startedOn');
		if (!isUuid(stepId) || !startedOn)
			return fail(400, { message: 'Enter the date the clock started.' });
		return guard(() => adjustStepStart(params.id, stepId, startedOn, locals.user!.id));
	},
	close: async ({ request, params, locals }) => {
		const form = await request.formData();
		const outcome = str(form, 'outcome') as Outcome;
		const closedOn = optionalDate(form, 'closedOn');
		if (!OUTCOMES.includes(outcome))
			return fail(400, { message: 'Choose how the grievance ended.' });
		if (!closedOn) return fail(400, { message: 'Enter the date it was resolved.' });
		return guard(() =>
			closeCase(
				params.id,
				{ outcome, closedOn, resolution: str(form, 'resolution', 20_000) },
				locals.user!.id
			)
		);
	},
	reopen: async ({ request, params, locals }) => {
		const form = await request.formData();
		return guard(() => reopenCase(params.id, str(form, 'reason', 2000), locals.user!.id));
	},
	deleteEntry: async ({ request, params, locals }) => {
		const entryId = str(await request.formData(), 'entryId');
		if (!isUuid(entryId)) return fail(400, { message: 'Unknown entry.' });
		const ok = await deleteEntry(params.id, entryId, locals.user!);
		if (!ok)
			return fail(403, {
				message: 'Only the person who added it (or an admin) can delete that entry.'
			});
		return { ok: true };
	},
	delete: async ({ params, locals }) => {
		if (locals.user!.role !== 'admin')
			return fail(403, { message: 'Only an admin can delete a case.' });
		await deleteCase(params.id);
		redirect(303, '/cases');
	}
};
