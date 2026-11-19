import type { PageServerLoad } from './$types';
import { caseStats } from '#lib/server/cases.ts';
import { recentActivity } from '#lib/server/timeline.ts';
import { listContracts } from '#lib/server/contracts.ts';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { today } = await parent();
	const [stats, activity, contracts] = await Promise.all([
		caseStats(today),
		recentActivity(10),
		listContracts()
	]);
	const running = stats.openCases.filter((c) => c.current);
	return {
		title: 'Today',
		stats: {
			open: stats.open,
			overdue: stats.overdue,
			dueThisWeek: stats.dueThisWeek,
			waitingOnManagement: stats.waitingOnManagement,
			closedThisYear: stats.closedThisYear,
			wonOrSettledThisYear: stats.wonOrSettledThisYear
		},
		deadlines: running.slice(0, 12),
		mine: running.filter((c) => c.steward?.id === locals.user!.id).length,
		noClock: stats.openCases.filter((c) => !c.current).slice(0, 5),
		activity,
		hasActiveContract: contracts.some((c) => c.status === 'active'),
		draftContracts: contracts
			.filter((c) => c.status === 'draft')
			.map((c) => ({ id: c.id, name: c.name, pending: c.steps - c.confirmedSteps }))
	};
};
