/**
 * Service-level tests against a real Postgres. Set TEST_DATABASE_URL to run them
 * (CI does); they're skipped otherwise. The database is wiped first.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, db, disconnect, runMigrations } from './db';
import { extractContract } from '../contracts/extract';
import {
	ActivationError,
	activateContract,
	addFederalHolidays,
	addStep,
	confirmStep,
	createContract,
	deleteContract,
	getContract,
	listContracts,
	moveStep,
	updateStep
} from './contracts';
import {
	CaseError,
	adjustStepStart,
	caseStats,
	closeCase,
	completeStep,
	createCase,
	extendStep,
	getCase,
	handoffCase,
	listCases,
	reopenCase,
	undoLastStep
} from './cases';
import { addQuickEntry, deleteEntry, recentActivity } from './timeline';
import { articleIndex, getArticle, searchPrecedents } from './library';
import {
	createSession,
	hashPassword,
	invalidateSession,
	validateSession,
	verifyPassword,
	Throttle
} from './auth';
import {
	DuplicateEmailError,
	countUsers,
	createUser,
	findUserByCalendarToken,
	regenerateCalendarToken
} from './users';
import { getSettings, saveSettings, today as localToday } from './settings';

const url = process.env.TEST_DATABASE_URL;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!url)('services (Postgres)', () => {
	let admin: { id: string };
	let steward: { id: string };
	let contractId = '';
	let caseId = '';
	const sample = readFileSync(path.join(root, 'examples/sample-contract.txt'), 'utf8');

	beforeAll(async () => {
		connect(url, { max: 4 });
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`drop schema if exists drizzle cascade`);
		await db.execute(sql`create schema public`);
		await runMigrations(path.join(root, 'drizzle'));
	});

	afterAll(async () => {
		await disconnect();
	});

	it('hashes passwords and manages sessions', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(hash.startsWith('scrypt$')).toBe(true);
		expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
		expect(await verifyPassword('wrong', hash)).toBe(false);
		expect(await verifyPassword('x', 'not-a-hash')).toBe(false);

		admin = await createUser({
			name: 'Sam Rivera',
			email: 'Sam@Example.org',
			password: 'correct horse battery',
			role: 'admin'
		});
		steward = await createUser({
			name: 'Alex Chen',
			email: 'alex@example.org',
			password: 'correct horse battery',
			role: 'steward'
		});
		await expect(
			createUser({
				name: 'Dup',
				email: 'sam@example.org',
				password: 'x'.repeat(12),
				role: 'steward'
			})
		).rejects.toBeInstanceOf(DuplicateEmailError);
		expect(await countUsers()).toBe(2);

		const { token } = await createSession(admin.id, 'vitest');
		const session = await validateSession(token);
		expect(session?.user).toMatchObject({ email: 'sam@example.org', role: 'admin' });
		await invalidateSession(session!.sessionId);
		expect(await validateSession(token)).toBeNull();

		const cal = await regenerateCalendarToken(admin.id);
		expect((await findUserByCalendarToken(cal))?.id).toBe(admin.id);
		expect(await findUserByCalendarToken('short')).toBeNull();
	});

	it('throttles repeated failures', () => {
		const t = new Throttle(2, 1000);
		t.fail('k', 0);
		expect(t.blocked('k', 10)).toBe(false);
		t.fail('k', 20);
		expect(t.blocked('k', 30)).toBe(true);
		expect(t.blocked('k', 2000)).toBe(false);
	});

	it('stores local settings', async () => {
		expect(await getSettings()).toBeNull();
		await saveSettings({ localName: 'Local 512', unionName: 'AWW', timezone: 'Not/AZone' });
		expect(await getSettings()).toMatchObject({
			localName: 'Local 512',
			timezone: 'America/New_York'
		});
		expect(await localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('creates a contract in draft and only activates once every step is confirmed', async () => {
		contractId = await createContract({
			name: 'Northgate CBA',
			employer: 'Northgate',
			effectiveDate: '2025-07-01',
			expirationDate: '2028-06-30',
			sourceText: sample,
			sourceFilename: null,
			createdBy: admin.id,
			extraction: extractContract(sample)
		});
		const c = (await getContract(contractId))!;
		expect(c.status).toBe('draft');
		expect(c.steps).toHaveLength(8);
		expect(c.holidays).toHaveLength(10);
		expect(c.articles).toHaveLength(15);
		await expect(activateContract(contractId)).rejects.toBeInstanceOf(ActivationError);

		for (const s of c.steps) await confirmStep(contractId, s.id, admin.id, true);
		await activateContract(contractId);
		expect((await getContract(contractId))!.status).toBe('active');

		// Unconfirming a step drops the contract back to draft.
		await confirmStep(contractId, c.steps[0].id, admin.id, false);
		expect((await getContract(contractId))!.status).toBe('draft');
		await updateStep(
			contractId,
			c.steps[0].id,
			{ stage: 'Step 1', name: 'File grievance', party: 'union', days: 10, dayType: 'business' },
			admin.id,
			true
		);
		await activateContract(contractId);

		expect(await addFederalHolidays(contractId)).toBeGreaterThan(0);
		expect(await addFederalHolidays(contractId)).toBe(0);
		const list = await listContracts();
		expect(list[0]).toMatchObject({ steps: 8, confirmedSteps: 8, articles: 15 });
	});

	it('reorders and adds steps', async () => {
		const scratch = await createContract({
			name: 'Scratch',
			employer: '',
			effectiveDate: null,
			expirationDate: null,
			sourceText: 'nothing here',
			sourceFilename: null,
			createdBy: admin.id,
			extraction: extractContract('nothing here')
		});
		await addStep(
			scratch,
			{ stage: 'Step 1', name: 'File', party: 'union', days: 5, dayType: 'business' },
			admin.id
		);
		await addStep(
			scratch,
			{ stage: 'Step 1', name: 'Answer', party: 'management', days: 5, dayType: 'business' },
			admin.id
		);
		const before = (await getContract(scratch))!.steps;
		await moveStep(scratch, before[1].id, -1);
		expect((await getContract(scratch))!.steps.map((s) => s.name)).toEqual(['Answer', 'File']);
		await activateContract(scratch); // hand-added steps count as confirmed
		expect(await deleteContract(scratch)).toBe(true);
	});

	it('runs a case through its steps', async () => {
		const c = (await getContract(contractId))!;
		const overtime = c.articles.find((a) => a.number === '6')!;
		const created = await createCase(
			{
				contractId,
				title: 'Overtime bypass',
				grievantName: 'Dana Ortiz',
				grievantContact: '',
				department: 'Receiving',
				supervisor: 'M. Klein',
				incidentDate: '2026-11-02',
				awareDate: null,
				summary: 'Junior operators got the overtime.',
				remedy: '4 hours at 1.5x',
				stewardId: admin.id,
				articles: [{ articleId: overtime.id, note: 'Section 6.2' }]
			},
			admin.id
		);
		caseId = created.id;
		expect(created.number).toBe('2026-001');

		let detail = (await getCase(caseId, '2026-11-05'))!;
		// 10 working days, skipping Veterans Day (added with the federal list above).
		expect(detail.chain.current?.effectiveDue).toBe('2026-11-17');
		expect(detail.articles[0]).toMatchObject({ number: '6', note: 'Section 6.2' });

		const [s1, s2] = detail.chain.steps;
		await expect(
			completeStep(caseId, s2.id, { date: '2026-11-05', completion: 'done', note: '' }, admin.id)
		).rejects.toBeInstanceOf(CaseError);
		await expect(
			completeStep(caseId, s1.id, { date: '2026-10-01', completion: 'done', note: '' }, admin.id)
		).rejects.toThrow(/before the step started/);
		await completeStep(
			caseId,
			s1.id,
			{ date: '2026-11-10', completion: 'done', note: 'Filed' },
			admin.id
		);

		detail = (await getCase(caseId, '2026-11-12'))!;
		expect(detail.chain.current?.id).toBe(s2.id);
		expect(detail.chain.current?.startedOn).toBe('2026-11-10');

		await extendStep(caseId, s2.id, { extendedTo: '2026-12-01', note: 'Agreed' }, admin.id);
		detail = (await getCase(caseId, '2026-11-12'))!;
		expect(detail.chain.current?.effectiveDue).toBe('2026-12-01');

		await adjustStepStart(caseId, s2.id, '2026-11-11', admin.id);
		await completeStep(
			caseId,
			s2.id,
			{ date: '2026-12-01', completion: 'no_response', note: '' },
			admin.id
		);
		detail = (await getCase(caseId, '2026-12-02'))!;
		// The appeal clock starts from the missed (extended) answer date.
		expect(detail.chain.current?.startedOn).toBe('2026-12-01');

		await undoLastStep(caseId, admin.id);
		detail = (await getCase(caseId, '2026-12-02'))!;
		expect(detail.chain.current?.id).toBe(s2.id);
		expect(detail.timeline.filter((e) => e.kind === 'step')).toHaveLength(4);

		const open = await listCases({ status: 'open' }, '2026-12-02');
		expect(open.map((r) => r.number)).toContain('2026-001');
		expect((await listCases({ status: 'open', q: 'Dana' }, '2026-12-02')).length).toBe(1);
		expect((await caseStats('2026-12-02')).open).toBe(1);
	});

	it('keeps quick entries idempotent and only lets authors delete them', async () => {
		const input = {
			kind: 'note' as const,
			title: '',
			body: 'Shift notes',
			occurredAt: new Date(),
			data: {},
			clientId: 'client-abc-123'
		};
		const first = await addQuickEntry(caseId, steward.id, input, [
			{ filename: 'list.jpg', mimeType: 'image/jpeg', data: Buffer.from([1, 2, 3]) }
		]);
		const again = await addQuickEntry(caseId, steward.id, input, []);
		expect(again).toEqual({ id: first.id, duplicate: true });
		expect((await getCase(caseId, '2026-12-02'))!.attachmentCount).toBe(1);

		expect(await deleteEntry(caseId, first.id, { id: admin.id, role: 'steward' })).toBe(false);
		expect(await deleteEntry(caseId, first.id, { id: steward.id, role: 'steward' })).toBe(true);
		expect((await recentActivity(5)).length).toBeGreaterThan(0);
	});

	it('hands off, closes, reopens and feeds the precedent library', async () => {
		await handoffCase(caseId, { toUserId: steward.id, notes: 'Call Dana' }, admin.id);
		await expect(
			handoffCase(caseId, { toUserId: steward.id, notes: '' }, admin.id)
		).rejects.toThrow(/already has/);
		expect((await getCase(caseId, '2026-12-02'))!.steward?.name).toBe('Alex Chen');

		await closeCase(
			caseId,
			{
				outcome: 'settled',
				resolution: 'Paid four hours at time and a half',
				closedOn: '2026-12-10'
			},
			steward.id
		);
		const results = await searchPrecedents({ q: 'four hours' });
		expect(results.map((r) => r.number)).toEqual(['2026-001']);
		expect(results[0].articles[0].number).toBe('6');
		expect(await searchPrecedents({ outcome: 'denied' })).toHaveLength(0);

		const index = await articleIndex();
		const overtime = index.find((a) => a.number === '6')!;
		expect(overtime).toMatchObject({ citations: 1, settled: 1 });
		const article = (await getArticle(overtime.id))!;
		expect(article.citing[0].number).toBe('2026-001');

		await reopenCase(caseId, 'Payment never arrived', admin.id);
		const reopened = (await getCase(caseId, '2026-12-11'))!;
		expect(reopened.status).toBe('open');
		expect(reopened.outcome).toBeNull();
	});
});
