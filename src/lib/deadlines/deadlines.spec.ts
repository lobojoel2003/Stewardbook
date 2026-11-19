import { describe, expect, it } from 'vitest';
import {
	US_FEDERAL_HOLIDAYS,
	WorkCalendar,
	addDays,
	computeDeadline,
	countdown,
	countdownLabel,
	describeRule,
	describeSkipped,
	diffDays,
	easterSunday,
	evaluateSteps,
	holidaysInYear,
	isISODate,
	nextTriggerDate,
	nthWeekday,
	todayIn,
	weekday,
	workingDaysBetween,
	holidayRuleKey,
	type HolidayDef,
	type HolidayRule,
	type StepRecord
} from './index';

const federal = new WorkCalendar({ holidays: US_FEDERAL_HOLIDAYS });
const plain = new WorkCalendar();

describe('dates', () => {
	it('validates ISO dates', () => {
		expect(isISODate('2026-02-28')).toBe(true);
		expect(isISODate('2026-02-29')).toBe(false);
		expect(isISODate('2028-02-29')).toBe(true);
		expect(isISODate('2026-13-01')).toBe(false);
		expect(isISODate('26-01-01')).toBe(false);
		expect(isISODate(20260101)).toBe(false);
	});

	it('does day arithmetic across month, year and DST boundaries', () => {
		expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
		expect(diffDays('2026-11-01', '2026-11-30')).toBe(29);
		expect(weekday('2026-11-19')).toBe(4);
	});

	it('computes today in a timezone', () => {
		const instant = new Date('2026-11-20T03:30:00Z');
		expect(todayIn('UTC', instant)).toBe('2026-11-20');
		expect(todayIn('America/Los_Angeles', instant)).toBe('2026-11-19');
		expect(todayIn('Not/AZone', instant)).toBe('2026-11-20');
	});
});

describe('holidays', () => {
	it('computes Easter', () => {
		expect(easterSunday(2024)).toBe('2024-03-31');
		expect(easterSunday(2025)).toBe('2025-04-20');
		expect(easterSunday(2026)).toBe('2026-04-05');
		expect(easterSunday(2027)).toBe('2027-03-28');
	});

	it('finds nth and last weekdays', () => {
		expect(nthWeekday(2026, 11, 4, 4)).toBe('2026-11-26');
		expect(nthWeekday(2026, 5, 1, -1)).toBe('2026-05-25');
		expect(nthWeekday(2026, 1, 1, 3)).toBe('2026-01-19');
		expect(nthWeekday(2026, 9, 1, 1)).toBe('2026-09-07');
		expect(nthWeekday(2026, 2, 1, 5)).toBeNull();
	});

	it('resolves the US federal calendar with observed dates', () => {
		const dates = holidaysInYear(US_FEDERAL_HOLIDAYS, 2026).map((h) => h.date);
		expect(dates).toEqual([
			'2026-01-01',
			'2026-01-19',
			'2026-02-16',
			'2026-05-25',
			'2026-06-19',
			'2026-07-03', // July 4 is a Saturday
			'2026-09-07',
			'2026-10-12',
			'2026-11-11',
			'2026-11-26',
			'2026-12-25'
		]);
		const july = holidaysInYear(US_FEDERAL_HOLIDAYS, 2026).find(
			(h) => h.name === 'Independence Day'
		);
		expect(july?.actual).toBe('2026-07-04');
	});

	it('attributes a holiday observed across the year boundary to the right year', () => {
		// Jan 1, 2022 was a Saturday → observed Friday Dec 31, 2021.
		const y2021 = holidaysInYear(US_FEDERAL_HOLIDAYS, 2021).map((h) => h.date);
		const y2022 = holidaysInYear(US_FEDERAL_HOLIDAYS, 2022).map((h) => h.date);
		expect(y2021).toContain('2021-12-31');
		expect(y2022).not.toContain('2022-01-01');
	});

	it('supports alternative observed rules, Easter offsets and one-off dates', () => {
		const defs: HolidayDef[] = [
			{
				name: 'Independence Day',
				rule: { kind: 'fixed', month: 7, day: 4, observed: 'weekend_to_monday' }
			},
			{ name: 'Good Friday', rule: { kind: 'easter', offset: -2 } },
			{ name: 'Snow closure', rule: { kind: 'date', date: '2026-02-02' } }
		];
		expect(holidaysInYear(defs, 2026).map((h) => h.date)).toEqual([
			'2026-02-02',
			'2026-04-03',
			'2026-07-06'
		]);
		expect(holidaysInYear(defs, 2027).map((h) => h.date)).toEqual(['2027-03-26', '2027-07-05']);
	});

	it('describes rules in plain language', () => {
		expect(describeRule({ kind: 'nth_weekday', month: 11, weekday: 4, n: 4 })).toBe(
			'Fourth Thursday of November'
		);
		expect(describeRule({ kind: 'nth_weekday', month: 11, weekday: 4, n: 4, offset: 1 })).toBe(
			'1 day after the fourth Thursday of November'
		);
		expect(describeRule({ kind: 'nth_weekday', month: 5, weekday: 1, n: -1 })).toBe(
			'Last Monday of May'
		);
		expect(describeRule({ kind: 'easter', offset: -2 })).toBe('2 days before Easter');
		expect(describeRule({ kind: 'fixed', month: 12, day: 25, observed: 'federal' })).toContain(
			'December 25'
		);
	});
});

describe('computeDeadline — working days', () => {
	it('counts forward from the day after the trigger, skipping weekends', () => {
		// Monday + 5 working days = the next Monday.
		expect(
			computeDeadline(plain, { trigger: '2026-11-02', days: 5, dayType: 'business' }).due
		).toBe('2026-11-09');
	});

	it('skips Thanksgiving', () => {
		const d = computeDeadline(federal, { trigger: '2026-11-16', days: 10, dayType: 'business' });
		expect(d.due).toBe('2026-12-01');
		expect(d.skipped.filter((s) => s.reason.type === 'holiday').map((s) => s.date)).toEqual([
			'2026-11-26'
		]);
		expect(describeSkipped(d.skipped)).toBe('Skipped Thanksgiving Day and 4 weekend days');
	});

	it('skips contract holidays such as the day after Thanksgiving', () => {
		const cal = new WorkCalendar({
			holidays: [
				...US_FEDERAL_HOLIDAYS,
				{
					name: 'Day after Thanksgiving',
					rule: { kind: 'nth_weekday', month: 11, weekday: 4, n: 4, offset: 1 }
				}
			]
		});
		expect(computeDeadline(cal, { trigger: '2026-11-16', days: 10, dayType: 'business' }).due).toBe(
			'2026-12-02'
		);
	});

	it('handles the Christmas–New Year stretch across the year boundary', () => {
		expect(
			computeDeadline(federal, { trigger: '2026-12-22', days: 5, dayType: 'business' }).due
		).toBe('2026-12-30');
		expect(
			computeDeadline(federal, { trigger: '2026-12-29', days: 5, dayType: 'business' }).due
		).toBe('2027-01-06');
	});

	it('skips an observed holiday (July 3 when July 4 is a Saturday)', () => {
		const d = computeDeadline(federal, { trigger: '2026-07-02', days: 1, dayType: 'business' });
		expect(d.due).toBe('2026-07-06');
		expect(d.skipped[0]).toEqual({
			date: '2026-07-03',
			reason: { type: 'holiday', name: 'Independence Day', actual: '2026-07-04' }
		});
	});

	it('honours a custom work week', () => {
		const sixDay = new WorkCalendar({ workdays: [1, 2, 3, 4, 5, 6] });
		expect(
			computeDeadline(sixDay, { trigger: '2026-11-20', days: 3, dayType: 'business' }).due
		).toBe('2026-11-24');
	});

	it('treats a zero-day limit as "same working day"', () => {
		expect(
			computeDeadline(plain, { trigger: '2026-11-18', days: 0, dayType: 'business' }).due
		).toBe('2026-11-18');
		expect(
			computeDeadline(plain, { trigger: '2026-11-21', days: 0, dayType: 'business' }).due
		).toBe('2026-11-23');
	});

	it('rejects an empty work week', () => {
		expect(() => new WorkCalendar({ workdays: [] })).toThrow(RangeError);
	});
});

describe('computeDeadline — calendar days', () => {
	it('counts every day', () => {
		expect(
			computeDeadline(federal, { trigger: '2026-11-02', days: 30, dayType: 'calendar' }).due
		).toBe('2026-12-02');
	});

	it('rolls a deadline that lands on a weekend forward to the next working day', () => {
		const d = computeDeadline(federal, {
			trigger: '2026-06-04',
			days: 30,
			dayType: 'calendar',
			rollForward: true
		});
		expect(d.rolledFrom).toBe('2026-07-04');
		expect(d.due).toBe('2026-07-06');
	});

	it('rolls past a holiday', () => {
		const d = computeDeadline(federal, { trigger: '2026-11-21', days: 5, dayType: 'calendar' });
		expect(d.rolledFrom).toBe('2026-11-26');
		expect(d.due).toBe('2026-11-27');
	});

	it('can leave the date alone when rolling is off', () => {
		const d = computeDeadline(federal, {
			trigger: '2026-06-04',
			days: 30,
			dayType: 'calendar',
			rollForward: false
		});
		expect(d.due).toBe('2026-07-04');
		expect(d.rolledFrom).toBeUndefined();
	});
});

describe('workingDaysBetween and countdown', () => {
	it('counts working days in (from, to] with a sign', () => {
		expect(workingDaysBetween(plain, '2026-11-20', '2026-11-23')).toBe(1);
		expect(workingDaysBetween(plain, '2026-11-23', '2026-11-20')).toBe(-1);
		expect(workingDaysBetween(plain, '2026-11-20', '2026-11-20')).toBe(0);
		expect(workingDaysBetween(federal, '2026-11-25', '2026-11-30')).toBe(2);
	});

	it('classifies urgency', () => {
		expect(countdown(plain, '2026-12-04', '2026-11-23').urgency).toBe('ok');
		expect(countdown(plain, '2026-11-27', '2026-11-23').urgency).toBe('soon');
		expect(countdown(plain, '2026-11-24', '2026-11-23').urgency).toBe('critical');
		expect(countdown(plain, '2026-11-23', '2026-11-23').urgency).toBe('today');
		expect(countdown(plain, '2026-11-20', '2026-11-23').urgency).toBe('overdue');
	});

	it('counts from a weekend correctly', () => {
		const c = countdown(plain, '2026-11-23', '2026-11-21');
		expect(c.workingDaysLeft).toBe(1);
		expect(c.calendarDaysLeft).toBe(2);
		expect(countdownLabel(c)).toBe('1 working day left');
	});

	it('produces readable labels', () => {
		expect(countdownLabel(countdown(plain, '2026-11-30', '2026-11-23'))).toBe(
			'5 working days left'
		);
		expect(countdownLabel(countdown(plain, '2026-11-23', '2026-11-23'))).toBe('Due today');
		expect(countdownLabel(countdown(plain, '2026-11-19', '2026-11-23'))).toBe(
			'Overdue by 2 working days'
		);
		expect(countdownLabel(countdown(plain, '2026-12-03', '2026-11-23', 'calendar'))).toBe(
			'10 days left'
		);
		expect(countdownLabel(countdown(plain, '2026-11-22', '2026-11-20'))).toBe(
			'Due before next working day'
		);
	});
});

describe('evaluateSteps', () => {
	const base = {
		rollForward: true,
		extendedTo: null,
		completion: null,
		completedOn: null,
		startedOn: null
	};
	const steps: StepRecord[] = [
		{
			...base,
			id: 'a',
			position: 1,
			name: 'Step 1: File grievance',
			party: 'union',
			days: 10,
			dayType: 'business',
			startedOn: '2026-11-02',
			completedOn: '2026-11-10',
			completion: 'done'
		},
		{
			...base,
			id: 'b',
			position: 2,
			name: 'Step 1: Management answer',
			party: 'management',
			days: 5,
			dayType: 'business',
			startedOn: '2026-11-10'
		},
		{
			...base,
			id: 'c',
			position: 3,
			name: 'Step 2: Appeal',
			party: 'union',
			days: 7,
			dayType: 'business'
		}
	];

	it('marks finished, active and pending steps and computes the running clock', () => {
		const view = evaluateSteps(federal, steps, '2026-11-13');
		expect(view.steps.map((s) => s.state)).toEqual(['done', 'active', 'pending']);
		expect(view.steps[0].deadline?.due).toBe('2026-11-17'); // skips Veterans Day
		expect(view.steps[0].onTime).toBe(true);
		expect(view.current?.id).toBe('b');
		expect(view.current?.effectiveDue).toBe('2026-11-18');
		expect(view.current?.countdown?.workingDaysLeft).toBe(3);
		expect(view.current?.countdown?.urgency).toBe('soon');
		expect(view.next?.id).toBe('c');
	});

	it('lets an agreed extension override the computed deadline', () => {
		const extended = steps.map((s) => (s.id === 'b' ? { ...s, extendedTo: '2026-12-01' } : s));
		const view = evaluateSteps(federal, extended, '2026-11-13');
		expect(view.current?.effectiveDue).toBe('2026-12-01');
		expect(view.current?.countdown?.urgency).toBe('ok');
	});

	it('flags late completions', () => {
		const late = steps.map((s) => (s.id === 'a' ? { ...s, completedOn: '2026-11-19' } : s));
		const view = evaluateSteps(federal, late, '2026-11-20');
		expect(view.steps[0].onTime).toBe(false);
		expect(view.steps[0].lateBy).toBe(2);
	});

	it('stops the clock when the case is closed', () => {
		const view = evaluateSteps(federal, steps, '2026-11-13', false);
		expect(view.current).toBeNull();
		expect(view.steps[1].countdown).toBeNull();
	});

	it('starts the next clock from the missed due date when management does not answer', () => {
		expect(nextTriggerDate('no_response', '2026-11-25', '2026-11-18')).toBe('2026-11-18');
		expect(nextTriggerDate('done', '2026-11-16', '2026-11-18')).toBe('2026-11-16');
		expect(nextTriggerDate('skipped', '2026-11-16', null)).toBe('2026-11-16');
	});
});

describe('holidayRuleKey', () => {
	it('ignores key order, observed rules and zero offsets', () => {
		expect(holidayRuleKey({ kind: 'fixed', month: 7, day: 4, observed: 'federal' })).toBe(
			holidayRuleKey(JSON.parse('{"day":4,"kind":"fixed","month":7}') as HolidayRule)
		);
		expect(holidayRuleKey({ kind: 'nth_weekday', month: 11, weekday: 4, n: 4, offset: 0 })).toBe(
			holidayRuleKey({ kind: 'nth_weekday', month: 11, weekday: 4, n: 4 })
		);
		expect(
			holidayRuleKey({ kind: 'nth_weekday', month: 11, weekday: 4, n: 4, offset: 1 })
		).not.toBe(holidayRuleKey({ kind: 'nth_weekday', month: 11, weekday: 4, n: 4 }));
	});
});
