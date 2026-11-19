import { describe, expect, it } from 'vitest';
import { renderPacketMarkdown, witnesses, type PacketCase } from './packet';

const packetCase: PacketCase = {
	number: '2026-007',
	title: 'Overtime bypass on the night shift',
	status: 'open',
	outcome: null,
	resolution: '',
	closedOn: null,
	grievantName: 'Dana Ortiz',
	grievantContact: '555-0134',
	department: 'Receiving',
	supervisor: 'M. Klein',
	incidentDate: '2026-11-02',
	awareDate: null,
	summary: 'Junior forklift operator was offered 4 hours of overtime first.',
	remedy: 'Pay 4 hours at time and one-half.',
	contract: { name: 'Northgate CBA 2025–2028', employer: 'Northgate Distribution Co.' },
	steward: { name: 'Sam Rivera' },
	chain: {
		current: {
			stage: 'Step 1',
			name: 'Management answer',
			party: 'management',
			days: 5,
			dayType: 'business',
			state: 'active',
			startedOn: '2026-11-10',
			completedOn: null,
			effectiveDue: '2026-11-18',
			extendedTo: null,
			onTime: null,
			countdown: {
				due: '2026-11-18',
				today: '2026-11-13',
				dayType: 'business',
				workingDaysLeft: 3,
				calendarDaysLeft: 5,
				unitsLeft: 3,
				urgency: 'soon'
			}
		},
		steps: []
	},
	articles: [{ number: '6', title: 'Overtime', note: 'Section 6.2 — by seniority' }],
	timeline: [
		{
			kind: 'witness',
			title: 'Witness statement',
			body: 'Saw the supervisor skip the list.',
			occurredAt: '2026-11-04T15:00:00Z',
			authorName: 'Sam Rivera',
			data: { witnessName: 'Lee Park', witnessContact: 'Line 3' },
			attachments: []
		},
		{
			kind: 'created',
			title: 'Case 2026-007 opened',
			body: '',
			occurredAt: '2026-11-03T15:00:00Z',
			authorName: 'Sam Rivera',
			data: {},
			attachments: []
		}
	]
};
packetCase.chain.steps = [packetCase.chain.current!];

describe('handoff packet', () => {
	const markdown = renderPacketMarkdown(packetCase, {
		generatedAt: new Date('2026-11-13T12:00:00Z'),
		generatedBy: 'Sam Rivera',
		localName: 'Local 512',
		notes: 'Call Dana before Friday.'
	});

	it('leads with the running deadline', () => {
		expect(markdown).toContain('# Handoff packet — Case 2026-007');
		expect(markdown).toContain('**Running now:** Step 1 — Management answer (Management must act)');
		expect(markdown).toContain('**Deadline:** Wed, Nov 18, 2026');
		expect(markdown).toContain('**Time left:** 3 working days left');
		expect(markdown).toContain('Call Dana before Friday.');
	});

	it('lists articles, witnesses and a chronological timeline', () => {
		expect(markdown).toContain('**Article 6 — Overtime**: Section 6.2 — by seniority');
		expect(markdown).toContain('**Lee Park** (Line 3) — Saw the supervisor skip the list.');
		expect(markdown.indexOf('Case opened')).toBeLessThan(markdown.indexOf('Witness statement'));
		expect(markdown).toContain('| Step 1 | Management answer | Management | 5 working days |');
	});

	it('extracts witnesses', () => {
		expect(witnesses(packetCase)).toEqual([
			{ name: 'Lee Park', contact: 'Line 3', statement: 'Saw the supervisor skip the list.' }
		]);
	});

	it('escapes markdown in user text', () => {
		const md = renderPacketMarkdown(
			{ ...packetCase, title: 'Pay *bonus* [issue]' },
			{ generatedAt: new Date(), generatedBy: 'x', localName: 'y' }
		);
		expect(md).toContain('Pay \\*bonus\\* \\[issue\\]');
	});
});
