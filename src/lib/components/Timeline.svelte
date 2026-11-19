<script lang="ts">
	import { enhance } from '$app/forms';
	import { CloudUpload, FileText, ShieldAlert, ShieldCheck, Trash2 } from '@lucide/svelte';
	import EntryIcon from './EntryIcon.svelte';
	import { ENTRY_LABELS } from '#lib/labels.ts';
	import { fileSize, formatDay, formatTime } from '#lib/format.ts';
	import { discard, type OutboxItem } from '#lib/client/outbox.svelte.ts';
	import { toast } from '#lib/toast.svelte.ts';

	interface Entry {
		id: string;
		kind: string;
		title: string;
		body: string;
		occurredAt: Date | string;
		authorId: string | null;
		authorName: string | null;
		data: Record<string, unknown>;
		attachments: { id: string; filename: string; mimeType: string; size: number }[];
	}

	let {
		entries,
		pending = [],
		user
	}: { entries: Entry[]; pending?: OutboxItem[]; user: { id: string; role: string } } = $props();

	const DELETABLE = new Set(['note', 'photo', 'witness', 'weingarten', 'document', 'call']);

	const groups = $derived.by(() => {
		const out: { day: string; items: Entry[] }[] = [];
		for (const e of entries) {
			const day = formatDay(e.occurredAt);
			const last = out[out.length - 1];
			if (last && last.day === day) last.items.push(e);
			else out.push({ day, items: [e] });
		}
		return out;
	});

	const isImage = (m: string) =>
		m.startsWith('image/') && !m.includes('heic') && !m.includes('heif');
</script>

{#if pending.length}
	<ul class="pending outbox-list">
		{#each pending as p (p.clientId)}
			<li>
				<EntryIcon kind={p.kind} />
				<div class="content">
					<div class="head">
						<strong>{p.title || ENTRY_LABELS[p.kind]}</strong>
						<span class="badge blue"><CloudUpload size={12} /> Waiting to sync</span>
					</div>
					{#if p.body}<p class="prose small">{p.body}</p>{/if}
					{#if p.files.length}<p class="tiny muted">
							{p.files.length} file{p.files.length === 1 ? '' : 's'} attached
						</p>{/if}
					{#if p.lastError}<p class="tiny muted">Last try: {p.lastError}</p>{/if}
					<button
						class="btn ghost small"
						type="button"
						onclick={async () => {
							if (confirm('Discard this unsynced entry? It hasn’t reached the server.')) {
								await discard(p.clientId);
								toast('Discarded');
							}
						}}
					>
						Discard
					</button>
				</div>
			</li>
		{/each}
	</ul>
{/if}

{#if groups.length}
	{#each groups as g (g.day)}
		<h3 class="day">{g.day}</h3>
		<ul class="entries">
			{#each g.items as e (e.id)}
				<li class={e.kind}>
					<EntryIcon kind={e.kind} />
					<div class="content">
						<div class="head">
							<strong>{e.title || ENTRY_LABELS[e.kind]}</strong>
							<span class="tiny muted">
								{formatTime(e.occurredAt)} · {e.authorName ?? 'Former steward'}
							</span>
						</div>

						{#if e.kind === 'weingarten'}
							<div class="facts small">
								{#if e.data.rightsAsserted}
									<span class="ok">
										<ShieldCheck size={14} /> Representation requested and present
									</span>
								{:else}
									<span class="warn"><ShieldAlert size={14} /> Representation not confirmed</span>
								{/if}
								{#if e.data.managementRep}<span>Management: {e.data.managementRep}</span>{/if}
								{#if e.data.attendees}<span>Present: {e.data.attendees}</span>{/if}
							</div>
							{#if e.data.questions}<pre class="qa">{e.data.questions}</pre>{/if}
						{:else if e.kind === 'witness' && e.data.witnessContact}
							<p class="tiny muted">{e.data.witnessContact}</p>
						{/if}

						{#if e.body}<p class="prose body">{e.body}</p>{/if}

						{#if e.attachments.length}
							<div class="files">
								{#each e.attachments as a (a.id)}
									{#if isImage(a.mimeType)}
										<a class="thumb" href="/attachments/{a.id}" target="_blank" rel="noopener">
											<img src="/attachments/{a.id}" alt={a.filename} loading="lazy" />
										</a>
									{:else}
										<a class="file" href="/attachments/{a.id}" target="_blank" rel="noopener">
											<FileText size={16} />
											<span>{a.filename}</span>
											<span class="tiny muted">{fileSize(a.size)}</span>
										</a>
									{/if}
								{/each}
							</div>
						{/if}

						{#if DELETABLE.has(e.kind) && (e.authorId === user.id || user.role === 'admin')}
							<form
								method="POST"
								action="?/deleteEntry"
								class="del"
								use:enhance={({ cancel }) => {
									if (!confirm('Delete this entry and its attachments?')) cancel();
									return async ({ update }) => {
										await update();
										toast('Entry deleted');
									};
								}}
							>
								<input type="hidden" name="entryId" value={e.id} />
								<button class="btn ghost small icon" aria-label="Delete entry">
									<Trash2 size={14} />
								</button>
							</form>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/each}
{:else if !pending.length}
	<p class="muted small">Nothing on the timeline yet.</p>
{/if}

<style>
	.day {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin: 18px 0 8px;
	}

	.day:first-child {
		margin-top: 0;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		display: flex;
		gap: 12px;
		padding: 10px 0;
	}

	.pending li {
		padding: 12px;
		border-radius: var(--radius);
		background: var(--blue-100);
		margin-bottom: 8px;
	}

	.content {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
		padding-right: 36px;
	}

	.body {
		font-size: 0.93rem;
		color: var(--text-soft);
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		color: var(--text-soft);
	}

	.facts span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.facts .ok {
		color: var(--green-600);
		font-weight: 600;
	}

	.facts .warn {
		color: var(--amber-700);
		font-weight: 600;
	}

	.qa {
		margin: 4px 0 0;
		padding: 10px 12px;
		border-radius: 10px;
		background: var(--surface-sunken);
		font-family: var(--font);
		font-size: 0.88rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.files {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
	}

	.thumb img {
		width: 120px;
		height: 120px;
		object-fit: cover;
		border-radius: 12px;
		border: 1px solid var(--border);
	}

	.file {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: var(--surface-2);
		text-decoration: none;
		font-size: 0.88rem;
		font-weight: 550;
		max-width: 100%;
	}

	.file span:first-of-type {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.del {
		position: absolute;
		top: -6px;
		right: 0;
		opacity: 0.5;
	}

	li:hover .del,
	.del:focus-within {
		opacity: 1;
	}
</style>
