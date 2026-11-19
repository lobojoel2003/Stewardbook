import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

let client: postgres.Sql | null = null;
let instance: Database | null = null;

/**
 * Open the connection pool. Called once from the server `init` hook, and by
 * scripts (seed, tests) that run outside SvelteKit.
 */
export function connect(url: string | undefined, options: { max?: number } = {}): Database {
	if (instance) return instance;
	if (!url) throw new Error('DATABASE_URL is not set. See .env.example.');
	client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
	instance = drizzle(client, { schema });
	return instance;
}

export function isConnected(): boolean {
	return instance !== null;
}

export async function disconnect(): Promise<void> {
	await client?.end({ timeout: 5 });
	client = null;
	instance = null;
}

export async function runMigrations(migrationsFolder: string): Promise<void> {
	if (!instance) throw new Error('Call connect() before runMigrations()');
	await migrate(instance, { migrationsFolder });
}

/** The shared database handle. Throws if `connect()` hasn't run. */
export const db: Database = new Proxy({} as Database, {
	get(_target, prop) {
		if (!instance) throw new Error('Database is not connected yet');
		const value: unknown = Reflect.get(instance, prop, instance);
		return typeof value === 'function'
			? (value as (...args: unknown[]) => unknown).bind(instance)
			: value;
	}
});

export { schema };
