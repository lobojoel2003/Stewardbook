<script lang="ts">
	import {
		ArrowRight,
		CalendarClock,
		CircleAlert,
		FolderOpen,
		Gavel,
		Plus,
		ScrollText,
		Trophy
	} from '@lucide/svelte';
	import CountdownChip from '#lib/components/CountdownChip.svelte';
	import EntryIcon from '#lib/components/EntryIcon.svelte';
	import { PARTY_LABELS, formatLong } from '#lib/deadlines/index.ts';
	import { relativeTime } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const greeting = $derived.by(() => {
		const h = new Date().getHours();
		return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
	});
	const firstName = $derived(data.user!.name.split(' ')[0]);
</script>

<div class="page">
	<header class="page-header">
		<div>
			<div class="eyebrow">{formatLong(data.today)}</div>
			<h1>{greeting}, {firstName}</h1>
			<p>
				{#if data.stats.overdue}
					<strong class="alert">
						{data.stats.overdue}
						{data.stats.overdue === 1 ? 'deadline has' : 'deadlines have'} passed.
					</strong>
				{/if}
				{#if data.stats.dueThisWeek}
					{data.stats.dueThisWeek} due within five working days.
				{:else if data.stats.open}
					Nothing due in the next five working days.
				{:else}
					No open grievances.
				{/if}
			</p>
		</div>
		<a class="btn accent" href="/cases/new"><Plus size={18} /> New case</a>
	</header>

	{#if !data.hasActiveContract}
		<div class="callout info setup">
			<ScrollText size={20} />
			<div class="stack" style="--gap: 6px">
				<strong>Start by adding your contract.</strong>
				<span>
					Paste or upload your collective bargaining agreement. Stewardbook finds the grievance
					steps, the day counts and the holidays, then asks you to confirm each one.
				</span>
				<div class="row">
					{#each data.draftContracts as c (c.id)}
						<a class="btn small" href="/contracts/{c.id}">
							Finish reviewing {c.name}{c.pending ? ` (${c.pending} to confirm)` : ''}
						</a>
					{/each}
					<a class="btn primary small" href="/contracts/new">Add a contract</a>
				</div>
			</div>
		</div>
	{/if}

	<section class="stats" aria-label="Summary">
		<a class="stat" href="/cases">
			<FolderOpen size={18} />
			<strong class="num">{data.stats.open}</strong>
			<span>Open grievances</span>
		</a>
		<a class="stat danger" class:zero={!data.stats.overdue} href="/cases">
			<CircleAlert size={18} />
			<strong class="num">{data.stats.overdue}</strong>
			<span>Past deadline</span>
		</a>
		<a class="stat warn" href="/cases">
			<CalendarClock size={18} />
			<strong class="num">{data.stats.dueThisWeek}</strong>
			<span>Due in 5 working days</span>
		</a>
		<a class="stat" href="/library">
			<Trophy size={18} />
			<strong class="num">
				{data.stats.wonOrSettledThisYear}<small>/{data.stats.closedThisYear}</small>
			</strong>
			<span>Won or settled this year</span>
		</a>
	</section>

	<div class="split">
		<section class="card">
			<div class="card-header">
				<h2>Deadlines</h2>
				<a class="link small" href="/cases">
					All cases <ArrowRight size={14} style="vertical-align: -2px" />
				</a>
			</div>
			{#if data.deadlines.length}
				<ul class="list deadlines">
					{#each data.deadlines as c (c.id)}
						<li>
							<a href="/cases/{c.id}" class="deadline {c.current?.countdown?.urgency}">
								<span class="bar" aria-hidden="true"></span>
								<span class="main">
									<span class="top">
										<span class="mono num muted">{c.number}</span>
										<span class="badge {c.current?.party === 'union' ? 'red' : 'blue'}">
											{PARTY_LABELS[c.current!.party]}
										</span>
									</span>
									<strong class="title">{c.title}</strong>
									<span class="small soft">
										{c.current?.stage}: {c.current?.name} · {c.grievantName}
									</span>
								</span>
								<span class="when">
									<CountdownChip
										countdown={c.current!.countdown}
										due={c.current!.effectiveDue}
										showDate={false}
									/>
									<span class="small muted">{formatLong(c.current!.effectiveDue!)}</span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="empty">
					<Gavel size={28} />
					<h3>No clocks running</h3>
					<p>When you open a case, its step deadlines show up here, most urgent first.</p>
				</div>
			{/if}
		</section>

		<aside class="stack">
			{#if data.noClock.length}
				<section class="card">
					<div class="card-header"><h2>Open, waiting</h2></div>
					<ul class="list compact">
						{#each data.noClock as c (c.id)}
							<li>
								<a href="/cases/{c.id}"><span class="mono muted">{c.number}</span> {c.title}</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			<section class="card">
				<div class="card-header"><h2>Recent activity</h2></div>
				{#if data.activity.length}
					<ul class="list activity">
						{#each data.activity as a (a.id)}
							<li>
								<EntryIcon kind={a.kind} size={15} />
								<div>
									<a href="/cases/{a.caseId}" class="act-title">{a.title || a.caseTitle}</a>
									<div class="tiny muted">
										{a.caseNumber} · {a.authorName ?? 'Someone'} · {relativeTime(a.occurredAt)}
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="card-body muted small">
						Notes, photos and step updates from every steward appear here.
					</p>
				{/if}
			</section>
		</aside>
	</div>
</div>

<style>
	.alert {
		color: var(--u-today);
	}

	.setup {
		margin-bottom: 20px;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 20px;
	}

	@media (min-width: 760px) {
		.stats {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	.stat {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		column-gap: 10px;
		align-items: center;
		padding: 16px;
		border-radius: var(--radius-lg);
		background: var(--surface);
		border: 1px solid var(--border);
		text-decoration: none;
		color: var(--text-muted);
		box-shadow: var(--shadow-sm);
	}

	.stat strong {
		font-size: 1.8rem;
		font-weight: 750;
		color: var(--text);
		letter-spacing: -0.02em;
	}

	.stat strong small {
		font-size: 1rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.stat span {
		grid-column: 1 / -1;
		font-size: 0.82rem;
		font-weight: 600;
	}

	.stat.danger:not(.zero) {
		border-color: color-mix(in srgb, var(--u-today) 40%, var(--border));
		background: linear-gradient(135deg, var(--u-today-bg), var(--surface) 70%);
	}

	.stat.danger:not(.zero) strong {
		color: var(--u-today);
	}

	.deadline {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 20px 14px 0;
		text-decoration: none;
		color: inherit;
	}

	.deadline:hover {
		background: var(--surface-2);
	}

	.deadline .bar {
		align-self: stretch;
		width: 4px;
		border-radius: 0 4px 4px 0;
		background: var(--u-ok);
		flex-shrink: 0;
	}

	.deadline.soon .bar {
		background: var(--u-soon);
	}
	.deadline.critical .bar {
		background: var(--u-critical);
	}
	.deadline.today .bar,
	.deadline.overdue .bar {
		background: var(--u-today);
	}

	.main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.top {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.when {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
		text-align: right;
	}

	@media (max-width: 560px) {
		.deadline {
			flex-wrap: wrap;
		}
		.when {
			flex-direction: row;
			align-items: center;
			margin-left: 18px;
		}
	}

	.compact li a {
		display: block;
		padding: 10px 20px;
		text-decoration: none;
		font-size: 0.92rem;
	}

	.compact li a:hover {
		background: var(--surface-2);
	}

	.activity li {
		display: flex;
		gap: 12px;
		padding: 12px 20px;
	}

	.act-title {
		font-weight: 600;
		font-size: 0.9rem;
		text-decoration: none;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.act-title:hover {
		text-decoration: underline;
	}

	.empty :global(svg) {
		color: var(--ink-300);
		margin-bottom: 8px;
	}
</style>
