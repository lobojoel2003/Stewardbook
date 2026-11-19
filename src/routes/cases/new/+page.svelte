<script lang="ts">
	import { enhance } from '$app/forms';
	import { CalendarClock, ScrollText } from '@lucide/svelte';
	import ArticlePicker from '#lib/components/ArticlePicker.svelte';
	import CaseFields from '#lib/components/CaseFields.svelte';
	import {
		WorkCalendar,
		computeDeadline,
		countdown,
		countdownLabel,
		describeSkipped,
		formatLong,
		isISODate
	} from '#lib/deadlines/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let contractId = $state('');
	let incidentDate = $state('');
	let awareDate = $state('');
	let startAt = $state(1);
	let busy = $state(false);

	$effect.pre(() => {
		contractId = form?.values?.contractId || data.defaultContract || '';
		incidentDate = form?.values?.incidentDate ?? '';
		awareDate = form?.values?.awareDate ?? '';
	});

	const contract = $derived(data.contracts.find((c) => c.id === contractId) ?? null);
	const errors = $derived(form?.errors ?? {});

	const preview = $derived.by(() => {
		if (!contract || !contract.steps.length) return null;
		const trigger = isISODate(awareDate)
			? awareDate
			: isISODate(incidentDate)
				? incidentDate
				: null;
		if (!trigger) return null;
		const step = contract.steps[Math.min(startAt, contract.steps.length) - 1];
		const cal = new WorkCalendar({ workdays: contract.workdays, holidays: contract.holidays });
		const d = computeDeadline(cal, {
			trigger,
			days: step.days,
			dayType: step.dayType,
			rollForward: contract.rollForward
		});
		const c = countdown(cal, d.due, data.today, step.dayType);
		return {
			step,
			due: d.due,
			label: countdownLabel(c),
			urgency: c.urgency,
			skipped: d.skipped.length ? describeSkipped(d.skipped) : ''
		};
	});
</script>

<div class="page narrow">
	<header class="page-header">
		<div>
			<div class="eyebrow"><a class="link" href="/cases">Cases</a></div>
			<h1>New case</h1>
			<p>
				The clock starts from the incident date — or from when the grievant learned about it, if the
				contract allows.
			</p>
		</div>
	</header>

	{#if !data.contracts.length}
		<div class="card empty">
			<ScrollText size={32} />
			<h3>No active contract yet</h3>
			<p>
				Add your contract and confirm its grievance steps first, so Stewardbook knows the deadlines.
			</p>
			<p style="margin-top: 16px"><a class="btn primary" href="/contracts">Go to contracts</a></p>
		</div>
	{:else}
		<form
			method="POST"
			class="stack"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			{#if errors.form}<div class="callout danger" role="alert">{errors.form}</div>{/if}

			<section class="card card-pad stack">
				<div class="form-grid">
					<label class="field">
						<span>Contract</span>
						<select class="select" name="contractId" bind:value={contractId}>
							{#each data.contracts as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
						</select>
					</label>
					<label class="field">
						<span>Steward</span>
						<select
							class="select"
							name="stewardId"
							value={form?.values?.stewardId ?? data.user?.id}
						>
							<option value="">Unassigned</option>
							{#each data.stewards as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
						</select>
					</label>
				</div>
				<CaseFields values={form?.values ?? {}} {errors} bind:incidentDate bind:awareDate />
			</section>

			{#if contract}
				<section class="card card-pad stack">
					<div>
						<h2>Where the grievance starts</h2>
						<p class="small soft">
							Most grievances start at the first step. Some contracts send discharges straight to a
							later step.
						</p>
					</div>
					<label class="field">
						<span class="sr-only">Starting step</span>
						<select class="select" name="startAt" bind:value={startAt}>
							{#each contract.steps as s, i (s.id)}
								<option value={i + 1}>
									{s.stage}: {s.name} ({s.days}
									{s.dayType === 'business' ? 'working' : 'calendar'} days)
								</option>
							{/each}
						</select>
					</label>
					{#if preview}
						<div class="preview {preview.urgency}">
							<CalendarClock size={20} />
							<div>
								<strong>{preview.step.name}</strong> is due
								<strong>{formatLong(preview.due)}</strong>
								— {preview.label.toLowerCase()}.
								{#if preview.skipped}<div class="small muted">{preview.skipped}</div>{/if}
							</div>
						</div>
					{/if}
				</section>

				<section class="card card-pad stack">
					<div>
						<h2>Contract articles</h2>
						<p class="small soft">
							Which articles does this grievance cite? They build your precedent library over time.
						</p>
					</div>
					{#key contractId}
						<ArticlePicker
							articles={contract.articles}
							initial={(form?.values?.articles ?? []).map((a) => ({
								id: a.articleId,
								note: a.note
							}))}
						/>
					{/key}
				</section>
			{/if}

			<div class="form-actions">
				<a class="btn ghost" href="/cases">Cancel</a>
				<button class="btn accent" disabled={busy}>
					{busy ? 'Opening…' : 'Open case and start the clock'}
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	.preview {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px 16px;
		border-radius: var(--radius);
		background: var(--u-ok-bg);
		color: var(--text);
	}

	.preview.soon {
		background: var(--u-soon-bg);
	}

	.preview.critical,
	.preview.today,
	.preview.overdue {
		background: var(--u-today-bg);
	}

	.empty :global(svg) {
		color: var(--ink-300);
	}
</style>
