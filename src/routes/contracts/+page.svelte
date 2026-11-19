<script lang="ts">
	import { BookOpen, FolderOpen, ListChecks, Plus, ScrollText } from '@lucide/svelte';
	import { formatLong } from '#lib/deadlines/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const STATUS = {
		active: { label: 'Active', tone: 'green' },
		draft: { label: 'Needs review', tone: 'amber' },
		archived: { label: 'Archived', tone: '' }
	} as const;
</script>

<div class="page">
	<header class="page-header">
		<div>
			<div class="eyebrow">Contracts</div>
			<h1>Your agreements</h1>
			<p>Each contract carries its own grievance steps, day counts, work week and holidays.</p>
		</div>
		<a class="btn primary" href="/contracts/new"><Plus size={18} /> Add contract</a>
	</header>

	{#if data.contracts.length}
		<div class="grid-2">
			{#each data.contracts as c (c.id)}
				<a class="card contract" href="/contracts/{c.id}">
					<div class="spread">
						<span class="badge {STATUS[c.status].tone}">{STATUS[c.status].label}</span>
						{#if c.expirationDate}<span class="tiny muted">
								Expires {formatLong(c.expirationDate)}
							</span>{/if}
					</div>
					<h2>{c.name}</h2>
					{#if c.employer}<p class="soft small">{c.employer}</p>{/if}
					<div class="facts">
						<span><ListChecks size={15} /> {c.confirmedSteps}/{c.steps} steps confirmed</span>
						<span><BookOpen size={15} /> {c.articles} articles</span>
						<span><FolderOpen size={15} /> {c.openCases} open · {c.cases} total</span>
					</div>
					{#if c.status === 'draft' && c.steps > 0}
						<div class="progress" aria-label="Review progress">
							<span style="width: {(c.confirmedSteps / c.steps) * 100}%"></span>
						</div>
					{/if}
				</a>
			{/each}
		</div>
	{:else}
		<div class="card empty">
			<ScrollText size={32} />
			<h3>No contracts yet</h3>
			<p>
				Paste or upload your collective bargaining agreement and Stewardbook will pull out the
				grievance deadlines.
			</p>
			<p style="margin-top: 16px">
				<a class="btn primary" href="/contracts/new">Add your contract</a>
			</p>
		</div>
	{/if}
</div>

<style>
	.contract {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		text-decoration: none;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}

	.contract:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow);
	}

	.contract h2 {
		margin-top: 6px;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		margin-top: 6px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.facts span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.progress {
		height: 6px;
		border-radius: 3px;
		background: var(--surface-sunken);
		overflow: hidden;
		margin-top: 6px;
	}

	.progress span {
		display: block;
		height: 100%;
		background: var(--amber-500);
		border-radius: 3px;
	}

	.empty :global(svg) {
		color: var(--ink-300);
	}
</style>
