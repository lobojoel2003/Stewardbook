import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAttachment } from '#lib/server/timeline.ts';
import { isUuid } from '#lib/server/forms.ts';

const INLINE = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'application/pdf',
	'text/plain'
]);

export const GET: RequestHandler = async ({ params, url }) => {
	if (!isUuid(params.id)) error(404, 'Not found');
	const file = await getAttachment(params.id);
	if (!file) error(404, 'Not found');
	const inline = INLINE.has(file.mimeType) && !url.searchParams.has('download');
	const name = encodeURIComponent(file.filename);
	return new Response(new Uint8Array(file.data), {
		headers: {
			'Content-Type': file.mimeType,
			'Content-Length': String(file.size),
			'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
			'Cache-Control': 'private, max-age=31536000, immutable',
			'Content-Security-Policy':
				"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
