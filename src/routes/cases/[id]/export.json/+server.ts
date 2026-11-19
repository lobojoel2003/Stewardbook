import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCase } from '#lib/server/cases.ts';
import { today } from '#lib/server/settings.ts';
import { isUuid } from '#lib/server/forms.ts';
import { BUILD } from '#lib/build.ts';

/** Full case data as JSON, so a local is never locked in. Attachments are referenced by URL. */
export const GET: RequestHandler = async ({ params, url }) => {
	if (!isUuid(params.id)) error(404, 'Case not found');
	const c = await getCase(params.id, await today());
	if (!c) error(404, 'Case not found');
	const body = {
		format: 'stewardbook.case.v1',
		exportedAt: new Date().toISOString(),
		app: { version: BUILD.version, build: BUILD.number },
		case: {
			...c,
			holidaysThisYear: undefined,
			timeline: c.timeline.map((e) => ({
				...e,
				attachments: e.attachments.map((a) => ({
					...a,
					url: new URL(`/attachments/${a.id}`, url).href
				}))
			}))
		}
	};
	return json(body, {
		headers: { 'Content-Disposition': `attachment; filename="case-${c.number}.json"` }
	});
};
