<script lang="ts">
	import { Search } from '@lucide/svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface Article {
		id: string;
		number: string;
		title: string;
	}

	let {
		articles,
		initial = []
	}: { articles: Article[]; initial?: { id: string; note: string }[] } = $props();

	const selected = new SvelteMap<string, string>();
	$effect.pre(() => {
		selected.clear();
		for (const a of initial) selected.set(a.id, a.note);
	});

	let q = $state('');
	const shown = $derived(
		q.trim()
			? articles.filter((a) =>
					`${a.number} ${a.title}`.toLowerCase().includes(q.trim().toLowerCase())
				)
			: articles
	);

	function toggle(id: string, on: boolean) {
		if (on) selected.set(id, selected.get(id) ?? '');
		else selected.delete(id);
	}
</script>

<div class="picker">
	{#if articles.length > 8}
		<label class="find">
			<Search size={15} />
			<span class="sr-only">Find an article</span>
			<input type="search" placeholder="Find an article…" bind:value={q} />
		</label>
	{/if}
	{#if articles.length}
		<ul>
			{#each shown as a (a.id)}
				<li class:on={selected.has(a.id)}>
					<label class="check">
						<input
							type="checkbox"
							name="article"
							value={a.id}
							checked={selected.has(a.id)}
							onchange={(e) => toggle(a.id, e.currentTarget.checked)}
						/>
						<span><span class="num muted">Art. {a.number}</span> {a.title}</span>
					</label>
					{#if selected.has(a.id)}
						<input
							class="input note"
							name="note:{a.id}"
							placeholder="Section and how it applies (optional)"
							maxlength="300"
							value={selected.get(a.id)}
							oninput={(e) => selected.set(a.id, e.currentTarget.value)}
						/>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="small muted">
			This contract has no articles listed. You can add them on the contract page.
		</p>
	{/if}
	{#if selected.size}<p class="tiny muted">{selected.size} cited</p>{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.find {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		color: var(--text-muted);
	}

	.find input {
		flex: 1;
		border: 0;
		outline: 0;
		background: transparent;
		font: inherit;
		min-height: 38px;
		color: var(--text);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 4px;
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}

	li {
		padding: 6px 8px;
		border-radius: 8px;
	}

	li.on {
		background: var(--surface);
		box-shadow: var(--shadow-sm);
	}

	.note {
		margin-top: 6px;
		min-height: 36px;
		font-size: 0.88rem;
	}
</style>
