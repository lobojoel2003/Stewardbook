/**
 * Date-only helpers.
 *
 * Grievance deadlines are calendar dates, not instants, so the whole rules engine
 * works on ISO `YYYY-MM-DD` strings and does its arithmetic in UTC. That keeps the
 * math immune to daylight-saving shifts and to the server's local timezone.
 */

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const WEEKDAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

export const MONTH_NAMES = [
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
] as const;

export function isISODate(value: unknown): value is ISODate {
	if (typeof value !== 'string') return false;
	const m = ISO_RE.exec(value);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function assertISODate(value: unknown, label = 'date'): ISODate {
	if (!isISODate(value)) throw new RangeError(`Invalid ${label}: ${String(value)}`);
	return value;
}

export function parts(date: ISODate): { year: number; month: number; day: number } {
	const m = ISO_RE.exec(date);
	if (!m) throw new RangeError(`Invalid date: ${date}`);
	return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Build an ISO date from a year, a 1-based month and a day. */
export function makeDate(year: number, month: number, day: number): ISODate {
	return fromUTC(new Date(Date.UTC(year, month - 1, day)));
}

export function toUTC(date: ISODate): Date {
	const { year, month, day } = parts(date);
	return new Date(Date.UTC(year, month - 1, day));
}

export function fromUTC(dt: Date): ISODate {
	const y = dt.getUTCFullYear();
	const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
	const d = String(dt.getUTCDate()).padStart(2, '0');
	return `${String(y).padStart(4, '0')}-${m}-${d}`;
}

export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: ISODate, n: number): ISODate {
	return fromUTC(new Date(toUTC(date).getTime() + n * DAY_MS));
}

/** Day of week, 0 = Sunday … 6 = Saturday. */
export function weekday(date: ISODate): number {
	return toUTC(date).getUTCDay();
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: ISODate, b: ISODate): number {
	return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS);
}

export function compareDates(a: ISODate, b: ISODate): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
	return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
	return a >= b ? a : b;
}

export function yearOf(date: ISODate): number {
	return parts(date).year;
}

/** Today's date as seen from a given IANA timezone (defaults to UTC if the zone is unknown). */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
	let fmt: Intl.DateTimeFormat;
	try {
		fmt = new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
	} catch {
		return fromUTC(now);
	}
	const get = (type: string) => fmt.formatToParts(now).find((p) => p.type === type)?.value ?? '';
	return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isValidTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone });
		return true;
	} catch {
		return false;
	}
}

const longFmt = new Intl.DateTimeFormat('en-US', {
	weekday: 'short',
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	timeZone: 'UTC'
});
const shortFmt = new Intl.DateTimeFormat('en-US', {
	weekday: 'short',
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});
const monthDayFmt = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});

/** "Tue, Dec 8, 2026" */
export function formatLong(date: ISODate): string {
	return longFmt.format(toUTC(date));
}

/** "Tue, Dec 8" */
export function formatShort(date: ISODate): string {
	return shortFmt.format(toUTC(date));
}

/** "Dec 8" */
export function formatMonthDay(date: ISODate): string {
	return monthDayFmt.format(toUTC(date));
}
