<script lang="ts">
	import '../app.css';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import {
		CloudUpload,
		FolderOpen,
		House,
		Library,
		LogOut,
		Plus,
		ScrollText,
		Settings,
		WifiOff
	} from '@lucide/svelte';
	import { BUILD } from '#lib/build.ts';
	import { toasts, toast } from '#lib/toast.svelte.ts';
	import { discard, outbox, startOutbox } from '#lib/client/outbox.svelte.ts';
	import { initials } from '#lib/format.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const nav = [
		{ href: '/', label: 'Today', icon: House, match: (p: string) => p === '/' },
		{
			href: '/cases',
			label: 'Cases',
			icon: FolderOpen,
			match: (p: string) => p.startsWith('/cases')
		},
		{
			href: '/contracts',
			label: 'Contracts',
			icon: ScrollText,
			match: (p: string) => p.startsWith('/contracts')
		},
		{
			href: '/library',
			label: 'Library',
			icon: Library,
			match: (p: string) => p.startsWith('/library')
		},
		{
			href: '/settings',
			label: 'Settings',
			icon: Settings,
			match: (p: string) => p.startsWith('/settings')
		}
	];

	const bare = $derived(!data.user || page.url.pathname.endsWith('/packet'));

	async function onLogout(e: SubmitEvent) {
		if (outbox.items.length) {
			const ok = confirm(
				`${outbox.items.length} timeline ${outbox.items.length === 1 ? 'entry hasn’t' : 'entries haven’t'} synced yet. Signing out deletes ${outbox.items.length === 1 ? 'it' : 'them'} from this device. Sign out anyway?`
			);
			if (!ok) return e.preventDefault();
			for (const item of [...outbox.items]) await discard(item.clientId);
		}
		navigator.serviceWorker?.controller?.postMessage('clear-private-cache');
	}

	// Start the offline outbox whenever someone is signed in — including right after
	// first-run setup or sign-in, when this layout is already mounted.
	const signedIn = $derived(!!data.user);
	$effect(() => {
		if (!signedIn) return;
		return untrack(() =>
			startOutbox((sent: number) => {
				toast(`Synced ${sent} saved ${sent === 1 ? 'entry' : 'entries'}`);
				void invalidateAll();
			})
		);
	});
</script>

<svelte:head>
	<title>{page.data.title ? `${page.data.title} · Stewardbook` : 'Stewardbook'}</title>
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<div class="shell">
		<aside class="sidebar no-print" aria-label="Main">
			<a class="brand" href="/">
				<img src="/icons/icon.svg" alt="" width="34" height="34" />
				<span>
					<strong class="serif">Stewardbook</strong>
					<small>{data.localName}</small>
				</span>
			</a>
			<a class="btn accent block new-case" href="/cases/new"><Plus size={18} /> New case</a>
			<nav>
				{#each nav as item (item.href)}
					<a
						href={item.href}
						class:active={item.match(page.url.pathname)}
						aria-current={item.match(page.url.pathname) ? 'page' : undefined}
					>
						<item.icon size={19} />
						{item.label}
					</a>
				{/each}
			</nav>
			<div class="sidebar-foot">
				{#if !outbox.online || outbox.items.length}
					<div class="sync" class:offline={!outbox.online}>
						{#if !outbox.online}<WifiOff size={16} /> Offline — entries are saved on this device{:else}<CloudUpload
								size={16}
							/>
							{outbox.items.length} waiting to sync{/if}
					</div>
				{/if}
				<div class="me">
					<span class="avatar" aria-hidden="true">{initials(data.user!.name)}</span>
					<span class="who">
						<strong>{data.user!.name}</strong>
						<small>{data.user!.role === 'admin' ? 'Admin' : 'Steward'}</small>
					</span>
					<form method="POST" action="/logout" onsubmit={onLogout}>
						<button class="btn ghost icon small" title="Sign out" aria-label="Sign out">
							<LogOut size={17} />
						</button>
					</form>
				</div>
				<a class="build" href="/settings#about" title="Version and build">{BUILD.label}</a>
			</div>
		</aside>

		<header class="topbar no-print">
			<a class="brand" href="/">
				<img src="/icons/icon.svg" alt="" width="30" height="30" />
				<strong class="serif">Stewardbook</strong>
			</a>
			{#if !outbox.online}
				<span class="badge amber"><WifiOff size={13} /> Offline</span>
			{:else if outbox.items.length}
				<span class="badge blue"><CloudUpload size={13} /> {outbox.items.length} to sync</span>
			{/if}
		</header>

		<main id="main">
			{@render children()}
		</main>

		<nav class="tabbar no-print" aria-label="Main">
			{#each nav.slice(0, 2) as item (item.href)}
				<a href={item.href} class:active={item.match(page.url.pathname)}>
					<item.icon size={22} />
					<span>{item.label}</span>
				</a>
			{/each}
			<a href="/cases/new" class="fab" aria-label="New case"><Plus size={26} /></a>
			{#each nav.slice(3, 5) as item (item.href)}
				<a href={item.href} class:active={item.match(page.url.pathname)}>
					<item.icon size={22} />
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	</div>
{/if}

<div class="toast-region" aria-live="polite">
	{#each toasts as t (t.id)}
		<div class="toast">{t.message}</div>
	{/each}
</div>

<style>
	.shell {
		min-height: 100dvh;
	}

	.sidebar {
		display: none;
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		padding-top: calc(10px + env(safe-area-inset-top, 0px));
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: saturate(1.4) blur(10px);
		border-bottom: 1px solid var(--border);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		color: var(--text);
	}

	.brand strong {
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.brand img {
		border-radius: 9px;
	}

	.tabbar {
		position: fixed;
		z-index: 30;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		align-items: center;
		padding: 6px 8px calc(6px + var(--safe-bottom));
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		backdrop-filter: saturate(1.4) blur(12px);
		border-top: 1px solid var(--border);
	}

	.tabbar a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 4px 0;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-muted);
		text-decoration: none;
	}

	.tabbar a.active {
		color: var(--text);
	}

	.tabbar .fab {
		justify-self: center;
		width: 54px;
		height: 54px;
		margin-top: -22px;
		border-radius: 18px;
		background: var(--red-500);
		color: #fff;
		justify-content: center;
		box-shadow: 0 6px 18px rgb(214 64 47 / 0.4);
	}

	@media (min-width: 900px) {
		.shell {
			display: grid;
			grid-template-columns: var(--sidebar) minmax(0, 1fr);
		}

		.topbar,
		.tabbar {
			display: none;
		}

		.sidebar {
			position: sticky;
			top: 0;
			height: 100dvh;
			display: flex;
			flex-direction: column;
			gap: 18px;
			padding: 20px 14px;
			background: var(--surface);
			border-right: 1px solid var(--border);
		}

		.sidebar .brand {
			padding: 2px 8px 6px;
		}

		.sidebar .brand span {
			display: flex;
			flex-direction: column;
			line-height: 1.15;
		}

		.sidebar .brand small {
			color: var(--text-muted);
			font-size: 0.78rem;
			margin-top: 2px;
		}

		.new-case {
			margin: 0 4px;
		}

		nav {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		nav a {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 9px 12px;
			border-radius: 10px;
			font-weight: 600;
			color: var(--text-soft);
			text-decoration: none;
		}

		nav a:hover {
			background: var(--surface-sunken);
			color: var(--text);
		}

		nav a.active {
			background: var(--ink-100);
			color: var(--text);
		}

		.sidebar-foot {
			margin-top: auto;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		.sync {
			display: flex;
			gap: 8px;
			align-items: center;
			font-size: 0.8rem;
			font-weight: 600;
			padding: 8px 10px;
			border-radius: 10px;
			background: var(--blue-100);
			color: var(--blue-700);
		}

		.sync.offline {
			background: var(--amber-100);
			color: var(--amber-700);
		}

		.me {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 10px 8px 0;
			border-top: 1px solid var(--border);
		}

		.avatar {
			display: grid;
			place-items: center;
			width: 34px;
			height: 34px;
			border-radius: 50%;
			background: var(--ink-800);
			color: #fff;
			font-size: 0.8rem;
			font-weight: 700;
			flex-shrink: 0;
		}

		.who {
			display: flex;
			flex-direction: column;
			min-width: 0;
			flex: 1;
			line-height: 1.2;
		}

		.who strong {
			font-size: 0.9rem;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.who small {
			color: var(--text-muted);
			font-size: 0.75rem;
		}

		.build {
			font-size: 0.7rem;
			color: var(--text-muted);
			text-decoration: none;
			padding: 0 8px;
			font-variant-numeric: tabular-nums;
		}
	}

	@media print {
		.shell {
			display: block;
		}
	}
</style>
