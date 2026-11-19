<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		Archive,
		ArrowDown,
		ArrowUp,
		BookOpen,
		CalendarDays,
		CircleCheck,
		CircleDashed,
		FileText,
		Pencil,
		Plus,
		Sparkles,
		Trash2,
		TriangleAlert,
		WandSparkles
	} from '@lucide/svelte';
	import DeadlinePreview from '#lib/components/DeadlinePreview.svelte';
	import HolidayForm from '#lib/components/HolidayForm.svelte';
	import SourceQuote from '#lib/components/SourceQuote.svelte';
	import StepFields from '#lib/components/StepFields.svelte';
	import {
		DAY_TYPE_LABELS,
		PARTY_LABELS,
		WEEKDAY_NAMES,
		describeRule,
		formatLong,
		holidaysInYear
	} from '#lib/deadlines/index.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import type { SubmitFunction } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form: rawForm }: PageProps = $props();
	const form = $derived(
		rawForm as {
			message?: string;
			stepId?: string;
			addStep?: boolean;
			holiday?: boolean;
			article?: boolean;
		} | null
	);

	const c = $derived(data.contract);
	const confirmed = $derived(c.steps.filter((s) => s.confirmedAt).length);
	const allConfirmed = $derived(c.steps.length > 0 && confirmed === c.steps.length);
	const year = $derived(Number(data.today.slice(0, 4)));
	const thisYear = $derived(
		holidaysInYear(
			c.holidays.map((h) => ({ name: h.name, rule: h.rule })),
			year
		)
	);
	const nextYear = $derived(
		holidaysInYear(
			c.holidays.map((h) => ({ name: h.name, rule: h.rule })),
			year + 1
		)
	);

	let editing = $state<string | null>(null);

	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	const foundSummary = $derived(
		`Found ${plural(c.steps.length, 'grievance deadline', 'grievance deadlines')}, ${plural(c.holidays.length, 'holiday', 'holidays')} and ${plural(c.articles.length, 'article', 'articles')}.`
	);

	const after =
		(message?: string, close?: () => void): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') {
				if (message) toast(message);
				close?.();
			}
		};

	const ORIGIN = {
		rules: { label: 'Found in contract', icon: Sparkles },
		llm: { label: 'Drafted by local AI', icon: WandSparkles },
		manual: { label: 'Added by hand', icon: Pencil }
	} as const;

	const STATUS = {
		active: { label: 'Active', tone: 'green' },
		draft: { label: 'Needs review', tone: 'amber' },
		archived: { label: 'Archived', tone: '' }
	} as const;
</script>

<div class="page">
	<header class="page-header">
		<div>
			<div class="eyebrow"><a class="link" href="/contracts">Contracts</a></div>
			<div class="row">
				<h1>{c.name}</h1>
				<span class="badge {STATUS[c.status].tone}">{STATUS[c.status].label}</span>
			</div>
			<p>
				{c.employer || 'Employer not set'}
				{#if c.effectiveDate || c.expirationDate}
					· {c.effectiveDate ? formatLong(c.effectiveDate) : '…'} – {c.expirationDate
						? formatLong(c.expirationDate)
						: '…'}
				{/if}
			</p>
		</div>
		<div class="row">
			<a class="btn" href="/contracts/{c.id}/source"><FileText size={16} /> Source text</a>
			{#if c.status === 'active'}
				<a class="btn accent" href="/cases/new?contract={c.id}"><Plus size={16} /> Open a case</a>
			{:else if c.status === 'draft'}
				<form
					method="POST"
					action="?/activate"
					use:enhance={after('Contract is active — you can open cases under it.')}
				>
					<button
						class="btn primary"
						disabled={!allConfirmed}
						title={allConfirmed ? '' : 'Confirm every step first'}
					>
						<CircleCheck size={16} /> Activate contract
					</button>
				</form>
			{/if}
		</div>
	</header>

	{#if form?.message && !form?.stepId && !form?.addStep && !form?.holiday && !form?.article}
		<div class="callout danger" role="alert" style="margin-bottom: 16px">{form.message}</div>
	{/if}

	{#if data.justCreated}
		<div class="callout success intro">
			<Sparkles size={20} />
			<div>
				<strong>Contract read.</strong>
				{foundSummary}
				{#if c.extraction?.llm}
					{#if c.extraction.llm.ok}
						The steps were drafted by {c.extraction.llm.model}.
					{:else}
						The local AI model couldn’t help ({c.extraction.llm.message}); these steps come from the
						built-in reader.
					{/if}
				{/if}
				Check each one against the quoted contract language and confirm it.
			</div>
		</div>
	{/if}

	{#if c.status === 'draft'}
		<div class="review card card-pad">
			<div class="spread">
				<div>
					<h2>{allConfirmed ? 'Every step is confirmed' : 'Review the grievance deadlines'}</h2>
					<p class="soft small">
						{#if allConfirmed}
							Activate the contract to start opening cases under it.
						{:else}
							Stewardbook never counts a deadline a person hasn’t confirmed. {confirmed} of {c.steps
								.length} confirmed.
						{/if}
					</p>
				</div>
				<span class="num big">{confirmed}/{c.steps.length}</span>
			</div>
			<div class="progress">
				<span style="width: {c.steps.length ? (confirmed / c.steps.length) * 100 : 0}%"></span>
			</div>
		</div>
	{/if}

	{#if c.extraction?.warnings?.length}
		<div class="callout warn" style="margin-bottom: 16px">
			<TriangleAlert size={18} />
			<ul class="warnings">
				{#each c.extraction.warnings as w (w)}<li>{w}</li>{/each}
			</ul>
		</div>
	{/if}

	<div class="split">
		<div class="stack">
			<section class="card">
				<div class="card-header">
					<h2>Grievance steps</h2>
					<span class="small muted">
						{c.steps.length}
						{c.steps.length === 1 ? 'deadline' : 'deadlines'}, in order
					</span>
				</div>
				{#if c.steps.length}
					<ol class="list steps">
						{#each c.steps as s, i (s.id)}
							{@const O = ORIGIN[s.origin]}
							<li class="step" class:confirmed={s.confirmedAt}>
								{#if editing === s.id}
									<form
										method="POST"
										action="?/saveStep"
										class="stack"
										use:enhance={after('Step saved and confirmed', () => (editing = null))}
									>
										<input type="hidden" name="stepId" value={s.id} />
										{#if s.source}<SourceQuote source={s.source} phrase={s.phrase} />{/if}
										<StepFields values={s} />
										{#if form?.stepId === s.id && form?.message}<p class="error-text">
												{form.message}
											</p>{/if}
										<div class="form-actions">
											<button type="button" class="btn ghost" onclick={() => (editing = null)}>
												Cancel
											</button>
											<button class="btn primary">Save and confirm</button>
										</div>
									</form>
								{:else}
									<div class="step-head">
										<span class="pos num">{i + 1}</span>
										<div class="step-main">
											<div class="row" style="--gap: 8px">
												<span class="stage">{s.stage}</span>
												<span class="badge {s.party === 'union' ? 'red' : 'blue'}">
													{PARTY_LABELS[s.party]}
												</span>
												{#if s.confidence && !s.confirmedAt}
													<span
														class="badge {s.confidence === 'high'
															? 'green'
															: s.confidence === 'medium'
																? 'amber'
																: 'red'}"
													>
														{s.confidence} confidence
													</span>
												{/if}
											</div>
											<h3>{s.name}</h3>
											<p class="limit">
												<strong class="num">{s.days}</strong>
												{DAY_TYPE_LABELS[s.dayType]}
												<span class="muted small">
													{i === 0
														? 'from the incident (or when the grievant learned of it)'
														: 'from the previous step'}
												</span>
											</p>
										</div>
										<div class="state">
											{#if s.confirmedAt}
												<span class="ok"><CircleCheck size={18} /> Confirmed</span>
											{:else}
												<span class="pending"><CircleDashed size={18} /> Unconfirmed</span>
											{/if}
										</div>
									</div>
									{#if s.source}<SourceQuote source={s.source} phrase={s.phrase} />{/if}
									{#if s.notes.length && !s.confirmedAt}
										<ul class="notes small">
											{#each s.notes as n (n)}<li>{n}</li>{/each}
										</ul>
									{/if}
									<div class="step-actions">
										<span class="origin tiny muted">
											<O.icon size={13} />
											{O.label}
										</span>
										<div class="row" style="--gap: 6px">
											<form method="POST" action="?/moveStep" use:enhance={after()}>
												<input type="hidden" name="stepId" value={s.id} />
												<button
													class="btn ghost small icon"
													name="dir"
													value="up"
													disabled={i === 0}
													aria-label="Move up"
												>
													<ArrowUp size={15} />
												</button>
												<button
													class="btn ghost small icon"
													name="dir"
													value="down"
													disabled={i === c.steps.length - 1}
													aria-label="Move down"
												>
													<ArrowDown size={15} />
												</button>
											</form>
											<form method="POST" action="?/deleteStep" use:enhance={after('Step removed')}>
												<input type="hidden" name="stepId" value={s.id} />
												<button class="btn ghost small icon" aria-label="Delete step">
													<Trash2 size={15} />
												</button>
											</form>
											<button class="btn small" type="button" onclick={() => (editing = s.id)}>
												<Pencil size={14} /> Edit
											</button>
											<form
												method="POST"
												action="?/confirm"
												use:enhance={after(s.confirmedAt ? undefined : 'Confirmed')}
											>
												<input type="hidden" name="stepId" value={s.id} />
												{#if s.confirmedAt}
													<button class="btn small ghost" name="confirmed" value="false">
														Unconfirm
													</button>
												{:else}
													<button class="btn small primary" name="confirmed" value="true">
														<CircleCheck size={14} /> Confirm
													</button>
												{/if}
											</form>
										</div>
									</div>
								{/if}
							</li>
						{/each}
					</ol>
				{:else}
					<div class="empty">
						<h3>No deadlines found</h3>
						<p>Add each step from the grievance article below.</p>
					</div>
				{/if}

				<details class="add" open={!c.steps.length || !!form?.addStep}>
					<summary><Plus size={16} /> Add a step by hand</summary>
					<form method="POST" action="?/addStep" class="stack" use:enhance={after('Step added')}>
						<StepFields />
						{#if form?.addStep && form?.message}<p class="error-text">{form.message}</p>{/if}
						<div class="form-actions"><button class="btn primary">Add step</button></div>
					</form>
				</details>
			</section>

			{#if c.extraction?.ignored?.length}
				<details class="card ignored">
					<summary>
						Other time limits in the procedure ({c.extraction.ignored.length}) — not added
					</summary>
					<ul class="list">
						{#each c.extraction.ignored as ig, i (i)}
							<li>
								<SourceQuote source={ig.source} phrase={ig.phrase} />
								<p class="tiny muted">{ig.reason}</p>
							</li>
						{/each}
					</ul>
				</details>
			{/if}

			{#if c.steps.length}
				<section class="card card-pad">
					<h2 style="margin-bottom: 12px">Try the timeline</h2>
					<DeadlinePreview
						steps={c.steps}
						workdays={c.workdays}
						rollForward={c.rollForward}
						holidays={c.holidays}
						today={data.today}
					/>
				</section>
			{/if}
		</div>

		<aside class="stack">
			<section class="card">
				<div class="card-header">
					<h2><CalendarDays size={17} style="vertical-align: -3px" /> Work week</h2>
				</div>
				<form
					method="POST"
					action="?/calendar"
					class="card-body stack"
					use:enhance={after('Calendar saved')}
				>
					<div class="days">
						{#each WEEKDAY_NAMES as d, i (d)}
							<label class="day">
								<input type="checkbox" name="workdays" value={i} checked={c.workdays.includes(i)} />
								<span>{d.slice(0, 3)}</span>
							</label>
						{/each}
					</div>
					<label class="check">
						<input type="checkbox" name="rollForward" checked={c.rollForward} />
						<span class="small">
							Calendar-day deadlines that land on a weekend or holiday move to the next working day
						</span>
					</label>
					{#if c.extraction?.defaultDayTypeSource}
						<div class="small">
							<span class="muted">The contract defines days as:</span>
							<SourceQuote source={c.extraction.defaultDayTypeSource} />
						</div>
					{/if}
					<button class="btn small">Save</button>
				</form>
			</section>

			<section class="card">
				<div class="card-header">
					<h2>Holidays</h2>
					<span class="small muted">{c.holidays.length}</span>
				</div>
				{#if c.holidays.length}
					<ul class="list holidays">
						{#each c.holidays as h (h.id)}
							{@const now = thisYear.find((x) => x.name === h.name)}
							{@const next = nextYear.find((x) => x.name === h.name)}
							<li>
								<div>
									<strong>{h.name}</strong>
									<div class="tiny muted">{describeRule(h.rule)}</div>
									<div class="tiny soft num">
										{now ? formatLong(now.date) : '—'}{next ? ` · ${formatLong(next.date)}` : ''}
									</div>
								</div>
								<form method="POST" action="?/deleteHoliday" use:enhance={after('Holiday removed')}>
									<input type="hidden" name="holidayId" value={h.id} />
									<button class="btn ghost small icon" aria-label="Remove {h.name}">
										<Trash2 size={14} />
									</button>
								</form>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="card-body small muted">No holidays yet, so only weekends are skipped.</p>
				{/if}
				<div class="card-body stack" style="--gap: 10px">
					<form
						method="POST"
						action="?/federal"
						use:enhance={after('Added the missing US federal holidays')}
					>
						<button class="btn small block">Add missing US federal holidays</button>
					</form>
					<details open={!!form?.holiday}>
						<summary class="small"><Plus size={14} /> Add a holiday</summary>
						<form
							method="POST"
							action="?/addHoliday"
							class="stack"
							style="margin-top: 12px"
							use:enhance={after('Holiday added')}
						>
							<HolidayForm />
							{#if form?.holiday && form?.message}<p class="error-text">{form.message}</p>{/if}
							<button class="btn small primary">Add holiday</button>
						</form>
					</details>
				</div>
			</section>

			<section class="card">
				<div class="card-header">
					<h2><BookOpen size={17} style="vertical-align: -3px" /> Articles</h2>
					<span class="small muted">{c.articles.length}</span>
				</div>
				{#if c.articles.length}
					<ul class="list articles">
						{#each c.articles as a (a.id)}
							<li>
								<a href="/library/articles/{a.id}">
									<span class="num muted">Art. {a.number}</span>
									<span class="t">{a.title}</span>
									{#if a.citations}<span class="badge">{a.citations}</span>{/if}
								</a>
							</li>
						{/each}
					</ul>
				{/if}
				<details class="card-body" open={!!form?.article}>
					<summary class="small"><Plus size={14} /> Add an article</summary>
					<form
						method="POST"
						action="?/addArticle"
						class="stack"
						style="margin-top: 12px"
						use:enhance={after('Article added')}
					>
						<div class="form-grid">
							<label class="field">
								<span>Number</span><input class="input" name="number" required maxlength="20" />
							</label>
							<label class="field">
								<span>Title</span><input class="input" name="title" required maxlength="200" />
							</label>
							<label class="field full">
								<span>Text</span><textarea class="textarea" name="body"></textarea>
							</label>
						</div>
						{#if form?.article && form?.message}<p class="error-text">{form.message}</p>{/if}
						<button class="btn small primary">Add article</button>
					</form>
				</details>
			</section>

			<details class="card card-pad">
				<summary><Pencil size={14} /> Contract details</summary>
				<form
					method="POST"
					action="?/details"
					class="stack"
					style="margin-top: 14px"
					use:enhance={after('Saved')}
				>
					<label class="field">
						<span>Name</span><input class="input" name="name" value={c.name} required />
					</label>
					<label class="field">
						<span>Employer</span><input class="input" name="employer" value={c.employer} />
					</label>
					<div class="form-grid">
						<label class="field">
							<span>Effective</span><input
								class="input"
								type="date"
								name="effectiveDate"
								value={c.effectiveDate ?? ''}
							/>
						</label>
						<label class="field">
							<span>Expires</span><input
								class="input"
								type="date"
								name="expirationDate"
								value={c.expirationDate ?? ''}
							/>
						</label>
					</div>
					<button class="btn small primary">Save details</button>
				</form>
				<hr class="divider" />
				<div class="row">
					{#if c.status === 'archived'}
						<form method="POST" action="?/unarchive" use:enhance={after('Restored as a draft')}>
							<button class="btn small">Restore</button>
						</form>
					{:else}
						<form method="POST" action="?/archive" use:enhance={after('Archived')}>
							<button class="btn small"><Archive size={14} /> Archive</button>
						</form>
					{/if}
					<form
						method="POST"
						action="?/delete"
						use:enhance={({ cancel }) => {
							if (!confirm('Delete this contract and everything extracted from it?')) cancel();
							return async ({ update }) => update();
						}}
					>
						<button class="btn small danger"><Trash2 size={14} /> Delete</button>
					</form>
				</div>
			</details>
		</aside>
	</div>
</div>

<style>
	.intro {
		margin-bottom: 16px;
	}

	.review {
		margin-bottom: 16px;
		border-color: color-mix(in srgb, var(--amber-500) 40%, var(--border));
	}

	.big {
		font-size: 1.6rem;
		font-weight: 750;
	}

	.progress {
		height: 8px;
		border-radius: 4px;
		background: var(--surface-sunken);
		overflow: hidden;
		margin-top: 12px;
	}

	.progress span {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--amber-500), var(--green-600));
		transition: width 0.3s;
	}

	.warnings {
		margin: 0;
		padding-left: 18px;
	}

	.step {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.step:not(.confirmed) {
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--amber-500) 7%, transparent),
			transparent 40%
		);
	}

	.step-head {
		display: flex;
		gap: 14px;
		align-items: flex-start;
	}

	.pos {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--ink-100);
		font-weight: 700;
		font-size: 0.85rem;
		flex-shrink: 0;
	}

	.confirmed .pos {
		background: var(--green-100);
		color: var(--green-700);
	}

	.step-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stage {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.limit strong {
		font-size: 1.1rem;
	}

	.state {
		font-size: 0.85rem;
		font-weight: 650;
		white-space: nowrap;
	}

	.state span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.ok {
		color: var(--green-600);
	}

	.pending {
		color: var(--amber-700);
	}

	@media (prefers-color-scheme: dark) {
		.pending {
			color: var(--u-soon);
		}
		.ok {
			color: var(--u-ok);
		}
	}

	.notes {
		margin: 0;
		padding-left: 18px;
		color: var(--amber-700);
	}

	.step-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}

	.step-actions form {
		display: inline-flex;
	}

	.origin {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	details > summary {
		cursor: pointer;
		font-weight: 600;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	details > summary::-webkit-details-marker {
		display: none;
	}

	.add {
		padding: 16px 20px;
		border-top: 1px solid var(--border);
	}

	.add form {
		margin-top: 14px;
	}

	.ignored summary {
		padding: 16px 20px;
		font-size: 0.92rem;
	}

	.ignored li {
		padding: 12px 20px;
	}

	.days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}

	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-size: 0.75rem;
		font-weight: 650;
		color: var(--text-muted);
		cursor: pointer;
	}

	.day input {
		accent-color: var(--ink-800);
		width: 18px;
		height: 18px;
	}

	.holidays li {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 20px;
	}

	.holidays strong {
		font-size: 0.9rem;
	}

	.articles {
		max-height: 340px;
		overflow-y: auto;
	}

	.articles a {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 8px 20px;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.articles a:hover {
		background: var(--surface-2);
	}

	.articles .num {
		width: 52px;
		flex-shrink: 0;
		font-size: 0.8rem;
	}

	.articles .t {
		flex: 1;
		min-width: 0;
	}
</style>
