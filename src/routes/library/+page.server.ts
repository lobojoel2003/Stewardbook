import type { PageServerLoad } from './$types';
import { articleIndex, searchPrecedents } from '#lib/server/library.ts';
import { isUuid } from '#lib/server/forms.ts';
import { OUTCOMES, type Outcome } from '#lib/labels.ts';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.slice(0, 200) ?? '';
	const article = url.searchParams.get('article');
	const outcomeParam = url.searchParams.get('outcome') as Outcome | null;
	const outcome = outcomeParam && OUTCOMES.includes(outcomeParam) ? outcomeParam : null;
	const includeOpen = url.searchParams.get('open') === '1';
	const [results, articles] = await Promise.all([
		searchPrecedents({ q, articleId: isUuid(article) ? article : null, outcome, includeOpen }),
		articleIndex()
	]);
	return {
		title: 'Precedent library',
		results,
		articles,
		filters: { q, article: isUuid(article) ? article : '', outcome: outcome ?? '', includeOpen }
	};
};
