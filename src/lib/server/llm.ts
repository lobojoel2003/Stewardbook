/**
 * Optional local-LLM pass that drafts grievance step deadlines.
 *
 * Talks to any OpenAI-compatible chat endpoint (Ollama, llama.cpp server, LM Studio, vLLM).
 * The contract text never leaves the machine the endpoint runs on. Output is validated,
 * every quoted sentence is checked against the contract, and — like the rules-based reader —
 * nothing is used until a person confirms it.
 */
import { z } from 'zod';
import type { DraftStep, ExtractionResult } from '../contracts/extract';

export interface LlmConfig {
	baseUrl: string;
	model: string;
	apiKey?: string;
	timeoutMs: number;
}

const StepSchema = z.object({
	stage: z.string().min(1).max(40),
	action: z.string().min(1).max(120),
	party: z.enum(['union', 'management']),
	days: z.coerce.number().int().min(0).max(365),
	day_type: z.enum(['working', 'business', 'calendar']),
	quote: z.string().max(1200).default('')
});

const ResponseSchema = z.object({ steps: z.array(StepSchema).max(30) });

const SYSTEM_PROMPT = `You read union collective bargaining agreements and extract the grievance procedure time limits.
Return JSON only, shaped like:
{"steps":[{"stage":"Step 1","action":"File written grievance with supervisor","party":"union","days":10,"day_type":"working","quote":"<the exact sentence from the contract>"}]}
Rules:
- One entry per time limit that a party (the union/grievant or management/the employer) must meet, in procedural order.
- Include arbitration requests by the union. Skip limits that apply to an arbitrator.
- "party" is "union" when the union, steward, grievant or employee must act, "management" when the employer or a manager must act.
- "day_type" is "working" for working/business/work days, "calendar" for calendar days. If the text just says "days", use the contract's definition of days if it has one; otherwise "calendar".
- "quote" must be copied word for word from the contract.
- Do not invent steps that are not in the text.`;

function normalize(s: string): string {
	return s
		.toLowerCase()
		.replace(/[“”"']/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function procedureExcerpt(
	text: string,
	extraction: ExtractionResult,
	maxChars = 14000
): string {
	const parts = extraction.articles
		.filter((a) => extraction.procedureArticles.includes(a.number))
		.map((a) => `ARTICLE ${a.number} – ${a.title}\n${a.body}`);
	const excerpt = parts.length ? parts.join('\n\n') : text;
	return excerpt.length > maxChars ? excerpt.slice(0, maxChars) : excerpt;
}

export function toDraftSteps(raw: unknown, contractText: string): DraftStep[] {
	const parsed = ResponseSchema.parse(raw);
	const haystack = normalize(contractText);
	return parsed.steps.map((s) => {
		const quoteFound = s.quote ? haystack.includes(normalize(s.quote)) : false;
		const notes = ['Drafted by the local AI model.'];
		if (!quoteFound)
			notes.push(
				'The quoted sentence could not be found word-for-word in the contract — check it carefully.'
			);
		return {
			stage: s.stage.trim(),
			name: s.action.trim(),
			party: s.party,
			days: s.days,
			dayType: s.day_type === 'calendar' ? 'calendar' : 'business',
			dayTypeExplicit: true,
			source: s.quote.trim(),
			phrase: '',
			article: null,
			confidence: quoteFound ? 'medium' : 'low',
			notes
		} satisfies DraftStep;
	});
}

export async function draftStepsWithLlm(
	config: LlmConfig,
	contractText: string,
	extraction: ExtractionResult,
	fetcher: typeof fetch = fetch
): Promise<DraftStep[]> {
	const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.timeoutMs);
	try {
		const res = await fetcher(url, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'content-type': 'application/json',
				...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
			},
			body: JSON.stringify({
				model: config.model,
				temperature: 0,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: procedureExcerpt(contractText, extraction) }
				]
			})
		});
		if (!res.ok) throw new Error(`The model endpoint answered ${res.status} ${res.statusText}`);
		const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
		const content = body.choices?.[0]?.message?.content;
		if (!content) throw new Error('The model returned an empty answer');
		const json: unknown = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
		return toDraftSteps(json, contractText);
	} finally {
		clearTimeout(timer);
	}
}
