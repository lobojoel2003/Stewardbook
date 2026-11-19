<script lang="ts">
	import { enhance } from '$app/forms';
	import { ClipboardPaste, FileUp, Sparkles, WandSparkles } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let mode = $state<'paste' | 'upload'>('paste');
	let text = $state('');
	let busy = $state(false);
	let fileName = $state('');
	let name = $state('');
	let employer = $state('');

	$effect(() => {
		if (form?.values) {
			name = form.values.name;
			employer = form.values.employer;
		}
	});

	function useSample() {
		mode = 'paste';
		text = data.sample;
		name = 'Northgate Distribution CBA 2025–2028';
		employer = 'Northgate Distribution Company';
	}
</script>

<div class="page narrow">
	<header class="page-header">
		<div>
			<div class="eyebrow">Contracts</div>
			<h1>Add a contract</h1>
			<p>
				Paste or upload the agreement once. Stewardbook reads the grievance procedure, the day
				counts and the holiday list — then you confirm every deadline before any case uses it.
			</p>
		</div>
	</header>

	{#if data.welcome}
		<div class="callout success" style="margin-bottom: 20px">
			<Sparkles size={20} />
			<div>
				<strong>Your local is set up.</strong> Next, add the contract your stewards work under. No
				contract handy?
				<button class="btn small" type="button" onclick={useSample}>Try the sample contract</button>
			</div>
		</div>
	{/if}

	<form
		method="POST"
		enctype="multipart/form-data"
		class="card card-pad stack"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		{#if form?.message}<div class="callout danger" role="alert">{form.message}</div>{/if}

		<div class="form-grid">
			<label class="field full">
				<span>Contract name</span>
				<input
					class="input"
					name="name"
					required
					placeholder="e.g. Warehouse CBA 2025–2028"
					bind:value={name}
				/>
			</label>
			<label class="field full">
				<span>Employer</span>
				<input
					class="input"
					name="employer"
					placeholder="Northgate Distribution Company"
					bind:value={employer}
				/>
			</label>
			<label class="field">
				<span>Effective</span>
				<input
					class="input"
					type="date"
					name="effectiveDate"
					value={form?.values?.effectiveDate ?? ''}
				/>
			</label>
			<label class="field">
				<span>Expires</span>
				<input
					class="input"
					type="date"
					name="expirationDate"
					value={form?.values?.expirationDate ?? ''}
				/>
			</label>
		</div>

		<div class="tabs" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'paste'}
				class:on={mode === 'paste'}
				onclick={() => (mode = 'paste')}
			>
				<ClipboardPaste size={16} /> Paste text
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'upload'}
				class:on={mode === 'upload'}
				onclick={() => (mode = 'upload')}
			>
				<FileUp size={16} /> Upload PDF or text file
			</button>
			{#if !data.welcome}
				<button type="button" class="sample link" onclick={useSample}>
					Use the sample contract
				</button>
			{/if}
		</div>

		{#if mode === 'paste'}
			<label class="field">
				<span class="sr-only">Contract text</span>
				<textarea
					class="textarea contract-text"
					name="text"
					bind:value={text}
					placeholder={'ARTICLE 9 – GRIEVANCE PROCEDURE\nStep 1. The Union shall present the grievance in writing within ten (10) working days…'}
				></textarea>
				<span class="hint">
					{text.length
						? `${text.length.toLocaleString()} characters`
						: 'The whole agreement works best — articles, holidays and all.'}
				</span>
			</label>
		{:else}
			<label class="drop">
				<input
					type="file"
					name="file"
					accept=".pdf,.txt,.md,application/pdf,text/plain"
					onchange={(e) => (fileName = e.currentTarget.files?.[0]?.name ?? '')}
				/>
				<FileUp size={28} />
				<strong>{fileName || 'Choose the contract PDF'}</strong>
				<span class="small muted">
					Text-based PDFs and .txt files up to 25 MB. Scanned PDFs need OCR first.
				</span>
			</label>
		{/if}

		{#if data.llm}
			<label class="check llm">
				<input type="checkbox" name="useLlm" checked />
				<span>
					<strong>
						<WandSparkles size={15} style="vertical-align: -2px" /> Draft deadlines with the local AI
						model
					</strong>
					<span class="small muted" style="display: block">
						Uses {data.llm.model} on your own server. The contract never leaves it, and you still confirm
						each step.
					</span>
				</span>
			</label>
		{/if}

		<div class="form-actions">
			<a class="btn ghost" href="/contracts">Cancel</a>
			<button class="btn primary" disabled={busy}>
				{busy ? 'Reading the contract…' : 'Read contract'}
			</button>
		</div>
	</form>
</div>

<style>
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		border-bottom: 1px solid var(--border);
		padding-bottom: 8px;
	}

	.tabs button[role='tab'] {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: 9px;
		border: 0;
		background: transparent;
		font: inherit;
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--text-muted);
		cursor: pointer;
	}

	.tabs button.on {
		background: var(--ink-100);
		color: var(--text);
	}

	.sample {
		margin-left: auto;
		background: none;
		border: 0;
		font: inherit;
		font-size: 0.88rem;
		cursor: pointer;
	}

	.contract-text {
		min-height: 320px;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 36px 20px;
		border: 2px dashed var(--border-strong);
		border-radius: var(--radius);
		text-align: center;
		cursor: pointer;
		color: var(--text-soft);
	}

	.drop:hover {
		border-color: var(--ink-400);
		background: var(--surface-2);
	}

	.drop input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.drop:focus-within {
		outline: 2px solid var(--focus);
	}

	.llm {
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--violet-100);
	}
</style>
