import { addDays, daysInMonth, isISODate, makeDate, weekday, type ISODate } from './dates';

/**
 * How a fixed-date holiday moves when it lands on a weekend.
 * - `none`: never moves
 * - `federal`: Saturday → preceding Friday, Sunday → following Monday (US federal rule)
 * - `sunday_to_monday`: only Sunday moves, to Monday
 * - `weekend_to_monday`: Saturday and Sunday both move to the following Monday
 */
export type ObservedRule = 'none' | 'federal' | 'sunday_to_monday' | 'weekend_to_monday';

export type HolidayRule =
	/** Same month/day every year, e.g. July 4. */
	| { kind: 'fixed'; month: number; day: number; observed?: ObservedRule }
	/** The nth weekday of a month (n = -1 for the last one), plus an optional day offset. */
	| { kind: 'nth_weekday'; month: number; weekday: number; n: number; offset?: number }
	/** Relative to Western Easter Sunday, e.g. Good Friday = -2. */
	| { kind: 'easter'; offset: number }
	/** A single specific date. */
	| { kind: 'date'; date: ISODate };

export interface HolidayDef {
	name: string;
	rule: HolidayRule;
}

export interface ResolvedHoliday {
	/** The date the workplace is closed. */
	date: ISODate;
	name: string;
	/** The calendar date of the holiday when it differs from the observed date. */
	actual?: ISODate;
}

export const OBSERVED_RULE_LABELS: Record<ObservedRule, string> = {
	none: 'Not moved when it falls on a weekend',
	federal: 'Saturday → Friday, Sunday → Monday',
	sunday_to_monday: 'Sunday → Monday only',
	weekend_to_monday: 'Saturday or Sunday → Monday'
};

/** Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm. */
export function easterSunday(year: number): ISODate {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return makeDate(year, month, day);
}

/** The nth (1-based) given weekday of a month; n = -1 means the last one. */
export function nthWeekday(year: number, month: number, dow: number, n: number): ISODate | null {
	if (n === -1) {
		const last = makeDate(year, month, daysInMonth(year, month));
		const back = (weekday(last) - dow + 7) % 7;
		return addDays(last, -back);
	}
	const first = makeDate(year, month, 1);
	const forward = (dow - weekday(first) + 7) % 7;
	const day = 1 + forward + (n - 1) * 7;
	if (n < 1 || day > daysInMonth(year, month)) return null;
	return makeDate(year, month, day);
}

function applyObserved(date: ISODate, rule: ObservedRule): ISODate {
	const dow = weekday(date);
	switch (rule) {
		case 'federal':
			if (dow === 6) return addDays(date, -1);
			if (dow === 0) return addDays(date, 1);
			return date;
		case 'sunday_to_monday':
			return dow === 0 ? addDays(date, 1) : date;
		case 'weekend_to_monday':
			if (dow === 6) return addDays(date, 2);
			if (dow === 0) return addDays(date, 1);
			return date;
		default:
			return date;
	}
}

/** Resolve one holiday rule for a year. Returns null if the rule does not occur that year. */
export function resolveHoliday(def: HolidayDef, year: number): ResolvedHoliday | null {
	const { rule, name } = def;
	switch (rule.kind) {
		case 'fixed': {
			if (rule.month < 1 || rule.month > 12) return null;
			if (rule.day < 1 || rule.day > daysInMonth(year, rule.month)) return null;
			const actual = makeDate(year, rule.month, rule.day);
			const observed = applyObserved(actual, rule.observed ?? 'none');
			return observed === actual ? { date: actual, name } : { date: observed, name, actual };
		}
		case 'nth_weekday': {
			const base = nthWeekday(year, rule.month, rule.weekday, rule.n);
			if (!base) return null;
			return { date: addDays(base, rule.offset ?? 0), name };
		}
		case 'easter':
			return { date: addDays(easterSunday(year), rule.offset), name };
		case 'date': {
			if (!isISODate(rule.date) || Number(rule.date.slice(0, 4)) !== year) return null;
			return { date: rule.date, name };
		}
	}
}

/**
 * Every closure that lands in `year`. Fixed holidays observed across a year
 * boundary (Jan 1 on a Saturday is observed Dec 31) are attributed to the year
 * they are observed in.
 */
export function holidaysInYear(defs: HolidayDef[], year: number): ResolvedHoliday[] {
	const out: ResolvedHoliday[] = [];
	for (const y of [year - 1, year, year + 1]) {
		for (const def of defs) {
			const r = resolveHoliday(def, y);
			if (r && r.date.startsWith(`${year}-`)) out.push(r);
		}
	}
	const seen = new Set<string>();
	return out
		.filter((h) => {
			const key = `${h.date}|${h.name}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
}

/**
 * A key that identifies when a holiday falls, ignoring its weekend rule and key order
 * (Postgres jsonb doesn't preserve key order, so JSON.stringify alone isn't stable).
 */
export function holidayRuleKey(rule: HolidayRule): string {
	const entries = Object.entries(rule).filter(
		([k, v]) => k !== 'observed' && v !== undefined && !(k === 'offset' && v === 0)
	);
	return JSON.stringify(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function describeRule(rule: HolidayRule): string {
	const ordinal = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
	const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const monthNames = [
		'',
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];
	switch (rule.kind) {
		case 'fixed': {
			const obs =
				rule.observed && rule.observed !== 'none'
					? ` (${OBSERVED_RULE_LABELS[rule.observed]})`
					: '';
			return `${monthNames[rule.month]} ${rule.day}${obs}`;
		}
		case 'nth_weekday': {
			const which = rule.n === -1 ? 'last' : (ordinal[rule.n] ?? `${rule.n}th`);
			const base = `${which} ${dayNames[rule.weekday]} of ${monthNames[rule.month]}`;
			if (!rule.offset) return base[0].toUpperCase() + base.slice(1);
			const off = `${Math.abs(rule.offset)} day${Math.abs(rule.offset) === 1 ? '' : 's'} ${rule.offset > 0 ? 'after' : 'before'} the`;
			return `${off} ${base}`.replace(/^./, (c) => c.toUpperCase());
		}
		case 'easter':
			if (rule.offset === 0) return 'Easter Sunday';
			return `${Math.abs(rule.offset)} day${Math.abs(rule.offset) === 1 ? '' : 's'} ${rule.offset > 0 ? 'after' : 'before'} Easter`;
		case 'date':
			return `Only on ${rule.date}`;
	}
}

/** US federal holidays (5 U.S.C. 6103), a sensible starting point for most US contracts. */
export const US_FEDERAL_HOLIDAYS: HolidayDef[] = [
	{ name: "New Year's Day", rule: { kind: 'fixed', month: 1, day: 1, observed: 'federal' } },
	{
		name: 'Martin Luther King Jr. Day',
		rule: { kind: 'nth_weekday', month: 1, weekday: 1, n: 3 }
	},
	{ name: "Presidents' Day", rule: { kind: 'nth_weekday', month: 2, weekday: 1, n: 3 } },
	{ name: 'Memorial Day', rule: { kind: 'nth_weekday', month: 5, weekday: 1, n: -1 } },
	{ name: 'Juneteenth', rule: { kind: 'fixed', month: 6, day: 19, observed: 'federal' } },
	{ name: 'Independence Day', rule: { kind: 'fixed', month: 7, day: 4, observed: 'federal' } },
	{ name: 'Labor Day', rule: { kind: 'nth_weekday', month: 9, weekday: 1, n: 1 } },
	{ name: 'Columbus Day', rule: { kind: 'nth_weekday', month: 10, weekday: 1, n: 2 } },
	{ name: 'Veterans Day', rule: { kind: 'fixed', month: 11, day: 11, observed: 'federal' } },
	{ name: 'Thanksgiving Day', rule: { kind: 'nth_weekday', month: 11, weekday: 4, n: 4 } },
	{ name: 'Christmas Day', rule: { kind: 'fixed', month: 12, day: 25, observed: 'federal' } }
];

interface CatalogEntry {
	name: string;
	pattern: RegExp;
	rule: (observed: ObservedRule) => HolidayRule;
}

/**
 * Named holidays commonly listed in US collective bargaining agreements.
 * Order matters: more specific names (e.g. "day after Thanksgiving") come first
 * so they claim their text before the generic pattern does.
 */
export const HOLIDAY_CATALOG: CatalogEntry[] = [
	{
		name: 'Day after Thanksgiving',
		pattern:
			/\b(day|friday)\s+(after|following)\s+thanksgiving(\s+day)?\b|\bblack\s+friday\b|\bthanksgiving\s+friday\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 11, weekday: 4, n: 4, offset: 1 })
	},
	{
		name: 'Thanksgiving Day',
		pattern: /\bthanksgiving(\s+day)?\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 11, weekday: 4, n: 4 })
	},
	{
		name: 'Christmas Eve',
		pattern: /\bchristmas\s+eve(\s+day)?\b|\bday\s+before\s+christmas\b/i,
		rule: (o) => ({ kind: 'fixed', month: 12, day: 24, observed: o })
	},
	{
		name: 'Christmas Day',
		pattern: /\bchristmas(\s+day)?\b(?!\s+eve)/i,
		rule: (o) => ({ kind: 'fixed', month: 12, day: 25, observed: o })
	},
	{
		name: "New Year's Eve",
		pattern: /\bnew\s+year['’]?s\s+eve(\s+day)?\b|\bday\s+before\s+new\s+year['’]?s(\s+day)?\b/i,
		rule: (o) => ({ kind: 'fixed', month: 12, day: 31, observed: o })
	},
	{
		name: "New Year's Day",
		pattern: /\bnew\s+year['’]?s(\s+day)?\b(?!\s+eve)/i,
		rule: (o) => ({ kind: 'fixed', month: 1, day: 1, observed: o })
	},
	{
		name: 'Martin Luther King Jr. Day',
		pattern:
			/\b(martin\s+luther\s+king|dr\.?\s+king|m\.?\s*l\.?\s*k\.?)(\s*,?\s*jr\.?)?(['’]s)?(\s+(day|birthday))?\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 1, weekday: 1, n: 3 })
	},
	{
		name: "Lincoln's Birthday",
		pattern: /\blincoln['’]?s?\s+birthday\b/i,
		rule: (o) => ({ kind: 'fixed', month: 2, day: 12, observed: o })
	},
	{
		name: "Presidents' Day",
		pattern: /\bpresidents?['’]?\s*day\b|\bwashington['’]?s?\s+birthday\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 2, weekday: 1, n: 3 })
	},
	{
		name: 'César Chávez Day',
		pattern: /\bc[eé]sar\s+ch[aá]vez(\s+day)?\b/i,
		rule: (o) => ({ kind: 'fixed', month: 3, day: 31, observed: o })
	},
	{
		name: 'Good Friday',
		pattern: /\bgood\s+friday\b/i,
		rule: () => ({ kind: 'easter', offset: -2 })
	},
	{
		name: 'Easter Monday',
		pattern: /\beaster\s+monday\b/i,
		rule: () => ({ kind: 'easter', offset: 1 })
	},
	{
		name: "Patriots' Day",
		pattern: /\bpatriots?['’]?\s+day\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 4, weekday: 1, n: 3 })
	},
	{
		name: 'Memorial Day',
		pattern: /\bmemorial\s+day\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 5, weekday: 1, n: -1 })
	},
	{
		name: 'Juneteenth',
		pattern: /\bjuneteenth\b/i,
		rule: (o) => ({ kind: 'fixed', month: 6, day: 19, observed: o })
	},
	{
		name: 'Independence Day',
		pattern: /\bindependence\s+day\b|\bfourth\s+of\s+july\b|\bjuly\s+(4|4th|fourth)\b/i,
		rule: (o) => ({ kind: 'fixed', month: 7, day: 4, observed: o })
	},
	{
		name: 'Labor Day',
		pattern: /\blabou?r\s+day\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 9, weekday: 1, n: 1 })
	},
	{
		name: "Indigenous Peoples' Day",
		pattern: /\bindigenous\s+peoples?['’]?\s+day\b|\bnative\s+american\s+day\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 10, weekday: 1, n: 2 })
	},
	{
		name: 'Columbus Day',
		pattern: /\bcolumbus\s+day\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 10, weekday: 1, n: 2 })
	},
	{
		name: 'Election Day',
		pattern: /\b(general\s+)?election\s+day\b/i,
		rule: () => ({ kind: 'nth_weekday', month: 11, weekday: 1, n: 1, offset: 1 })
	},
	{
		name: 'Veterans Day',
		pattern: /\bveterans['’]?\s+day\b|\barmistice\s+day\b/i,
		rule: (o) => ({ kind: 'fixed', month: 11, day: 11, observed: o })
	}
];
