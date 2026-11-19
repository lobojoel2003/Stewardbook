<script lang="ts">
	import {
		ArrowLeftRight,
		Camera,
		CircleCheck,
		FilePlus2,
		FileText,
		Flag,
		Handshake,
		Phone,
		ShieldCheck,
		StickyNote,
		UserRound
	} from '@lucide/svelte';

	let { kind, size = 16 }: { kind: string; size?: number } = $props();

	const icons = {
		created: FilePlus2,
		note: StickyNote,
		photo: Camera,
		witness: UserRound,
		weingarten: ShieldCheck,
		document: FileText,
		call: Phone,
		step: CircleCheck,
		extension: Handshake,
		handoff: ArrowLeftRight,
		status: Flag
	} as const;

	const Icon = $derived(icons[kind as keyof typeof icons] ?? StickyNote);
</script>

<span class="entry-icon {kind}"><Icon {size} /></span>

<style>
	.entry-icon {
		display: inline-grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		flex-shrink: 0;
		background: var(--ink-100);
		color: var(--ink-600);
	}
	.photo,
	.document {
		background: var(--blue-100);
		color: var(--blue-600);
	}
	.witness,
	.call {
		background: var(--violet-100);
		color: var(--violet-600);
	}
	.weingarten {
		background: var(--red-100);
		color: var(--red-600);
	}
	.step,
	.created {
		background: var(--green-100);
		color: var(--green-600);
	}
	.extension,
	.handoff {
		background: var(--amber-100);
		color: var(--amber-700);
	}
	@media (prefers-color-scheme: dark) {
		.entry-icon {
			color: var(--text-soft);
		}
		.photo,
		.document {
			color: #a8c0ff;
		}
		.witness,
		.call {
			color: #c7b4ff;
		}
		.weingarten {
			color: #ff9a8d;
		}
		.step,
		.created {
			color: #6fd7a1;
		}
		.extension,
		.handoff {
			color: #f5c56b;
		}
	}
</style>
