<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { FolderOpen, Plus, Search } from '@lucide/svelte';
	import CountdownChip from '#lib/components/CountdownChip.svelte';
	import OutcomeBadge from '#lib/components/OutcomeBadge.svelte';
	import { PARTY_LABELS, formatLong } from '#lib/deadlines/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function setParam(key: string, value: string | null) {
		const url = new URL(page.url.href);
		if (value) url.searchParams.set(key, value);
		else url.searchParams.delete(key);
		void goto(url, { reset: false, replace: true });
	}

	// Writable derived: follows the URL, but the search box can edit it locally.
	let q = $derived(data.filters.q);
	let timer: ReturnType<typeof setTimeout>;
	function onSearch() {
		clearTimeout(timer);
		timer = setTimeout(() => setParam('q', q.trim() || null), 250);
	}
</script>

<div class="page">
	<header class="page-header">
		<div>
			<div class="eyebrow">Cases</div>
			<h1>Grievances</h1>
			<p>Open cases are sorted by the deadline that’s closest.</p>
		</div>
		<a class="btn accent" href="/cases/new"><Plus size={18} /> New case</a>
	</header>

	<div class="toolbar">
		<div class="seg" role="tablist" aria-label="Status">
			{#each [['open', 'Open'], ['closed', 'Closed'], ['all', 'All']] as [value, label] (value)}
				<button
					role="tab"
					aria-selected={data.filters.status === value}
					class:on={data.filters.status === value}
					onclick={() => setParam('status', value === 'open' ? null : value)}
				>
					{label}
				</button>
			{/each}
		</div>
		<label class="search">
			<Search size={16} />
			<span class="sr-only">Search cases</span>
			<input
				type="search"
				placeholder="Search number, grievant, issue…"
				bind:value={q}
				oninput={onSearch}
			/>
		</label>
		<select
			class="select compact"
			aria-label="Steward"
			value={data.filters.mine ? 'mine' : data.filters.steward}
			onchange={(e) => {
				const v = e.currentTarget.value;
				const url = new URL(page.url.href);
				url.searchParams.delete('mine');
				url.searchParams.delete('steward');
				if (v === 'mine') url.searchParams.set('mine', '1');
				else if (v) url.searchParams.set('steward', v);
				void goto(url, { reset: false, replace: true });
			}}
		>
			<option value="">All stewards</option>
			<option value="mine">My cases</option>
			{#each data.stewards as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
		</select>
		{#if data.contracts.length > 1}
			<select
				class="select compact"
				aria-label="Contract"
				value={data.filters.contract}
				onchange={(e) => setParam('contract', e.currentTarget.value || null)}
			>
				<option value="">All contracts</option>
				{#each data.contracts as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		{/if}
	</div>

	{#if data.cases.length}
		<div class="card">
			<ul class="list">
				{#each data.cases as c (c.id)}
					<li>
						<a class="case" href="/cases/{c.id}">
							<div class="main">
								<div class="row" style="--gap: 8px">
									<span class="mono muted">{c.number}</span>
									<OutcomeBadge outcome={c.outcome} status={c.status} />
								</div>
								<strong class="title">{c.title}</strong>
								<span class="small soft">
									{c.grievantName}{c.department ? ` · ${c.department}` : ''} · {c.steward?.name ??
										'Unassigned'}
								</span>
							</div>
							<div class="progress" aria-label="{c.stepsDone} of {c.stepsTotal} steps finished">
								{#each { length: c.stepsTotal }, i (i)}
									<span class:done={i < c.stepsDone} class:now={c.current && i === c.stepsDone}
									></span>
								{/each}
							</div>
							<div class="when">
								{#if c.status === 'open'}
									{#if c.current}
										<CountdownChip countdown={c.current.countdown} due={c.current.effectiveDue} />
										<span class="tiny muted">
											{c.current.stage} · {PARTY_LABELS[c.current.party]}
										</span>
									{:else}
										<span class="small muted">All steps finished</span>
									{/if}
								{:else}
									<span class="small muted">Closed {c.closedOn ? formatLong(c.closedOn) : ''}</span>
								{/if}
							</div>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<div class="card empty">
			<FolderOpen size={32} />
			<h3>
				{data.filters.q
					? 'No cases match that search'
					: data.filters.status === 'closed'
						? 'No closed cases yet'
						: 'No open cases'}
			</h3>
			<p>
				{data.filters.q
					? 'Try fewer words or a case number.'
					: 'Start one when a member brings you a problem.'}
			</p>
		</div>
	{/if}
</div>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		margin-bottom: 16px;
	}

	.seg {
		display: inline-flex;
		padding: 3px;
		border-radius: 11px;
		background: var(--surface-sunken);
		border: 1px solid var(--border);
	}

	.seg button {
		border: 0;
		background: transparent;
		font: inherit;
		font-weight: 600;
		font-size: 0.88rem;
		padding: 6px 14px;
		border-radius: 8px;
		color: var(--text-muted);
		cursor: pointer;
	}

	.seg button.on {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}

	.search {
		flex: 1;
		min-width: 220px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		background: var(--surface);
		color: var(--text-muted);
	}

	.search:focus-within {
		border-color: var(--blue-600);
	}

	.search input {
		flex: 1;
		border: 0;
		outline: 0;
		background: transparent;
		font: inherit;
		font-size: 16px;
		min-height: 40px;
		color: var(--text);
	}

	.compact {
		width: auto;
		min-height: 40px;
	}

	.case {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 10px 20px;
		align-items: center;
		padding: 14px 20px;
		text-decoration: none;
	}

	.case:hover {
		background: var(--surface-2);
	}

	@media (min-width: 760px) {
		.case {
			grid-template-columns: minmax(0, 1fr) 120px 220px;
		}
	}

	.main {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}

	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress {
		display: none;
		gap: 4px;
	}

	@media (min-width: 760px) {
		.progress {
			display: flex;
		}
	}

	.progress span {
		flex: 1;
		height: 6px;
		border-radius: 3px;
		background: var(--surface-sunken);
	}

	.progress span.done {
		background: var(--green-600);
	}

	.progress span.now {
		background: var(--amber-500);
	}

	.when {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
		text-align: right;
	}

	@media (max-width: 759px) {
		.when {
			grid-column: 1 / -1;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
	}

	.empty :global(svg) {
		color: var(--ink-300);
	}
</style>
