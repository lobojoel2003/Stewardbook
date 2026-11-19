import { describe, expect, it, vi } from 'vitest';
import { extractContract } from '../contracts/extract';
import { draftStepsWithLlm, toDraftSteps } from './llm';

const contract = `ARTICLE 9 – GRIEVANCE PROCEDURE
Step 1. The Union shall file the grievance within ten (10) working days of the incident.`;

describe('local LLM drafting', () => {
	it('validates the response and checks quotes against the contract', () => {
		const steps = toDraftSteps(
			{
				steps: [
					{
						stage: 'Step 1',
						action: 'File grievance',
						party: 'union',
						days: '10',
						day_type: 'working',
						quote:
							'The Union shall file the grievance within ten (10) working days of the incident.'
					},
					{
						stage: 'Step 2',
						action: 'Made up',
						party: 'management',
						days: 3,
						day_type: 'calendar',
						quote: 'Not in the text.'
					}
				]
			},
			contract
		);
		expect(steps[0]).toMatchObject({ days: 10, dayType: 'business', confidence: 'medium' });
		expect(steps[1]).toMatchObject({ dayType: 'calendar', confidence: 'low' });
		expect(steps[1].notes.join(' ')).toMatch(/could not be found/);
	});

	it('rejects malformed output', () => {
		expect(() => toDraftSteps({ steps: [{ party: 'arbitrator' }] }, contract)).toThrow();
	});

	it('calls an OpenAI-compatible endpoint', async () => {
		const fetcher = vi.fn(() =>
			Promise.resolve(
				Response.json({
					choices: [
						{
							message: {
								content:
									'```json\n{"steps":[{"stage":"Step 1","action":"File grievance","party":"union","days":10,"day_type":"working","quote":"within ten (10) working days"}]}\n```'
							}
						}
					]
				})
			)
		);
		const steps = await draftStepsWithLlm(
			{ baseUrl: 'http://localhost:11434/v1/', model: 'llama3.1:8b', timeoutMs: 1000 },
			contract,
			extractContract(contract),
			fetcher
		);
		expect(steps).toHaveLength(1);
		const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('http://localhost:11434/v1/chat/completions');
		expect(JSON.parse(init.body as string)).toMatchObject({ model: 'llama3.1:8b', temperature: 0 });
	});

	it('surfaces endpoint errors', async () => {
		const fetcher = vi.fn(() =>
			Promise.resolve(new Response('nope', { status: 500, statusText: 'Server Error' }))
		);
		await expect(
			draftStepsWithLlm(
				{ baseUrl: 'http://x/v1', model: 'm', timeoutMs: 1000 },
				contract,
				extractContract(contract),
				fetcher as unknown as typeof fetch
			)
		).rejects.toThrow(/500/);
	});
});
