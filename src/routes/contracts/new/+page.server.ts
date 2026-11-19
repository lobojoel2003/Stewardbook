import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT_SECONDS } from '$app/env/private';
import { extractContract } from '#lib/contracts/extract.ts';
import { createContract } from '#lib/server/contracts.ts';
import { draftStepsWithLlm } from '#lib/server/llm.ts';
import { pdfToText } from '#lib/server/pdf.ts';
import { bool, optionalDate, str } from '#lib/server/forms.ts';
import type { ExtractionNotes } from '#lib/server/db/schema.ts';
import sample from '../../../../examples/sample-contract.txt?raw';

const MAX_TEXT = 2_000_000;
const MAX_FILE = 25 * 1024 * 1024;

export const load: PageServerLoad = ({ url }) => {
	return {
		title: 'Add a contract',
		welcome: url.searchParams.has('welcome'),
		llm: LLM_BASE_URL ? { model: LLM_MODEL } : null,
		sample
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const values = {
			name: str(form, 'name', 200),
			employer: str(form, 'employer', 200),
			effectiveDate: optionalDate(form, 'effectiveDate'),
			expirationDate: optionalDate(form, 'expirationDate')
		};
		let text = str(form, 'text', MAX_TEXT);
		let sourceFilename: string | null = null;
		const file = form.get('file');

		if (file instanceof File && file.size > 0) {
			if (file.size > MAX_FILE)
				return fail(400, { values, message: 'That file is larger than 25 MB.' });
			sourceFilename = file.name.slice(0, 200);
			const buf = new Uint8Array(await file.arrayBuffer());
			const isPdf =
				file.type === 'application/pdf' ||
				/\.pdf$/i.test(file.name) ||
				new TextDecoder().decode(buf.slice(0, 5)) === '%PDF-';
			if (isPdf) {
				try {
					text = (await pdfToText(buf)).text;
				} catch {
					return fail(400, {
						values,
						message:
							'Stewardbook couldn’t read that PDF. Try copying the text out of it and pasting instead.'
					});
				}
				if (text.replace(/\s/g, '').length < 200) {
					return fail(400, {
						values,
						message:
							'That PDF has almost no text in it — it is probably a scan. Run it through OCR first, or paste the text.'
					});
				}
			} else if (file.type.startsWith('text/') || /\.(txt|md|text)$/i.test(file.name)) {
				text = new TextDecoder().decode(buf);
			} else {
				return fail(400, { values, message: 'Upload a PDF or a plain-text file.' });
			}
		}

		if (!values.name) return fail(400, { values, message: 'Give the contract a name.' });
		if (text.trim().length < 40)
			return fail(400, { values, message: 'Paste the contract text or upload the file.' });

		const extraction = extractContract(text);

		let llmSteps = null;
		let llmInfo: ExtractionNotes['llm'];
		if (bool(form, 'useLlm') && LLM_BASE_URL) {
			try {
				llmSteps = await draftStepsWithLlm(
					{
						baseUrl: LLM_BASE_URL,
						model: LLM_MODEL,
						apiKey: LLM_API_KEY,
						timeoutMs: LLM_TIMEOUT_SECONDS * 1000
					},
					text,
					extraction
				);
				llmInfo = {
					model: LLM_MODEL,
					ok: llmSteps.length > 0,
					message: llmSteps.length ? undefined : 'The model found no steps.'
				};
				if (!llmSteps.length) llmSteps = null;
			} catch (err) {
				llmInfo = {
					model: LLM_MODEL,
					ok: false,
					message: err instanceof Error ? err.message : String(err)
				};
			}
		}

		const id = await createContract({
			...values,
			sourceText: text,
			sourceFilename,
			createdBy: locals.user!.id,
			extraction,
			llmSteps,
			llmInfo
		});
		redirect(303, `/contracts/${id}?new=1`);
	}
};
