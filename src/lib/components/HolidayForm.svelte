<script lang="ts">
	import { MONTH_NAMES, OBSERVED_RULE_LABELS, WEEKDAY_NAMES } from '#lib/deadlines/index.ts';

	let kind = $state<'fixed' | 'nth_weekday' | 'easter' | 'date'>('fixed');
</script>

<div class="form-grid">
	<label class="field full">
		<span>Holiday name</span>
		<input
			class="input"
			name="holidayName"
			required
			maxlength="80"
			placeholder="Day after Thanksgiving"
		/>
	</label>
	<label class="field full">
		<span>Falls on</span>
		<select class="select" name="kind" bind:value={kind}>
			<option value="fixed">The same date every year</option>
			<option value="nth_weekday">A weekday of a month (e.g. 4th Thursday of November)</option>
			<option value="easter">Relative to Easter</option>
			<option value="date">One specific date</option>
		</select>
	</label>

	{#if kind === 'fixed' || kind === 'nth_weekday'}
		<label class="field">
			<span>Month</span>
			<select class="select" name="month">
				{#each MONTH_NAMES as m, i (m)}<option value={i + 1}>{m}</option>{/each}
			</select>
		</label>
	{/if}

	{#if kind === 'fixed'}
		<label class="field">
			<span>Day</span>
			<input class="input" type="number" name="day" min="1" max="31" value="1" />
		</label>
		<label class="field full">
			<span>When it lands on a weekend</span>
			<select class="select" name="observed" value="federal">
				{#each Object.entries(OBSERVED_RULE_LABELS) as [value, label] (value)}<option {value}>
						{label}
					</option>{/each}
			</select>
		</label>
	{:else if kind === 'nth_weekday'}
		<label class="field">
			<span>Which</span>
			<select class="select" name="n">
				<option value="1">First</option>
				<option value="2">Second</option>
				<option value="3">Third</option>
				<option value="4">Fourth</option>
				<option value="5">Fifth</option>
				<option value="-1">Last</option>
			</select>
		</label>
		<label class="field">
			<span>Weekday</span>
			<select class="select" name="weekday" value="1">
				{#each WEEKDAY_NAMES as d, i (d)}<option value={i}>{d}</option>{/each}
			</select>
		</label>
		<label class="field">
			<span>Plus days <span class="hint">(1 = day after)</span></span>
			<input class="input" type="number" name="offset" min="-7" max="7" value="0" />
		</label>
	{:else if kind === 'easter'}
		<label class="field">
			<span>Days from Easter Sunday <span class="hint">(Good Friday = −2)</span></span>
			<input class="input" type="number" name="easterOffset" min="-60" max="60" value="-2" />
		</label>
	{:else}
		<label class="field">
			<span>Date</span>
			<input class="input" type="date" name="date" />
		</label>
	{/if}
</div>
