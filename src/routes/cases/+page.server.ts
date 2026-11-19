import type { PageServerLoad } from './$types';
import { listCases } from '#lib/server/cases.ts';
import { listContracts } from '#lib/server/contracts.ts';
import { listActiveStewards } from '#lib/server/users.ts';
import { isUuid } from '#lib/server/forms.ts';

export const load: PageServerLoad = async ({ url, parent, locals }) => {
	const { today } = await parent();
	const status =
		(['open', 'closed', 'all'] as const).find((s) => s === url.searchParams.get('status')) ??
		'open';
	const q = url.searchParams.get('q')?.slice(0, 200) ?? '';
	const mine = url.searchParams.get('mine') === '1';
	const steward = url.searchParams.get('steward');
	const contract = url.searchParams.get('contract');
	const [cases, contracts, stewards] = await Promise.all([
		listCases(
			{
				status,
				q,
				stewardId: mine ? locals.user!.id : isUuid(steward) ? steward : null,
				contractId: isUuid(contract) ? contract : null
			},
			today
		),
		listContracts(),
		listActiveStewards()
	]);
	return {
		title: 'Cases',
		cases,
		filters: {
			status,
			q,
			mine,
			steward: isUuid(steward) ? steward : '',
			contract: isUuid(contract) ? contract : ''
		},
		contracts: contracts.map((c) => ({ id: c.id, name: c.name })),
		stewards
	};
};
