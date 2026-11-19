<script lang="ts">
	import { OUTCOME_SHORT, type Outcome } from '#lib/labels.ts';

	let { outcome, status }: { outcome: Outcome | null; status: 'open' | 'closed' } = $props();
	const tone = $derived(
		status === 'open'
			? 'blue'
			: outcome === 'sustained'
				? 'green'
				: outcome === 'settled'
					? 'violet'
					: outcome === 'denied'
						? 'red'
						: ''
	);
</script>

<span class="badge {tone}">
	{status === 'open' ? 'Open' : outcome ? OUTCOME_SHORT[outcome] : 'Closed'}
</span>
