<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import {
		ArrowLeftRight,
		BookOpen,
		Camera,
		CircleCheck,
		CornerDownRight,
		Download,
		FileText,
		Flag,
		Handshake,
		Pencil,
		Phone,
		Printer,
		RotateCcw,
		ShieldCheck,
		SkipForward,
		StickyNote,
		Trash2,
		Undo2,
		UserRound
	} from '@lucide/svelte';
	import CountdownClock from '#lib/components/CountdownClock.svelte';
	import OutcomeBadge from '#lib/components/OutcomeBadge.svelte';
	import QuickEntrySheet from '#lib/components/QuickEntrySheet.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import StepTracker from '#lib/components/StepTracker.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import { PARTY_LABELS, formatLong } from '#lib/deadlines/index.ts';
	import { OUTCOME_LABELS, OUTCOMES, ENTRY_HINTS, type QuickEntryKind } from '#lib/labels.ts';
	import { outbox } from '#lib/client/outbox.svelte.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { plural } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const c = $derived(data.case);
	const current = $derived(c.chain.current);
	const pending = $derived(outbox.items.filter((i) => i.caseId === c.id));
	const hasCompleted = $derived(c.chain.steps.some((s) => s.completedOn));
	const lastCompleted = $derived([...c.chain.steps].reverse().find((s) => s.completedOn) ?? null);

	let entryKind = $state<QuickEntryKind | null>(null);
	type SheetKind = 'complete' | 'no_response' | 'skip' | 'extend' | 'adjust' | 'close' | 'reopen';
	// `sheet` keeps its value while the dialog animates closed, so the content doesn't vanish mid-close.
	let sheet = $state<SheetKind | null>(null);
	let sheetOpen = $state(false);
	function openSheet(kind: SheetKind) {
		sheet = kind;
		sheetOpen = true;
	}

	const quick: { kind: QuickEntryKind; label: string; icon: typeof StickyNote }[] = [
		{ kind: 'note', label: 'Note', icon: StickyNote },
		{ kind: 'photo', label: 'Photo', icon: Camera },
		{ kind: 'witness', label: 'Witness', icon: UserRound },
		{ kind: 'weingarten', label: 'Weingarten', icon: ShieldCheck },
		{ kind: 'call', label: 'Call', icon: Phone },
		{ kind: 'document', label: 'Document', icon: FileText }
	];

	const submit =
		(message: string): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				sheetOpen = false;
				toast(message);
			}
		};

	const sheetTitle = $derived(
		sheet === 'complete'
			? current?.party === 'union'
				? `Mark “${current?.name}” done`
				: `Record management’s action`
			: sheet === 'no_response'
				? 'Management did not answer'
				: sheet === 'skip'
					? 'Skip this step'
					: sheet === 'extend'
						? 'Record an extension'
						: sheet === 'adjust'
							? 'Change when the clock started'
							: sheet === 'close'
								? 'Close the case'
								: 'Reopen the case'
	);
</script>

<div class="page">
	<header class="page-header">
		<div class="title-block">
			<div class="row" style="--gap: 8px">
				<span class="eyebrow mono"><a class="link" href="/cases">Cases</a> / {c.number}</span>
				<OutcomeBadge outcome={c.outcome} status={c.status} />
			</div>
			<h1>{c.title}</h1>
			<p>
				<strong>{c.grievantName}</strong>{c.department ? ` · ${c.department}` : ''} · steward
				<strong>{c.steward?.name ?? 'unassigned'}</strong> · {c.contract.name}
			</p>
		</div>
		<div class="row actions no-print">
			<a class="btn small" href="/cases/{c.id}/edit"><Pencil size={15} /> Edit</a>
			<a class="btn small" href="/cases/{c.id}/handoff"><ArrowLeftRight size={15} /> Hand off</a>
			<a class="btn small" href="/cases/{c.id}/packet"><Printer size={15} /> Packet</a>
		</div>
	</header>

	{#if form?.message}<div class="callout danger" role="alert" style="margin-bottom: 16px">
			{form.message}
		</div>{/if}
	{#if data.created}
		<div class="callout success" style="margin-bottom: 16px">
			<CircleCheck size={20} />
			<div>
				<strong>Case {c.number} is open and the clock is running.</strong> Add notes, photos and witness
				statements as you go.
			</div>
		</div>
	{/if}

	<div class="split">
		<div class="stack">
			{#if c.status === 'open' && current}
				<div class="stack" style="--gap: 10px">
					<CountdownClock step={current} closures={c.upcomingClosures} />
					<div class="step-actions no-print">
						<button class="btn primary" onclick={() => openSheet('complete')}>
							<CircleCheck size={17} />
							{current.party === 'union' ? 'Mark done' : 'Management answered'}
						</button>
						{#if current.party === 'management'}
							<button class="btn" onclick={() => openSheet('no_response')}>
								<CornerDownRight size={16} /> No answer
							</button>
						{:else}
							<button class="btn" onclick={() => openSheet('skip')}>
								<SkipForward size={16} /> Skip
							</button>
						{/if}
						<button class="btn" onclick={() => openSheet('extend')}>
							<Handshake size={16} /> Extension
						</button>
						<button class="btn ghost" onclick={() => openSheet('adjust')}>Change start date</button>
						{#if hasCompleted}
							<form method="POST" action="?/undo" use:enhance={submit('Previous step reopened')}>
								<button
									class="btn ghost"
									title="Undo {lastCompleted?.stage}: {lastCompleted?.name}"
								>
									<Undo2 size={16} /> Undo last
								</button>
							</form>
						{/if}
					</div>
					{#if c.chain.next}
						<p class="small muted next">
							Next: <strong>{c.chain.next.stage} · {c.chain.next.name}</strong> — {PARTY_LABELS[
								c.chain.next.party
							].toLowerCase()} gets
							{c.chain.next.days}
							{c.chain.next.dayType === 'business' ? 'working' : 'calendar'} days once this step is done.
						</p>
					{/if}
				</div>
			{:else if c.status === 'open'}
				<div class="callout info">
					<Flag size={20} />
					<div class="stack" style="--gap: 8px">
						<div>
							<strong>Every step is finished.</strong> Record how the grievance ended to add it to the
							precedent library.
						</div>
						<div class="row">
							<button class="btn primary small" onclick={() => openSheet('close')}>
								Close the case
							</button>
							{#if hasCompleted}
								<form method="POST" action="?/undo" use:enhance={submit('Last step reopened')}>
									<button class="btn small ghost"><Undo2 size={15} /> Undo last step</button>
								</form>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<section class="card card-pad resolution">
					<div class="spread">
						<h2>{c.outcome ? OUTCOME_LABELS[c.outcome] : 'Closed'}</h2>
						<span class="small muted">{c.closedOn ? formatLong(c.closedOn) : ''}</span>
					</div>
					{#if c.resolution}<p class="prose">{c.resolution}</p>{:else}<p class="muted small">
							No resolution notes.
						</p>{/if}
				</section>
			{/if}

			<section class="card">
				<div class="card-header">
					<h2>Timeline</h2>
					<span class="small muted">
						{plural(c.timeline.length, 'entry', 'entries')} · {plural(c.attachmentCount, 'file')}
					</span>
				</div>
				<div class="quick no-print" role="toolbar" aria-label="Add to timeline">
					{#each quick as q (q.kind)}
						<button
							class="q"
							type="button"
							onclick={() => (entryKind = q.kind)}
							title={ENTRY_HINTS[q.kind]}
						>
							<q.icon size={20} />
							<span>{q.label}</span>
						</button>
					{/each}
				</div>
				<div class="card-body">
					<Timeline entries={c.timeline} {pending} user={data.user!} />
				</div>
			</section>
		</div>

		<aside class="stack">
			<section class="card card-pad">
				<h2 class="section-title">Steps</h2>
				<StepTracker steps={c.chain.steps} />
			</section>

			<section class="card">
				<div class="card-header">
					<h2><BookOpen size={16} style="vertical-align: -3px" /> Articles cited</h2>
				</div>
				{#if c.articles.length}
					<ul class="list articles">
						{#each c.articles as a (a.id)}
							<li>
								<details>
									<summary>
										<span class="num muted">Art. {a.number}</span>
										<strong>{a.title}</strong>
									</summary>
									{#if a.note}<p class="small note">{a.note}</p>{/if}
									{#if a.body}<p class="excerpt">
											{a.body.slice(0, 600)}{a.body.length > 600 ? '…' : ''}
										</p>{/if}
									<a class="link small" href="/library/articles/{a.id}">
										Precedents for this article →
									</a>
								</details>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="card-body small muted">
						No articles cited yet. <a class="link" href="/cases/{c.id}/edit">Add them</a> to build the
						precedent library.
					</p>
				{/if}
			</section>

			<section class="card card-pad details">
				<h2 class="section-title">The grievance</h2>
				<dl>
					<dt>Incident</dt>
					<dd>{formatLong(c.incidentDate)}</dd>
					{#if c.awareDate}<dt>Grievant learned</dt>
						<dd>{formatLong(c.awareDate)}</dd>{/if}
					{#if c.supervisor}<dt>Supervisor</dt>
						<dd>{c.supervisor}</dd>{/if}
					{#if c.grievantContact}<dt>Contact</dt>
						<dd>{c.grievantContact}</dd>{/if}
				</dl>
				{#if c.summary}<h3>What happened</h3>
					<p class="prose small">{c.summary}</p>{/if}
				{#if c.remedy}<h3>Remedy sought</h3>
					<p class="prose small">{c.remedy}</p>{/if}
			</section>

			<section class="card card-pad stack no-print" style="--gap: 10px">
				{#if c.status === 'open'}
					<button class="btn block" onclick={() => openSheet('close')}>
						<Flag size={16} /> Close the case
					</button>
				{:else}
					<button class="btn block" onclick={() => openSheet('reopen')}>
						<RotateCcw size={16} /> Reopen
					</button>
				{/if}
				<a class="btn block ghost" href="/cases/{c.id}/export.json" download>
					<Download size={16} /> Export case data (JSON)
				</a>
				{#if data.user?.role === 'admin'}
					<form
						method="POST"
						action="?/delete"
						use:enhance={({ cancel }) => {
							if (!confirm(`Permanently delete case ${c.number} and its whole timeline?`)) cancel();
						}}
					>
						<button class="btn block danger small"><Trash2 size={15} /> Delete case</button>
					</form>
				{/if}
			</section>
		</aside>
	</div>
</div>

<QuickEntrySheet
	bind:kind={entryKind}
	caseId={c.id}
	caseLabel="{c.number} {c.title}"
	maxUploadMb={data.maxUploadMb}
/>

<Sheet bind:open={sheetOpen} title={sheetTitle}>
	{#if (sheet === 'complete' || sheet === 'no_response' || sheet === 'skip') && current}
		<form
			method="POST"
			action="?/complete"
			use:enhance={submit(sheet === 'skip' ? 'Step skipped' : 'Step recorded — next clock started')}
		>
			<input type="hidden" name="stepId" value={current.id} />
			<input type="hidden" name="completion" value={sheet === 'complete' ? 'done' : sheet} />
			<div class="sheet-body stack">
				{#if sheet === 'no_response'}
					<p class="soft">
						The answer was due {formatLong(current.effectiveDue!)}. Most contracts let the union
						move to the next step; its clock starts from that missed due date.
					</p>
				{:else if sheet === 'skip'}
					<p class="soft">
						Use this when the contract lets you go straight to the next step (for example,
						discharges filed at Step 2).
					</p>
				{/if}
				<label class="field">
					<span>
						{sheet === 'no_response'
							? 'Date you noted it'
							: current.party === 'union'
								? 'Date filed or delivered'
								: 'Date of the answer'}
					</span>
					<input
						class="input"
						type="date"
						name="date"
						value={data.today}
						max={data.today}
						required
					/>
				</label>
				<label class="field">
					<span>Notes</span>
					<textarea
						class="textarea"
						name="note"
						rows="3"
						placeholder={current.party === 'management'
							? 'What did they say? Granted, denied, partial?'
							: 'Who received it and how'}></textarea>
				</label>
			</div>
			<div class="sheet-foot">
				<button type="button" class="btn ghost" onclick={() => (sheetOpen = false)}>Cancel</button>
				<button class="btn primary">Save</button>
			</div>
		</form>
	{:else if sheet === 'extend' && current}
		<form method="POST" action="?/extend" use:enhance={submit('Extension recorded')}>
			<input type="hidden" name="stepId" value={current.id} />
			<div class="sheet-body stack">
				<p class="soft">
					Record a time-limit extension both sides agreed to — ideally in writing. The new date
					replaces the computed deadline.
				</p>
				<label class="field">
					<span>New deadline</span>
					<input
						class="input"
						type="date"
						name="extendedTo"
						value={current.extendedTo ?? current.effectiveDue ?? ''}
						min={current.startedOn ?? undefined}
					/>
				</label>
				<label class="field">
					<span>Agreed with / how</span>
					<textarea
						class="textarea"
						name="note"
						rows="3"
						placeholder="Agreed by email with HR manager on…"></textarea>
				</label>
			</div>
			<div class="sheet-foot">
				{#if current.extendedTo}<button class="btn ghost danger" name="remove" value="1">
						Remove extension
					</button>{/if}
				<button class="btn primary">Save extension</button>
			</div>
		</form>
	{:else if sheet === 'adjust' && current}
		<form method="POST" action="?/adjust" use:enhance={submit('Clock start updated')}>
			<input type="hidden" name="stepId" value={current.id} />
			<div class="sheet-body stack">
				<p class="soft">
					Change this if the clock really started on a different day — for example, the answer
					arrived later than it was dated.
				</p>
				<label class="field">
					<span>Clock started on</span>
					<input class="input" type="date" name="startedOn" value={current.startedOn} required />
				</label>
			</div>
			<div class="sheet-foot"><button class="btn primary">Save</button></div>
		</form>
	{:else if sheet === 'close'}
		<form method="POST" action="?/close" use:enhance={submit('Case closed')}>
			<div class="sheet-body stack">
				<fieldset class="outcomes">
					<legend class="label">How did it end?</legend>
					{#each OUTCOMES as o (o)}
						<label class="outcome">
							<input type="radio" name="outcome" value={o} required />
							<span>{OUTCOME_LABELS[o]}</span>
						</label>
					{/each}
				</fieldset>
				<label class="field">
					<span>Date resolved</span>
					<input class="input" type="date" name="closedOn" value={data.today} required />
				</label>
				<label class="field">
					<span>
						Resolution <span class="hint">
							— what was agreed or decided; this is what future stewards will search for
						</span>
					</span>
					<textarea
						class="textarea"
						name="resolution"
						rows="4"
						placeholder="Management agreed to pay 4 hours at 1.5x and re-train supervisors on the overtime list."
					></textarea>
				</label>
			</div>
			<div class="sheet-foot"><button class="btn primary">Close case</button></div>
		</form>
	{:else if sheet === 'reopen'}
		<form method="POST" action="?/reopen" use:enhance={submit('Case reopened')}>
			<div class="sheet-body stack">
				<label class="field">
					<span>Why is it being reopened?</span><textarea class="textarea" name="reason" rows="3"
					></textarea>
				</label>
			</div>
			<div class="sheet-foot"><button class="btn primary">Reopen</button></div>
		</form>
	{/if}
</Sheet>

<style>
	.title-block {
		min-width: 0;
	}

	.title-block .eyebrow {
		margin: 0;
	}

	.title-block h1 {
		margin-top: 6px;
	}

	.step-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.next {
		padding: 0 4px;
	}

	.resolution h2 {
		font-size: 1.2rem;
	}

	.resolution .prose {
		margin-top: 10px;
	}

	.quick {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		padding: 14px 20px 4px;
	}

	@media (min-width: 640px) {
		.quick {
			grid-template-columns: repeat(6, 1fr);
		}
	}

	.q {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 12px 6px;
		border-radius: 14px;
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-soft);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 650;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			transform 0.05s;
	}

	.q:hover {
		background: var(--surface);
		border-color: var(--border-strong);
		color: var(--text);
	}

	.q:active {
		transform: scale(0.97);
	}

	.articles summary {
		display: flex;
		gap: 10px;
		align-items: baseline;
		padding: 10px 20px;
		cursor: pointer;
		list-style: none;
		font-size: 0.9rem;
	}

	.articles summary::-webkit-details-marker {
		display: none;
	}

	.articles .num {
		flex-shrink: 0;
		font-size: 0.8rem;
	}

	.articles details > :not(summary) {
		margin: 0 20px 10px;
	}

	.note {
		color: var(--text-soft);
		font-weight: 550;
	}

	.excerpt {
		font-family: var(--font-serif);
		font-size: 0.88rem;
		color: var(--text-soft);
		white-space: pre-wrap;
	}

	.details dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0 0 8px;
		font-size: 0.9rem;
	}

	.details dt {
		color: var(--text-muted);
	}

	.details dd {
		margin: 0;
		font-weight: 550;
	}

	.details h3 {
		font-size: 0.85rem;
		margin: 12px 0 4px;
	}

	.outcomes {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}

	.outcomes legend {
		margin-bottom: 8px;
	}

	.outcome {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.92rem;
	}

	.outcome:has(input:checked) {
		border-color: var(--ink-800);
		background: var(--ink-100);
	}

	.outcome input {
		accent-color: var(--ink-800);
	}
</style>
