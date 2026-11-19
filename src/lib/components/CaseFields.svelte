<script lang="ts">
	interface Values {
		title?: string;
		grievantName?: string;
		grievantContact?: string;
		department?: string;
		supervisor?: string;
		incidentDate?: string;
		awareDate?: string | null;
		summary?: string;
		remedy?: string;
	}

	let {
		values = {},
		errors = {},
		incidentDate = $bindable(''),
		awareDate = $bindable('')
	}: {
		values?: Values;
		errors?: Record<string, string>;
		incidentDate?: string;
		awareDate?: string;
	} = $props();
</script>

<div class="form-grid">
	<label class="field full">
		<span>Short title</span>
		<input
			class="input"
			name="title"
			required
			maxlength="200"
			placeholder="Overtime bypassed on night shift"
			value={values.title ?? ''}
		/>
		{#if errors.title}<span class="error-text">{errors.title}</span>{/if}
	</label>
	<label class="field">
		<span>Grievant</span>
		<input
			class="input"
			name="grievantName"
			required
			maxlength="160"
			autocomplete="off"
			value={values.grievantName ?? ''}
		/>
		{#if errors.grievantName}<span class="error-text">{errors.grievantName}</span>{/if}
	</label>
	<label class="field">
		<span>Grievant contact <span class="hint">(phone, email, shift)</span></span>
		<input
			class="input"
			name="grievantContact"
			maxlength="200"
			autocomplete="off"
			value={values.grievantContact ?? ''}
		/>
	</label>
	<label class="field">
		<span>Department or work area</span>
		<input class="input" name="department" maxlength="160" value={values.department ?? ''} />
	</label>
	<label class="field">
		<span>Supervisor involved</span>
		<input class="input" name="supervisor" maxlength="160" value={values.supervisor ?? ''} />
	</label>
	<label class="field">
		<span>Date of the incident</span>
		<input class="input" type="date" name="incidentDate" required bind:value={incidentDate} />
		{#if errors.incidentDate}<span class="error-text">{errors.incidentDate}</span>{/if}
	</label>
	<label class="field">
		<span>Grievant learned of it <span class="hint">(if later)</span></span>
		<input class="input" type="date" name="awareDate" bind:value={awareDate} />
		{#if errors.awareDate}<span class="error-text">{errors.awareDate}</span>{/if}
	</label>
	<label class="field full">
		<span>What happened</span>
		<textarea
			class="textarea"
			name="summary"
			rows="4"
			placeholder="Who, what, when, where — in plain words.">{values.summary ?? ''}</textarea
		>
	</label>
	<label class="field full">
		<span>Remedy sought</span>
		<textarea
			class="textarea"
			name="remedy"
			rows="2"
			placeholder="Make the grievant whole, including…">{values.remedy ?? ''}</textarea
		>
	</label>
</div>
