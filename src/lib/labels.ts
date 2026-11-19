import type { StepCompletion } from './deadlines/chain';

export type Outcome = 'sustained' | 'settled' | 'denied' | 'withdrawn';

export const OUTCOME_LABELS: Record<Outcome, string> = {
	sustained: 'Won (sustained)',
	settled: 'Settled',
	denied: 'Denied',
	withdrawn: 'Withdrawn'
};

export const OUTCOME_SHORT: Record<Outcome, string> = {
	sustained: 'Won',
	settled: 'Settled',
	denied: 'Denied',
	withdrawn: 'Withdrawn'
};

export const OUTCOMES = Object.keys(OUTCOME_LABELS) as Outcome[];

export const COMPLETION_LABELS: Record<StepCompletion, string> = {
	done: 'Done',
	no_response: 'No response by the deadline',
	skipped: 'Skipped'
};

export type QuickEntryKind = 'note' | 'photo' | 'witness' | 'weingarten' | 'document' | 'call';

export const QUICK_ENTRY_KINDS: QuickEntryKind[] = [
	'note',
	'photo',
	'witness',
	'weingarten',
	'call',
	'document'
];

export const ENTRY_LABELS: Record<string, string> = {
	created: 'Case opened',
	note: 'Note',
	photo: 'Photo',
	witness: 'Witness statement',
	weingarten: 'Weingarten meeting',
	document: 'Document',
	call: 'Call or conversation',
	step: 'Step update',
	extension: 'Deadline extended',
	handoff: 'Handoff',
	status: 'Status change'
};

export const ENTRY_HINTS: Record<QuickEntryKind, string> = {
	note: 'Anything worth remembering',
	photo: 'Snap the posting, the schedule, the hazard',
	witness: 'Who saw it and what they said',
	weingarten: 'Investigatory interview notes',
	call: 'Calls with management or the grievant',
	document: 'PDF, letter, schedule, pay stub'
};
