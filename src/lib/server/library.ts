import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { caseArticles, cases, contractArticles, contracts } from './db/schema';
import { searchCondition } from './cases';
import type { Outcome } from '../labels';

export interface LibraryFilters {
	q?: string | null;
	articleId?: string | null;
	outcome?: Outcome | null;
	contractId?: string | null;
	includeOpen?: boolean;
}

/** Search past cases — the precedent library. */
export async function searchPrecedents(filters: LibraryFilters) {
	const where: SQL[] = [];
	if (!filters.includeOpen) where.push(eq(cases.status, 'closed'));
	if (filters.outcome) where.push(eq(cases.outcome, filters.outcome));
	if (filters.contractId) where.push(eq(cases.contractId, filters.contractId));
	if (filters.articleId) {
		where.push(
			inArray(
				cases.id,
				db
					.select({ id: caseArticles.caseId })
					.from(caseArticles)
					.where(eq(caseArticles.articleId, filters.articleId))
			)
		);
	}
	const q = filters.q?.trim();
	if (q) where.push(searchCondition(q));

	const rank = sql<number>`ts_rank(${cases.search}, websearch_to_tsquery('english', ${q ?? ''}))`;
	const rows = await db
		.select({
			id: cases.id,
			number: cases.number,
			title: cases.title,
			status: cases.status,
			outcome: cases.outcome,
			resolution: cases.resolution,
			summary: cases.summary,
			department: cases.department,
			closedOn: cases.closedOn,
			incidentDate: cases.incidentDate,
			contractName: contracts.name,
			rank
		})
		.from(cases)
		.innerJoin(contracts, eq(contracts.id, cases.contractId))
		.where(where.length ? and(...where) : undefined)
		.orderBy(...(q ? [desc(rank)] : []), desc(cases.closedOn), desc(cases.updatedAt))
		.limit(100);

	const cited = rows.length
		? await db
				.select({
					caseId: caseArticles.caseId,
					articleId: contractArticles.id,
					number: contractArticles.number,
					title: contractArticles.title,
					note: caseArticles.note
				})
				.from(caseArticles)
				.innerJoin(contractArticles, eq(contractArticles.id, caseArticles.articleId))
				.where(
					inArray(
						caseArticles.caseId,
						rows.map((r) => r.id)
					)
				)
				.orderBy(asc(contractArticles.sort))
		: [];

	return rows.map((r) => ({ ...r, articles: cited.filter((c) => c.caseId === r.id) }));
}

/** Every article with how often it has been cited and how those cases ended. */
export async function articleIndex(contractId?: string | null) {
	const rows = await db
		.select({
			id: contractArticles.id,
			number: contractArticles.number,
			title: contractArticles.title,
			contractId: contractArticles.contractId,
			contractName: contracts.name,
			citations: sql<number>`count(${caseArticles.caseId})::int`,
			won: sql<number>`count(*) filter (where ${cases.outcome} = 'sustained')::int`,
			settled: sql<number>`count(*) filter (where ${cases.outcome} = 'settled')::int`,
			denied: sql<number>`count(*) filter (where ${cases.outcome} = 'denied')::int`,
			withdrawn: sql<number>`count(*) filter (where ${cases.outcome} = 'withdrawn')::int`,
			open: sql<number>`count(*) filter (where ${cases.status} = 'open')::int`
		})
		.from(contractArticles)
		.innerJoin(contracts, eq(contracts.id, contractArticles.contractId))
		.leftJoin(caseArticles, eq(caseArticles.articleId, contractArticles.id))
		.leftJoin(cases, eq(cases.id, caseArticles.caseId))
		.where(
			contractId
				? eq(contractArticles.contractId, contractId)
				: sql`${contracts.status} <> 'archived'`
		)
		.groupBy(contractArticles.id, contracts.name)
		.orderBy(asc(contracts.name), asc(contractArticles.sort));
	return rows;
}

export async function getArticle(articleId: string) {
	const [article] = await db
		.select({
			id: contractArticles.id,
			number: contractArticles.number,
			title: contractArticles.title,
			body: contractArticles.body,
			contractId: contractArticles.contractId,
			contractName: contracts.name
		})
		.from(contractArticles)
		.innerJoin(contracts, eq(contracts.id, contractArticles.contractId))
		.where(eq(contractArticles.id, articleId))
		.limit(1);
	if (!article) return null;
	const citing = await db
		.select({
			id: cases.id,
			number: cases.number,
			title: cases.title,
			status: cases.status,
			outcome: cases.outcome,
			resolution: cases.resolution,
			closedOn: cases.closedOn,
			note: caseArticles.note
		})
		.from(caseArticles)
		.innerJoin(cases, eq(cases.id, caseArticles.caseId))
		.where(eq(caseArticles.articleId, articleId))
		.orderBy(desc(cases.closedOn), desc(cases.createdAt));
	return { ...article, citing };
}

export async function librarySummary() {
	const [row] = await db.select({ closed: count() }).from(cases).where(eq(cases.status, 'closed'));
	return { closed: row?.closed ?? 0 };
}
