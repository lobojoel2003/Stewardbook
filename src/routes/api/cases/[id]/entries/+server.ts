import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { MAX_UPLOAD_MB } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { cases, type EntryData } from '#lib/server/db/schema.ts';
import { addQuickEntry, isAllowedUpload, type UploadedFile } from '#lib/server/timeline.ts';
import { isUuid, str } from '#lib/server/forms.ts';
import { QUICK_ENTRY_KINDS, type QuickEntryKind } from '#lib/labels.ts';

const MAX_FILES = 10;

function pickData(kind: QuickEntryKind, raw: unknown): EntryData {
	const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const s = (k: string, max = 300) =>
		typeof src[k] === 'string' ? src[k].trim().slice(0, max) : undefined;
	switch (kind) {
		case 'witness':
			return { witnessName: s('witnessName'), witnessContact: s('witnessContact') };
		case 'weingarten':
			return {
				managementRep: s('managementRep'),
				attendees: s('attendees'),
				rightsAsserted: src.rightsAsserted === true,
				questions: s('questions', 20_000)
			};
		case 'call':
			return { contact: s('contact') };
		default:
			return {};
	}
}

/** Add a timeline entry (used directly and by the offline outbox). */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!isUuid(params.id)) error(404, 'Case not found');
	const [c] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, params.id)).limit(1);
	if (!c) error(404, 'Case not found');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Expected multipart form data');
	}

	const kind = str(form, 'kind') as QuickEntryKind;
	if (!QUICK_ENTRY_KINDS.includes(kind)) error(400, 'Unknown entry type');

	const clientId = str(form, 'clientId', 64) || null;
	if (clientId && !/^[\w-]{8,64}$/.test(clientId)) error(400, 'Bad client id');

	const occurredRaw = str(form, 'occurredAt', 40);
	const occurredAt = occurredRaw ? new Date(occurredRaw) : new Date();
	if (Number.isNaN(occurredAt.getTime())) error(400, 'Bad date');

	let data: EntryData = {};
	try {
		data = pickData(kind, JSON.parse(str(form, 'data', 50_000) || '{}'));
	} catch {
		error(400, 'Bad entry data');
	}

	const files: UploadedFile[] = [];
	const uploads = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
	if (uploads.length > MAX_FILES) error(400, `Attach at most ${MAX_FILES} files at a time`);
	for (const f of uploads) {
		if (f.size > MAX_UPLOAD_MB * 1024 * 1024)
			error(413, `${f.name} is larger than ${MAX_UPLOAD_MB} MB`);
		const type = f.type || 'application/octet-stream';
		if (!isAllowedUpload(type)) error(415, `${f.name}: that file type isn’t supported`);
		files.push({ filename: f.name, mimeType: type, data: Buffer.from(await f.arrayBuffer()) });
	}

	const body = str(form, 'body', 50_000);
	if (kind === 'note' && !body) error(400, 'The note is empty');
	if ((kind === 'photo' || kind === 'document') && !files.length) error(400, 'Attach a file');

	const result = await addQuickEntry(
		params.id,
		locals.user!.id,
		{ kind, title: str(form, 'title', 300), body, occurredAt, data, clientId },
		files
	);
	return json(result, { status: result.duplicate ? 200 : 201 });
};
