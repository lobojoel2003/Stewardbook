import { addDays, type ISODate } from './deadlines/dates';

export interface IcsEvent {
	uid: string;
	/** All-day event on this date. */
	date: ISODate;
	summary: string;
	description?: string;
	url?: string;
	/** Add a reminder this many days before (at 9:00 the day of the reminder). */
	alarmDaysBefore?: number;
}

export function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/\r?\n/g, '\\n')
		.replace(/([,;])/g, '\\$1');
}

/** Fold a content line to 75 octets per RFC 5545 §3.1, without splitting UTF-8 sequences. */
export function foldLine(line: string): string {
	const encoder = new TextEncoder();
	if (encoder.encode(line).length <= 75) return line;
	const out: string[] = [];
	let current = '';
	let size = 0;
	const limit = () => (out.length === 0 ? 75 : 74);
	for (const ch of line) {
		const n = encoder.encode(ch).length;
		if (size + n > limit()) {
			out.push(current);
			current = '';
			size = 0;
		}
		current += ch;
		size += n;
	}
	out.push(current);
	return out.join('\r\n ');
}

const compact = (d: ISODate) => d.replace(/-/g, '');

function stamp(now: Date): string {
	return now
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
}

export function buildIcs(calendarName: string, events: IcsEvent[], now: Date = new Date()): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Stewardbook//Grievance deadlines//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeIcsText(calendarName)}`,
		'X-PUBLISHED-TTL:PT1H'
	];
	for (const e of events) {
		lines.push(
			'BEGIN:VEVENT',
			`UID:${e.uid}`,
			`DTSTAMP:${stamp(now)}`,
			`DTSTART;VALUE=DATE:${compact(e.date)}`,
			`DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`,
			`SUMMARY:${escapeIcsText(e.summary)}`,
			'TRANSP:TRANSPARENT'
		);
		if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
		if (e.url) lines.push(`URL:${e.url}`);
		if (e.alarmDaysBefore && e.alarmDaysBefore > 0) {
			lines.push(
				'BEGIN:VALARM',
				'ACTION:DISPLAY',
				`DESCRIPTION:${escapeIcsText(e.summary)}`,
				`TRIGGER:-P${e.alarmDaysBefore}DT15H`,
				'END:VALARM'
			);
		}
		lines.push('END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	return lines.map(foldLine).join('\r\n') + '\r\n';
}
