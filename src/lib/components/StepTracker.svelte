<script lang="ts">
	import {
		Check,
		CircleDashed,
		CornerDownRight,
		Handshake,
		Minus,
		TriangleAlert
	} from '@lucide/svelte';
	import {
		DAY_TYPE_LABELS,
		PARTY_LABELS,
		formatMonthDay,
		type StepView
	} from '#lib/deadlines/index.ts';

	let { steps }: { steps: (StepView & { stage: string })[] } = $props();
</script>

<ol class="tracker">
	{#each steps as s (s.id)}
		<li class={s.state}>
			<span class="node" aria-hidden="true">
				{#if s.state === 'done'}
					{#if s.onTime === false}<TriangleAlert size={13} />{:else}<Check
							size={14}
							strokeWidth={3}
						/>{/if}
				{:else if s.state === 'no_response'}<CornerDownRight size={13} />
				{:else if s.state === 'skipped'}<Minus size={13} />
				{:else if s.state === 'active'}<span class="pulse"></span>
				{:else}<CircleDashed size={13} />{/if}
			</span>
			<div class="body">
				<div class="head">
					<span class="stage">{s.stage}</span>
					<span class="party {s.party}">{PARTY_LABELS[s.party]}</span>
				</div>
				<strong>{s.name}</strong>
				<span class="meta">
					{s.days}
					{DAY_TYPE_LABELS[s.dayType]}
					{#if s.state === 'pending'}
						· starts when the previous step ends
					{:else if s.state === 'active'}
						· due {s.effectiveDue ? formatMonthDay(s.effectiveDue) : '—'}
					{:else if s.state === 'done'}
						· done {formatMonthDay(s.completedOn!)}
						{#if s.onTime === false}<em class="late">
								— {s.lateBy} working {s.lateBy === 1 ? 'day' : 'days'} late
							</em>{:else if s.effectiveDue}<span class="ontime">
								(due {formatMonthDay(s.effectiveDue)})
							</span>{/if}
					{:else if s.state === 'no_response'}
						· no answer by {s.effectiveDue ? formatMonthDay(s.effectiveDue) : '—'}
					{:else}
						· skipped
					{/if}
				</span>
				{#if s.extendedTo}<span class="ext">
						<Handshake size={12} /> Extended to {formatMonthDay(s.extendedTo)}
					</span>{/if}
			</div>
		</li>
	{/each}
</ol>

<style>
	.tracker {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		position: relative;
		display: flex;
		gap: 12px;
		padding-bottom: 16px;
	}

	li:not(:last-child)::before {
		content: '';
		position: absolute;
		left: 11px;
		top: 24px;
		bottom: 0;
		width: 2px;
		background: var(--border);
	}

	li.done:not(:last-child)::before,
	li.no_response:not(:last-child)::before,
	li.skipped:not(:last-child)::before {
		background: var(--green-600);
	}

	.node {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--surface);
		border: 2px solid var(--border-strong);
		color: var(--text-muted);
	}

	.done .node {
		background: var(--green-600);
		border-color: var(--green-600);
		color: #fff;
	}

	.no_response .node,
	.skipped .node {
		background: var(--ink-100);
		border-color: var(--ink-300);
	}

	.active .node {
		border-color: var(--amber-500);
		background: var(--amber-100);
	}

	.pulse {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--amber-500);
		animation: pulse 1.6s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			transform: scale(1.6);
			opacity: 0.5;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
		}
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		font-size: 0.9rem;
	}

	.pending .body {
		opacity: 0.6;
	}

	.head {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.stage {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.party {
		font-size: 0.7rem;
		font-weight: 650;
		color: var(--red-600);
	}

	.party.management {
		color: var(--blue-600);
	}

	.meta {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.late {
		color: var(--u-today);
		font-style: normal;
		font-weight: 650;
	}

	.ontime {
		color: var(--text-muted);
	}

	.ext {
		display: inline-flex;
		gap: 4px;
		align-items: center;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--blue-600);
	}
</style>
