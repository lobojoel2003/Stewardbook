import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { attachments, cases, timelineEntries, users, type EntryData } from './db/schema';
import type { QuickEntryKind } from '../labels';

export interface QuickEntryInput {
	kind: QuickEntryKind;
	title: string;
	body: string;
	occurredAt: Date;
	data: EntryData;
	clientId: string | null;
}

export interface UploadedFile {
	filename: string;
	mimeType: string;
	data: Buffer;
}

export const ALLOWED_UPLOAD_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic',
	'image/heif',
	'application/pdf',
	'text/plain',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export function isAllowedUpload(mimeType: string): boolean {
	return ALLOWED_UPLOAD_TYPES.includes(mimeType);
}

export function safeFilename(name: string): string {
	const cleaned = name
		.normalize('NFKD')
		.replace(/[^\w.\- ]+/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120);
	return cleaned || 'attachment';
}

export async function addQuickEntry(
	caseId: string,
	authorId: string,
	input: QuickEntryInput,
	files: UploadedFile[]
): Promise<{ id: string; duplicate: boolean }> {
	if (input.clientId) {
		const [existing] = await db
			.select({ id: timelineEntries.id, caseId: timelineEntries.caseId })
			.from(timelineEntries)
			.where(eq(timelineEntries.clientId, input.clientId))
			.limit(1);
		if (existing) {
			if (existing.caseId !== caseId) throw new Error('Client id already used for another case');
			return { id: existing.id, duplicate: true };
		}
	}
	return db.transaction(async (tx) => {
		const [entry] = await tx
			.insert(timelineEntries)
			.values({
				caseId,
				authorId,
				kind: input.kind,
				title: input.title,
				body: input.body,
				occurredAt: input.occurredAt,
				data: input.data,
				clientId: input.clientId
			})
			.returning({ id: timelineEntries.id });
		for (const f of files) {
			await tx.insert(attachments).values({
				caseId,
				entryId: entry.id,
				filename: safeFilename(f.filename),
				mimeType: f.mimeType,
				size: f.data.length,
				data: f.data,
				uploadedBy: authorId
			});
		}
		await tx.update(cases).set({ updatedAt: new Date() }).where(eq(cases.id, caseId));
		return { id: entry.id, duplicate: false };
	});
}

const DELETABLE = new Set(['note', 'photo', 'witness', 'weingarten', 'document', 'call']);

export async function deleteEntry(
	caseId: string,
	entryId: string,
	user: { id: string; role: string }
): Promise<boolean> {
	const [entry] = await db
		.select({ authorId: timelineEntries.authorId, kind: timelineEntries.kind })
		.from(timelineEntries)
		.where(and(eq(timelineEntries.id, entryId), eq(timelineEntries.caseId, caseId)))
		.limit(1);
	if (!entry || !DELETABLE.has(entry.kind)) return false;
	if (entry.authorId !== user.id && user.role !== 'admin') return false;
	await db.delete(timelineEntries).where(eq(timelineEntries.id, entryId));
	return true;
}

export async function getAttachment(id: string) {
	const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
	return row ?? null;
}

export async function recentActivity(limit = 12) {
	return db
		.select({
			id: timelineEntries.id,
			kind: timelineEntries.kind,
			title: timelineEntries.title,
			occurredAt: timelineEntries.occurredAt,
			authorName: users.name,
			caseId: cases.id,
			caseNumber: cases.number,
			caseTitle: cases.title
		})
		.from(timelineEntries)
		.innerJoin(cases, eq(cases.id, timelineEntries.caseId))
		.leftJoin(users, eq(users.id, timelineEntries.authorId))
		.orderBy(desc(timelineEntries.occurredAt), desc(timelineEntries.createdAt))
		.limit(limit);
}
