import { addDays, diffDays, type ISODate } from './dates';
import type { NonWorkingReason, WorkCalendar } from './calendar';

/**
 * `business` — count only working days (skips the calendar's weekends and holidays).
 * `calendar` — count every day; optionally roll a deadline that lands on a
 * non-working day forward to the next working day.
 */
export type DayType = 'business' | 'calendar';

export interface DeadlineRule {
	/** The date the clock starts. That day itself is day 0; counting begins the next day. */
	trigger: ISODate;
	days: number;
	dayType: DayType;
	/** For calendar-day limits: move a deadline landing on a weekend/holiday to the next working day. */
	rollForward?: boolean;
}

export interface SkippedDay {
	date: ISODate;
	reason: NonWorkingReason;
}

export interface Deadline {
	due: ISODate;
	trigger: ISODate;
	days: number;
	dayType: DayType;
	/** Non-working days the count stepped over (or rolled past). */
	skipped: SkippedDay[];
	/** Set when a calendar-day deadline was rolled forward off a non-working day. */
	rolledFrom?: ISODate;
}

/** Hard stop so a misconfigured calendar can never spin forever. */
const MAX_SCAN = 3660;

function rollToWorkingDay(cal: WorkCalendar, date: ISODate, skipped: SkippedDay[]): ISODate {
	let d = date;
	for (let i = 0; i < MAX_SCAN; i++) {
		const reason = cal.nonWorkingReason(d);
		if (!reason) return d;
		skipped.push({ date: d, reason });
		d = addDays(d, 1);
	}
	throw new RangeError('Could not find a working day within ten years');
}

export function computeDeadline(cal: WorkCalendar, rule: DeadlineRule): Deadline {
	const { trigger, dayType } = rule;
	const days = Math.max(0, Math.floor(rule.days));
	const skipped: SkippedDay[] = [];

	if (dayType === 'calendar') {
		const raw = addDays(trigger, days);
		if (rule.rollForward === false) return { due: raw, trigger, days, dayType, skipped };
		const due = rollToWorkingDay(cal, raw, skipped);
		return due === raw
			? { due, trigger, days, dayType, skipped }
			: { due, trigger, days, dayType, skipped, rolledFrom: raw };
	}

	if (days === 0) {
		const due = rollToWorkingDay(cal, trigger, skipped);
		return { due, trigger, days, dayType, skipped };
	}

	let d = trigger;
	let counted = 0;
	for (let i = 0; counted < days; i++) {
		if (i > MAX_SCAN) throw new RangeError('Deadline is more than ten years out');
		d = addDays(d, 1);
		const reason = cal.nonWorkingReason(d);
		if (reason) skipped.push({ date: d, reason });
		else counted++;
	}
	return { due: d, trigger, days, dayType, skipped };
}

/**
 * Signed count of working days between two dates: the working days in `(from, to]`
 * when `to` is later, or the negated working days in `(to, from]` when earlier.
 */
export function workingDaysBetween(cal: WorkCalendar, from: ISODate, to: ISODate): number {
	if (from === to) return 0;
	const forward = from < to;
	const [start, end] = forward ? [from, to] : [to, from];
	const span = diffDays(start, end);
	if (span > MAX_SCAN) throw new RangeError('Date range is too large');
	let count = 0;
	let d = start;
	for (let i = 0; i < span; i++) {
		d = addDays(d, 1);
		if (cal.isWorkingDay(d)) count++;
	}
	return forward ? count : -count;
}

export type Urgency = 'overdue' | 'today' | 'critical' | 'soon' | 'ok';

export interface Countdown {
	due: ISODate;
	today: ISODate;
	dayType: DayType;
	/** Working days left after today, up to and including the due date. Negative once overdue. */
	workingDaysLeft: number;
	/** Calendar days until the due date. Negative once overdue. */
	calendarDaysLeft: number;
	/** The count in the deadline's own unit (working days for business-day limits). */
	unitsLeft: number;
	urgency: Urgency;
}

export function countdown(
	cal: WorkCalendar,
	due: ISODate,
	today: ISODate,
	dayType: DayType = 'business'
): Countdown {
	const calendarDaysLeft = diffDays(today, due);
	const workingDaysLeft = workingDaysBetween(cal, today, due);
	const unitsLeft = dayType === 'business' ? workingDaysLeft : calendarDaysLeft;
	let urgency: Urgency;
	if (calendarDaysLeft < 0) urgency = 'overdue';
	else if (calendarDaysLeft === 0) urgency = 'today';
	else if (workingDaysLeft <= 2) urgency = 'critical';
	else if (workingDaysLeft <= 5) urgency = 'soon';
	else urgency = 'ok';
	return { due, today, dayType, workingDaysLeft, calendarDaysLeft, unitsLeft, urgency };
}

function plural(n: number, word: string): string {
	return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Human summary such as "3 working days left", "Due today" or "Overdue by 2 working days". */
export function countdownLabel(c: Countdown): string {
	const unit = c.dayType === 'business' ? 'working day' : 'day';
	if (c.urgency === 'today') return 'Due today';
	if (c.urgency === 'overdue') {
		const n = c.dayType === 'business' ? Math.max(1, -c.workingDaysLeft) : -c.calendarDaysLeft;
		return `Overdue by ${plural(n, unit)}`;
	}
	if (c.dayType === 'business' && c.workingDaysLeft === 0) {
		// Due date is after today but no working days remain (e.g. today is Friday, due Sunday).
		return 'Due before next working day';
	}
	return `${plural(c.unitsLeft, unit)} left`;
}

export function describeSkipped(skipped: SkippedDay[]): string {
	const weekends = skipped.filter((s) => s.reason.type === 'weekend').length;
	const holidays = skipped
		.map((s) => (s.reason.type === 'holiday' ? s.reason.name : null))
		.filter((n): n is string => n !== null);
	const parts: string[] = [];
	if (holidays.length) parts.push(holidays.join(', '));
	if (weekends) parts.push(plural(weekends, 'weekend day'));
	return parts.length ? `Skipped ${parts.join(' and ')}` : 'No days skipped';
}
