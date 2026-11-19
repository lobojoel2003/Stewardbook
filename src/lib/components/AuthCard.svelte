<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		children,
		footer
	}: { title: string; subtitle?: string; children: Snippet; footer?: Snippet } = $props();
</script>

<div class="auth">
	<div class="panel">
		<div class="logo">
			<img src="/icons/icon.svg" alt="" width="52" height="52" />
			<span class="serif">Stewardbook</span>
		</div>
		<div class="card card-pad">
			<h1>{title}</h1>
			{#if subtitle}<p class="soft sub">{subtitle}</p>{/if}
			{@render children()}
		</div>
		{#if footer}<div class="foot small muted">{@render footer()}</div>{/if}
	</div>
</div>

<style>
	.auth {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 32px 16px;
		background:
			radial-gradient(
				1200px 500px at 10% -10%,
				color-mix(in srgb, var(--red-500) 10%, transparent),
				transparent 60%
			),
			radial-gradient(
				900px 500px at 110% 110%,
				color-mix(in srgb, var(--blue-600) 10%, transparent),
				transparent 60%
			),
			var(--bg);
	}

	.panel {
		width: min(460px, 100%);
	}

	.logo {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		margin-bottom: 22px;
		font-size: 1.6rem;
		font-weight: 700;
	}

	.logo img {
		border-radius: 13px;
		box-shadow: var(--shadow);
	}

	h1 {
		font-size: 1.35rem;
	}

	.sub {
		margin: 6px 0 20px;
	}

	.foot {
		text-align: center;
		margin-top: 18px;
	}
</style>
