<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let busy = $state(false);
</script>

<AuthCard title="Sign in" subtitle="Grievance deadlines, case files and handoffs for your local.">
	<form
		method="POST"
		class="stack"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		{#if form?.message}<div class="callout danger" role="alert">{form.message}</div>{/if}
		<label class="field">
			<span>Email</span>
			<input
				class="input"
				type="email"
				name="email"
				autocomplete="username"
				required
				value={form?.email ?? ''}
			/>
		</label>
		<label class="field">
			<span>Password</span>
			<input
				class="input"
				type="password"
				name="password"
				autocomplete="current-password"
				required
			/>
		</label>
		<button class="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
	</form>
	{#snippet footer()}
		Forgot your password? Ask an admin of your local to reset it.
	{/snippet}
</AuthCard>
