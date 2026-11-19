import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) =>
	value && value.trim() !== '' ? value.trim() : undefined;

const positiveInt = (fallback: number) => (value: string | undefined) => {
	if (!optional(value)) return fallback;
	const n = Number(value);
	if (!Number.isInteger(n) || n <= 0)
		throw new Error(`expected a positive integer, got "${value}"`);
	return n;
};

export const variables = defineEnvVars({
	DATABASE_URL: {
		description:
			'Postgres connection string, e.g. postgres://user:password@localhost:5432/stewardbook',
		schema: optional
	},
	MIGRATE_ON_START: {
		description: 'Apply pending database migrations when the server starts (default: true).',
		schema: (value) => optional(value)?.toLowerCase() !== 'false'
	},
	DEFAULT_TIMEZONE: {
		description:
			'Timezone used for "today" until the local sets its own (default: America/New_York).',
		schema: (value) => optional(value) ?? 'America/New_York'
	},
	MAX_UPLOAD_MB: {
		description: 'Largest photo or document a steward can attach, in megabytes (default: 15).',
		schema: positiveInt(15)
	},
	SOURCE_CODE_URL: {
		description:
			'Where users can get the source of this installation (AGPL-3.0 §13). Change it if you run a modified version.',
		schema: (value) => optional(value) ?? 'https://github.com/lobojoel2003/Stewardbook'
	},
	LLM_BASE_URL: {
		description:
			'Optional OpenAI-compatible endpoint of a local model used to draft contract deadlines, e.g. http://localhost:11434/v1 for Ollama.',
		schema: optional
	},
	LLM_MODEL: {
		description: 'Model name for the local LLM (default: llama3.1:8b).',
		schema: (value) => optional(value) ?? 'llama3.1:8b'
	},
	LLM_API_KEY: {
		description: 'API key for the LLM endpoint, if it needs one.',
		schema: optional
	},
	LLM_TIMEOUT_SECONDS: {
		description:
			'How long to wait for the local LLM before falling back to the rules-based reader (default: 120).',
		schema: positiveInt(120)
	}
});
