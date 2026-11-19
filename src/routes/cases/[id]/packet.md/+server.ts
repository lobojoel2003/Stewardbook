import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { packetData } from '#lib/server/packet-data.ts';
import { today } from '#lib/server/settings.ts';
import { isUuid } from '#lib/server/forms.ts';
import { renderPacketMarkdown } from '#lib/packet.ts';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.id)) error(404, 'Case not found');
	const data = await packetData(params.id, await today());
	if (!data) error(404, 'Case not found');
	const markdown = renderPacketMarkdown(data.case, {
		generatedAt: new Date(),
		generatedBy: locals.user!.name,
		localName: data.localName,
		notes: data.lastHandoff?.body
	});
	return new Response(markdown, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Content-Disposition': `attachment; filename="handoff-${data.case.number}.md"`
		}
	});
};
