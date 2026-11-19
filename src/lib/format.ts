const dateTime = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
});
const timeOnly = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const dayOnly = new Intl.DateTimeFormat('en-US', {
	weekday: 'short',
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});

export function formatDateTime(value: Date | string): string {
	return dateTime.format(new Date(value));
}

export function formatTime(value: Date | string): string {
	return timeOnly.format(new Date(value));
}

export function formatDay(value: Date | string): string {
	return dayOnly.format(new Date(value));
}

export function relativeTime(value: Date | string, now: Date = new Date()): string {
	const diff = (new Date(value).getTime() - now.getTime()) / 1000;
	const abs = Math.abs(diff);
	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	if (abs < 60) return 'just now';
	if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
	if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
	if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
	return formatDay(value);
}

export function fileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
	return `${n} ${n === 1 ? word : pluralWord}`;
}

/** A local datetime-local input value for "now". */
export function nowLocalInput(now: Date = new Date()): string {
	const offset = now.getTimezoneOffset() * 60_000;
	return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0].toUpperCase())
		.join('');
}
