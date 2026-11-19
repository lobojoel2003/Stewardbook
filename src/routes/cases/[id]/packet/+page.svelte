<script lang="ts">
	import { ArrowLeft, Download, Printer } from '@lucide/svelte';
	import {
		DAY_TYPE_LABELS,
		PARTY_LABELS,
		countdownLabel,
		formatLong
	} from '#lib/deadlines/index.ts';
	import { ENTRY_LABELS, OUTCOME_LABELS } from '#lib/labels.ts';
	import { formatDateTime } from '#lib/format.ts';
	import { witnesses } from '#lib/packet.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.case);
	const chronological = $derived([...c.timeline].reverse());
	const ws = $derived(witnesses(c));
	const STATE: Record<string, string> = {
		done: 'Done',
		no_response: 'No response',
		skipped: 'Skipped',
		active: 'Running',
		pending: 'Not started'
	};
</script>

<div class="toolbar no-print">
	<a class="btn ghost small" href="/cases/{c.id}"><ArrowLeft size={16} /> Back to case</a>
	<div class="row">
		<a class="btn small" href="/cases/{c.id}/packet.md" download><Download size={15} /> Markdown</a>
		<button class="btn small primary" onclick={() => window.print()}>
			<Printer size={15} /> Print or save as PDF
		</button>
	</div>
</div>

{#if data.justHandedOff}
	<div class="callout success no-print handed">
		Case handed off to <strong>{c.steward?.name}</strong>. Print this packet or send them the link —
		the case is already in their list.
	</div>
{/if}

<article class="packet">
	<header>
		<div class="brand">
			<img src="/icons/icon.svg" alt="" width="36" height="36" />
			<div>
				<div class="serif name">Stewardbook</div>
				<div class="tiny muted">{data.localName}</div>
			</div>
		</div>
		<div class="meta tiny muted">Handoff packet · generated {formatLong(data.today)}</div>
	</header>

	<h1><span class="mono">{c.number}</span> {c.title}</h1>
	<p class="sub">
		{c.contract.name}{c.contract.employer ? ` · ${c.contract.employer}` : ''} · Steward:
		<strong>{c.steward?.name ?? 'Unassigned'}</strong>
		{#if c.steward?.phone}· {c.steward.phone}{/if}
	</p>

	<section class="status">
		{#if c.status === 'closed'}
			<h2>
				Closed — {c.outcome ? OUTCOME_LABELS[c.outcome] : 'closed'}{c.closedOn
					? ` on ${formatLong(c.closedOn)}`
					: ''}
			</h2>
			{#if c.resolution}<p class="prose">{c.resolution}</p>{/if}
		{:else if c.chain.current}
			{@const s = c.chain.current}
			<div class="now {s.countdown?.urgency}">
				<div>
					<div class="label">Running now · {PARTY_LABELS[s.party]} must act</div>
					<h2>{s.stage}: {s.name}</h2>
				</div>
				<div class="due">
					<strong>{formatLong(s.effectiveDue!)}</strong>
					<span>
						{s.countdown ? countdownLabel(s.countdown) : ''}{s.extendedTo
							? ' · extended by agreement'
							: ''}
					</span>
				</div>
			</div>
		{:else}
			<h2>Open — no step clock running</h2>
		{/if}
		{#if data.lastHandoff?.body}
			<div class="notes">
				<div class="label">
					Notes from {data.lastHandoff.data.fromName ?? 'the previous steward'}
				</div>
				<p class="prose">{data.lastHandoff.body}</p>
			</div>
		{/if}
	</section>

	<div class="cols">
		<section>
			<h3>The grievance</h3>
			<dl>
				<dt>Grievant</dt>
				<dd>{c.grievantName}{c.grievantContact ? ` — ${c.grievantContact}` : ''}</dd>
				<dt>Department</dt>
				<dd>{c.department || '—'}</dd>
				<dt>Supervisor</dt>
				<dd>{c.supervisor || '—'}</dd>
				<dt>Incident</dt>
				<dd>{formatLong(c.incidentDate)}</dd>
				{#if c.awareDate}<dt>Learned of it</dt>
					<dd>{formatLong(c.awareDate)}</dd>{/if}
			</dl>
			{#if c.summary}<h4>What happened</h4>
				<p class="prose">{c.summary}</p>{/if}
			{#if c.remedy}<h4>Remedy sought</h4>
				<p class="prose">{c.remedy}</p>{/if}
		</section>
		<section>
			<h3>Contract articles cited</h3>
			{#if c.articles.length}
				<ul class="arts">
					{#each c.articles as a (a.id)}<li>
							<strong>Article {a.number} — {a.title}</strong>{#if a.note}<br /><span class="soft">
									{a.note}
								</span>{/if}
						</li>{/each}
				</ul>
			{:else}<p class="muted">None recorded.</p>{/if}
			<h3>Witnesses</h3>
			{#if ws.length}
				<ul class="arts">
					{#each ws as w, i (i)}<li>
							<strong>{w.name}</strong>{w.contact ? ` (${w.contact})` : ''}{#if w.statement}<br
								/><span class="soft">{w.statement}</span>{/if}
						</li>{/each}
				</ul>
			{:else}<p class="muted">None recorded.</p>{/if}
		</section>
	</div>

	<section>
		<h3>Step deadlines</h3>
		<table>
			<thead>
				<tr>
					<th>Step</th><th>Action</th><th>Party</th><th>Limit</th><th>Started</th><th>Due</th><th>
						Finished
					</th><th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#each c.chain.steps as s (s.id)}
					<tr class={s.state}>
						<td>{s.stage}</td>
						<td>{s.name}</td>
						<td>{PARTY_LABELS[s.party]}</td>
						<td class="num">{s.days} {DAY_TYPE_LABELS[s.dayType]}</td>
						<td class="num date">{s.startedOn ?? '—'}</td>
						<td class="num date">{s.effectiveDue ?? '—'}</td>
						<td class="num date">{s.completedOn ?? '—'}</td>
						<td>{STATE[s.state]}{s.onTime === false ? ' (late)' : ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section>
		<h3>Timeline</h3>
		<ol class="tl">
			{#each chronological as e (e.id)}
				<li>
					<div class="when tiny muted">{formatDateTime(e.occurredAt)}</div>
					<div>
						<strong>{e.title || ENTRY_LABELS[e.kind]}</strong>
						<span class="tiny muted">· {ENTRY_LABELS[e.kind]} · {e.authorName ?? '—'}</span>
						{#if e.kind === 'weingarten' && e.data.questions}<p class="prose small">
								{e.data.questions}
							</p>{/if}
						{#if e.body}<p class="prose small">{e.body}</p>{/if}
						{#if e.attachments.length}
							<div class="atts">
								{#each e.attachments as a (a.id)}
									{#if a.mimeType.startsWith('image/')}<img
											src="/attachments/{a.id}"
											alt={a.filename}
										/>{:else}<span class="tiny">📎 {a.filename}</span>{/if}
								{/each}
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	</section>
</article>

<style>
	.toolbar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 12px 20px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.handed {
		max-width: 860px;
		margin: 16px auto 0;
	}

	.packet {
		max-width: 860px;
		margin: 24px auto 80px;
		padding: 40px 48px;
		background: #fff;
		color: #111;
		border-radius: 6px;
		box-shadow: var(--shadow);
		font-size: 0.95rem;
		--text-soft: #444;
		--text-muted: #666;
	}

	@media (max-width: 700px) {
		.packet {
			padding: 24px 18px;
			margin: 0 0 80px;
			border-radius: 0;
		}
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 2px solid #1d2b4a;
		padding-bottom: 12px;
		margin-bottom: 20px;
	}

	.brand {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.brand img {
		border-radius: 8px;
	}

	.name {
		font-weight: 700;
		font-size: 1.1rem;
	}

	h1 {
		font-size: 1.5rem;
		color: #111;
	}

	h1 .mono {
		color: #666;
		font-weight: 600;
	}

	.sub {
		margin: 6px 0 18px;
		color: #444;
	}

	.status {
		padding: 16px 18px;
		border-radius: 10px;
		background: #f5f3ee;
		margin-bottom: 22px;
	}

	.now {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		align-items: flex-end;
	}

	.now.overdue .due strong,
	.now.today .due strong,
	.now.critical .due strong {
		color: #b3261b;
	}

	.label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #666;
	}

	.status h2 {
		font-size: 1.15rem;
		margin-top: 4px;
	}

	.due {
		display: flex;
		flex-direction: column;
		text-align: right;
	}

	.due strong {
		font-size: 1.15rem;
	}

	.notes {
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px dashed #ccc;
	}

	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 28px;
	}

	@media (max-width: 700px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}

	h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: #1d2b4a;
		margin: 18px 0 8px;
		padding-bottom: 4px;
		border-bottom: 1px solid #ddd;
	}

	h4 {
		font-size: 0.85rem;
		margin: 12px 0 2px;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 3px 12px;
		margin: 0;
	}

	dt {
		color: #666;
	}

	dd {
		margin: 0;
	}

	.arts {
		margin: 0;
		padding-left: 18px;
	}

	.arts li + li {
		margin-top: 6px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
	}

	th,
	td {
		text-align: left;
		padding: 6px 8px;
		border-bottom: 1px solid #e3e3e3;
		vertical-align: top;
	}

	th {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: #666;
	}

	td.date {
		white-space: nowrap;
	}

	tr.active td {
		background: #fff6e0;
		font-weight: 600;
	}

	.tl {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.tl li {
		display: grid;
		grid-template-columns: 150px 1fr;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid #eee;
		break-inside: avoid;
	}

	@media (max-width: 600px) {
		.tl li {
			grid-template-columns: 1fr;
			gap: 2px;
		}
	}

	.atts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}

	.atts img {
		width: 140px;
		height: 105px;
		object-fit: cover;
		border-radius: 4px;
	}

	@media print {
		.packet {
			margin: 0;
			padding: 0;
			box-shadow: none;
			max-width: none;
		}
		:global(body) {
			background: #fff;
		}
	}
</style>
