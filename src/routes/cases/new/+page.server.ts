import { fail, redirect } from '@sveltejs/kit';
import { and, asc, inArray, isNotNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '#lib/server/db/index.ts';
import {
	contractArticles,
	contractHolidays,
	contractSteps,
	contracts as contractsTable
} from '#lib/server/db/schema.ts';
import { CaseError, createCase } from '#lib/server/cases.ts';
import { listActiveContracts } from '#lib/server/contracts.ts';
import { listActiveStewards } from '#lib/server/users.ts';
import { readCaseForm } from '#lib/server/case-form.ts';
import { int, isUuid } from '#lib/server/forms.ts';

export const load: PageServerLoad = async ({ url }) => {
	const contracts = await listActiveContracts();
	const ids = contracts.map((c) => c.id);
	const [articles, steps, holidays, settings, stewards] = await Promise.all([
		ids.length
			? db
					.select({
						id: contractArticles.id,
						contractId: contractArticles.contractId,
						number: contractArticles.number,
						title: contractArticles.title
					})
					.from(contractArticles)
					.where(inArray(contractArticles.contractId, ids))
					.orderBy(asc(contractArticles.sort))
			: [],
		ids.length
			? db
					.select({
						id: contractSteps.id,
						contractId: contractSteps.contractId,
						stage: contractSteps.stage,
						name: contractSteps.name,
						party: contractSteps.party,
						days: contractSteps.days,
						dayType: contractSteps.dayType
					})
					.from(contractSteps)
					.where(and(inArray(contractSteps.contractId, ids), isNotNull(contractSteps.confirmedAt)))
					.orderBy(asc(contractSteps.position))
			: [],
		ids.length
			? db
					.select({
						contractId: contractHolidays.contractId,
						name: contractHolidays.name,
						rule: contractHolidays.rule
					})
					.from(contractHolidays)
					.where(inArray(contractHolidays.contractId, ids))
			: [],
		ids.length
			? db
					.select({
						id: contractsTable.id,
						workdays: contractsTable.workdays,
						rollForward: contractsTable.rollForward
					})
					.from(contractsTable)
					.where(inArray(contractsTable.id, ids))
			: [],
		listActiveStewards()
	]);
	const requested = url.searchParams.get('contract');
	return {
		title: 'New case',
		contracts: contracts.map((c) => ({
			...c,
			articles: articles.filter((a) => a.contractId === c.id),
			steps: steps.filter((s) => s.contractId === c.id),
			holidays: holidays.filter((h) => h.contractId === c.id),
			workdays: settings.find((s) => s.id === c.id)?.workdays ?? [1, 2, 3, 4, 5],
			rollForward: settings.find((s) => s.id === c.id)?.rollForward ?? true
		})),
		defaultContract: contracts.find((c) => c.id === requested)?.id ?? contracts[0]?.id ?? null,
		stewards
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const { values, errors } = readCaseForm(form);
		if (!isUuid(values.contractId)) errors.contractId = 'Choose a contract.';
		const stewardId = isUuid(values.stewardId) ? values.stewardId : null;
		if (Object.keys(errors).length) return fail(400, { values, errors });
		let created: { id: string };
		try {
			created = await createCase(
				{ ...values, stewardId, startAt: int(form, 'startAt') ?? 1 },
				locals.user!.id
			);
		} catch (err) {
			if (err instanceof CaseError) return fail(400, { values, errors: { form: err.message } });
			throw err;
		}
		redirect(303, `/cases/${created.id}?created=1`);
	}
};
