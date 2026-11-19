import {
	createHash,
	randomBytes,
	scrypt as scryptCb,
	timingSafeEqual,
	type ScryptOptions
} from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { sessions, users } from './db/schema';

function scrypt(
	password: string,
	salt: Buffer,
	keylen: number,
	options: ScryptOptions
): Promise<Buffer> {
	return new Promise((resolve, reject) =>
		scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)))
	);
}

export const SESSION_COOKIE = 'sb_session';
const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;
const DAY_MS = 86_400_000;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

export interface SessionUser {
	id: string;
	email: string;
	name: string;
	role: 'admin' | 'steward';
	calendarToken: string;
}

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, {
		N: SCRYPT.N,
		r: SCRYPT.r,
		p: SCRYPT.p,
		maxmem: SCRYPT.maxmem
	});
	return [
		'scrypt',
		SCRYPT.N,
		SCRYPT.r,
		SCRYPT.p,
		salt.toString('base64'),
		key.toString('base64')
	].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algo, n, r, p, saltB64, keyB64] = stored.split('$');
	if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
	const expected = Buffer.from(keyB64, 'base64');
	const key = await scrypt(
		password.normalize('NFKC'),
		Buffer.from(saltB64, 'base64'),
		expected.length,
		{
			N: Number(n),
			r: Number(r),
			p: Number(p),
			maxmem: SCRYPT.maxmem
		}
	);
	return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A random URL-safe token. */
export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
	userId: string,
	userAgent: string | null
): Promise<{ token: string; expiresAt: Date }> {
	const token = randomToken();
	const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
	await db.insert(sessions).values({
		id: hashToken(token),
		userId,
		expiresAt,
		userAgent: userAgent?.slice(0, 300) ?? null
	});
	await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
	// Opportunistic cleanup of expired sessions.
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
	return { token, expiresAt };
}

export async function validateSession(
	token: string
): Promise<{ user: SessionUser; sessionId: string; renewedExpiry: Date | null } | null> {
	const id = hashToken(token);
	const [row] = await db
		.select({
			sessionId: sessions.id,
			expiresAt: sessions.expiresAt,
			id: users.id,
			email: users.email,
			name: users.name,
			role: users.role,
			calendarToken: users.calendarToken
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
		.limit(1);
	if (!row) return null;

	let renewedExpiry: Date | null = null;
	if (row.expiresAt.getTime() - Date.now() < RENEW_WHEN_DAYS_LEFT * DAY_MS) {
		renewedExpiry = new Date(Date.now() + SESSION_DAYS * DAY_MS);
		await db.update(sessions).set({ expiresAt: renewedExpiry }).where(eq(sessions.id, id));
	}
	const { sessionId, id: userId, email, name, role, calendarToken } = row;
	return { user: { id: userId, email, name, role, calendarToken }, sessionId, renewedExpiry };
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateUserSessions(
	userId: string,
	exceptSessionId?: string
): Promise<void> {
	await db
		.delete(sessions)
		.where(
			exceptSessionId
				? and(eq(sessions.userId, userId), sql`${sessions.id} <> ${exceptSessionId}`)
				: eq(sessions.userId, userId)
		);
}

/**
 * In-memory login throttle: at most `limit` failures per key in `windowMs`.
 * Good enough for a single-container deployment; it resets on restart.
 */
export class Throttle {
	#hits = new Map<string, number[]>();
	constructor(
		private limit: number,
		private windowMs: number
	) {}

	#recent(key: string, now: number): number[] {
		const list = (this.#hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
		if (list.length) this.#hits.set(key, list);
		else this.#hits.delete(key);
		return list;
	}

	blocked(key: string, now = Date.now()): boolean {
		return this.#recent(key, now).length >= this.limit;
	}

	fail(key: string, now = Date.now()): void {
		const list = this.#recent(key, now);
		list.push(now);
		this.#hits.set(key, list);
	}

	reset(key: string): void {
		this.#hits.delete(key);
	}
}

export const loginThrottle = new Throttle(8, 15 * 60 * 1000);
