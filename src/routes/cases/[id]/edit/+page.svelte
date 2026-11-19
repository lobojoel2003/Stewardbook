<script lang="ts">
	import { enhance } from '$app/forms';
	import ArticlePicker from '#lib/components/ArticlePicker.svelte';
	import CaseFields from '#lib/components/CaseFields.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let incidentDate = $state('');
	let awareDate = $state('');
	$effect.pre(() => {
		incidentDate = form?.values?.incidentDate ?? data.case.incidentDate;
		awareDate = form?.values?.awareDate ?? data.case.awareDate ?? '';
	});
	const errors = $derived(form?.errors ?? {});
	const values = $derived(form?.values ?? data.case);
</script>

<div class="page narrow">
	<header class="page-header">
		<div>
			<div class="eyebrow"><a class="link" href="/cases/{data.case.id}">{data.case.number}</a></div>
			<h1>Edit case</h1>
			<p>
				Changing the incident date doesn’t move a clock that’s already running — use “Change start
				date” on the case for that.
			</p>
		</div>
	</header>
	<form
		method="POST"
		class="stack"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		<section class="card card-pad">
			<CaseFields {values} {errors} bind:incidentDate bind:awareDate />
		</section>
		<section class="card card-pad stack">
			<h2>Contract articles</h2>
			<ArticlePicker articles={data.articles} initial={data.case.articles} />
		</section>
		<div class="form-actions">
			<a class="btn ghost" href="/cases/{data.case.id}">Cancel</a>
			<button class="btn primary">Save changes</button>
		</div>
	</form>
</div>
