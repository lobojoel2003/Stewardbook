/** Build metadata baked in by vite.config.ts. */
export const BUILD = {
	version: __APP_VERSION__,
	number: __BUILD_NUMBER__,
	sha: __GIT_SHA__,
	date: __BUILD_DATE__,
	label: `v${__APP_VERSION__} · build ${__BUILD_NUMBER__} · ${__GIT_SHA__}`
} as const;
