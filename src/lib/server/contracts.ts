import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { WorkCalendar } from '../deadlines/calendar';
import { US_FEDERAL_HOLIDAYS, holidayRuleKey, type HolidayRule } from '../deadlines/holidays';
import type { DayType } from '../deadlines/engine';
import type { Party } from '../deadlines/chain';
import type { DraftStep, ExtractionResult } from '../contracts/extract';
import { db, type Transaction } from './db';
import {
	caseArticles,
	cases,
	contractArticles,
	contractHolidays,
	contractSteps,
	contracts,
	type Contract,
	type ContractArticle,
	type ContractHoliday,
	type ContractStep,
	type ExtractionNotes
} from './db/schema';

export interface ContractDetail extends Contract {
	steps: ContractStep[];
	holidays: ContractHoliday[];
	articles: (Omit<ContractArticle, 'search'> & { citations: number })[];
	openCases: number;
}

export function calendarFor(
	contract: { workdays: number[] },
	holidays: { name: string; rule: HolidayRule }[]
): WorkCalendar {
	return new WorkCalendar({
		workdays: contract.workdays.length ? contract.workdays : undefined,
		holidays: holidays.map((h) => ({ name: h.name, rule: h.rule }))
	});
}

/** Build the working-day calendars for several contracts in two queries. */
export async function calendarsFor(contractIds: string[]): Promise<Map<string, WorkCalendar>> {
	const ids = [...new Set(contractIds)];
	const out = new Map<string, WorkCalendar>();
	if (!ids.length) return out;
	const [rows, holidays] = await Promise.all([
		db
			.select({ id: contracts.id, workdays: contracts.workdays })
			.from(contracts)
			.where(inArray(contracts.id, ids)),
		db.select().from(contractHolidays).where(inArray(contractHolidays.contractId, ids))
	]);
	for (const c of rows) {
		out.set(
			c.id,
			calendarFor(
				c,
				holidays.filter((h) => h.contractId === c.id)
			)
		);
	}
	return out;
}

export interface NewContractInput {
	name: string;
	employer: string;
	effectiveDate: string | null;
	expirationDate: string | null;
	sourceText: string;
	sourceFilename: string | null;
	createdBy: string;
	extraction: ExtractionResult;
	/** Steps drafted by a local LLM; replace the rules-based steps when present. */
	llmSteps?: DraftStep[] | null;
	llmInfo?: ExtractionNotes['llm'];
}

export async function createContract(input: NewContractInput): Promise<string> {
	const { extraction } = input;
	const useLlm = !!input.llmSteps?.length;
	const steps = useLlm ? input.llmSteps! : extraction.steps;
	return db.transaction(async (tx) => {
		const [contract] = await tx
			.insert(contracts)
			.values({
				name: input.name,
				employer: input.employer,
				effectiveDate: input.effectiveDate,
				expirationDate: input.expirationDate,
				sourceText: input.sourceText,
				sourceFilename: input.sourceFilename,
				createdBy: input.createdBy,
				workdays: extraction.workdays ?? [1, 2, 3, 4, 5],
				extraction: {
					warnings: extraction.warnings,
					ignored: extraction.ignored,
					defaultDayType: extraction.defaultDayType,
					defaultDayTypeSource: extraction.defaultDayTypeSource,
					llm: input.llmInfo
				}
			})
			.returning({ id: contracts.id });

		if (steps.length) {
			await tx.insert(contractSteps).values(
				steps.map((s, i) => ({
					contractId: contract.id,
					position: i + 1,
					stage: s.stage,
					name: s.name,
					party: s.party,
					days: s.days,
					dayType: s.dayType,
					source: s.source,
					phrase: s.phrase,
					origin: useLlm ? ('llm' as const) : ('rules' as const),
					confidence: s.confidence,
					notes: s.notes
				}))
			);
		}
		if (extraction.holidays.length) {
			await tx.insert(contractHolidays).values(
				extraction.holidays.map((h) => ({
					contractId: contract.id,
					name: h.name,
					rule: h.rule,
					matched: h.matched
				}))
			);
		}
		if (extraction.articles.length) {
			await tx.insert(contractArticles).values(
				extraction.articles.map((a) => ({
					contractId: contract.id,
					number: a.number,
					title: a.title,
					body: a.body,
					sort: a.sort
				}))
			);
		}
		return contract.id;
	});
}

export async function listContracts() {
	const rows = await db
		.select()
		.from(contracts)
		.orderBy(asc(contracts.status), asc(contracts.name));
	if (!rows.length) return [];
	const ids = rows.map((r) => r.id);
	const [stepCounts, articleCounts, caseCounts] = await Promise.all([
		db
			.select({
				contractId: contractSteps.contractId,
				total: count(),
				confirmed: sql<number>`count(${contractSteps.confirmedAt})::int`
			})
			.from(contractSteps)
			.where(inArray(contractSteps.contractId, ids))
			.groupBy(contractSteps.contractId),
		db
			.select({ contractId: contractArticles.contractId, total: count() })
			.from(contractArticles)
			.where(inArray(contractArticles.contractId, ids))
			.groupBy(contractArticles.contractId),
		db
			.select({
				contractId: cases.contractId,
				total: count(),
				open: sql<number>`count(*) filter (where ${cases.status} = 'open')::int`
			})
			.from(cases)
			.where(inArray(cases.contractId, ids))
			.groupBy(cases.contractId)
	]);
	return rows.map(({ sourceText, ...c }) => ({
		...c,
		sourceLength: sourceText.length,
		steps: stepCounts.find((s) => s.contractId === c.id)?.total ?? 0,
		confirmedSteps: stepCounts.find((s) => s.contractId === c.id)?.confirmed ?? 0,
		articles: articleCounts.find((s) => s.contractId === c.id)?.total ?? 0,
		cases: caseCounts.find((s) => s.contractId === c.id)?.total ?? 0,
		openCases: caseCounts.find((s) => s.contractId === c.id)?.open ?? 0
	}));
}

export async function listActiveContracts() {
	return db
		.select({ id: contracts.id, name: contracts.name, employer: contracts.employer })
		.from(contracts)
		.where(eq(contracts.status, 'active'))
		.orderBy(asc(contracts.name));
}

export async function getContract(id: string): Promise<ContractDetail | null> {
	const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
	if (!contract) return null;
	const [steps, holidays, articles, citations, [open]] = await Promise.all([
		db
			.select()
			.from(contractSteps)
			.where(eq(contractSteps.contractId, id))
			.orderBy(asc(contractSteps.position)),
		db
			.select()
			.from(contractHolidays)
			.where(eq(contractHolidays.contractId, id))
			.orderBy(asc(contractHolidays.createdAt)),
		db
			.select({
				id: contractArticles.id,
				contractId: contractArticles.contractId,
				number: contractArticles.number,
				title: contractArticles.title,
				body: contractArticles.body,
				sort: contractArticles.sort,
				createdAt: contractArticles.createdAt,
				updatedAt: contractArticles.updatedAt
			})
			.from(contractArticles)
			.where(eq(contractArticles.contractId, id))
			.orderBy(asc(contractArticles.sort), asc(contractArticles.number)),
		db
			.select({ articleId: caseArticles.articleId, n: count() })
			.from(caseArticles)
			.innerJoin(contractArticles, eq(contractArticles.id, caseArticles.articleId))
			.where(eq(contractArticles.contractId, id))
			.groupBy(caseArticles.articleId),
		db
			.select({ n: count() })
			.from(cases)
			.where(and(eq(cases.contractId, id), eq(cases.status, 'open')))
	]);
	return {
		...contract,
		steps,
		holidays,
		articles: articles.map((a) => ({
			...a,
			citations: citations.find((c) => c.articleId === a.id)?.n ?? 0
		})),
		openCases: open?.n ?? 0
	};
}

export async function getContractCalendar(id: string): Promise<WorkCalendar | null> {
	return (await calendarsFor([id])).get(id) ?? null;
}

export async function updateContract(
	id: string,
	input: Partial<
		Pick<
			Contract,
			'name' | 'employer' | 'effectiveDate' | 'expirationDate' | 'workdays' | 'rollForward'
		>
	>
): Promise<void> {
	await db.update(contracts).set(input).where(eq(contracts.id, id));
}

/** A contract can only be used for cases while every step is confirmed. */
async function refreshStatus(tx: Transaction | typeof db, contractId: string): Promise<void> {
	const [row] = await tx
		.select({
			total: count(),
			unconfirmed: sql<number>`count(*) filter (where ${contractSteps.confirmedAt} is null)::int`
		})
		.from(contractSteps)
		.where(eq(contractSteps.contractId, contractId));
	if (!row?.total || row.unconfirmed > 0) {
		await tx
			.update(contracts)
			.set({ status: 'draft' })
			.where(and(eq(contracts.id, contractId), eq(contracts.status, 'active')));
	}
}

export interface StepInput {
	stage: string;
	name: string;
	party: Party;
	days: number;
	dayType: DayType;
}

export async function addStep(contractId: string, input: StepInput, userId: string): Promise<void> {
	const [last] = await db
		.select({ max: sql<number>`coalesce(max(${contractSteps.position}), 0)::int` })
		.from(contractSteps)
		.where(eq(contractSteps.contractId, contractId));
	await db.insert(contractSteps).values({
		contractId,
		position: (last?.max ?? 0) + 1,
		...input,
		origin: 'manual',
		confirmedAt: new Date(),
		confirmedBy: userId
	});
}

export async function updateStep(
	contractId: string,
	stepId: string,
	input: StepInput,
	userId: string,
	confirm: boolean
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.update(contractSteps)
			.set({
				...input,
				confirmedAt: confirm ? new Date() : null,
				confirmedBy: confirm ? userId : null
			})
			.where(and(eq(contractSteps.id, stepId), eq(contractSteps.contractId, contractId)));
		await refreshStatus(tx, contractId);
	});
}

export async function confirmStep(
	contractId: string,
	stepId: string,
	userId: string,
	confirmed: boolean
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.update(contractSteps)
			.set({ confirmedAt: confirmed ? new Date() : null, confirmedBy: confirmed ? userId : null })
			.where(and(eq(contractSteps.id, stepId), eq(contractSteps.contractId, contractId)));
		await refreshStatus(tx, contractId);
	});
}

export async function deleteStep(contractId: string, stepId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.delete(contractSteps)
			.where(and(eq(contractSteps.id, stepId), eq(contractSteps.contractId, contractId)));
		const rest = await tx
			.select({ id: contractSteps.id })
			.from(contractSteps)
			.where(eq(contractSteps.contractId, contractId))
			.orderBy(asc(contractSteps.position));
		for (const [i, s] of rest.entries()) {
			await tx
				.update(contractSteps)
				.set({ position: i + 1 })
				.where(eq(contractSteps.id, s.id));
		}
		await refreshStatus(tx, contractId);
	});
}

export async function moveStep(
	contractId: string,
	stepId: string,
	direction: -1 | 1
): Promise<void> {
	await db.transaction(async (tx) => {
		const steps = await tx
			.select({ id: contractSteps.id, position: contractSteps.position })
			.from(contractSteps)
			.where(eq(contractSteps.contractId, contractId))
			.orderBy(asc(contractSteps.position));
		const i = steps.findIndex((s) => s.id === stepId);
		const j = i + direction;
		if (i < 0 || j < 0 || j >= steps.length) return;
		await tx
			.update(contractSteps)
			.set({ position: steps[j].position })
			.where(eq(contractSteps.id, steps[i].id));
		await tx
			.update(contractSteps)
			.set({ position: steps[i].position })
			.where(eq(contractSteps.id, steps[j].id));
	});
}

export class ActivationError extends Error {}

export async function activateContract(id: string): Promise<void> {
	const [row] = await db
		.select({
			total: count(),
			unconfirmed: sql<number>`count(*) filter (where ${contractSteps.confirmedAt} is null)::int`
		})
		.from(contractSteps)
		.where(eq(contractSteps.contractId, id));
	if (!row?.total) throw new ActivationError('Add at least one grievance step first.');
	if (row.unconfirmed > 0) {
		throw new ActivationError(
			`${row.unconfirmed} step${row.unconfirmed === 1 ? ' still needs' : 's still need'} a person to confirm ${row.unconfirmed === 1 ? 'it' : 'them'}.`
		);
	}
	await db
		.update(contracts)
		.set({ status: 'active', activatedAt: new Date() })
		.where(eq(contracts.id, id));
}

export async function archiveContract(id: string, archived: boolean): Promise<void> {
	if (archived) {
		await db.update(contracts).set({ status: 'archived' }).where(eq(contracts.id, id));
	} else {
		await db.update(contracts).set({ status: 'draft' }).where(eq(contracts.id, id));
	}
}

export async function deleteContract(id: string): Promise<boolean> {
	const [used] = await db.select({ n: count() }).from(cases).where(eq(cases.contractId, id));
	if (used?.n) return false;
	await db.delete(contracts).where(eq(contracts.id, id));
	return true;
}

export async function addHoliday(
	contractId: string,
	name: string,
	rule: HolidayRule
): Promise<void> {
	await db.insert(contractHolidays).values({ contractId, name, rule });
}

export async function deleteHoliday(contractId: string, holidayId: string): Promise<void> {
	await db
		.delete(contractHolidays)
		.where(and(eq(contractHolidays.id, holidayId), eq(contractHolidays.contractId, contractId)));
}

/** Add any US federal holidays the contract doesn't already list. */
export async function addFederalHolidays(contractId: string): Promise<number> {
	const existing = await db
		.select({ name: contractHolidays.name, rule: contractHolidays.rule })
		.from(contractHolidays)
		.where(eq(contractHolidays.contractId, contractId));
	const have = new Set(existing.map((h) => holidayRuleKey(h.rule)));
	const missing = US_FEDERAL_HOLIDAYS.filter((h) => !have.has(holidayRuleKey(h.rule)));
	if (missing.length) {
		await db
			.insert(contractHolidays)
			.values(missing.map((h) => ({ contractId, name: h.name, rule: h.rule })));
	}
	return missing.length;
}

export interface ArticleInput {
	number: string;
	title: string;
	body: string;
}

function articleSort(number: string): number {
	const n = parseInt(number, 10);
	return Number.isFinite(n) ? n : 0;
}

export async function addArticle(contractId: string, input: ArticleInput): Promise<string> {
	const [row] = await db
		.insert(contractArticles)
		.values({ contractId, ...input, sort: articleSort(input.number) })
		.returning({ id: contractArticles.id });
	return row.id;
}

export async function updateArticle(
	contractId: string,
	articleId: string,
	input: ArticleInput
): Promise<void> {
	await db
		.update(contractArticles)
		.set({ ...input, sort: articleSort(input.number) })
		.where(and(eq(contractArticles.id, articleId), eq(contractArticles.contractId, contractId)));
}

export async function deleteArticle(contractId: string, articleId: string): Promise<void> {
	await db
		.delete(contractArticles)
		.where(and(eq(contractArticles.id, articleId), eq(contractArticles.contractId, contractId)));
}

export async function listArticles(contractId: string) {
	return db
		.select({
			id: contractArticles.id,
			number: contractArticles.number,
			title: contractArticles.title
		})
		.from(contractArticles)
		.where(eq(contractArticles.contractId, contractId))
		.orderBy(asc(contractArticles.sort), asc(contractArticles.number));
}

export async function confirmedSteps(contractId: string) {
	return db
		.select()
		.from(contractSteps)
		.where(and(eq(contractSteps.contractId, contractId)))
		.orderBy(asc(contractSteps.position))
		.then((rows) => rows.filter((r) => r.confirmedAt !== null));
}

export async function unconfirmedCount(contractId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(contractSteps)
		.where(and(eq(contractSteps.contractId, contractId), isNull(contractSteps.confirmedAt)));
	return row?.n ?? 0;
}
