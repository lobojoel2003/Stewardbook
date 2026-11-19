import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { packetData } from '#lib/server/packet-data.ts';
import { isUuid } from '#lib/server/forms.ts';

export const load: PageServerLoad = async ({ params, parent, url }) => {
	if (!isUuid(params.id)) error(404, 'Case not found');
	const { today } = await parent();
	const data = await packetData(params.id, today);
	if (!data) error(404, 'Case not found');
	return {
		title: `Handoff packet ${data.case.number}`,
		...data,
		justHandedOff: url.searchParams.has('handoff')
	};
};
