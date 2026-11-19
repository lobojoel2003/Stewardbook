<script lang="ts">
	let {
		won,
		settled,
		denied,
		withdrawn,
		open = 0
	}: { won: number; settled: number; denied: number; withdrawn: number; open?: number } = $props();
	const total = $derived(won + settled + denied + withdrawn + open);
	const parts = $derived(
		[
			{ key: 'won', n: won, label: 'won' },
			{ key: 'settled', n: settled, label: 'settled' },
			{ key: 'denied', n: denied, label: 'denied' },
			{ key: 'withdrawn', n: withdrawn, label: 'withdrawn' },
			{ key: 'open', n: open, label: 'open' }
		].filter((p) => p.n > 0)
	);
</script>

{#if total}
	<span class="bar" role="img" aria-label={parts.map((p) => `${p.n} ${p.label}`).join(', ')}>
		{#each parts as p (p.key)}<span class={p.key} style="flex: {p.n}" title="{p.n} {p.label}"
			></span>{/each}
	</span>
{/if}

<style>
	.bar {
		display: flex;
		gap: 2px;
		height: 6px;
		width: 100%;
		border-radius: 3px;
		overflow: hidden;
	}

	.won {
		background: var(--green-600);
	}
	.settled {
		background: var(--violet-600);
	}
	.denied {
		background: var(--red-500);
	}
	.withdrawn {
		background: var(--ink-300);
	}
	.open {
		background: var(--blue-600);
		opacity: 0.5;
	}
</style>
