import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
	version: string;
};

function git(cmd: string): string {
	try {
		return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return '';
	}
}

/** Build metadata: set by CI (BUILD_NUMBER = GitHub run number), falls back to local values. */
const build = {
	version: process.env.APP_VERSION?.replace(/^v/, '') || pkg.version,
	number: process.env.BUILD_NUMBER || 'dev',
	sha: (process.env.GIT_SHA || git('rev-parse HEAD') || 'unknown').slice(0, 7),
	date: process.env.BUILD_DATE || new Date().toISOString()
};

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(build.version),
		__BUILD_NUMBER__: JSON.stringify(build.number),
		__GIT_SHA__: JSON.stringify(build.sha),
		__BUILD_DATE__: JSON.stringify(build.date)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ precompress: true }),
			version: { name: `${build.version}+${build.number}.${build.sha}` },
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'worker-src': ['self'],
					'manifest-src': ['self'],
					'object-src': ['none'],
					'frame-ancestors': ['none'],
					'base-uri': ['self'],
					'form-action': ['self']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: ['src/lib/**/*.spec.ts', 'src/lib/**/fixtures/**', 'src/lib/client/**'],
			reporter: ['text-summary', 'html', 'lcov', 'json-summary']
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
