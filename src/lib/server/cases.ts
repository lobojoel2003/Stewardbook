import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isISODate, type ISODate } from '../deadlines/dates';
import {
	evaluateSteps,
	nextTriggerDate,
	type ChainView,
	type StepCompletion,
	type StepRecord,
	type StepView
} from '../deadlines/chain';
import type { Outcome } from '../labels';
import { COMPLETION_LABELS, OUTCOME_LABELS } from '../labels';
import { db, type Transaction } from './db';
import {
	attachments,
	caseArticles,
	caseSteps,
	cases,
	contractArticles,
	contracts,
	timelineEntries,
	users,
	type CaseStep,
	type EntryData
} from './db/schema';
import { calendarsFor, confirmedSteps } from './contracts';

export class CaseError extends Error {}

function toRecord(s: CaseStep): StepRecord {
	return {
		id: s.id,
		position: s.position,
		name: s.name,
		party: s.party,
		days: s.days,
		dayType: s.dayType,
		rollForward: s.rollForward,
		startedOn: s.startedOn,
		completedOn: s.completedOn,
		completion: s.completion,
		extendedTo: s.extendedTo
	};
}

export type CaseStepView = StepView & { stage: string };

function withStage(
	view: ChainView,
	steps: CaseStep[]
): { steps: CaseStepView[]; current: CaseStepView | null; next: CaseStepView | null } {
	const stage = (id: string) => steps.find((s) => s.id === id)?.stage ?? '';
	const add = (v: StepView | null) => (v ? { ...v, stage: stage(v.id) } : null);
	return {
		steps: view.steps.map((v) => ({ ...v, stage: stage(v.id) })),
		current: add(view.current),
		next: add(view.next)
	};
}

async function nextCaseNumber(tx: Transaction, year: number): Promise<string> {
	await tx.execute(sql`select pg_advisory_xact_lock(732001)`);
	const prefix = `${year}-`;
	const rows = await tx
		.select({ number: cases.number })
		.from(cases)
		.where(sql`${cases.number} like ${prefix + '%'}`);
	const max = rows.reduce(
		(m, r) => Math.max(m, parseInt(r.number.slice(prefix.length), 10) || 0),
		0
	);
	return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** A step dated in the past is shown on that day; today's actions keep the real time. */
function occurredAtFor(date?: ISODate): Date {
	const now = new Date();
	if (!date || date >= now.toISOString().slice(0, 10)) return now;
	return new Date(`${date}T12:00:00Z`);
}

async function addTimeline(
	tx: Transaction | typeof db,
	caseId: string,
	authorId: string | null,
	kind: 'created' | 'step' | 'extension' | 'handoff' | 'status',
	title: string,
	body = '',
	data: EntryData = {},
	occurredOn?: ISODate
): Promise<void> {
	await tx
		.insert(timelineEntries)
		.values({ caseId, authorId, kind, title, body, data, occurredAt: occurredAtFor(occurredOn) });
	await tx.update(cases).set({ updatedAt: new Date() }).where(eq(cases.id, caseId));
}

export interface CaseInput {
	contractId: string;
	title: string;
	grievantName: string;
	grievantContact: string;
	department: string;
	supervisor: string;
	incidentDate: ISODate;
	awareDate: ISODate | null;
	summary: string;
	remedy: string;
	stewardId: string | null;
	articles: { articleId: string; note: string }[];
}

export async function createCase(
	input: CaseInput & { startAt?: number },
	userId: string
): Promise<{ id: string; number: string }> {
	const steps = await confirmedSteps(input.contractId);
	if (!steps.length) throw new CaseError('That contract has no confirmed grievance steps yet.');
	const [contract] = await db
		.select({ status: contracts.status, rollForward: contracts.rollForward })
		.from(contracts)
		.where(eq(contracts.id, input.contractId))
		.limit(1);
	if (!contract || contract.status !== 'active') throw new CaseError('Choose an active contract.');

	const trigger = input.awareDate ?? input.incidentDate;
	const startAt = Math.min(Math.max(1, input.startAt ?? 1), steps.length);

	return db.transaction(async (tx) => {
		const number = await nextCaseNumber(
			tx,
			Number(trigger.slice(0, 4)) || new Date().getFullYear()
		);
		const [row] = await tx
			.insert(cases)
			.values({
				number,
				title: input.title,
				contractId: input.contractId,
				grievantName: input.grievantName,
				grievantContact: input.grievantContact,
				department: input.department,
				supervisor: input.supervisor,
				incidentDate: input.incidentDate,
				awareDate: input.awareDate,
				summary: input.summary,
				remedy: input.remedy,
				stewardId: input.stewardId,
				createdBy: userId
			})
			.returning({ id: cases.id });

		await tx.insert(caseSteps).values(
			steps.map((s, i) => {
				const position = i + 1;
				const skipped = position < startAt;
				return {
					caseId: row.id,
					position,
					stage: s.stage,
					name: s.name,
					party: s.party,
					days: s.days,
					dayType: s.dayType,
					rollForward: contract.rollForward,
					startedOn: position <= startAt ? trigger : null,
					completedOn: skipped ? trigger : null,
					completion: skipped ? ('skipped' as const) : null
				};
			})
		);

		if (input.articles.length) {
			await tx
				.insert(caseArticles)
				.values(
					input.articles.map((a) => ({ caseId: row.id, articleId: a.articleId, note: a.note }))
				)
				.onConflictDoNothing();
		}
		await addTimeline(tx, row.id, userId, 'created', `Case ${number} opened`, input.summary);
		return { id: row.id, number };
	});
}

const stewardUser = alias(users, 'steward');

export interface CaseListFilters {
	status?: 'open' | 'closed' | 'all';
	stewardId?: string | null;
	contractId?: string | null;
	q?: string | null;
	limit?: number;
}

export interface CaseListRow {
	id: string;
	number: string;
	title: string;
	grievantName: string;
	department: string;
	status: 'open' | 'closed';
	outcome: Outcome | null;
	closedOn: string | null;
	updatedAt: Date;
	incidentDate: string;
	steward: { id: string; name: string } | null;
	contract: { id: string; name: string };
	current: CaseStepView | null;
	stepsDone: number;
	stepsTotal: number;
}

export function searchCondition(q: string): SQL {
	const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
	return or(
		sql`${cases.search} @@ websearch_to_tsquery('english', ${q})`,
		ilike(cases.number, like),
		ilike(cases.title, like),
		ilike(cases.grievantName, like)
	)!;
}

export async function listCases(filters: CaseListFilters, today: ISODate): Promise<CaseListRow[]> {
	const where: SQL[] = [];
	if (filters.status && filters.status !== 'all') where.push(eq(cases.status, filters.status));
	if (filters.stewardId) where.push(eq(cases.stewardId, filters.stewardId));
	if (filters.contractId) where.push(eq(cases.contractId, filters.contractId));
	if (filters.q?.trim()) where.push(searchCondition(filters.q.trim()));

	const rows = await db
		.select({
			id: cases.id,
			number: cases.number,
			title: cases.title,
			grievantName: cases.grievantName,
			department: cases.department,
			status: cases.status,
			outcome: cases.outcome,
			closedOn: cases.closedOn,
			updatedAt: cases.updatedAt,
			incidentDate: cases.incidentDate,
			contractId: cases.contractId,
			contractName: contracts.name,
			stewardId: stewardUser.id,
			stewardName: stewardUser.name
		})
		.from(cases)
		.innerJoin(contracts, eq(contracts.id, cases.contractId))
		.leftJoin(stewardUser, eq(stewardUser.id, cases.stewardId))
		.where(where.length ? and(...where) : undefined)
		.orderBy(desc(cases.updatedAt))
		.limit(filters.limit ?? 500);
	if (!rows.length) return [];

	const [steps, calendars] = await Promise.all([
		db
			.select()
			.from(caseSteps)
			.where(
				inArray(
					caseSteps.caseId,
					rows.map((r) => r.id)
				)
			)
			.orderBy(asc(caseSteps.position)),
		calendarsFor(rows.map((r) => r.contractId))
	]);

	const out = rows.map((r) => {
		const own = steps.filter((s) => s.caseId === r.id);
		const cal = calendars.get(r.contractId)!;
		const view = withStage(evaluateSteps(cal, own.map(toRecord), today, r.status === 'open'), own);
		return {
			id: r.id,
			number: r.number,
			title: r.title,
			grievantName: r.grievantName,
			department: r.department,
			status: r.status,
			outcome: r.outcome,
			closedOn: r.closedOn,
			updatedAt: r.updatedAt,
			incidentDate: r.incidentDate,
			steward: r.stewardId ? { id: r.stewardId, name: r.stewardName ?? '' } : null,
			contract: { id: r.contractId, name: r.contractName },
			current: view.current,
			stepsDone: view.steps.filter((s) => s.state !== 'pending' && s.state !== 'active').length,
			stepsTotal: view.steps.length
		};
	});

	// Most urgent first: running clocks by due date, then everything else by last activity.
	return out.sort((a, b) => {
		const da = a.current?.effectiveDue;
		const dbb = b.current?.effectiveDue;
		if (da && dbb) return da < dbb ? -1 : da > dbb ? 1 : 0;
		if (da) return -1;
		if (dbb) return 1;
		return b.updatedAt.getTime() - a.updatedAt.getTime();
	});
}

export async function getCase(id: string, today: ISODate) {
	const [row] = await db
		.select({
			case: {
				id: cases.id,
				number: cases.number,
				title: cases.title,
				contractId: cases.contractId,
				grievantName: cases.grievantName,
				grievantContact: cases.grievantContact,
				department: cases.department,
				supervisor: cases.supervisor,
				incidentDate: cases.incidentDate,
				awareDate: cases.awareDate,
				summary: cases.summary,
				remedy: cases.remedy,
				stewardId: cases.stewardId,
				status: cases.status,
				outcome: cases.outcome,
				resolution: cases.resolution,
				closedOn: cases.closedOn,
				createdAt: cases.createdAt,
				updatedAt: cases.updatedAt
			},
			contract: { id: contracts.id, name: contracts.name, employer: contracts.employer },
			steward: {
				id: stewardUser.id,
				name: stewardUser.name,
				email: stewardUser.email,
				phone: stewardUser.phone
			}
		})
		.from(cases)
		.innerJoin(contracts, eq(contracts.id, cases.contractId))
		.leftJoin(stewardUser, eq(stewardUser.id, cases.stewardId))
		.where(eq(cases.id, id))
		.limit(1);
	if (!row) return null;

	const [steps, calendars, articles, entries, files] = await Promise.all([
		db.select().from(caseSteps).where(eq(caseSteps.caseId, id)).orderBy(asc(caseSteps.position)),
		calendarsFor([row.case.contractId]),
		db
			.select({
				id: contractArticles.id,
				number: contractArticles.number,
				title: contractArticles.title,
				body: contractArticles.body,
				note: caseArticles.note
			})
			.from(caseArticles)
			.innerJoin(contractArticles, eq(contractArticles.id, caseArticles.articleId))
			.where(eq(caseArticles.caseId, id))
			.orderBy(asc(contractArticles.sort)),
		db
			.select({
				id: timelineEntries.id,
				kind: timelineEntries.kind,
				occurredAt: timelineEntries.occurredAt,
				title: timelineEntries.title,
				body: timelineEntries.body,
				data: timelineEntries.data,
				createdAt: timelineEntries.createdAt,
				authorId: timelineEntries.authorId,
				authorName: users.name
			})
			.from(timelineEntries)
			.leftJoin(users, eq(users.id, timelineEntries.authorId))
			.where(eq(timelineEntries.caseId, id))
			.orderBy(desc(timelineEntries.occurredAt), desc(timelineEntries.createdAt)),
		db
			.select({
				id: attachments.id,
				entryId: attachments.entryId,
				filename: attachments.filename,
				mimeType: attachments.mimeType,
				size: attachments.size
			})
			.from(attachments)
			.where(eq(attachments.caseId, id))
	]);
	const calendar = calendars.get(row.case.contractId)!;
	const chain = withStage(
		evaluateSteps(calendar, steps.map(toRecord), today, row.case.status === 'open'),
		steps
	);

	// Non-working days between today and the running deadline, so the countdown can explain itself.
	const upcomingClosures: { date: string; name: string }[] = [];
	if (chain.current?.effectiveDue) {
		for (const s of chain.current.deadline?.skipped ?? []) {
			if (s.reason.type === 'holiday' && s.date >= today)
				upcomingClosures.push({ date: s.date, name: s.reason.name });
		}
	}

	return {
		...row.case,
		contract: row.contract,
		steward: row.steward?.id ? row.steward : null,
		chain,
		articles,
		timeline: entries.map((e) => ({ ...e, attachments: files.filter((f) => f.entryId === e.id) })),
		attachmentCount: files.length,
		upcomingClosures,
		holidaysThisYear: calendar.holidaysIn(Number(today.slice(0, 4)))
	};
}

export type CaseDetail = NonNullable<Awaited<ReturnType<typeof getCase>>>;

export async function updateCase(
	id: string,
	input: Omit<CaseInput, 'contractId' | 'stewardId'>,
	userId: string
): Promise<void> {
	await db.transaction(async (tx) => {
		const { articles, ...fields } = input;
		await tx.update(cases).set(fields).where(eq(cases.id, id));
		await tx.delete(caseArticles).where(eq(caseArticles.caseId, id));
		if (articles.length) {
			await tx
				.insert(caseArticles)
				.values(articles.map((a) => ({ caseId: id, articleId: a.articleId, note: a.note })))
				.onConflictDoNothing();
		}
		void userId;
	});
}

async function loadSteps(tx: Transaction, caseId: string) {
	const [c] = await tx
		.select({ status: cases.status, contractId: cases.contractId })
		.from(cases)
		.where(eq(cases.id, caseId))
		.limit(1);
	if (!c) throw new CaseError('Case not found.');
	const steps = await tx
		.select()
		.from(caseSteps)
		.where(eq(caseSteps.caseId, caseId))
		.orderBy(asc(caseSteps.position));
	const cal = (await calendarsFor([c.contractId])).get(c.contractId)!;
	return { status: c.status, steps, cal };
}

export async function completeStep(
	caseId: string,
	stepId: string,
	input: { date: ISODate; completion: StepCompletion; note: string },
	userId: string
): Promise<void> {
	await db.transaction(async (tx) => {
		const { status, steps, cal } = await loadSteps(tx, caseId);
		if (status !== 'open') throw new CaseError('Reopen the case before updating steps.');
		const view = evaluateSteps(cal, steps.map(toRecord), input.date);
		const current = view.current;
		if (!current || current.id !== stepId)
			throw new CaseError('That step is not the one currently running.');
		if (!isISODate(input.date)) throw new CaseError('Enter a valid date.');
		if (current.startedOn && input.date < current.startedOn)
			throw new CaseError('The date can’t be before the step started.');

		await tx
			.update(caseSteps)
			.set({ completedOn: input.date, completion: input.completion })
			.where(eq(caseSteps.id, stepId));
		const next = view.next;
		if (next) {
			await tx
				.update(caseSteps)
				.set({ startedOn: nextTriggerDate(input.completion, input.date, current.effectiveDue) })
				.where(eq(caseSteps.id, next.id));
		}
		const stage = steps.find((s) => s.id === stepId)?.stage ?? '';
		const late =
			input.completion === 'done' && current.effectiveDue && input.date > current.effectiveDue;
		const title = `${stage}: ${current.name} — ${COMPLETION_LABELS[input.completion].toLowerCase()}${late ? ' (after the deadline)' : ''}`;
		await addTimeline(
			tx,
			caseId,
			userId,
			'step',
			title,
			input.note,
			{ stepId, completion: input.completion },
			input.date
		);
	});
}

export async function undoLastStep(caseId: string, userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		const { status, steps } = await loadSteps(tx, caseId);
		if (status !== 'open') throw new CaseError('Reopen the case before updating steps.');
		const done = steps.filter((s) => s.completedOn);
		const last = done[done.length - 1];
		if (!last) throw new CaseError('No step has been completed yet.');
		await tx
			.update(caseSteps)
			.set({ completedOn: null, completion: null })
			.where(eq(caseSteps.id, last.id));
		const after = steps.find((s) => s.position === last.position + 1);
		if (after && !after.completedOn) {
			await tx
				.update(caseSteps)
				.set({ startedOn: null, extendedTo: null })
				.where(eq(caseSteps.id, after.id));
		}
		await addTimeline(tx, caseId, userId, 'step', `Reopened ${last.stage}: ${last.name}`, '', {
			stepId: last.id
		});
	});
}

export async function extendStep(
	caseId: string,
	stepId: string,
	input: { extendedTo: ISODate | null; note: string },
	userId: string
): Promise<void> {
	await db.transaction(async (tx) => {
		const { steps } = await loadSteps(tx, caseId);
		const step = steps.find((s) => s.id === stepId);
		if (!step || !step.startedOn || step.completedOn)
			throw new CaseError('Only a running step can be extended.');
		if (input.extendedTo && input.extendedTo < step.startedOn)
			throw new CaseError('The new deadline is before the step started.');
		await tx
			.update(caseSteps)
			.set({ extendedTo: input.extendedTo })
			.where(eq(caseSteps.id, stepId));
		const title = input.extendedTo
			? `${step.stage}: deadline extended by agreement`
			: `${step.stage}: extension removed`;
		await addTimeline(tx, caseId, userId, 'extension', title, input.note, {
			stepId,
			extendedTo: input.extendedTo ?? undefined
		});
	});
}

export async function adjustStepStart(
	caseId: string,
	stepId: string,
	startedOn: ISODate,
	userId: string
): Promise<void> {
	await db.transaction(async (tx) => {
		const { steps } = await loadSteps(tx, caseId);
		const step = steps.find((s) => s.id === stepId);
		if (!step || !step.startedOn || step.completedOn)
			throw new CaseError('Only a running step can be adjusted.');
		const prev = steps.find((s) => s.position === step.position - 1);
		if (prev?.completedOn && startedOn < prev.completedOn && prev.completion !== 'no_response') {
			throw new CaseError('The clock can’t start before the previous step finished.');
		}
		await tx.update(caseSteps).set({ startedOn }).where(eq(caseSteps.id, stepId));
		await addTimeline(
			tx,
			caseId,
			userId,
			'step',
			`${step.stage}: clock start changed to ${startedOn}`,
			'',
			{ stepId }
		);
	});
}

export async function closeCase(
	caseId: string,
	input: { outcome: Outcome; resolution: string; closedOn: ISODate },
	userId: string
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.update(cases)
			.set({
				status: 'closed',
				outcome: input.outcome,
				resolution: input.resolution,
				closedOn: input.closedOn
			})
			.where(eq(cases.id, caseId));
		await addTimeline(
			tx,
			caseId,
			userId,
			'status',
			`Closed — ${OUTCOME_LABELS[input.outcome]}`,
			input.resolution,
			{ outcome: input.outcome },
			input.closedOn
		);
	});
}

export async function reopenCase(caseId: string, reason: string, userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.update(cases)
			.set({ status: 'open', outcome: null, closedOn: null })
			.where(eq(cases.id, caseId));
		await addTimeline(tx, caseId, userId, 'status', 'Case reopened', reason);
	});
}

export async function handoffCase(
	caseId: string,
	input: { toUserId: string; notes: string },
	userId: string
): Promise<void> {
	await db.transaction(async (tx) => {
		const [c] = await tx
			.select({ stewardId: cases.stewardId, stewardName: users.name })
			.from(cases)
			.leftJoin(users, eq(users.id, cases.stewardId))
			.where(eq(cases.id, caseId))
			.limit(1);
		if (!c) throw new CaseError('Case not found.');
		const [to] = await tx
			.select({ id: users.id, name: users.name, active: users.active })
			.from(users)
			.where(eq(users.id, input.toUserId))
			.limit(1);
		if (!to || !to.active) throw new CaseError('Choose an active steward.');
		if (to.id === c.stewardId) throw new CaseError(`${to.name} already has this case.`);
		await tx.update(cases).set({ stewardId: to.id }).where(eq(cases.id, caseId));
		await addTimeline(
			tx,
			caseId,
			userId,
			'handoff',
			c.stewardName ? `Handed off from ${c.stewardName} to ${to.name}` : `Assigned to ${to.name}`,
			input.notes,
			{ fromUserId: c.stewardId, fromName: c.stewardName, toUserId: to.id, toName: to.name }
		);
	});
}

export async function deleteCase(caseId: string): Promise<void> {
	await db.delete(cases).where(eq(cases.id, caseId));
}

export async function caseStats(today: ISODate) {
	const open = await listCases({ status: 'open' }, today);
	const [closedThisYear] = await db
		.select({
			total: sql<number>`count(*)::int`,
			won: sql<number>`count(*) filter (where ${cases.outcome} in ('sustained', 'settled'))::int`
		})
		.from(cases)
		.where(
			and(eq(cases.status, 'closed'), sql`${cases.closedOn} >= ${today.slice(0, 4) + '-01-01'}`)
		);
	return {
		open: open.length,
		overdue: open.filter((c) => c.current?.countdown?.urgency === 'overdue').length,
		dueThisWeek: open.filter((c) => {
			const u = c.current?.countdown?.urgency;
			return u === 'today' || u === 'critical' || u === 'soon';
		}).length,
		waitingOnManagement: open.filter((c) => c.current?.party === 'management').length,
		closedThisYear: closedThisYear?.total ?? 0,
		wonOrSettledThisYear: closedThisYear?.won ?? 0,
		openCases: open
	};
}
