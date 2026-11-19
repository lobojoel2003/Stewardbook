import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	ActivationError,
	activateContract,
	addArticle,
	addFederalHolidays,
	addHoliday,
	addStep,
	archiveContract,
	confirmStep,
	deleteContract,
	deleteHoliday,
	deleteStep,
	getContract,
	moveStep,
	updateContract,
	updateStep,
	type StepInput
} from '#lib/server/contracts.ts';
import { int, isUuid, optionalDate, str } from '#lib/server/forms.ts';
import { isISODate } from '#lib/deadlines/dates.ts';
import type { HolidayRule, ObservedRule } from '#lib/deadlines/holidays.ts';

export const load: PageServerLoad = async ({ params, url }) => {
	if (!isUuid(params.id)) error(404, 'Contract not found');
	const contract = await getContract(params.id);
	if (!contract) error(404, 'Contract not found');
	const { sourceText, ...rest } = contract;
	return {
		title: contract.name,
		contract: { ...rest, sourceLength: sourceText.length },
		justCreated: url.searchParams.has('new')
	};
};

function stepInput(form: FormData): StepInput | string {
	const stage = str(form, 'stage', 40);
	const name = str(form, 'name', 160);
	const party = str(form, 'party');
	const dayType = str(form, 'dayType');
	const days = int(form, 'days');
	if (!stage) return 'Give the step a label such as "Step 1" or "Arbitration".';
	if (!name) return 'Describe what has to happen.';
	if (party !== 'union' && party !== 'management') return 'Choose who must act.';
	if (dayType !== 'business' && dayType !== 'calendar') return 'Choose working or calendar days.';
	if (days === null || days < 0 || days > 365) return 'Enter a number of days between 0 and 365.';
	return { stage, name, party, days, dayType };
}

function holidayRule(form: FormData): HolidayRule | string {
	const kind = str(form, 'kind');
	const observed = (str(form, 'observed') || 'none') as ObservedRule;
	switch (kind) {
		case 'fixed': {
			const month = int(form, 'month');
			const day = int(form, 'day');
			if (!month || month < 1 || month > 12 || !day || day < 1 || day > 31)
				return 'Choose a month and day.';
			if (!['none', 'federal', 'sunday_to_monday', 'weekend_to_monday'].includes(observed))
				return 'Choose an observed rule.';
			return { kind: 'fixed', month, day, observed };
		}
		case 'nth_weekday': {
			const month = int(form, 'month');
			const weekday = int(form, 'weekday');
			const n = int(form, 'n');
			const offset = int(form, 'offset') ?? 0;
			if (!month || month < 1 || month > 12) return 'Choose a month.';
			if (weekday === null || weekday < 0 || weekday > 6) return 'Choose a weekday.';
			if (n === null || (n !== -1 && (n < 1 || n > 5))) return 'Choose which week.';
			return { kind: 'nth_weekday', month, weekday, n, ...(offset ? { offset } : {}) };
		}
		case 'easter': {
			const offset = int(form, 'easterOffset');
			if (offset === null || offset < -60 || offset > 60) return 'Enter days relative to Easter.';
			return { kind: 'easter', offset };
		}
		case 'date': {
			const date = str(form, 'date', 10);
			if (!isISODate(date)) return 'Choose a date.';
			return { kind: 'date', date };
		}
		default:
			return 'Choose how the holiday is set.';
	}
}

export const actions: Actions = {
	confirm: async ({ request, params, locals }) => {
		const form = await request.formData();
		const stepId = str(form, 'stepId');
		if (!isUuid(stepId)) return fail(400, { message: 'Unknown step.' });
		await confirmStep(params.id, stepId, locals.user!.id, str(form, 'confirmed') !== 'false');
		return { ok: true };
	},
	saveStep: async ({ request, params, locals }) => {
		const form = await request.formData();
		const stepId = str(form, 'stepId');
		const input = stepInput(form);
		if (typeof input === 'string') return fail(400, { stepId, message: input });
		if (!isUuid(stepId)) return fail(400, { message: 'Unknown step.' });
		await updateStep(params.id, stepId, input, locals.user!.id, true);
		return { ok: true };
	},
	addStep: async ({ request, params, locals }) => {
		const form = await request.formData();
		const input = stepInput(form);
		if (typeof input === 'string') return fail(400, { addStep: true, message: input });
		await addStep(params.id, input, locals.user!.id);
		return { ok: true };
	},
	deleteStep: async ({ request, params }) => {
		const stepId = str(await request.formData(), 'stepId');
		if (isUuid(stepId)) await deleteStep(params.id, stepId);
		return { ok: true };
	},
	moveStep: async ({ request, params }) => {
		const form = await request.formData();
		const stepId = str(form, 'stepId');
		if (isUuid(stepId)) await moveStep(params.id, stepId, str(form, 'dir') === 'up' ? -1 : 1);
		return { ok: true };
	},
	activate: async ({ params }) => {
		try {
			await activateContract(params.id);
		} catch (err) {
			if (err instanceof ActivationError) return fail(400, { message: err.message });
			throw err;
		}
		return { ok: true, activated: true };
	},
	archive: async ({ params }) => {
		await archiveContract(params.id, true);
		return { ok: true };
	},
	unarchive: async ({ params }) => {
		await archiveContract(params.id, false);
		return { ok: true };
	},
	delete: async ({ params }) => {
		const ok = await deleteContract(params.id);
		if (!ok)
			return fail(400, {
				message: 'This contract has cases filed under it, so it can only be archived.'
			});
		redirect(303, '/contracts');
	},
	details: async ({ request, params }) => {
		const form = await request.formData();
		const name = str(form, 'name', 200);
		if (!name) return fail(400, { message: 'The contract needs a name.' });
		await updateContract(params.id, {
			name,
			employer: str(form, 'employer', 200),
			effectiveDate: optionalDate(form, 'effectiveDate'),
			expirationDate: optionalDate(form, 'expirationDate')
		});
		return { ok: true };
	},
	calendar: async ({ request, params }) => {
		const form = await request.formData();
		const workdays = form
			.getAll('workdays')
			.map((v) => Number(v))
			.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
		if (!workdays.length) return fail(400, { message: 'Pick at least one working day.' });
		await updateContract(params.id, {
			workdays: [...new Set(workdays)].sort(),
			rollForward: form.get('rollForward') === 'on'
		});
		return { ok: true };
	},
	addHoliday: async ({ request, params }) => {
		const form = await request.formData();
		const name = str(form, 'holidayName', 80);
		if (!name) return fail(400, { holiday: true, message: 'Name the holiday.' });
		const rule = holidayRule(form);
		if (typeof rule === 'string') return fail(400, { holiday: true, message: rule });
		await addHoliday(params.id, name, rule);
		return { ok: true };
	},
	deleteHoliday: async ({ request, params }) => {
		const id = str(await request.formData(), 'holidayId');
		if (isUuid(id)) await deleteHoliday(params.id, id);
		return { ok: true };
	},
	federal: async ({ params }) => {
		const added = await addFederalHolidays(params.id);
		return { ok: true, added };
	},
	addArticle: async ({ request, params }) => {
		const form = await request.formData();
		const number = str(form, 'number', 20);
		const title = str(form, 'title', 200);
		if (!number || !title)
			return fail(400, { article: true, message: 'An article needs a number and a title.' });
		await addArticle(params.id, { number, title, body: str(form, 'body', 200_000) });
		return { ok: true };
	}
};
