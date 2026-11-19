import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	customType,
	date,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import type { HolidayRule } from '../../deadlines/holidays';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType: () => 'bytea'
});

const tsvector = customType<{ data: string }>({
	dataType: () => 'tsvector'
});

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
};

export const userRole = pgEnum('user_role', ['admin', 'steward']);
export const party = pgEnum('party', ['union', 'management']);
export const dayType = pgEnum('day_type', ['business', 'calendar']);
export const contractStatus = pgEnum('contract_status', ['draft', 'active', 'archived']);
export const stepOrigin = pgEnum('step_origin', ['rules', 'llm', 'manual']);
export const caseStatus = pgEnum('case_status', ['open', 'closed']);
export const caseOutcome = pgEnum('case_outcome', ['sustained', 'settled', 'denied', 'withdrawn']);
export const stepCompletion = pgEnum('step_completion', ['done', 'no_response', 'skipped']);
export const entryKind = pgEnum('entry_kind', [
	'created',
	'note',
	'photo',
	'witness',
	'weingarten',
	'document',
	'call',
	'step',
	'extension',
	'handoff',
	'status'
]);

// ─── People ──────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	phone: text('phone'),
	role: userRole('role').notNull().default('steward'),
	passwordHash: text('password_hash').notNull(),
	active: boolean('active').notNull().default(true),
	/** Secret for the read-only deadline calendar feed. */
	calendarToken: text('calendar_token').notNull().unique(),
	lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
	...timestamps
});

export const sessions = pgTable(
	'sessions',
	{
		/** SHA-256 of the cookie token; the raw token is never stored. */
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		userAgent: text('user_agent'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

/** One row: the local this installation serves. */
export const settings = pgTable(
	'settings',
	{
		id: integer('id').primaryKey().default(1),
		localName: text('local_name').notNull(),
		unionName: text('union_name').notNull().default(''),
		timezone: text('timezone').notNull().default('America/New_York'),
		...timestamps
	},
	(t) => [check('settings_singleton', sql`${t.id} = 1`)]
);

// ─── Contracts ───────────────────────────────────────────────────────────────

export interface ExtractionNotes {
	warnings: string[];
	ignored: { source: string; phrase: string; reason: string }[];
	defaultDayType: 'business' | 'calendar' | null;
	defaultDayTypeSource: string | null;
	llm?: { model: string; ok: boolean; message?: string };
}

export const contracts = pgTable('contracts', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	employer: text('employer').notNull().default(''),
	effectiveDate: date('effective_date', { mode: 'string' }),
	expirationDate: date('expiration_date', { mode: 'string' }),
	status: contractStatus('status').notNull().default('draft'),
	/** Days of the week that are working days (0 = Sunday … 6 = Saturday). */
	workdays: integer('workdays')
		.array()
		.notNull()
		.default(sql`'{1,2,3,4,5}'::integer[]`),
	/** Calendar-day limits landing on a weekend/holiday move to the next working day. */
	rollForward: boolean('roll_forward').notNull().default(true),
	sourceText: text('source_text').notNull().default(''),
	sourceFilename: text('source_filename'),
	extraction: jsonb('extraction').$type<ExtractionNotes>(),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	activatedAt: timestamp('activated_at', { withTimezone: true }),
	...timestamps
});

export const contractSteps = pgTable(
	'contract_steps',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		contractId: uuid('contract_id')
			.notNull()
			.references(() => contracts.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		stage: text('stage').notNull(),
		name: text('name').notNull(),
		party: party('party').notNull(),
		days: integer('days').notNull(),
		dayType: dayType('day_type').notNull(),
		source: text('source'),
		phrase: text('phrase'),
		origin: stepOrigin('origin').notNull().default('manual'),
		confidence: text('confidence'),
		notes: text('notes')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
		confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
		...timestamps
	},
	(t) => [index('contract_steps_contract_idx').on(t.contractId, t.position)]
);

export const contractHolidays = pgTable(
	'contract_holidays',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		contractId: uuid('contract_id')
			.notNull()
			.references(() => contracts.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		rule: jsonb('rule').$type<HolidayRule>().notNull(),
		matched: text('matched'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('contract_holidays_contract_idx').on(t.contractId)]
);

export const contractArticles = pgTable(
	'contract_articles',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		contractId: uuid('contract_id')
			.notNull()
			.references(() => contracts.id, { onDelete: 'cascade' }),
		number: text('number').notNull(),
		title: text('title').notNull(),
		body: text('body').notNull().default(''),
		sort: integer('sort').notNull().default(0),
		search: tsvector('search').generatedAlwaysAs(
			sql`setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'C')`
		),
		...timestamps
	},
	(t) => [
		index('contract_articles_contract_idx').on(t.contractId, t.sort),
		index('contract_articles_search_idx').using('gin', t.search)
	]
);

// ─── Cases ───────────────────────────────────────────────────────────────────

export const cases = pgTable(
	'cases',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** Human-friendly number, e.g. 2026-014. */
		number: text('number').notNull(),
		title: text('title').notNull(),
		contractId: uuid('contract_id')
			.notNull()
			.references(() => contracts.id, { onDelete: 'restrict' }),
		grievantName: text('grievant_name').notNull(),
		grievantContact: text('grievant_contact').notNull().default(''),
		department: text('department').notNull().default(''),
		supervisor: text('supervisor').notNull().default(''),
		incidentDate: date('incident_date', { mode: 'string' }).notNull(),
		/** When the grievant knew or should have known — many contracts start the clock here. */
		awareDate: date('aware_date', { mode: 'string' }),
		summary: text('summary').notNull().default(''),
		remedy: text('remedy').notNull().default(''),
		stewardId: uuid('steward_id').references(() => users.id, { onDelete: 'set null' }),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
		status: caseStatus('status').notNull().default('open'),
		outcome: caseOutcome('outcome'),
		resolution: text('resolution').notNull().default(''),
		closedOn: date('closed_on', { mode: 'string' }),
		search: tsvector('search').generatedAlwaysAs(
			sql`setweight(to_tsvector('english', coalesce("number", '') || ' ' || coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("summary", '') || ' ' || coalesce("resolution", '')), 'B') || setweight(to_tsvector('english', coalesce("remedy", '') || ' ' || coalesce("department", '') || ' ' || coalesce("grievant_name", '') || ' ' || coalesce("supervisor", '')), 'C')`
		),
		...timestamps
	},
	(t) => [
		uniqueIndex('cases_number_idx').on(t.number),
		index('cases_status_idx').on(t.status),
		index('cases_steward_idx').on(t.stewardId),
		index('cases_search_idx').using('gin', t.search)
	]
);

export const caseSteps = pgTable(
	'case_steps',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		caseId: uuid('case_id')
			.notNull()
			.references(() => cases.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		stage: text('stage').notNull(),
		name: text('name').notNull(),
		party: party('party').notNull(),
		days: integer('days').notNull(),
		dayType: dayType('day_type').notNull(),
		rollForward: boolean('roll_forward').notNull().default(true),
		startedOn: date('started_on', { mode: 'string' }),
		completedOn: date('completed_on', { mode: 'string' }),
		completion: stepCompletion('completion'),
		extendedTo: date('extended_to', { mode: 'string' }),
		...timestamps
	},
	(t) => [index('case_steps_case_idx').on(t.caseId, t.position)]
);

export const caseArticles = pgTable(
	'case_articles',
	{
		caseId: uuid('case_id')
			.notNull()
			.references(() => cases.id, { onDelete: 'cascade' }),
		articleId: uuid('article_id')
			.notNull()
			.references(() => contractArticles.id, { onDelete: 'cascade' }),
		/** e.g. "Section 6.2 — overtime by seniority" */
		note: text('note').notNull().default('')
	},
	(t) => [
		primaryKey({ columns: [t.caseId, t.articleId] }),
		index('case_articles_article_idx').on(t.articleId)
	]
);

export type EntryData = {
	// witness
	witnessName?: string;
	witnessContact?: string;
	// weingarten
	attendees?: string;
	managementRep?: string;
	rightsAsserted?: boolean;
	questions?: string;
	// call
	contact?: string;
	// step / extension / status
	stepId?: string;
	completion?: 'done' | 'no_response' | 'skipped';
	extendedTo?: string;
	outcome?: string;
	// handoff
	fromUserId?: string | null;
	fromName?: string | null;
	toUserId?: string;
	toName?: string;
};

export const timelineEntries = pgTable(
	'timeline_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		caseId: uuid('case_id')
			.notNull()
			.references(() => cases.id, { onDelete: 'cascade' }),
		authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
		kind: entryKind('kind').notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
		title: text('title').notNull().default(''),
		body: text('body').notNull().default(''),
		data: jsonb('data').$type<EntryData>().notNull().default({}),
		/** Set by the offline outbox so a retried sync never creates a duplicate. */
		clientId: text('client_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('timeline_case_idx').on(t.caseId, t.occurredAt),
		uniqueIndex('timeline_client_idx').on(t.clientId)
	]
);

export const attachments = pgTable(
	'attachments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		caseId: uuid('case_id')
			.notNull()
			.references(() => cases.id, { onDelete: 'cascade' }),
		entryId: uuid('entry_id').references(() => timelineEntries.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		mimeType: text('mime_type').notNull(),
		size: integer('size').notNull(),
		/** Stored in Postgres so one pg_dump backs up the whole case file. */
		data: bytea('data').notNull(),
		uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('attachments_case_idx').on(t.caseId), index('attachments_entry_idx').on(t.entryId)]
);

export type User = typeof users.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type ContractStep = typeof contractSteps.$inferSelect;
export type ContractHoliday = typeof contractHolidays.$inferSelect;
export type ContractArticle = typeof contractArticles.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type CaseStep = typeof caseSteps.$inferSelect;
export type TimelineEntry = typeof timelineEntries.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type EntryKind = (typeof entryKind.enumValues)[number];
export type CaseOutcome = (typeof caseOutcome.enumValues)[number];
