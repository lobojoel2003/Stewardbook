<script lang="ts">
	import {
		WorkCalendar,
		computeDeadline,
		describeSkipped,
		formatShort,
		isISODate,
		type HolidayRule
	} from '#lib/deadlines/index.ts';

	interface PreviewStep {
		id: string;
		stage: string;
		name: string;
		party: 'union' | 'management';
		days: number;
		dayType: 'business' | 'calendar';
	}

	let {
		steps,
		workdays,
		rollForward,
		holidays,
		today
	}: {
		steps: PreviewStep[];
		workdays: number[];
		rollForward: boolean;
		holidays: { name: string; rule: HolidayRule }[];
		today: string;
	} = $props();

	let start = $state('');
	const from = $derived(isISODate(start) ? start : today);

	const rows = $derived.by(() => {
		try {
			const cal = new WorkCalendar({ workdays, holidays });
			let trigger = from;
			return steps.map((s) => {
				const d = computeDeadline(cal, { trigger, days: s.days, dayType: s.dayType, rollForward });
				const row = {
					...s,
					trigger,
					due: d.due,
					note: d.skipped.length ? describeSkipped(d.skipped) : ''
				};
				trigger = d.due;
				return row;
			});
		} catch {
			return [];
		}
	});
</script>

<div class="preview">
	<label class="field start">
		<span>If the clock starts on</span>
		<input class="input" type="date" bind:value={start} placeholder={today} />
	</label>
	<p class="small muted">
		The latest date each step can happen, if every earlier step takes its full time.
	</p>
	<ol class="steps">
		{#each rows as r (r.id)}
			<li>
				<span class="dot {r.party}"></span>
				<div class="what">
					<strong>{r.stage}</strong> · {r.name}
					<div class="tiny muted">
						{r.days}
						{r.dayType === 'business' ? 'working' : 'calendar'} days from {formatShort(
							r.trigger
						)}{r.note ? ` · ${r.note}` : ''}
					</div>
				</div>
				<span class="due num">{formatShort(r.due)}</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.start {
		max-width: 240px;
	}

	.steps {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
		border-left: 2px solid var(--border);
		margin-left: 6px;
	}

	.steps li {
		position: relative;
		display: flex;
		gap: 12px;
		align-items: baseline;
		padding: 8px 0 8px 18px;
	}

	.dot {
		position: absolute;
		left: -7px;
		top: 13px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--red-500);
		border: 2px solid var(--surface);
	}

	.dot.management {
		background: var(--blue-600);
	}

	.what {
		flex: 1;
		min-width: 0;
		font-size: 0.9rem;
	}

	.due {
		font-weight: 650;
		white-space: nowrap;
	}
</style>
