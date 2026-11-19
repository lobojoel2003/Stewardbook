import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pdfToText } from './pdf';
import { extractContract } from '../contracts/extract';

describe('pdfToText', () => {
	it('extracts text with line breaks that the contract reader understands', async () => {
		const pdf = readFileSync(
			fileURLToPath(new URL('../../../examples/sample-contract.pdf', import.meta.url))
		);
		const { text, pages } = await pdfToText(new Uint8Array(pdf));
		expect(pages).toBeGreaterThan(1);
		expect(text).toMatch(/^\s*ARTICLE 9 – GRIEVANCE PROCEDURE\s*$/m);

		const result = extractContract(text);
		expect(result.articles).toHaveLength(15);
		expect(result.steps.map((s) => `${s.stage} ${s.days} ${s.dayType}`)).toEqual([
			'Step 1 10 business',
			'Step 1 5 business',
			'Step 2 7 business',
			'Step 2 5 business',
			'Step 2 10 business',
			'Step 3 10 business',
			'Step 3 15 business',
			'Arbitration 30 calendar'
		]);
		expect(result.holidays).toHaveLength(10);
	});

	it('rejects data that is not a PDF', async () => {
		await expect(pdfToText(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
	});
});
