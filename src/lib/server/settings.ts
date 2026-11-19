import { eq } from 'drizzle-orm';
import { todayIn, isValidTimeZone } from '../deadlines/dates';
import { db } from './db';
import { settings } from './db/schema';

export interface LocalSettings {
	localName: string;
	unionName: string;
	timezone: string;
}

let cache: LocalSettings | null = null;
let fallbackTimezone = 'America/New_York';

export function setFallbackTimezone(tz: string): void {
	if (isValidTimeZone(tz)) fallbackTimezone = tz;
}

export async function getSettings(): Promise<LocalSettings | null> {
	if (cache) return cache;
	const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
	if (!row) return null;
	cache = { localName: row.localName, unionName: row.unionName, timezone: row.timezone };
	return cache;
}

export async function saveSettings(input: LocalSettings): Promise<LocalSettings> {
	const timezone = isValidTimeZone(input.timezone) ? input.timezone : fallbackTimezone;
	const values = { id: 1, localName: input.localName, unionName: input.unionName, timezone };
	await db
		.insert(settings)
		.values(values)
		.onConflictDoUpdate({
			target: settings.id,
			set: { localName: values.localName, unionName: values.unionName, timezone }
		});
	cache = { localName: values.localName, unionName: values.unionName, timezone };
	return cache;
}

export function clearSettingsCache(): void {
	cache = null;
}

export async function timezone(): Promise<string> {
	return (await getSettings())?.timezone ?? fallbackTimezone;
}

/** Today's date in the local's timezone. */
export async function today(): Promise<string> {
	return todayIn(await timezone());
}
