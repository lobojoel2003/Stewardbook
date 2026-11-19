<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		CalendarDays,
		Copy,
		CodeXml,
		Info,
		KeyRound,
		RefreshCw,
		Shield,
		UserPlus,
		UserRound,
		Users,
		WandSparkles
	} from '@lucide/svelte';
	import { BUILD } from '#lib/build.ts';
	import { formatDateTime, initials, relativeTime } from '#lib/format.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import type { SubmitFunction } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form: rawForm }: PageProps = $props();
	const form = $derived(
		rawForm as {
			section?: string;
			message?: string;
			saved?: string;
			tempPassword?: { email: string; password: string };
		} | null
	);

	const zones =
		typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

	const done: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success' && result.data?.saved) toast(String(result.data.saved));
		};

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast('Copied');
		} catch {
			toast('Copy failed — select the link and copy it');
		}
	}
</script>

<div class="page">
	<header class="page-header">
		<div>
			<div class="eyebrow">Settings</div>
			<h1>Settings</h1>
		</div>
	</header>

	<div class="grid-2">
		<section class="card">
			<div class="card-header"><h2><UserRound size={17} class="ic" /> Your profile</h2></div>
			<form method="POST" action="?/profile" class="card-body stack" use:enhance={done}>
				{#if form?.section === 'profile' && form.message}<p class="error-text">
						{form.message}
					</p>{/if}
				<label class="field">
					<span>Name</span><input class="input" name="name" value={data.me?.name} required />
				</label>
				<label class="field">
					<span>Email</span><input
						class="input"
						type="email"
						name="email"
						value={data.me?.email}
						required
					/>
				</label>
				<label class="field">
					<span>Phone <span class="hint">(shown on handoff packets)</span></span><input
						class="input"
						name="phone"
						value={data.me?.phone ?? ''}
					/>
				</label>
				<div><button class="btn small primary">Save profile</button></div>
			</form>
		</section>

		<section class="card">
			<div class="card-header"><h2><KeyRound size={17} class="ic" /> Password</h2></div>
			<form method="POST" action="?/password" class="card-body stack" use:enhance={done}>
				{#if form?.section === 'password' && form.message}<p class="error-text">
						{form.message}
					</p>{/if}
				<label class="field">
					<span>Current password</span><input
						class="input"
						type="password"
						name="current"
						autocomplete="current-password"
						required
					/>
				</label>
				<label class="field">
					<span>New password</span><input
						class="input"
						type="password"
						name="next"
						autocomplete="new-password"
						minlength="10"
						required
					/>
				</label>
				<div><button class="btn small primary">Change password</button></div>
			</form>
		</section>

		<section class="card">
			<div class="card-header">
				<h2><CalendarDays size={17} class="ic" /> Deadlines in your calendar</h2>
			</div>
			<div class="card-body stack">
				<p class="small soft">
					Subscribe to this link in Google Calendar, Apple Calendar or Outlook (“add calendar from
					URL”). Every running deadline on your cases shows up as an all-day event with a reminder.
					Add <code>?all=1</code> for every steward’s cases.
				</p>
				<div class="copy">
					<input
						class="input mono"
						readonly
						value={data.calendarUrl}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<button
						class="btn icon"
						type="button"
						aria-label="Copy calendar link"
						onclick={() => copy(data.calendarUrl)}
					>
						<Copy size={16} />
					</button>
				</div>
				<form method="POST" action="?/calendar" use:enhance={done}>
					<button class="btn small">
						<RefreshCw size={14} /> Make a new link (the old one stops working)
					</button>
				</form>
			</div>
		</section>

		<section class="card" id="about">
			<div class="card-header"><h2><Info size={17} class="ic" /> About this installation</h2></div>
			<dl class="card-body about">
				<dt>Version</dt>
				<dd class="mono">v{BUILD.version}</dd>
				<dt>Build</dt>
				<dd class="mono">{BUILD.number}</dd>
				<dt>Commit</dt>
				<dd class="mono">{BUILD.sha}</dd>
				<dt>Built</dt>
				<dd>{BUILD.date.startsWith('20') ? formatDateTime(BUILD.date) : BUILD.date}</dd>
				<dt>Local AI</dt>
				<dd>
					{#if data.llm}<span class="badge violet">
							<WandSparkles size={12} />
							{data.llm.model} @ {data.llm.host}
						</span>{:else}<span class="muted">Not configured (set LLM_BASE_URL)</span>{/if}
				</dd>
				<dt>License</dt>
				<dd>GNU AGPL-3.0</dd>
				<dt>Source</dt>
				<dd>
					<a class="link" href={data.sourceUrl} target="_blank" rel="noopener">
						<CodeXml size={14} class="ic" />
						{data.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}
					</a>
				</dd>
			</dl>
		</section>

		{#if data.isAdmin}
			<section class="card">
				<div class="card-header"><h2><Shield size={17} class="ic" /> Local</h2></div>
				<form method="POST" action="?/local" class="card-body stack" use:enhance={done}>
					{#if form?.section === 'local' && form.message}<p class="error-text">
							{form.message}
						</p>{/if}
					<label class="field">
						<span>Local name</span><input
							class="input"
							name="localName"
							value={data.settings?.localName}
							required
						/>
					</label>
					<label class="field">
						<span>Union</span><input
							class="input"
							name="unionName"
							value={data.settings?.unionName}
						/>
					</label>
					<label class="field">
						<span>Timezone</span>
						<select class="select" name="timezone" value={data.settings?.timezone}>
							{#each zones as z (z)}<option value={z}>{z.replaceAll('_', ' ')}</option>{/each}
						</select>
					</label>
					<div><button class="btn small primary">Save</button></div>
				</form>
			</section>
		{/if}
	</div>

	{#if data.isAdmin}
		<section class="card team">
			<div class="card-header">
				<h2><Users size={17} class="ic" /> Team</h2>
				<span class="small muted">{data.team.filter((u) => u.active).length} active</span>
			</div>

			{#if form?.section === 'team' && form.message}<p class="error-text card-body">
					{form.message}
				</p>{/if}
			{#if form?.tempPassword}
				<div class="callout success temp">
					<KeyRound size={18} />
					<div>
						Share this temporary password with <strong>{form.tempPassword.email}</strong> in person
						or by text. It is shown only once.
						<div class="copy" style="margin-top: 8px">
							<input class="input mono" readonly value={form.tempPassword.password} />
							<button
								class="btn icon"
								type="button"
								aria-label="Copy password"
								onclick={() => copy(form.tempPassword!.password)}
							>
								<Copy size={16} />
							</button>
						</div>
					</div>
				</div>
			{/if}

			<div class="table-wrap">
				<table class="table">
					<thead><tr><th>Steward</th><th>Role</th><th>Last sign-in</th><th></th></tr></thead>
					<tbody>
						{#each data.team as u (u.id)}
							<tr class:inactive={!u.active}>
								<td>
									<div class="person">
										<span class="avatar">{initials(u.name)}</span>
										<div>
											<strong>{u.name}</strong>{#if !u.active}
												<span class="badge">Deactivated</span>{/if}
											<div class="tiny muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div>
										</div>
									</div>
								</td>
								<td>
									<span class="badge {u.role === 'admin' ? 'ink' : ''}">
										{u.role === 'admin' ? 'Admin' : 'Steward'}
									</span>
								</td>
								<td class="small muted">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'Never'}</td>
								<td>
									{#if u.id !== data.user?.id}
										<div class="row actions" style="--gap: 6px">
											<form method="POST" action="?/toggleRole" use:enhance={done}>
												<input type="hidden" name="userId" value={u.id} /><button
													class="btn ghost small"
												>
													{u.role === 'admin' ? 'Make steward' : 'Make admin'}
												</button>
											</form>
											<form method="POST" action="?/resetPassword" use:enhance={done}>
												<input type="hidden" name="userId" value={u.id} /><button
													class="btn ghost small"
												>
													Reset password
												</button>
											</form>
											<form method="POST" action="?/toggleActive" use:enhance={done}>
												<input type="hidden" name="userId" value={u.id} /><button
													class="btn small {u.active ? 'danger' : ''}"
												>
													{u.active ? 'Deactivate' : 'Reactivate'}
												</button>
											</form>
										</div>
									{:else}
										<span class="tiny muted">You</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<form method="POST" action="?/addUser" class="card-body add" use:enhance={done}>
				<h3><UserPlus size={16} class="ic" /> Add a steward</h3>
				<div class="form-grid">
					<label class="field"><span>Name</span><input class="input" name="name" required /></label>
					<label class="field">
						<span>Email</span><input class="input" type="email" name="email" required />
					</label>
					<label class="field"><span>Phone</span><input class="input" name="phone" /></label>
					<label class="field">
						<span>Role</span>
						<select class="select" name="role">
							<option value="steward">Steward</option><option value="admin">Admin</option>
						</select>
					</label>
				</div>
				<div><button class="btn small primary">Add and create a temporary password</button></div>
			</form>
		</section>
	{/if}
</div>

<style>
	:global(.ic) {
		vertical-align: -3px;
	}

	.copy {
		display: flex;
		gap: 8px;
	}

	.copy .input {
		font-size: 0.82rem;
	}

	.about {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 16px;
		margin: 0;
		font-size: 0.92rem;
	}

	.about dt {
		color: var(--text-muted);
	}

	.about dd {
		margin: 0;
	}

	.team {
		margin-top: 16px;
	}

	.temp {
		margin: 16px 20px 0;
	}

	.person {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--ink-100);
		font-size: 0.75rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	tr.inactive td {
		opacity: 0.6;
	}

	.actions form {
		display: inline;
	}

	.add {
		display: flex;
		flex-direction: column;
		gap: 14px;
		border-top: 1px solid var(--border);
	}

	code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--surface-sunken);
		padding: 1px 5px;
		border-radius: 5px;
	}
</style>
