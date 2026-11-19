<script lang="ts">
	let { source, phrase }: { source: string; phrase?: string | null } = $props();

	const parts = $derived.by(() => {
		if (!phrase) return null;
		const i = source.indexOf(phrase);
		if (i < 0) return null;
		return [
			source.slice(0, i),
			source.slice(i, i + phrase.length),
			source.slice(i + phrase.length)
		];
	});
</script>

<blockquote class="quote">
	{#if parts}{parts[0]}<mark>{parts[1]}</mark>{parts[2]}{:else}{source}{/if}
</blockquote>

<style>
	blockquote {
		margin: 0;
	}
</style>
