import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index.ts';
import { BUILD } from '#lib/build.ts';

/** Liveness + readiness probe for Docker and load balancers. */
export const GET: RequestHandler = async () => {
	const started = Date.now();
	try {
		await db.execute(sql`select 1`);
		return json(
			{
				status: 'ok',
				version: BUILD.version,
				build: BUILD.number,
				commit: BUILD.sha,
				db: 'ok',
				latencyMs: Date.now() - started
			},
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch {
		return json(
			{ status: 'error', version: BUILD.version, build: BUILD.number, db: 'unreachable' },
			{ status: 503, headers: { 'Cache-Control': 'no-store' } }
		);
	}
};
