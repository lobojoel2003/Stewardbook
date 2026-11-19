<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);

	const zones = $derived(
		typeof Intl.supportedValuesOf === 'function'
			? Intl.supportedValuesOf('timeZone')
			: [data.defaultTimezone]
	);
	const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const initialZone = $derived(
		form?.values?.timezone ?? (zones.includes(guess) ? guess : data.defaultTimezone)
	);
</script>

<AuthCard
	title="Set up your local"
	subtitle="One-time setup. You'll be the first admin and can invite other stewards afterwards."
>
	<form
		method="POST"
		class="stack"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<label class="field">
			<span>Local name</span>
			<input
				class="input"
				name="localName"
				required
				placeholder="Local 512"
				value={form?.values?.localName ?? ''}
			/>
			{#if form?.errors?.localName}<span class="error-text">{form.errors.localName}</span>{/if}
		</label>
		<label class="field">
			<span>Union <span class="hint">(optional)</span></span>
			<input
				class="input"
				name="unionName"
				placeholder="Allied Warehouse Workers"
				value={form?.values?.unionName ?? ''}
			/>
		</label>
		<label class="field">
			<span>Timezone <span class="hint">— used to decide what "today" is for deadlines</span></span>
			<select class="select" name="timezone" value={initialZone}>
				{#each zones as z (z)}<option value={z}>{z.replaceAll('_', ' ')}</option>{/each}
			</select>
			{#if form?.errors?.timezone}<span class="error-text">{form.errors.timezone}</span>{/if}
		</label>
		<hr class="divider" />
		<label class="field">
			<span>Your name</span>
			<input
				class="input"
				name="name"
				autocomplete="name"
				required
				value={form?.values?.name ?? ''}
			/>
			{#if form?.errors?.name}<span class="error-text">{form.errors.name}</span>{/if}
		</label>
		<label class="field">
			<span>Email</span>
			<input
				class="input"
				type="email"
				name="email"
				autocomplete="email"
				required
				value={form?.values?.email ?? ''}
			/>
			{#if form?.errors?.email}<span class="error-text">{form.errors.email}</span>{/if}
		</label>
		<label class="field">
			<span>Password <span class="hint">— at least 10 characters</span></span>
			<input
				class="input"
				type="password"
				name="password"
				autocomplete="new-password"
				required
				minlength="10"
			/>
			{#if form?.errors?.password}<span class="error-text">{form.errors.password}</span>{/if}
		</label>
		<button class="btn primary block" disabled={busy}>
			{busy ? 'Setting up…' : 'Create local and sign in'}
		</button>
	</form>
	{#snippet footer()}
		Stewardbook is free software under the AGPL-3.0. Your data stays in your own database.
	{/snippet}
</AuthCard>
