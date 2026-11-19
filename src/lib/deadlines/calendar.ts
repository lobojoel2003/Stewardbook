import { weekday, yearOf, type ISODate } from './dates';
import { holidaysInYear, type HolidayDef, type ResolvedHoliday } from './holidays';

/** Monday–Friday, the default work week for grievance time limits. */
export const DEFAULT_WORKDAYS: readonly number[] = [1, 2, 3, 4, 5];

export interface CalendarConfig {
	/** Days of the week that count as working days (0 = Sunday … 6 = Saturday). */
	workdays?: readonly number[];
	/** Contract holidays. */
	holidays?: readonly HolidayDef[];
}

export type NonWorkingReason =
	{ type: 'weekend'; weekday: number } | { type: 'holiday'; name: string; actual?: ISODate };

/**
 * A working-day calendar for one contract: which weekdays are worked and which
 * dates are contract holidays. Holiday dates are resolved lazily per year and cached.
 */
export class WorkCalendar {
	readonly workdays: ReadonlySet<number>;
	readonly holidays: readonly HolidayDef[];
	#years = new Map<number, Map<ISODate, ResolvedHoliday>>();

	constructor(config: CalendarConfig = {}) {
		const days = (config.workdays ?? DEFAULT_WORKDAYS).filter(
			(d) => Number.isInteger(d) && d >= 0 && d <= 6
		);
		if (days.length === 0) throw new RangeError('A work week needs at least one working day');
		this.workdays = new Set(days);
		this.holidays = config.holidays ?? [];
	}

	#yearMap(year: number): Map<ISODate, ResolvedHoliday> {
		let map = this.#years.get(year);
		if (!map) {
			map = new Map();
			for (const h of holidaysInYear([...this.holidays], year)) {
				if (!map.has(h.date)) map.set(h.date, h);
			}
			this.#years.set(year, map);
		}
		return map;
	}

	holiday(date: ISODate): ResolvedHoliday | undefined {
		return this.#yearMap(yearOf(date)).get(date);
	}

	holidaysIn(year: number): ResolvedHoliday[] {
		return [...this.#yearMap(year).values()];
	}

	/** Why a date is not a working day, or null if it is one. */
	nonWorkingReason(date: ISODate): NonWorkingReason | null {
		const dow = weekday(date);
		if (!this.workdays.has(dow)) return { type: 'weekend', weekday: dow };
		const h = this.holiday(date);
		if (h) return { type: 'holiday', name: h.name, actual: h.actual };
		return null;
	}

	isWorkingDay(date: ISODate): boolean {
		return this.nonWorkingReason(date) === null;
	}
}
