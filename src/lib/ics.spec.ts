import { describe, expect, it } from 'vitest';
import { buildIcs, escapeIcsText, foldLine } from './ics';

describe('ics', () => {
	it('escapes text values', () => {
		expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
	});

	it('folds long lines at 75 octets without splitting characters', () => {
		const long = 'SUMMARY:' + 'é'.repeat(60);
		const folded = foldLine(long);
		const parts = folded.split('\r\n ');
		expect(parts.length).toBeGreaterThan(1);
		for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
		expect(parts.join('')).toBe(long);
	});

	it('builds all-day events with reminders', () => {
		const ics = buildIcs(
			'Local 512 deadlines',
			[
				{
					uid: 'step-1@stewardbook',
					date: '2026-12-01',
					summary: 'Case 2026-001: File grievance',
					description: 'Union must act',
					url: 'https://example.org/cases/1',
					alarmDaysBefore: 2
				}
			],
			new Date('2026-11-19T12:00:00Z')
		);
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics).toContain('DTSTART;VALUE=DATE:20261201\r\n');
		expect(ics).toContain('DTEND;VALUE=DATE:20261202\r\n');
		expect(ics).toContain('DTSTAMP:20261119T120000Z\r\n');
		expect(ics).toContain('SUMMARY:Case 2026-001: File grievance\r\n');
		expect(ics).toContain('TRIGGER:-P2DT15H\r\n');
		expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
	});
});
