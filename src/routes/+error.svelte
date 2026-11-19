<script lang="ts">
	import { page } from '$app/state';
	import { CircleAlert, WifiOff } from '@lucide/svelte';

	const offline = $derived(typeof navigator !== 'undefined' && !navigator.onLine);
</script>

<div class="page narrow">
	<div class="card empty err">
		{#if offline}
			<WifiOff size={36} />
			<h1>You’re offline</h1>
			<p>
				This page hasn’t been saved on this device yet. Pages you’ve opened before still work, and
				new timeline entries are kept until you reconnect.
			</p>
		{:else}
			<CircleAlert size={36} />
			<h1>{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>
			<p>{page.error?.message}</p>
		{/if}
		<p style="margin-top: 18px"><a class="btn primary" href="/">Back to today</a></p>
	</div>
</div>

<style>
	.err {
		margin-top: 40px;
	}

	.err :global(svg) {
		color: var(--ink-300);
		margin-bottom: 10px;
	}

	h1 {
		font-size: 1.4rem;
		color: var(--text);
		margin-bottom: 8px;
	}
</style>
