<script lang="ts">
	import { onMount } from 'svelte';
	import { CalendarOff, Handshake, Info } from '@lucide/svelte';
	import {
		DAY_TYPE_LABELS,
		PARTY_LABELS,
		countdownLabel,
		describeSkipped,
		formatLong,
		formatMonthDay,
		type Countdown,
		type Deadline,
		type Party
	} from '#lib/deadlines/index.ts';

	interface ClockStep {
		stage: string;
		name: string;
		party: Party;
		days: number;
		dayType: 'business' | 'calendar';
		startedOn: string | null;
		effectiveDue: string | null;
		extendedTo: string | null;
		countdown: Countdown | null;
		deadline: Deadline | null;
	}

	let { step, closures = [] }: { step: ClockStep; closures?: { date: string; name: string }[] } =
		$props();

	const c = $derived(step.countdown!);
	const total = $derived(Math.max(1, step.days));
	const left = $derived(Math.max(0, c.unitsLeft));
	const progress = $derived(
		c.urgency === 'overdue' ? 1 : Math.min(1, Math.max(0.02, 1 - left / total))
	);
	const R = 52;
	const CIRC = 2 * Math.PI * R;

	let now = $state<number | null>(null);
	onMount(() => {
		now = Date.now();
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	const ticker = $derived.by(() => {
		if (now === null || !step.effectiveDue) return null;
		const end = new Date(`${step.effectiveDue}T23:59:59`).getTime();
		const ms = end - now;
		const sign = ms < 0 ? -1 : 1;
		const abs = Math.abs(ms);
		const d = Math.floor(abs / 86_400_000);
		const h = Math.floor((abs % 86_400_000) / 3_600_000);
		const m = Math.floor((abs % 3_600_000) / 60_000);
		const s = Math.floor((abs % 60_000) / 1000);
		const pad = (n: number) => String(n).padStart(2, '0');
		return { sign, text: `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s` };
	});
</script>

<section class="clock {c.urgency}" aria-label="Deadline countdown">
	<div class="ring" role="img" aria-label={countdownLabel(c)}>
		<svg viewBox="0 0 128 128" width="128" height="128" aria-hidden="true">
			<circle class="track" cx="64" cy="64" r={R} />
			<circle
				class="bar"
				cx="64"
				cy="64"
				r={R}
				stroke-dasharray={CIRC}
				stroke-dashoffset={CIRC * (1 - progress)}
				transform="rotate(-90 64 64)"
			/>
		</svg>
		<div class="center">
			{#if c.urgency === 'overdue'}
				<strong class="num">
					{Math.abs(
						step.dayType === 'business' ? Math.min(-1, c.workingDaysLeft) : c.calendarDaysLeft
					)}
				</strong>
				<small>{step.dayType === 'business' ? 'working' : ''} days late</small>
			{:else if c.urgency === 'today'}
				<strong class="today-label">Today</strong>
				<small>last day</small>
			{:else}
				<strong class="num">{left}</strong>
				<small>{step.dayType === 'business' ? 'working days' : 'days'} left</small>
			{/if}
		</div>
	</div>

	<div class="info">
		<div class="who">
			<span class="badge {step.party === 'union' ? 'red' : 'blue'}">
				{PARTY_LABELS[step.party]} must act
			</span>
			<span class="stage">{step.stage}</span>
		</div>
		<h2>{step.name}</h2>
		<p class="due">
			{c.urgency === 'overdue' ? 'Was due' : 'Due'}
			<strong>{formatLong(step.effectiveDue!)}</strong>
		</p>
		{#if ticker}
			<p class="ticker num" aria-live="off">
				{#if ticker.sign > 0}{ticker.text} until end of day{:else}Deadline passed {ticker.text} ago{/if}
			</p>
		{/if}
		<div class="facts">
			<span class="fact">
				<Info size={14} />
				{step.days}
				{DAY_TYPE_LABELS[step.dayType]} from {step.startedOn ? formatMonthDay(step.startedOn) : '—'}
			</span>
			{#if step.extendedTo}
				<span class="fact ext"><Handshake size={14} /> Extended by agreement</span>
			{:else if step.deadline?.skipped.length}
				<span class="fact"><CalendarOff size={14} /> {describeSkipped(step.deadline.skipped)}</span>
			{/if}
		</div>
		{#if closures.length && !step.extendedTo}
			<div class="closures">
				{#each closures as h (h.date)}
					<span class="badge">{h.name} · {formatMonthDay(h.date)}</span>
				{/each}
			</div>
		{/if}
	</div>
</section>

<style>
	.clock {
		--tone: var(--u-ok);
		--tone-bg: var(--u-ok-bg);
		display: flex;
		gap: 22px;
		align-items: center;
		padding: 20px;
		border-radius: var(--radius-lg);
		background: linear-gradient(135deg, var(--tone-bg), transparent 70%), var(--surface);
		border: 1px solid color-mix(in srgb, var(--tone) 30%, var(--border));
		box-shadow: var(--shadow-sm);
	}

	.soon {
		--tone: var(--u-soon);
		--tone-bg: var(--u-soon-bg);
	}
	.critical {
		--tone: var(--u-critical);
		--tone-bg: var(--u-critical-bg);
	}
	.today {
		--tone: var(--u-today);
		--tone-bg: var(--u-today-bg);
	}
	.overdue {
		--tone: var(--u-overdue);
		--tone-bg: var(--u-overdue-bg);
	}

	.ring {
		position: relative;
		flex-shrink: 0;
		width: 128px;
		height: 128px;
	}

	.track {
		fill: none;
		stroke: color-mix(in srgb, var(--tone) 15%, var(--surface-sunken));
		stroke-width: 11;
	}

	.bar {
		fill: none;
		stroke: var(--tone);
		stroke-width: 11;
		stroke-linecap: round;
		transition: stroke-dashoffset 0.6s ease;
	}

	.center {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		line-height: 1;
	}

	.center strong {
		font-size: 2.6rem;
		font-weight: 750;
		color: var(--tone);
		letter-spacing: -0.03em;
	}

	.center .today-label {
		font-size: 1.6rem;
	}

	.center small {
		margin-top: 5px;
		font-size: 0.6rem;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		max-width: 74px;
		line-height: 1.2;
	}

	.info {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.stage {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	h2 {
		font-size: 1.25rem;
	}

	.due {
		color: var(--text-soft);
	}

	.due strong {
		color: var(--text);
	}

	.ticker {
		font-size: 0.85rem;
		font-weight: 650;
		color: var(--tone);
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		margin-top: 2px;
	}

	.fact {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.fact.ext {
		color: var(--blue-600);
		font-weight: 600;
	}

	.closures {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	@media (max-width: 520px) {
		.clock {
			gap: 14px;
			padding: 16px;
			align-items: flex-start;
		}

		.ring {
			width: 92px;
			height: 92px;
		}

		.ring svg {
			width: 92px;
			height: 92px;
		}

		.center strong {
			font-size: 1.9rem;
		}

		.center .today-label {
			font-size: 1.2rem;
		}

		.center small {
			font-size: 0.5rem;
			max-width: 60px;
			margin-top: 3px;
		}

		h2 {
			font-size: 1.05rem;
		}

		.due,
		.ticker {
			font-size: 0.85rem;
		}
	}
</style>
