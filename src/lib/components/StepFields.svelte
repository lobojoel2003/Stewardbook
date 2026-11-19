<script lang="ts">
	interface Values {
		stage?: string;
		name?: string;
		party?: 'union' | 'management';
		days?: number;
		dayType?: 'business' | 'calendar';
	}
	let { values = {} }: { values?: Values } = $props();
</script>

<div class="form-grid">
	<label class="field">
		<span>Label</span>
		<input
			class="input"
			name="stage"
			required
			maxlength="40"
			placeholder="Step 1"
			value={values.stage ?? ''}
		/>
	</label>
	<label class="field">
		<span>Who must act</span>
		<select class="select" name="party" value={values.party ?? 'union'}>
			<option value="union">Union</option>
			<option value="management">Management</option>
		</select>
	</label>
	<label class="field full">
		<span>What has to happen</span>
		<input
			class="input"
			name="name"
			required
			maxlength="160"
			placeholder="File written grievance with supervisor"
			value={values.name ?? ''}
		/>
	</label>
	<label class="field">
		<span>Days</span>
		<input
			class="input"
			type="number"
			name="days"
			min="0"
			max="365"
			required
			value={values.days ?? 10}
		/>
	</label>
	<label class="field">
		<span>Counted as</span>
		<select class="select" name="dayType" value={values.dayType ?? 'business'}>
			<option value="business">Working days</option>
			<option value="calendar">Calendar days</option>
		</select>
	</label>
</div>
