// Wipes the e2e database so every run starts from first-run setup.
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url || !/test|e2e|ci/i.test(url)) {
	console.error(`Refusing to reset a database that doesn't look like a test database: ${url}`);
	process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql`drop schema if exists public cascade`;
await sql`drop schema if exists drizzle cascade`;
await sql`create schema public`;
await sql.end();
console.log('e2e database reset');
