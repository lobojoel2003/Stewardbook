import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const DATABASE_URL =
	process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/stewardbook_test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'off',
		screenshot: 'only-on-failure',
		// Use a preinstalled Chromium when the matching Playwright browser isn't downloaded.
		launchOptions: process.env.PW_CHROMIUM_PATH
			? { executablePath: process.env.PW_CHROMIUM_PATH }
			: {}
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'node e2e/reset-db.mjs && node build',
		port: PORT,
		reuseExistingServer: false,
		timeout: 120_000,
		env: {
			DATABASE_URL,
			PORT: String(PORT),
			ORIGIN: `http://localhost:${PORT}`,
			BODY_SIZE_LIMIT: '30M',
			DEFAULT_TIMEZONE: 'America/New_York'
		}
	}
});
