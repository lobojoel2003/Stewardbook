<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Camera, FileUp } from '@lucide/svelte';
	import Sheet from './Sheet.svelte';
	import { ENTRY_LABELS, type QuickEntryKind } from '#lib/labels.ts';
	import { newClientId, submitEntry, type OutboxFile } from '#lib/client/outbox.svelte.ts';
	import { downscaleImage } from '#lib/client/images.ts';
	import { nowLocalInput } from '#lib/format.ts';
	import { toast } from '#lib/toast.svelte.ts';

	let {
		kind = $bindable(null),
		caseId,
		caseLabel,
		maxUploadMb
	}: {
		kind: QuickEntryKind | null;
		caseId: string;
		caseLabel: string;
		maxUploadMb: number;
	} = $props();

	let open = $state(false);
	let busy = $state(false);
	let error = $state('');
	let previews = $state<string[]>([]);

	let openedAt = $state(nowLocalInput());
	$effect(() => {
		if (kind) {
			openedAt = nowLocalInput();
			open = true;
		}
	});
	$effect(() => {
		if (!open) untrack(reset);
	});

	function reset() {
		kind = null;
		error = '';
		for (const p of previews) URL.revokeObjectURL(p);
		previews = [];
	}

	const titles: Record<QuickEntryKind, string> = {
		note: 'Add a note',
		photo: 'Add a photo',
		witness: 'Witness statement',
		weingarten: 'Weingarten meeting notes',
		call: 'Log a call or conversation',
		document: 'Attach a document'
	};

	function onFiles(e: Event & { currentTarget: HTMLInputElement }) {
		for (const p of previews) URL.revokeObjectURL(p);
		const files = [...(e.currentTarget.files ?? [])];
		previews = files.filter((f) => f.type.startsWith('image/')).map((f) => URL.createObjectURL(f));
	}

	async function onsubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
		e.preventDefault();
		if (!kind) return;
		error = '';
		const form = new FormData(e.currentTarget);
		const get = (k: string) => {
			const v = form.get(k);
			return typeof v === 'string' ? v.trim() : '';
		};
		const occurredLocal = get('occurredAt');
		// Untouched "When" field means right now, to the second (the input only holds minutes).
		const occurredAt =
			occurredLocal && occurredLocal !== openedAt
				? new Date(occurredLocal).toISOString()
				: new Date().toISOString();

		const data: Record<string, unknown> = {};
		let title = get('title');
		const body = get('body');
		if (kind === 'witness') {
			const witnessName = get('witnessName');
			data.witnessName = witnessName;
			data.witnessContact = get('witnessContact');
			if (!witnessName) return void (error = 'Who is the witness?');
			title = `Witness: ${witnessName}`;
		} else if (kind === 'weingarten') {
			data.managementRep = get('managementRep');
			data.attendees = get('attendees');
			data.rightsAsserted = form.get('rightsAsserted') === 'on';
			data.questions = get('questions');
			title = title || 'Investigatory interview';
		} else if (kind === 'call') {
			const contact = get('contact');
			data.contact = contact;
			title = contact ? `Talked with ${contact}` : 'Call';
		}

		const raw = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
		if ((kind === 'photo' || kind === 'document') && !raw.length)
			return void (error = kind === 'photo' ? 'Take or choose a photo.' : 'Choose a file.');
		if (kind === 'note' && !body) return void (error = 'Write the note first.');

		busy = true;
		try {
			const files: OutboxFile[] = [];
			for (const f of raw) {
				const small = kind === 'photo' || f.type.startsWith('image/') ? await downscaleImage(f) : f;
				if (small.size > maxUploadMb * 1024 * 1024) {
					error = `${f.name} is larger than ${maxUploadMb} MB.`;
					busy = false;
					return;
				}
				files.push({
					name: small.name,
					type: small.type || 'application/octet-stream',
					blob: small
				});
			}
			const result = await submitEntry({
				clientId: newClientId(),
				caseId,
				caseLabel,
				kind,
				title,
				body,
				occurredAt,
				data,
				files,
				createdAt: Date.now(),
				attempts: 0
			});
			open = false;
			if (result === 'sent') {
				toast(`${ENTRY_LABELS[kind]} saved`);
				await invalidateAll();
			} else {
				toast('Saved on this device — it will sync when you’re back online', 4500);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save the entry.';
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open title={kind ? titles[kind] : ''}>
	{#if kind}
		<form class="sheet-form" {onsubmit}>
			<div class="sheet-body stack">
				{#if kind === 'photo'}
					<label class="capture">
						<input
							type="file"
							name="files"
							accept="image/*"
							capture="environment"
							multiple
							onchange={onFiles}
						/>
						{#if previews.length}
							<span class="thumbs">
								{#each previews as p (p)}<img src={p} alt="" />{/each}
							</span>
						{:else}
							<Camera size={30} />
							<strong>Take a photo or choose one</strong>
						{/if}
					</label>
					<label class="field">
						<span>Caption</span><input
							class="input"
							name="body"
							placeholder="What does this show?"
						/>
					</label>
				{:else if kind === 'document'}
					<label class="capture">
						<input
							type="file"
							name="files"
							accept=".pdf,.doc,.docx,.txt,image/*"
							multiple
							onchange={onFiles}
						/>
						<FileUp size={28} />
						<strong>Choose a file</strong>
						<span class="small muted">PDF, Word, text or image · up to {maxUploadMb} MB</span>
					</label>
					<label class="field">
						<span>Title</span><input
							class="input"
							name="title"
							placeholder="Discipline letter dated…"
						/>
					</label>
					<label class="field">
						<span>Notes</span><textarea class="textarea" name="body" rows="2"></textarea>
					</label>
				{:else if kind === 'witness'}
					<div class="form-grid">
						<label class="field">
							<span>Witness name</span><input
								class="input"
								name="witnessName"
								required
								autocomplete="off"
							/>
						</label>
						<label class="field">
							<span>Contact or shift</span><input
								class="input"
								name="witnessContact"
								autocomplete="off"
							/>
						</label>
					</div>
					<label class="field">
						<span>
							Statement <span class="hint">— in the witness’s own words where you can</span>
						</span>
						<textarea class="textarea" name="body" rows="6"></textarea>
					</label>
				{:else if kind === 'weingarten'}
					<div class="callout info small">
						The employee has the right to a steward in any investigatory interview they reasonably
						believe could lead to discipline (<em>NLRB v. J. Weingarten</em>). Note whether the
						right was asked for and honored.
					</div>
					<div class="form-grid">
						<label class="field">
							<span>Management representative</span><input class="input" name="managementRep" />
						</label>
						<label class="field">
							<span>Also present</span><input
								class="input"
								name="attendees"
								placeholder="Grievant, steward, HR…"
							/>
						</label>
					</div>
					<label class="check">
						<input type="checkbox" name="rightsAsserted" checked />
						<span>
							The employee asked for representation and a steward was present before questioning
							began
						</span>
					</label>
					<label class="field">
						<span>Questions asked and answers given</span>
						<textarea
							class="textarea"
							name="questions"
							rows="5"
							placeholder={'Q: Where were you at 2:15?\nA: On break in the cafeteria.'}></textarea>
					</label>
					<label class="field">
						<span>Your notes</span><textarea class="textarea" name="body" rows="3"></textarea>
					</label>
				{:else if kind === 'call'}
					<label class="field">
						<span>Who</span><input
							class="input"
							name="contact"
							placeholder="HR manager, grievant…"
						/>
					</label>
					<label class="field">
						<span>What was said</span><textarea class="textarea" name="body" rows="5"></textarea>
					</label>
				{:else}
					<label class="field">
						<span>Title <span class="hint">(optional)</span></span><input
							class="input"
							name="title"
						/>
					</label>
					<label class="field">
						<span>Note</span><textarea class="textarea" name="body" rows="6" required></textarea>
					</label>
				{/if}

				<label class="field when">
					<span>When</span>
					<input class="input" type="datetime-local" name="occurredAt" value={openedAt} />
				</label>
				{#if error}<p class="error-text" role="alert">{error}</p>{/if}
			</div>
			<div class="sheet-foot">
				<button type="button" class="btn ghost" onclick={() => (open = false)}>Cancel</button>
				<button class="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save to timeline'}</button>
			</div>
		</form>
	{/if}
</Sheet>

<style>
	.sheet-form {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}

	.capture {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 150px;
		padding: 20px;
		border: 2px dashed var(--border-strong);
		border-radius: var(--radius);
		text-align: center;
		cursor: pointer;
		color: var(--text-soft);
	}

	.capture:hover {
		background: var(--surface-2);
	}

	.capture:focus-within {
		outline: 2px solid var(--focus);
	}

	.capture input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.thumbs {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.thumbs img {
		width: 96px;
		height: 96px;
		object-fit: cover;
		border-radius: 10px;
	}

	.when {
		max-width: 260px;
	}
</style>
