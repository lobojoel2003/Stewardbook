<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';

	let {
		open = $bindable(false),
		title,
		children,
		footer
	}: { open?: boolean; title: string; children: Snippet; footer?: Snippet } = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	class="sheet"
	bind:this={dialog}
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
	aria-label={title}
>
	<div class="sheet-head">
		<h2>{title}</h2>
		<button
			type="button"
			class="btn ghost icon small"
			aria-label="Close"
			onclick={() => (open = false)}
		>
			<X size={18} />
		</button>
	</div>
	{@render children()}
	{#if footer}{@render footer()}{/if}
</dialog>
