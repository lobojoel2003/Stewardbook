import type { CaseInput } from './cases';
import { isISODate } from '../deadlines/dates';
import { isUuid, optionalDate, str } from './forms';

export type CaseFormValues = Omit<CaseInput, 'contractId' | 'stewardId' | 'incidentDate'> & {
	contractId: string;
	stewardId: string;
	incidentDate: string;
};

/** Read and validate the shared new/edit case form. */
export function readCaseForm(form: FormData): {
	values: CaseFormValues;
	errors: Record<string, string>;
} {
	const articleIds = form
		.getAll('article')
		.filter((v): v is string => typeof v === 'string' && isUuid(v));
	const values: CaseFormValues = {
		contractId: str(form, 'contractId', 40),
		stewardId: str(form, 'stewardId', 40),
		title: str(form, 'title', 200),
		grievantName: str(form, 'grievantName', 160),
		grievantContact: str(form, 'grievantContact', 200),
		department: str(form, 'department', 160),
		supervisor: str(form, 'supervisor', 160),
		incidentDate: str(form, 'incidentDate', 10),
		awareDate: optionalDate(form, 'awareDate'),
		summary: str(form, 'summary', 20_000),
		remedy: str(form, 'remedy', 10_000),
		articles: [...new Set(articleIds)].map((articleId) => ({
			articleId,
			note: str(form, `note:${articleId}`, 300)
		}))
	};
	const errors: Record<string, string> = {};
	if (!values.title) errors.title = 'Give the case a short title.';
	if (!values.grievantName) errors.grievantName = 'Who is the grievant?';
	if (!isISODate(values.incidentDate)) errors.incidentDate = 'When did it happen?';
	if (
		values.awareDate &&
		isISODate(values.incidentDate) &&
		values.awareDate < values.incidentDate
	) {
		errors.awareDate = 'This can’t be before the incident.';
	}
	return { values, errors };
}
