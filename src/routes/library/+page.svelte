<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Library, Search } from '@lucide/svelte';
	import OutcomeBadge from '#lib/components/OutcomeBadge.svelte';
	import OutcomeBar from '#lib/components/OutcomeBar.svelte';
	import { formatLong } from '#lib/deadlines/index.ts';
	import { OUTCOMES, OUTCOME_LABELS } from '#lib/labels.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Writable derived: follows the URL, but the search box can edit it locally.
	let q = $derived(data.filters.q);

	function setParam(key: string, value: string | null) {
		const url = new URL(page.url.href);
		if (value) url.searchParams.set(key, value);
		else url.searchParams.delete(key);
		void goto(url, { reset: false, replace: true });
	}

	let timer: ReturnType<typeof setTimeout>;
	const topArticles = $derived(
		[...data.articles]
			.filter((a) => a.citations > 0)
			.sort((a, b) => b.citations - a.citations)
			.slice(0, 12)
	);
</script>

<div class="page">
	<header class="page-header">
		<div>
			<div class="eyebrow">Library</div>
			<h1>Precedent library</h1>
			<p>
				Every closed grievance, searchable by issue, article and outcome — so the next steward
				starts from what worked.
			</p>
		</div>
	</header>

	<div class="split">
		<div class="stack">
			<div class="filters card card-pad">
				<label class="search">
					<Search size={17} />
					<span class="sr-only">Search precedents</span>
					<input
						type="search"
						placeholder="overtime bypass, forklift, schedule change…"
						bind:value={q}
						oninput={() => {
							clearTimeout(timer);
							timer = setTimeout(() => setParam('q', q.trim() || null), 250);
						}}
					/>
				</label>
				<div class="row">
					<select
						class="select"
						aria-label="Article"
						value={data.filters.article}
						onchange={(e) => setParam('article', e.currentTarget.value || null)}
					>
						<option value="">Any article</option>
						{#each data.articles as a (a.id)}<option value={a.id}>
								Art. {a.number} — {a.title}
							</option>{/each}
					</select>
					<select
						class="select"
						aria-label="Outcome"
						value={data.filters.outcome}
						onchange={(e) => setParam('outcome', e.currentTarget.value || null)}
					>
						<option value="">Any outcome</option>
						{#each OUTCOMES as o (o)}<option value={o}>{OUTCOME_LABELS[o]}</option>{/each}
					</select>
					<label class="check small">
						<input
							type="checkbox"
							checked={data.filters.includeOpen}
							onchange={(e) => setParam('open', e.currentTarget.checked ? '1' : null)}
						/>
						<span>Include open cases</span>
					</label>
				</div>
			</div>

			{#if data.results.length}
				<ul class="results">
					{#each data.results as r (r.id)}
						<li class="card">
							<a href="/cases/{r.id}" class="result">
								<div class="spread">
									<div class="row" style="--gap: 8px">
										<span class="mono muted small">{r.number}</span>
										<OutcomeBadge outcome={r.outcome} status={r.status} />
									</div>
									<span class="tiny muted">
										{r.closedOn
											? `Closed ${formatLong(r.closedOn)}`
											: `Incident ${formatLong(r.incidentDate)}`}
									</span>
								</div>
								<h3>{r.title}</h3>
								{#if r.resolution}
									<p class="res"><span class="label">Resolution</span> {r.resolution}</p>
								{:else if r.summary}
									<p class="res soft">{r.summary}</p>
								{/if}
								{#if r.articles.length}
									<div class="arts">
										{#each r.articles as a (a.articleId)}<span class="badge">
												Art. {a.number} · {a.title}
											</span>{/each}
									</div>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="card empty">
					<Library size={32} />
					<h3>
						{data.filters.q || data.filters.article || data.filters.outcome
							? 'Nothing matches yet'
							: 'The library fills itself'}
					</h3>
					<p>
						{data.filters.q || data.filters.article || data.filters.outcome
							? 'Try other words, or include open cases.'
							: 'When a case is closed with its outcome and resolution, it shows up here for every steward.'}
					</p>
				</div>
			{/if}
		</div>

		<aside class="card">
			<div class="card-header"><h2>Most cited articles</h2></div>
			{#if topArticles.length}
				<ul class="list top">
					{#each topArticles as a (a.id)}
						<li>
							<a href="/library/articles/{a.id}">
								<div class="spread">
									<span>
										<span class="num muted small">Art. {a.number}</span> <strong>{a.title}</strong>
									</span>
									<span class="badge">{a.citations}</span>
								</div>
								<OutcomeBar
									won={a.won}
									settled={a.settled}
									denied={a.denied}
									withdrawn={a.withdrawn}
									open={a.open}
								/>
							</a>
						</li>
					{/each}
				</ul>
				<div class="legend tiny muted">
					<span><i class="won"></i>Won</span><span><i class="settled"></i>Settled</span><span>
						<i class="denied"></i>Denied
					</span><span><i class="open"></i>Open</span>
				</div>
			{:else}
				<p class="card-body small muted">
					Cite articles on cases to see which ones come up most and how they tend to go.
				</p>
			{/if}
		</aside>
	</div>
</div>

<style>
	.filters {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.filters .select {
		width: auto;
		max-width: 100%;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 14px;
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		color: var(--text-muted);
		background: var(--surface);
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
		font-size: 1.05rem;
		min-height: 48px;
		color: var(--text);
	}

	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.result {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px 20px;
		text-decoration: none;
	}

	.result:hover h3 {
		text-decoration: underline;
	}

	.res {
		font-size: 0.92rem;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--green-700);
		margin-right: 4px;
	}

	.arts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.top a {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 20px;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.top a:hover {
		background: var(--surface-2);
	}

	.legend {
		display: flex;
		gap: 12px;
		padding: 10px 20px 16px;
	}

	.legend i {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		margin-right: 4px;
	}

	.legend .won {
		background: var(--green-600);
	}
	.legend .settled {
		background: var(--violet-600);
	}
	.legend .denied {
		background: var(--red-500);
	}
	.legend .open {
		background: var(--blue-600);
		opacity: 0.5;
	}

	.empty :global(svg) {
		color: var(--ink-300);
	}
</style>
