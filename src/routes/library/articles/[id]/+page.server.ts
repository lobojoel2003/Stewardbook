import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getArticle } from '#lib/server/library.ts';
import { deleteArticle, updateArticle } from '#lib/server/contracts.ts';
import { isUuid, str } from '#lib/server/forms.ts';

export const load: PageServerLoad = async ({ params }) => {
	if (!isUuid(params.id)) error(404, 'Article not found');
	const article = await getArticle(params.id);
	if (!article) error(404, 'Article not found');
	return { title: `Article ${article.number} — ${article.title}`, article };
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const form = await request.formData();
		const article = await getArticle(params.id);
		if (!article) error(404, 'Article not found');
		const number = str(form, 'number', 20);
		const title = str(form, 'title', 200);
		if (!number || !title) return fail(400, { message: 'An article needs a number and a title.' });
		await updateArticle(article.contractId, params.id, {
			number,
			title,
			body: str(form, 'body', 200_000)
		});
		return { ok: true };
	},
	delete: async ({ params }) => {
		const article = await getArticle(params.id);
		if (!article) error(404, 'Article not found');
		await deleteArticle(article.contractId, params.id);
		redirect(303, `/contracts/${article.contractId}`);
	}
};
