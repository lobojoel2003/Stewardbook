/**
 * Offline outbox for timeline entries.
 *
 * On the shop floor the signal comes and goes. A note, photo or witness statement
 * is saved to IndexedDB first, then sent; anything that can't be sent waits here
 * and syncs automatically when the connection comes back. Each entry carries a
 * client id so a retry never creates a duplicate on the server.
 */

export interface OutboxFile {
	name: string;
	type: string;
	blob: Blob;
}

export interface OutboxItem {
	clientId: string;
	caseId: string;
	caseLabel: string;
	kind: string;
	title: string;
	body: string;
	occurredAt: string;
	data: Record<string, unknown>;
	files: OutboxFile[];
	createdAt: number;
	attempts: number;
	lastError?: string;
}

const DB_NAME = 'stewardbook';
const STORE = 'outbox';

export const outbox = $state({
	items: [] as OutboxItem[],
	syncing: false,
	online: true,
	loaded: false
});

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) {
				req.result.createObjectStore(STORE, { keyPath: 'clientId' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
	});
}

async function tx<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openDb();
	try {
		return await new Promise<T>((resolve, reject) => {
			const t = db.transaction(STORE, mode);
			const req = fn(t.objectStore(STORE));
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
		});
	} finally {
		db.close();
	}
}

async function refresh(): Promise<void> {
	try {
		const items = await tx<OutboxItem[]>('readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>);
		outbox.items = items.sort((a, b) => a.createdAt - b.createdAt);
	} catch {
		outbox.items = [];
	}
	outbox.loaded = true;
}

async function put(item: OutboxItem): Promise<void> {
	await tx('readwrite', (s) => s.put($state.snapshot(item)));
}

async function remove(clientId: string): Promise<void> {
	await tx('readwrite', (s) => s.delete(clientId));
}

export function newClientId(): string {
	return crypto.randomUUID();
}

class HttpError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

async function send(item: OutboxItem): Promise<void> {
	const form = new FormData();
	form.set('clientId', item.clientId);
	form.set('kind', item.kind);
	form.set('title', item.title);
	form.set('body', item.body);
	form.set('occurredAt', item.occurredAt);
	form.set('data', JSON.stringify(item.data));
	for (const f of item.files) form.append('files', new File([f.blob], f.name, { type: f.type }));
	const res = await fetch(`/api/cases/${item.caseId}/entries`, {
		method: 'POST',
		body: form,
		credentials: 'same-origin',
		headers: { accept: 'application/json' }
	});
	if (!res.ok) {
		let message = `Server answered ${res.status}`;
		try {
			const body = (await res.json()) as { message?: string };
			if (body.message) message = body.message;
		} catch {
			// not JSON
		}
		throw new HttpError(res.status, message);
	}
}

/** Save an entry and try to send it. Resolves to `sent` or `queued`. */
export async function submitEntry(item: OutboxItem): Promise<'sent' | 'queued'> {
	let stored = false;
	try {
		await put(item);
		stored = true;
	} catch {
		// Private browsing without IndexedDB: fall through and send directly.
	}
	try {
		await send(item);
		outbox.online = true;
		if (stored) await remove(item.clientId);
		await refresh();
		return 'sent';
	} catch (err) {
		if (isPermanent(err)) {
			if (stored) await remove(item.clientId);
			await refresh();
			throw err;
		}
		if (!stored) throw err;
		if (!(err instanceof HttpError)) outbox.online = false;
		await put({
			...item,
			attempts: item.attempts + 1,
			lastError: err instanceof Error ? err.message : String(err)
		});
		await refresh();
		scheduleRetry();
		return 'queued';
	}
}

/** Send everything waiting in the outbox. */
export async function syncOutbox(): Promise<{ sent: number; failed: number }> {
	if (outbox.syncing) return { sent: 0, failed: 0 };
	outbox.syncing = true;
	let sent = 0;
	let failed = 0;
	try {
		await refresh();
		for (const item of outbox.items) {
			try {
				await send(item);
				outbox.online = true;
				await remove(item.clientId);
				sent++;
			} catch (err) {
				failed++;
				const permanent = isPermanent(err);
				if (!(err instanceof HttpError)) outbox.online = false;
				await put({
					...item,
					attempts: item.attempts + 1,
					lastError:
						(permanent ? 'Rejected: ' : '') + (err instanceof Error ? err.message : String(err))
				});
				if (!permanent) break; // still offline — try again later
			}
		}
	} finally {
		await refresh();
		outbox.syncing = false;
	}
	if (outbox.items.some((i) => !i.lastError?.startsWith('Rejected'))) scheduleRetry();
	return { sent, failed };
}

/** A 4xx other than 401/408 means the server will never accept this entry as-is. */
function isPermanent(err: unknown): boolean {
	return (
		err instanceof HttpError &&
		err.status >= 400 &&
		err.status < 500 &&
		err.status !== 401 &&
		err.status !== 408
	);
}

// navigator.onLine can't be trusted ("lie-fi"), so while anything is waiting we
// also retry on a timer.
const RETRY_MS = 8_000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let notifySynced: ((sent: number) => void) | null = null;

function scheduleRetry(): void {
	if (retryTimer || typeof window === 'undefined') return;
	retryTimer = setTimeout(() => {
		retryTimer = null;
		if (!outbox.items.length) return;
		void syncOutbox().then((r) => r.sent && notifySynced?.(r.sent));
	}, RETRY_MS);
}

export async function discard(clientId: string): Promise<void> {
	await remove(clientId);
	await refresh();
}

/** Wire up online/offline listeners. Returns a cleanup function. */
export function startOutbox(onSynced: (sent: number) => void): () => void {
	notifySynced = onSynced;
	outbox.online = navigator.onLine;
	void refresh().then(() => {
		if (outbox.online && outbox.items.length)
			void syncOutbox().then((r) => r.sent && onSynced(r.sent));
	});
	const online = () => {
		outbox.online = true;
		void syncOutbox().then((r) => r.sent && onSynced(r.sent));
	};
	const offline = () => (outbox.online = false);
	const visible = () => {
		if (document.visibilityState === 'visible' && navigator.onLine && outbox.items.length) {
			void syncOutbox().then((r) => r.sent && onSynced(r.sent));
		}
	};
	window.addEventListener('online', online);
	window.addEventListener('offline', offline);
	document.addEventListener('visibilitychange', visible);
	return () => {
		window.removeEventListener('online', online);
		window.removeEventListener('offline', offline);
		document.removeEventListener('visibilitychange', visible);
		if (retryTimer) clearTimeout(retryTimer);
		retryTimer = null;
		notifySynced = null;
	};
}
