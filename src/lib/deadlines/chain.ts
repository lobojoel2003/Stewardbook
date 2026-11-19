import type { ISODate } from './dates';
import type { WorkCalendar } from './calendar';
import {
	computeDeadline,
	countdown,
	workingDaysBetween,
	type Countdown,
	type DayType,
	type Deadline
} from './engine';

export type Party = 'union' | 'management';

/** How a step was closed out. */
export type StepCompletion = 'done' | 'no_response' | 'skipped';

export type StepState = 'pending' | 'active' | 'done' | 'no_response' | 'skipped';

/** The persisted shape of one grievance step on a case. */
export interface StepRecord {
	id: string;
	position: number;
	name: string;
	party: Party;
	days: number;
	dayType: DayType;
	rollForward: boolean;
	startedOn: ISODate | null;
	completedOn: ISODate | null;
	completion: StepCompletion | null;
	/** A mutually agreed extension replaces the computed due date. */
	extendedTo: ISODate | null;
}

export interface StepView extends StepRecord {
	state: StepState;
	deadline: Deadline | null;
	/** The date that actually governs: an agreed extension, otherwise the computed deadline. */
	effectiveDue: ISODate | null;
	countdown: Countdown | null;
	/** For finished steps: whether the action happened on or before the effective due date. */
	onTime: boolean | null;
	/** Working days late, for steps completed after their deadline. */
	lateBy: number;
}

export interface ChainView {
	steps: StepView[];
	/** The step whose clock is running, if any. */
	current: StepView | null;
	/** The next step that will start once the current one is finished. */
	next: StepView | null;
}

export function evaluateSteps(
	cal: WorkCalendar,
	records: StepRecord[],
	today: ISODate,
	caseOpen = true
): ChainView {
	const sorted = [...records].sort((a, b) => a.position - b.position);
	const steps: StepView[] = sorted.map((r) => {
		const deadline = r.startedOn
			? computeDeadline(cal, {
					trigger: r.startedOn,
					days: r.days,
					dayType: r.dayType,
					rollForward: r.rollForward
				})
			: null;
		const effectiveDue = r.extendedTo ?? deadline?.due ?? null;
		let state: StepState = 'pending';
		if (r.completedOn)
			state =
				r.completion === 'no_response'
					? 'no_response'
					: r.completion === 'skipped'
						? 'skipped'
						: 'done';
		else if (r.startedOn) state = 'active';

		const finished = state === 'done' && r.completedOn && effectiveDue;
		const onTime = finished ? r.completedOn! <= effectiveDue : null;
		const lateBy = finished && !onTime ? workingDaysBetween(cal, effectiveDue, r.completedOn!) : 0;

		return {
			...r,
			state,
			deadline,
			effectiveDue,
			countdown:
				state === 'active' && caseOpen && effectiveDue
					? countdown(cal, effectiveDue, today, r.dayType)
					: null,
			onTime,
			lateBy
		};
	});
	const currentIndex = caseOpen ? steps.findIndex((s) => s.state === 'active') : -1;
	const current = currentIndex >= 0 ? steps[currentIndex] : null;
	const next =
		currentIndex >= 0
			? (steps.slice(currentIndex + 1).find((s) => s.state === 'pending') ?? null)
			: null;
	return { steps, current, next };
}

/**
 * When a step closes, the clock for the next step starts from:
 * - the date the action happened, for a normal completion or a skip;
 * - the governing due date, when management failed to answer — most contracts let the
 *   union advance a grievance once the answer period runs out.
 */
export function nextTriggerDate(
	completion: StepCompletion,
	completedOn: ISODate,
	effectiveDue: ISODate | null
): ISODate {
	if (completion === 'no_response' && effectiveDue) return effectiveDue;
	return completedOn;
}

export const PARTY_LABELS: Record<Party, string> = {
	union: 'Union',
	management: 'Management'
};

export const DAY_TYPE_LABELS: Record<DayType, string> = {
	business: 'working days',
	calendar: 'calendar days'
};
