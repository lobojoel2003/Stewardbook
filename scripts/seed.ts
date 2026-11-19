/**
 * Demo data: a fictional local, its contract, three stewards and a handful of
 * grievances at different stages. Dates are relative to today, so the dashboard
 * always shows live deadlines.
 *
 *   npm run db:seed            # refuses to run if the database already has users
 *   npm run db:seed -- --reset # wipes every table first
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { connect, disconnect, db, runMigrations } from '../src/lib/server/db/index';
import { extractContract } from '../src/lib/contracts/extract';
import {
	activateContract,
	confirmStep,
	createContract,
	getContract,
	getContractCalendar
} from '../src/lib/server/contracts';
import {
	closeCase,
	completeStep,
	createCase,
	extendStep,
	getCase,
	handoffCase
} from '../src/lib/server/cases';
import { addQuickEntry } from '../src/lib/server/timeline';
import { countUsers, createUser } from '../src/lib/server/users';
import { saveSettings } from '../src/lib/server/settings';
import { addDays, todayIn, type ISODate } from '../src/lib/deadlines/dates';
import type { WorkCalendar } from '../src/lib/deadlines/calendar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TZ = process.env.DEFAULT_TIMEZONE || 'America/New_York';
export const DEMO_PASSWORD = 'stewardbook-demo';

function workingDaysBefore(cal: WorkCalendar, from: ISODate, n: number): ISODate {
	let d = from;
	let count = 0;
	while (count < n) {
		d = addDays(d, -1);
		if (cal.isWorkingDay(d)) count++;
	}
	return d;
}

function at(date: ISODate, time: string): Date {
	return new Date(`${date}T${time}:00`);
}

async function main() {
	const reset = process.argv.includes('--reset');
	connect(process.env.DATABASE_URL, { max: 4 });
	await runMigrations(path.join(root, 'drizzle'));

	if (reset) {
		await db.execute(
			sql`truncate table attachments, timeline_entries, case_articles, case_steps, cases, contract_articles, contract_holidays, contract_steps, contracts, sessions, users, settings restart identity cascade`
		);
	} else if ((await countUsers()) > 0) {
		console.error('The database already has users. Run with --reset to wipe it and load the demo.');
		process.exit(1);
	}

	const today = todayIn(TZ);
	await saveSettings({
		localName: 'Local 512',
		unionName: 'Allied Warehouse Workers',
		timezone: TZ
	});

	const sam = await createUser({
		name: 'Sam Rivera',
		email: 'sam@local512.example',
		password: DEMO_PASSWORD,
		role: 'admin',
		phone: '555-0101'
	});
	const alex = await createUser({
		name: 'Alex Chen',
		email: 'alex@local512.example',
		password: DEMO_PASSWORD,
		role: 'steward',
		phone: '555-0102'
	});
	const priya = await createUser({
		name: 'Priya Natarajan',
		email: 'priya@local512.example',
		password: DEMO_PASSWORD,
		role: 'steward'
	});

	const text = readFileSync(path.join(root, 'examples/sample-contract.txt'), 'utf8');
	const contractId = await createContract({
		name: 'Northgate Distribution CBA 2025–2028',
		employer: 'Northgate Distribution Company',
		effectiveDate: '2025-07-01',
		expirationDate: '2028-06-30',
		sourceText: text,
		sourceFilename: 'northgate-cba-2025.pdf',
		createdBy: sam.id,
		extraction: extractContract(text)
	});
	const contract = (await getContract(contractId))!;
	for (const s of contract.steps) await confirmStep(contractId, s.id, sam.id, true);
	await activateContract(contractId);
	const cal = (await getContractCalendar(contractId))!;
	const art = (n: string) => contract.articles.find((a) => a.number === n)!.id;
	const stepIds = async (id: string) => (await getCase(id, today))!.chain.steps.map((s) => s.id);
	const wd = (n: number) => workingDaysBefore(cal, today, n);

	const note = (
		caseId: string,
		author: string,
		when: Date,
		kind: 'note' | 'witness' | 'weingarten' | 'call' | 'photo',
		title: string,
		body: string,
		data = {},
		files: { filename: string; mimeType: string; data: Buffer }[] = []
	) =>
		addQuickEntry(
			caseId,
			author,
			{ kind, title, body, occurredAt: when, data, clientId: null },
			files
		);

	// 1. Overtime bypass — Step 1 filed, management answer due soon.
	{
		const incident = wd(6);
		const c = await createCase(
			{
				contractId,
				title: 'Overtime bypassed on night shift',
				grievantName: 'Dana Ortiz',
				grievantContact: '555-0134 · nights, Receiving',
				department: 'Receiving',
				supervisor: 'M. Klein',
				incidentDate: incident,
				awareDate: null,
				summary:
					'Saturday overtime in Receiving was offered to K. Mensah and J. Byrne (seniority #47 and #52) before Dana (seniority #14), who had signed the voluntary list and marked herself available.',
				remedy:
					'Pay Dana 4 hours at time and one-half, and post the overtime rotation weekly as Article 6.2 requires.',
				stewardId: sam.id,
				articles: [
					{
						articleId: art('6'),
						note: 'Section 6.2 — overtime offered by seniority on a rotating basis'
					}
				]
			},
			sam.id
		);
		const [s1] = await stepIds(c.id);
		await note(
			c.id,
			sam.id,
			at(addDays(incident, 1), '07:40'),
			'photo',
			'Overtime sign-up sheet, Receiving',
			'Posted list with Dana marked available. Offers went to #47 and #52.',
			{},
			[
				{
					filename: 'overtime-signup.jpg',
					mimeType: 'image/jpeg',
					data: readFileSync(path.join(root, 'examples/seed/overtime-signup.jpg'))
				}
			]
		);
		await note(
			c.id,
			sam.id,
			at(addDays(incident, 1), '08:15'),
			'witness',
			'Witness: Lee Park',
			'I was next to Dana when Klein walked past the list. He said he “needed people who could stay late” and called Mensah over.',
			{
				witnessName: 'Lee Park',
				witnessContact: 'Seniority #22 · nights'
			}
		);
		await completeStep(
			c.id,
			s1,
			{
				date: wd(2),
				completion: 'done',
				note: 'Handed the written grievance to M. Klein at shift start. He signed for it.'
			},
			sam.id
		);
		await note(
			c.id,
			sam.id,
			at(wd(1), '16:05'),
			'call',
			'Talked with HR (T. Alvarez)',
			'HR wants to look at the overtime log before answering. I reminded them the Step 1 answer is due in 5 working days.',
			{
				contact: 'T. Alvarez, HR'
			}
		);
	}

	// 2. Unsafe forklift — Step 1 filing due in two working days.
	{
		const c = await createCase(
			{
				contractId,
				title: 'Forklift #7 kept in service with failed brake check',
				grievantName: 'Marcus Bell',
				grievantContact: '555-0177',
				department: 'Shipping',
				supervisor: 'R. Duarte',
				incidentDate: wd(8),
				awareDate: null,
				summary:
					'Marcus flagged forklift #7 on the pre-shift checklist (brakes pulling left). Supervisor told him to run it anyway and wrote him up when he refused.',
				remedy:
					'Remove the warning, take #7 out of service until repaired, and confirm no employee is disciplined for refusing unsafe equipment.',
				stewardId: alex.id,
				articles: [
					{ articleId: art('13'), note: 'Section 13.2 — right to refuse unsafe equipment' },
					{ articleId: art('8'), note: 'Just cause' }
				]
			},
			alex.id
		);
		await note(
			c.id,
			alex.id,
			at(wd(7), '15:30'),
			'weingarten',
			'Investigatory interview with R. Duarte',
			'Marcus stayed calm. Duarte could not say who signed off on the brake repair.',
			{
				managementRep: 'R. Duarte, Shipping supervisor',
				attendees: 'Marcus Bell, Alex Chen (steward)',
				rightsAsserted: true,
				questions:
					'Q: Did you refuse a direct order?\nA: I refused to drive a forklift that failed its brake check.\nQ: Did you report it?\nA: Yes, on the checklist at 6:02 and to you in person.'
			}
		);
		await note(
			c.id,
			alex.id,
			at(wd(6), '09:10'),
			'note',
			'Pre-shift checklist',
			'Asked maintenance for the repair log for #7. They said the brake part is on back order.'
		);
	}

	// 3. Schedule change without notice — union appeal to Step 2 running.
	{
		const c = await createCase(
			{
				contractId,
				title: 'Shift moved with three days’ notice',
				grievantName: 'Group — Returns team (6 members)',
				grievantContact: 'Contact: Rosa Jimenez, 555-0150',
				department: 'Returns',
				supervisor: 'A. Novak',
				incidentDate: wd(16),
				awareDate: null,
				summary:
					'Returns team’s start time moved from 7:00 to 5:00 with three days’ posted notice. No emergency was claimed.',
				remedy:
					'Restore the 7:00 start and pay the difference for every hour worked outside the posted schedule.',
				stewardId: priya.id,
				articles: [
					{
						articleId: art('5'),
						note: 'Section 5.3 — 14 calendar days’ notice of schedule changes'
					}
				]
			},
			priya.id
		);
		const [s1, s2] = await stepIds(c.id);
		await completeStep(
			c.id,
			s1,
			{ date: wd(8), completion: 'done', note: 'Filed with A. Novak.' },
			priya.id
		);
		await completeStep(
			c.id,
			s2,
			{
				date: wd(1),
				completion: 'done',
				note: 'Denied, two days late: “operational needs.” No emergency named.'
			},
			priya.id
		);
		await note(
			c.id,
			priya.id,
			at(wd(1), '12:00'),
			'note',
			'Group meeting',
			'Five of six members came to the lunch meeting and want to appeal. Collecting statements on childcare costs.'
		);
	}

	// 4. Discharge filed directly at Step 2 — management meeting overdue.
	{
		const c = await createCase(
			{
				contractId,
				title: 'Discharge — alleged time-card falsification',
				grievantName: 'Terrence Hall',
				grievantContact: '555-0199',
				department: 'Maintenance',
				supervisor: 'J. Whitaker',
				incidentDate: wd(14),
				awareDate: null,
				summary:
					'Terrence was discharged for a 22-minute discrepancy on one time card. He says the badge reader at Door 4 was down that week, which maintenance logged.',
				remedy:
					'Reinstatement with full back pay and seniority; purge the discharge from his file.',
				stewardId: sam.id,
				articles: [{ articleId: art('8'), note: 'Just cause; progressive discipline (8.1)' }]
			},
			sam.id
		);
		const ids = await stepIds(c.id);
		// Discharges go straight to Step 2 (Section 9.7): skip Step 1 and its answer.
		await completeStep(
			c.id,
			ids[0],
			{
				date: wd(12),
				completion: 'skipped',
				note: 'Discharge — filed directly at Step 2 under Section 9.7.'
			},
			sam.id
		);
		await completeStep(c.id, ids[1], { date: wd(12), completion: 'skipped', note: '' }, sam.id);
		await completeStep(
			c.id,
			ids[2],
			{ date: wd(11), completion: 'done', note: 'Appeal delivered to Operations Manager.' },
			sam.id
		);
		await note(
			c.id,
			sam.id,
			at(wd(10), '10:00'),
			'witness',
			'Witness: Gloria Reyes',
			'The Door 4 reader was broken from Monday to Thursday that week. We all signed the paper log at the guard desk.',
			{
				witnessName: 'Gloria Reyes',
				witnessContact: 'Maintenance tech, days'
			}
		);
	}

	// 5. Extension by agreement on a Step 3 answer.
	{
		const c = await createCase(
			{
				contractId,
				title: 'Job bid awarded to junior applicant',
				grievantName: 'Lena Kowalski',
				grievantContact: '555-0112',
				department: 'Inventory control',
				supervisor: 'HR — T. Alvarez',
				incidentDate: wd(40),
				awareDate: null,
				summary:
					'Lena (12 years) bid on the Inventory Lead posting and met every listed qualification. The job went to an applicant with 3 years.',
				remedy: 'Award Lena the position retroactively with the pay difference.',
				stewardId: alex.id,
				articles: [{ articleId: art('14'), note: 'Section 14.1 — senior qualified bidder' }]
			},
			alex.id
		);
		const ids = await stepIds(c.id);
		const dates = [wd(37), wd(33), wd(29), wd(26), wd(18), wd(12)];
		for (let i = 0; i < 6; i++)
			await completeStep(c.id, ids[i], { date: dates[i], completion: 'done', note: '' }, alex.id);
		await extendStep(
			c.id,
			ids[6],
			{
				extendedTo: addDays(today, 18),
				note: 'HR asked for two more weeks to interview the hiring panel. Agreed by email (attached to the file).'
			},
			alex.id
		);
		await handoffCase(
			c.id,
			{
				toUserId: priya.id,
				notes:
					'Alex is rotating off nights. Lena prefers email. HR promised the panel notes by the 3rd.'
			},
			alex.id
		);
	}

	// Closed cases — the precedent library.
	const closed: {
		title: string;
		grievant: string;
		dept: string;
		article: string;
		note: string;
		outcome: 'sustained' | 'settled' | 'denied' | 'withdrawn';
		resolution: string;
		daysAgo: number;
		steward: string;
	}[] = [
		{
			title: 'Vacation request denied after seniority bid',
			grievant: 'Hector Ruiz',
			dept: 'Shipping',
			article: '12',
			note: 'Section 12.2 — vacation by seniority',
			outcome: 'sustained',
			resolution:
				'Employer granted the original vacation week and agreed to post the vacation calendar by March 15 each year.',
			daysAgo: 70,
			steward: sam.id
		},
		{
			title: 'Overtime offered out of rotation (Saturday inventory)',
			grievant: 'Ana Lima',
			dept: 'Receiving',
			article: '6',
			note: 'Section 6.2',
			outcome: 'settled',
			resolution:
				'Settled at Step 2: 6 hours at time and one-half paid to the grievant; supervisors retrained on the rotating overtime list.',
			daysAgo: 120,
			steward: alex.id
		},
		{
			title: 'Written warning for attendance — doctor’s note ignored',
			grievant: 'Paul Okafor',
			dept: 'Returns',
			article: '8',
			note: 'Just cause',
			outcome: 'sustained',
			resolution:
				'Warning withdrawn and removed from the file at Step 3; doctor’s notes now go to HR, not the supervisor.',
			daysAgo: 160,
			steward: priya.id
		},
		{
			title: 'No heat-illness breaks during August heat wave',
			grievant: 'Group — Dock crew',
			dept: 'Shipping',
			article: '13',
			note: 'Section 13.3 — water, shade and rest above 80°F',
			outcome: 'settled',
			resolution:
				'Employer installed two cooling stations and a 10-minute break every 2 hours above 80°F; one hour of pay to each crew member.',
			daysAgo: 95,
			steward: sam.id
		},
		{
			title: 'Layoff notice short by four days',
			grievant: 'Kim Tran',
			dept: 'Inventory control',
			article: '7',
			note: 'Section 7.2 — 10 working days’ notice',
			outcome: 'denied',
			resolution:
				'Arbitrator denied: the shortened notice fell under the emergency exception. Lesson: document the employer’s claimed emergency early.',
			daysAgo: 210,
			steward: alex.id
		},
		{
			title: 'Steward denied time to investigate',
			grievant: 'Local 512 (union grievance)',
			dept: '—',
			article: '3',
			note: 'Section 3.2 — paid time to investigate',
			outcome: 'withdrawn',
			resolution:
				'Withdrawn after the employer confirmed in writing that stewards get reasonable paid time after notifying their supervisor.',
			daysAgo: 45,
			steward: sam.id
		}
	];
	for (const k of closed) {
		const target = addDays(today, -k.daysAgo);
		const closedOn = cal.isWorkingDay(target) ? target : workingDaysBefore(cal, target, 1);
		const incident = workingDaysBefore(cal, closedOn, 30);
		const c = await createCase(
			{
				contractId,
				title: k.title,
				grievantName: k.grievant,
				grievantContact: '',
				department: k.dept,
				supervisor: '',
				incidentDate: incident,
				awareDate: null,
				summary: k.title + '.',
				remedy: '',
				stewardId: k.steward,
				articles: [{ articleId: art(k.article), note: k.note }]
			},
			k.steward
		);
		const ids = await stepIds(c.id);
		await completeStep(
			c.id,
			ids[0],
			{ date: workingDaysBefore(cal, closedOn, 24), completion: 'done', note: '' },
			k.steward
		);
		await closeCase(c.id, { outcome: k.outcome, resolution: k.resolution, closedOn }, k.steward);
	}

	// Backdate "case opened" entries so the demo timeline reads naturally.
	await db.execute(sql`
		update timeline_entries t set occurred_at = (c.incident_date + interval '1 day' + interval '14 hours')
		from cases c where t.case_id = c.id and t.kind = 'created'`);
	await db.execute(
		sql`update cases set created_at = incident_date + interval '1 day' + interval '14 hours'`
	);

	console.log(`Seeded the demo local. Sign in as sam@local512.example / ${DEMO_PASSWORD}`);
	await disconnect();
}

main().catch(async (err) => {
	console.error(err);
	await disconnect();
	process.exit(1);
});
