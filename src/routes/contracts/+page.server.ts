import type { PageServerLoad } from './$types';
import { listContracts } from '#lib/server/contracts.ts';

export const load: PageServerLoad = async () => {
	return { title: 'Contracts', contracts: await listContracts() };
};
