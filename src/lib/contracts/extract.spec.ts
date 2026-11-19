import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	extractArticles,
	extractContract,
	normalizeText,
	splitSentences,
	titleCase
} from './extract';
import { parseNumberWord, parseOrdinalish, parseRoman } from './numbers';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const sample = read('../../../examples/sample-contract.txt');
const publicSector = read('./fixtures/public-sector.txt');
const noHeadings = read('./fixtures/no-headings.txt');

const summary = (text: string) =>
	extractContract(text).steps.map(
		(s) => `${s.stage} | ${s.party} | ${s.days} ${s.dayType} | ${s.name}`
	);

describe('numbers', () => {
	it('parses number words', () => {
		expect(parseNumberWord('ten')).toBe(10);
		expect(parseNumberWord('twenty-one')).toBe(21);
		expect(parseNumberWord('forty five')).toBe(45);
		expect(parseNumberWord('Fifteen')).toBe(15);
		expect(parseNumberWord('one hundred')).toBe(100);
		expect(parseNumberWord('12')).toBe(12);
		expect(parseNumberWord('several')).toBeNull();
	});

	it('parses roman numerals and ordinals', () => {
		expect(parseRoman('IX')).toBe(9);
		expect(parseRoman('XIV')).toBe(14);
		expect(parseRoman('abc')).toBeNull();
		expect(parseOrdinalish('third')).toBe(3);
		expect(parseOrdinalish('two')).toBe(2);
		expect(parseOrdinalish('IV')).toBe(4);
	});
});

describe('text helpers', () => {
	it('title-cases shouty headings only', () => {
		expect(titleCase('HEALTH AND SAFETY')).toBe('Health and Safety');
		expect(titleCase('JOB POSTING AND BIDDING')).toBe('Job Posting and Bidding');
		expect(titleCase('Grievance Procedure')).toBe('Grievance Procedure');
	});

	it('normalizes whitespace and line endings', () => {
		expect(normalizeText('a\r\nb \t c\n\n\n\nd')).toBe('a\nb c\n\nd');
	});

	it('splits sentences without breaking on section numbers or abbreviations', () => {
		const s = splitSentences('Section 9.3 Step 1. The Union shall file. See Sec. 4 for more. Done');
		expect(s.map((x) => x.text)).toEqual([
			'Section 9.3 Step 1.',
			'The Union shall file.',
			'See Sec. 4 for more.',
			'Done'
		]);
	});
});

describe('articles', () => {
	it('finds numbered article headings with titles on the same line', () => {
		const articles = extractArticles(normalizeText(sample));
		expect(articles).toHaveLength(15);
		expect(articles[8]).toMatchObject({ number: '9', title: 'Grievance Procedure', sort: 9 });
		expect(articles[8].body).toContain('Section 9.3 Step 1.');
		expect(articles[8].body).not.toContain('ARTICLE 10');
	});

	it('finds roman numeral headings with titles on the next line', () => {
		const articles = extractArticles(normalizeText(publicSector));
		expect(articles.map((a) => `${a.number} ${a.title}`)).toEqual([
			'I Recognition',
			'II Holidays',
			'III Grievance Procedure',
			'IV Arbitration'
		]);
	});

	it('ignores in-text references that wrap onto a new line', () => {
		const text =
			'ARTICLE 1 – SCOPE\nText that mentions\nArticle 1, Section 2 again.\nARTICLE 2 – PAY\nMore.';
		expect(extractArticles(text).map((a) => a.number)).toEqual(['1', '2']);
	});
});

describe('grievance steps — sample agreement', () => {
	const result = extractContract(sample);

	it('reads every step deadline in order', () => {
		expect(summary(sample)).toEqual([
			'Step 1 | union | 10 business | File grievance with immediate supervisor',
			"Step 1 | management | 5 business | Supervisor's written answer",
			'Step 2 | union | 7 business | Appeal to Operations Manager',
			'Step 2 | management | 5 business | Operations Manager meets with the union',
			"Step 2 | management | 10 business | Operations Manager's written answer",
			'Step 3 | union | 10 business | Appeal to Director of Human Resources',
			"Step 3 | management | 15 business | Director's written answer",
			'Arbitration | union | 30 calendar | Request arbitration'
		]);
	});

	it('keeps the source sentence and phrase for human review', () => {
		const first = result.steps[0];
		expect(first.phrase).toBe('ten (10) working days');
		expect(first.source).toMatch(/^The Union shall present the grievance/);
		expect(first.article).toBe('9');
		expect(first.confidence).toBe('high');
	});

	it('reports limits that are not party deadlines instead of silently dropping them', () => {
		expect(result.ignored).toHaveLength(1);
		expect(result.ignored[0].source).toMatch(/arbitrator shall issue a written decision/);
	});

	it('reads the days definition, work week and procedure articles', () => {
		expect(result.defaultDayType).toBe('business');
		expect(result.workdays).toEqual([1, 2, 3, 4, 5]);
		expect(result.procedureArticles).toEqual(['9', '10']);
		expect(result.warnings).toEqual([]);
	});

	it('does not pick up time limits from other articles', () => {
		expect(result.steps.some((s) => /layoff|vacanc|discipline/i.test(s.source))).toBe(false);
	});
});

describe('grievance steps — other drafting styles', () => {
	it('handles "STEP ONE:" headings, passive voice and a calendar-day definition', () => {
		expect(summary(publicSector)).toEqual([
			'Step 1 | union | 14 calendar | File grievance with immediate supervisor',
			"Step 1 | management | 3 calendar | Supervisor's written answer",
			'Step 2 | union | 7 calendar | Appeal to Superintendent of Public Works',
			"Step 2 | management | 10 calendar | Superintendent's written answer",
			'Step 3 | union | 10 calendar | Appeal to Town Manager',
			'Step 3 | management | 15 calendar | Town Manager meets with the union',
			"Step 3 | management | 10 business | Town Manager's written answer",
			'Arbitration | union | 21 calendar | Request arbitration'
		]);
		const r = extractContract(publicSector);
		expect(r.defaultDayType).toBe('calendar');
		expect(r.steps[0].dayTypeExplicit).toBe(false);
		expect(r.steps[0].notes[0]).toMatch(/defines days as calendar days/);
		expect(r.warnings.some((w) => w.includes('hours'))).toBe(true);
	});

	it('numbers steps by itself when the contract has no step headings', () => {
		expect(summary(noHeadings)).toEqual([
			'Step 1 | union | 5 business | File grievance with shop foreman',
			"Step 1 | management | 2 business | Foreman's written answer",
			'Step 2 | union | 3 business | Appeal to plant manager',
			"Step 2 | management | 5 business | Plant manager's written answer"
		]);
		const r = extractContract(noHeadings);
		expect(r.articles).toEqual([]);
		expect(r.warnings.some((w) => w.includes('ARTICLE'))).toBe(true);
	});

	it('flags unqualified "days" as low confidence when the contract never defines them', () => {
		const r = extractContract('The Union shall file the grievance within 10 days of the incident.');
		expect(r.steps[0]).toMatchObject({
			days: 10,
			dayType: 'business',
			dayTypeExplicit: false,
			confidence: 'low'
		});
	});

	it('returns nothing (with a warning) for text without time limits', () => {
		const r = extractContract('This is not a contract.');
		expect(r.steps).toEqual([]);
		expect(r.warnings.join(' ')).toMatch(/No grievance time limits/);
	});
});

describe('holidays', () => {
	it('reads the holiday list and the observed-date rule', () => {
		const r = extractContract(sample);
		expect(r.holidays.map((h) => h.name)).toEqual([
			"New Year's Day",
			'Martin Luther King Jr. Day',
			'Memorial Day',
			'Juneteenth',
			'Independence Day',
			'Labor Day',
			'Thanksgiving Day',
			'Day after Thanksgiving',
			'Christmas Eve',
			'Christmas Day'
		]);
		expect(r.observedRule).toBe('federal');
		expect(r.holidays.find((h) => h.name === 'Christmas Day')?.rule).toEqual({
			kind: 'fixed',
			month: 12,
			day: 25,
			observed: 'federal'
		});
	});

	it('reads holidays written as a sentence, including Easter-based ones', () => {
		const r = extractContract(publicSector);
		expect(r.observedRule).toBe('sunday_to_monday');
		expect(r.holidays.map((h) => h.name)).toContain('Good Friday');
		expect(r.holidays.map((h) => h.name)).toContain('Day after Thanksgiving');
		expect(r.holidays.find((h) => h.name === 'Good Friday')?.rule).toEqual({
			kind: 'easter',
			offset: -2
		});
		expect(r.holidays).toHaveLength(12);
	});

	it('warns when there is no holiday article', () => {
		expect(extractContract(noHeadings).warnings.join(' ')).toMatch(/No holiday article/);
	});
});
