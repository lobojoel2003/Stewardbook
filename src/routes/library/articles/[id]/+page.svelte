<script lang="ts">
	import { enhance } from '$app/forms';
	import { Pencil, Trash2 } from '@lucide/svelte';
	import OutcomeBadge from '#lib/components/OutcomeBadge.svelte';
	import OutcomeBar from '#lib/components/OutcomeBar.svelte';
	import { formatLong } from '#lib/deadlines/index.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const a = $derived(data.article);
	let editing = $state(false);

	const count = (o: string) => a.citing.filter((c) => c.outcome === o).length;
	const openCount = $derived(a.citing.filter((c) => c.status === 'open').length);
</script>

<div class="page">
	<header class="page-header">
		<div>
			<div class="eyebrow">
				<a class="link" href="/library">Library</a> ·
				<a class="link" href="/contracts/{a.contractId}">{a.contractName}</a>
			</div>
			<h1>Article {a.number} — {a.title}</h1>
			<p>Cited in {a.citing.length} {a.citing.length === 1 ? 'case' : 'cases'}.</p>
		</div>
		<button class="btn small" onclick={() => (editing = !editing)}>
			<Pencil size={15} />
			{editing ? 'Done editing' : 'Edit text'}
		</button>
	</header>

	{#if form?.message}<div class="callout danger" style="margin-bottom: 16px">
			{form.message}
		</div>{/if}

	<div class="split">
		<div class="stack">
			{#if editing}
				<form
					method="POST"
					action="?/save"
					class="card card-pad stack"
					use:enhance={() =>
						async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') {
								editing = false;
								toast('Article saved');
							}
						}}
				>
					<div class="form-grid">
						<label class="field">
							<span>Number</span><input class="input" name="number" value={a.number} required />
						</label>
						<label class="field">
							<span>Title</span><input class="input" name="title" value={a.title} required />
						</label>
						<label class="field full">
							<span>Text</span><textarea class="textarea" name="body" rows="14">{a.body}</textarea>
						</label>
					</div>
					<div class="form-actions">
						<button class="btn primary">Save</button>
					</div>
				</form>
				<form
					method="POST"
					action="?/delete"
					use:enhance={({ cancel }) => {
						if (!confirm('Delete this article? Cases that cite it will lose the citation.'))
							cancel();
					}}
				>
					<button class="btn small danger"><Trash2 size={14} /> Delete article</button>
				</form>
			{:else}
				<article class="card card-pad text">
					{#if a.body}{a.body}{:else}<span class="muted">
							No text stored for this article.
						</span>{/if}
				</article>
			{/if}
		</div>

		<aside class="card">
			<div class="card-header"><h2>Cases citing it</h2></div>
			{#if a.citing.length}
				<div class="card-body stack" style="--gap: 8px">
					<OutcomeBar
						won={count('sustained')}
						settled={count('settled')}
						denied={count('denied')}
						withdrawn={count('withdrawn')}
						open={openCount}
					/>
					<p class="tiny muted">
						{count('sustained')} won · {count('settled')} settled · {count('denied')} denied · {openCount}
						open
					</p>
				</div>
				<ul class="list cites">
					{#each a.citing as c (c.id)}
						<li>
							<a href="/cases/{c.id}">
								<div class="row" style="--gap: 8px">
									<span class="mono muted small">{c.number}</span>
									<OutcomeBadge outcome={c.outcome} status={c.status} />
								</div>
								<strong>{c.title}</strong>
								{#if c.note}<span class="small soft">{c.note}</span>{/if}
								{#if c.resolution}<span class="small res">{c.resolution}</span>{/if}
								{#if c.closedOn}<span class="tiny muted">Closed {formatLong(c.closedOn)}</span>{/if}
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="card-body small muted">No case cites this article yet.</p>
			{/if}
		</aside>
	</div>
</div>

<style>
	.text {
		font-family: var(--font-serif);
		font-size: 1.02rem;
		line-height: 1.7;
		white-space: pre-wrap;
	}

	.cites a {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 12px 20px;
		text-decoration: none;
	}

	.cites a:hover {
		background: var(--surface-2);
	}

	.res {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
