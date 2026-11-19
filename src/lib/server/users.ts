import { asc, count, eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';
import { hashPassword, randomToken } from './auth';

export const publicUserColumns = {
	id: users.id,
	email: users.email,
	name: users.name,
	phone: users.phone,
	role: users.role,
	active: users.active,
	lastLoginAt: users.lastLoginAt,
	createdAt: users.createdAt
};

export type PublicUser = {
	id: string;
	email: string;
	name: string;
	phone: string | null;
	role: 'admin' | 'steward';
	active: boolean;
	lastLoginAt: Date | null;
	createdAt: Date;
};

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export async function countUsers(): Promise<number> {
	const [row] = await db.select({ n: count() }).from(users);
	return row?.n ?? 0;
}

export class DuplicateEmailError extends Error {
	constructor() {
		super('Someone already uses that email address.');
	}
}

export async function createUser(input: {
	email: string;
	name: string;
	password: string;
	role: 'admin' | 'steward';
	phone?: string | null;
}): Promise<PublicUser> {
	const email = normalizeEmail(input.email);
	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (existing.length) throw new DuplicateEmailError();
	const [row] = await db
		.insert(users)
		.values({
			email,
			name: input.name.trim(),
			phone: input.phone?.trim() || null,
			role: input.role,
			passwordHash: await hashPassword(input.password),
			calendarToken: randomToken(24)
		})
		.returning(publicUserColumns);
	return row;
}

export async function listUsers(): Promise<PublicUser[]> {
	return db.select(publicUserColumns).from(users).orderBy(asc(users.name));
}

export async function listActiveStewards(): Promise<{ id: string; name: string }[]> {
	return db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.active, true))
		.orderBy(asc(users.name));
}

export async function getUser(id: string): Promise<PublicUser | null> {
	const [row] = await db.select(publicUserColumns).from(users).where(eq(users.id, id)).limit(1);
	return row ?? null;
}

export async function findUserForLogin(email: string) {
	const [row] = await db
		.select()
		.from(users)
		.where(eq(users.email, normalizeEmail(email)))
		.limit(1);
	return row ?? null;
}

export async function findUserByCalendarToken(token: string) {
	if (!token || token.length < 16) return null;
	const [row] = await db
		.select({ id: users.id, name: users.name, active: users.active })
		.from(users)
		.where(eq(users.calendarToken, token))
		.limit(1);
	return row && row.active ? row : null;
}

export async function updateProfile(
	id: string,
	input: { name: string; email: string; phone: string | null }
): Promise<void> {
	const email = normalizeEmail(input.email);
	const [clash] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (clash && clash.id !== id) throw new DuplicateEmailError();
	await db
		.update(users)
		.set({ name: input.name.trim(), email, phone: input.phone?.trim() || null })
		.where(eq(users.id, id));
}

export async function setPassword(id: string, password: string): Promise<void> {
	await db
		.update(users)
		.set({ passwordHash: await hashPassword(password) })
		.where(eq(users.id, id));
}

export async function getPasswordHash(id: string): Promise<string | null> {
	const [row] = await db
		.select({ hash: users.passwordHash })
		.from(users)
		.where(eq(users.id, id))
		.limit(1);
	return row?.hash ?? null;
}

export async function setActive(id: string, active: boolean): Promise<void> {
	await db.update(users).set({ active }).where(eq(users.id, id));
}

export async function setRole(id: string, role: 'admin' | 'steward'): Promise<void> {
	await db.update(users).set({ role }).where(eq(users.id, id));
}

export async function countActiveAdmins(): Promise<number> {
	const rows = await db.select({ role: users.role, active: users.active }).from(users);
	return rows.filter((r) => r.role === 'admin' && r.active).length;
}

export async function regenerateCalendarToken(id: string): Promise<string> {
	const token = randomToken(24);
	await db.update(users).set({ calendarToken: token }).where(eq(users.id, id));
	return token;
}
