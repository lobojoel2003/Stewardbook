<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeftRight, CircleCheck, Paperclip, UserRound } from '@lucide/svelte';
	import CountdownChip from '#lib/components/CountdownChip.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const c = $derived(data.case);
	const witnesses = $derived(c.timeline.filter((e) => e.kind === 'witness').length);
</script>

<div class="page narrow">
	<header class="page-header">
		<div>
			<div class="eyebrow"><a class="link" href="/cases/{c.id}">{c.number}</a></div>
			<h1>Hand off this case</h1>
			<p>
				The full history moves with it. The next steward gets a packet with deadlines, witnesses,
				articles and every note.
			</p>
		</div>
	</header>

	<section class="card card-pad summary">
		<h2>{c.title}</h2>
		<div class="row" style="margin-top: 10px">
			{#if c.chain.current}
				<CountdownChip countdown={c.chain.current.countdown} due={c.chain.current.effectiveDue} />
				<span class="small soft">{c.chain.current.stage}: {c.chain.current.name}</span>
			{:else}
				<span class="small soft">No clock running</span>
			{/if}
		</div>
		<ul class="included">
			<li><CircleCheck size={16} /> {c.chain.steps.length} steps with dates</li>
			<li>
				<UserRound size={16} />
				{witnesses} witness {witnesses === 1 ? 'statement' : 'statements'}
			</li>
			<li>
				<Paperclip size={16} />
				{c.timeline.length} timeline entries, {c.attachmentCount} files
			</li>
		</ul>
	</section>

	<form
		method="POST"
		class="card card-pad stack"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		{#if form?.message}<div class="callout danger" role="alert">{form.message}</div>{/if}
		<label class="field">
			<span>Hand it to</span>
			<select class="select" name="toUserId" required>
				<option value="">Choose a steward…</option>
				{#each data.stewards as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
			</select>
			{#if !data.stewards.length}<span class="hint">
					No other active stewards yet. An admin can add them in Settings → Team.
				</span>{/if}
		</label>
		<label class="field">
			<span>
				Handoff notes <span class="hint">
					— what’s pending, who to call, what you promised the grievant
				</span>
			</span>
			<textarea
				class="textarea"
				name="notes"
				rows="6"
				value={form?.notes ?? ''}
				placeholder={'Step 2 meeting is set for Thursday at 2pm with the Operations Manager.\nDana prefers texts after 6pm.\nAsk HR for the overtime sign-up sheet — they promised it by Friday.'}
			></textarea>
		</label>
		<div class="form-actions">
			<a class="btn ghost" href="/cases/{c.id}">Cancel</a>
			<button class="btn primary"><ArrowLeftRight size={16} /> Hand off and open the packet</button>
		</div>
	</form>
</div>

<style>
	.summary {
		margin-bottom: 16px;
	}

	.included {
		list-style: none;
		margin: 14px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		color: var(--text-soft);
		font-size: 0.9rem;
	}

	.included li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
</style>
