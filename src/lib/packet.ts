/**
 * The case handoff packet: everything the next steward needs, in one document.
 * Rendered as Markdown for download and reused by the printable HTML page.
 */
import { formatLong, type ISODate } from './deadlines/dates';
import { countdownLabel, type Countdown } from './deadlines/engine';
import { DAY_TYPE_LABELS, PARTY_LABELS, type Party } from './deadlines/chain';
import type { DayType } from './deadlines/engine';
import { ENTRY_LABELS, OUTCOME_LABELS, type Outcome } from './labels';

export interface PacketStep {
	stage: string;
	name: string;
	party: Party;
	days: number;
	dayType: DayType;
	state: string;
	startedOn: ISODate | null;
	completedOn: ISODate | null;
	effectiveDue: ISODate | null;
	extendedTo: ISODate | null;
	onTime: boolean | null;
	countdown: Countdown | null;
}

export interface PacketEntry {
	kind: string;
	title: string;
	body: string;
	occurredAt: Date | string;
	authorName: string | null;
	data: Record<string, unknown>;
	attachments: { filename: string }[];
}

export interface PacketCase {
	number: string;
	title: string;
	status: 'open' | 'closed';
	outcome: Outcome | null;
	resolution: string;
	closedOn: ISODate | null;
	grievantName: string;
	grievantContact: string;
	department: string;
	supervisor: string;
	incidentDate: ISODate;
	awareDate: ISODate | null;
	summary: string;
	remedy: string;
	contract: { name: string; employer: string };
	steward: { name: string; email?: string | null; phone?: string | null } | null;
	chain: { steps: PacketStep[]; current: PacketStep | null };
	articles: { number: string; title: string; note: string; body?: string }[];
	timeline: PacketEntry[];
}

const STATE_LABEL: Record<string, string> = {
	done: 'Done',
	no_response: 'No response',
	skipped: 'Skipped',
	active: 'Running',
	pending: 'Not started'
};

function md(text: string): string {
	return text.replace(/([\\`*_[\]#|<>])/g, '\\$1');
}

function when(value: Date | string): string {
	const d = typeof value === 'string' ? new Date(value) : value;
	return d.toISOString().slice(0, 10);
}

export function witnesses(c: PacketCase): { name: string; contact: string; statement: string }[] {
	return c.timeline
		.filter((e) => e.kind === 'witness')
		.map((e) => ({
			name: typeof e.data.witnessName === 'string' ? e.data.witnessName : e.title,
			contact: typeof e.data.witnessContact === 'string' ? e.data.witnessContact : '',
			statement: e.body
		}));
}

export function renderPacketMarkdown(
	c: PacketCase,
	opts: { generatedAt: Date; generatedBy: string; localName: string; notes?: string }
): string {
	const out: string[] = [];
	const push = (...lines: string[]) => out.push(...lines);

	push(`# Handoff packet — Case ${c.number}`, '');
	push(`**${md(c.title)}**`, '');
	push(
		`${md(opts.localName)} · ${md(c.contract.name)}${c.contract.employer ? ` (${md(c.contract.employer)})` : ''}`,
		`Generated ${when(opts.generatedAt)} by ${md(opts.generatedBy)}`,
		''
	);

	push('## Where it stands', '');
	if (c.status === 'closed') {
		push(
			`Closed${c.closedOn ? ` on ${formatLong(c.closedOn)}` : ''} — **${c.outcome ? OUTCOME_LABELS[c.outcome] : 'closed'}**.`
		);
		if (c.resolution) push('', md(c.resolution));
	} else if (c.chain.current) {
		const s = c.chain.current;
		push(
			`- **Running now:** ${md(s.stage)} — ${md(s.name)} (${PARTY_LABELS[s.party]} must act)`,
			`- **Deadline:** ${s.effectiveDue ? formatLong(s.effectiveDue) : '—'}${s.extendedTo ? ' (extended by agreement)' : ''}`,
			`- **Time left:** ${s.countdown ? countdownLabel(s.countdown) : '—'}`
		);
	} else {
		push('Open, with no step clock running.');
	}
	if (opts.notes?.trim())
		push('', '### Notes from the outgoing steward', '', md(opts.notes.trim()));
	push('');

	push('## The grievance', '');
	push(
		`- **Grievant:** ${md(c.grievantName)}${c.grievantContact ? ` — ${md(c.grievantContact)}` : ''}`,
		`- **Department:** ${md(c.department || '—')}`,
		`- **Supervisor:** ${md(c.supervisor || '—')}`,
		`- **Incident date:** ${formatLong(c.incidentDate)}`
	);
	if (c.awareDate) push(`- **Grievant became aware:** ${formatLong(c.awareDate)}`);
	push(`- **Current steward:** ${c.steward ? md(c.steward.name) : 'Unassigned'}`, '');
	if (c.summary) push('**What happened**', '', md(c.summary), '');
	if (c.remedy) push('**Remedy sought**', '', md(c.remedy), '');

	push('## Contract articles cited', '');
	if (c.articles.length) {
		for (const a of c.articles)
			push(`- **Article ${md(a.number)} — ${md(a.title)}**${a.note ? `: ${md(a.note)}` : ''}`);
	} else push('None recorded yet.');
	push('');

	push('## Step deadlines', '');
	push(
		'| Step | Action | Party | Limit | Started | Due | Finished | Status |',
		'|---|---|---|---|---|---|---|---|'
	);
	for (const s of c.chain.steps) {
		const status =
			STATE_LABEL[s.state] +
			(s.onTime === false ? ' (late)' : '') +
			(s.state === 'active' && s.countdown ? ` — ${countdownLabel(s.countdown)}` : '');
		push(
			`| ${md(s.stage)} | ${md(s.name)} | ${PARTY_LABELS[s.party]} | ${s.days} ${DAY_TYPE_LABELS[s.dayType]} | ${s.startedOn ?? '—'} | ${s.effectiveDue ?? '—'} | ${s.completedOn ?? '—'} | ${status} |`
		);
	}
	push('');

	const ws = witnesses(c);
	push('## Witnesses', '');
	if (ws.length) {
		for (const w of ws)
			push(
				`- **${md(w.name)}**${w.contact ? ` (${md(w.contact)})` : ''}${w.statement ? ` — ${md(w.statement)}` : ''}`
			);
	} else push('None recorded.');
	push('');

	push('## Timeline', '');
	const chronological = [...c.timeline].sort(
		(a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
	);
	for (const e of chronological) {
		const label = ENTRY_LABELS[e.kind] ?? e.kind;
		const head = `- **${when(e.occurredAt)} · ${label}**${e.title && e.title !== label ? ` — ${md(e.title)}` : ''}${e.authorName ? ` _(${md(e.authorName)})_` : ''}`;
		push(head);
		if (e.body) push(`  ${md(e.body).replace(/\n/g, '\n  ')}`);
		if (e.attachments.length)
			push(`  Attachments: ${e.attachments.map((a) => md(a.filename)).join(', ')}`);
	}
	push('');
	return out.join('\n');
}
