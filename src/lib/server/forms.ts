import { isISODate } from '../deadlines/dates';

/** Small helpers for reading FormData safely. */
export function str(form: FormData, key: string, max = 10_000): string {
	const v = form.get(key);
	return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function optionalDate(form: FormData, key: string): string | null {
	const v = str(form, key, 20);
	return isISODate(v) ? v : null;
}

export function int(form: FormData, key: string): number | null {
	const v = str(form, key, 20);
	if (!/^-?\d+$/.test(v)) return null;
	return Number(v);
}

export function bool(form: FormData, key: string): boolean {
	const v = form.get(key);
	return v === 'on' || v === 'true' || v === '1';
}

export function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isUuid(value: string | null | undefined): value is string {
	return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
