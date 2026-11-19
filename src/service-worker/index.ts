/**
 * Stewardbook service worker.
 *
 * - App code and icons are precached, so the app opens with no signal.
 * - Pages and their data are fetched network-first and cached as a fallback,
 *   so cases you've opened recently stay readable offline.
 * - Attachments are immutable and cached on first view.
 * - New timeline entries made offline live in the IndexedDB outbox (see
 *   src/lib/client/outbox.svelte.ts), not here.
 */
import { self } from '$app/service-worker';
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const APP_CACHE = `app-${version}`;
const PAGE_CACHE = 'pages-v1';
const FILE_CACHE = 'attachments-v1';
const OFFLINE_URL = '/offline.html';
const MAX_PAGES = 80;
const MAX_FILES = 150;

const PRECACHE = [...immutable.map((f) => f.path), ...assets.map((f) => f.path)].map((p) =>
	p.startsWith('/') ? p : `/${p}`
);
const PRECACHED = new Set(PRECACHE);

/** Never cache these: they change state, are private feeds, or are downloads. */
const BYPASS = [
	/^\/api\//,
	/^\/logout/,
	/^\/login/,
	/^\/setup/,
	/^\/calendar\//,
	/^\/healthz/,
	/\.md$/,
	/\.json$/
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(APP_CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith('app-') && key !== APP_CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('message', (event) => {
	if (event.data === 'clear-private-cache') {
		event.waitUntil(Promise.all([caches.delete(PAGE_CACHE), caches.delete(FILE_CACHE)]));
	}
});

async function trim(cacheName: string, max: number): Promise<void> {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

async function networkFirst(request: Request, isNavigation: boolean): Promise<Response> {
	const cache = await caches.open(PAGE_CACHE);
	try {
		const response = await fetch(request);
		// Only keep real pages: not redirects to /login, not errors.
		if (response.ok && response.type === 'basic' && !response.redirected) {
			await cache.put(request, response.clone());
			void trim(PAGE_CACHE, MAX_PAGES);
		}
		return response;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		if (isNavigation) {
			const offline = await caches.match(OFFLINE_URL);
			if (offline) return offline;
		}
		return new Response(JSON.stringify({ message: 'Offline' }), {
			status: 503,
			headers: { 'content-type': 'application/json' }
		});
	}
}

async function cacheFirst(request: Request, cacheName: string, max?: number): Promise<Response> {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) {
		await cache.put(request, response.clone());
		if (max) void trim(cacheName, max);
	}
	return response;
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (PRECACHED.has(url.pathname)) {
		event.respondWith(cacheFirst(request, APP_CACHE));
		return;
	}
	if (url.pathname.startsWith('/attachments/')) {
		event.respondWith(cacheFirst(request, FILE_CACHE, MAX_FILES));
		return;
	}
	if (BYPASS.some((re) => re.test(url.pathname)) && !url.pathname.endsWith('/__data.json')) return;

	const isNavigation = request.mode === 'navigate';
	if (isNavigation || url.pathname.endsWith('/__data.json')) {
		event.respondWith(networkFirst(request, isNavigation));
	}
});
