// See https://svelte.dev/docs/kit/types#app.d.ts
import type { SessionUser } from '#lib/server/auth.ts';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			sessionId: string | null;
		}
		interface PageState {
			sheet?: string;
		}
	}

	/** Injected at build time by vite.config.ts. */
	const __APP_VERSION__: string;
	const __BUILD_NUMBER__: string;
	const __GIT_SHA__: string;
	const __BUILD_DATE__: string;
}

export {};
