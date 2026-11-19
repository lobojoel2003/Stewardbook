import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '#lib/server/db/index.ts';
import { contracts } from '#lib/server/db/schema.ts';
import { isUuid } from '#lib/server/forms.ts';

export const load: PageServerLoad = async ({ params }) => {
	if (!isUuid(params.id)) error(404, 'Contract not found');
	const [c] = await db
		.select({
			id: contracts.id,
			name: contracts.name,
			sourceText: contracts.sourceText,
			sourceFilename: contracts.sourceFilename
		})
		.from(contracts)
		.where(eq(contracts.id, params.id))
		.limit(1);
	if (!c) error(404, 'Contract not found');
	return { title: `${c.name} — source`, contract: c };
};
