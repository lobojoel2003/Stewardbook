<script lang="ts">
	import { AlarmClock, CircleCheck, Hourglass, TriangleAlert } from '@lucide/svelte';
	import { countdownLabel, formatMonthDay, type Countdown } from '#lib/deadlines/index.ts';

	let {
		countdown,
		due,
		showDate = true
	}: { countdown: Countdown | null; due?: string | null; showDate?: boolean } = $props();
</script>

{#if countdown}
	<span class="chip {countdown.urgency}" title={due ? `Due ${due}` : undefined}>
		{#if countdown.urgency === 'overdue'}
			<TriangleAlert size={14} />
		{:else if countdown.urgency === 'today' || countdown.urgency === 'critical'}
			<AlarmClock size={14} />
		{:else}
			<Hourglass size={14} />
		{/if}
		<span>{countdownLabel(countdown)}</span>
		{#if showDate && due}<span class="date">· {formatMonthDay(due)}</span>{/if}
	</span>
{:else}
	<span class="chip none"><CircleCheck size={14} /> No clock running</span>
{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 10px;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 650;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.date {
		font-weight: 500;
		opacity: 0.85;
	}

	.ok {
		background: var(--u-ok-bg);
		color: var(--u-ok);
	}
	.soon {
		background: var(--u-soon-bg);
		color: var(--amber-700);
	}
	.critical {
		background: var(--u-critical-bg);
		color: #b2401a;
	}
	.today {
		background: var(--u-today);
		color: #fff;
	}
	.overdue {
		background: var(--u-overdue);
		color: #fff;
	}
	.none {
		background: var(--ink-100);
		color: var(--text-muted);
	}

	@media (prefers-color-scheme: dark) {
		.soon {
			color: var(--u-soon);
		}
		.critical {
			color: #ff9b72;
		}
		.overdue {
			background: #b3261b;
		}
	}
</style>
