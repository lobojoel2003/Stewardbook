<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let q = $state('');

	const lines = $derived(data.contract.sourceText.split('\n'));
	const matches = $derived(
		q.trim().length > 2
			? lines.filter((l) => l.toLowerCase().includes(q.trim().toLowerCase())).length
			: 0
	);
</script>

<div class="page">
	<header class="page-header">
		<div>
			<div class="eyebrow">
				<a class="link" href="/contracts/{data.contract.id}">{data.contract.name}</a>
			</div>
			<h1>Contract text</h1>
			<p>
				{data.contract.sourceFilename ?? 'Pasted text'} · {data.contract.sourceText.length.toLocaleString()}
				characters
			</p>
		</div>
		<label class="field find">
			<span class="sr-only">Find in contract</span>
			<input class="input" type="search" placeholder="Find in contract…" bind:value={q} />
			{#if q.trim().length > 2}<span class="hint">
					{matches} matching {matches === 1 ? 'line' : 'lines'}
				</span>{/if}
		</label>
	</header>
	<article class="card card-pad source">
		{#each lines as line, i (i)}
			<p
				class:hit={q.trim().length > 2 && line.toLowerCase().includes(q.trim().toLowerCase())}
				class:head={/^\s*ARTICLE\b/i.test(line)}
			>
				{line || ' '}
			</p>
		{/each}
	</article>
</div>

<style>
	.find {
		min-width: min(320px, 100%);
	}

	.source {
		font-family: var(--font-serif);
		font-size: 1rem;
		line-height: 1.65;
	}

	.source p {
		white-space: pre-wrap;
	}

	.head {
		font-weight: 700;
		margin-top: 12px;
		font-family: var(--font);
		letter-spacing: 0.02em;
	}

	.hit {
		background: color-mix(in srgb, var(--amber-500) 25%, transparent);
		border-radius: 4px;
	}
</style>
