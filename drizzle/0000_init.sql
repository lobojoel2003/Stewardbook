CREATE TYPE "public"."case_outcome" AS ENUM('sustained', 'settled', 'denied', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."day_type" AS ENUM('business', 'calendar');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('created', 'note', 'photo', 'witness', 'weingarten', 'document', 'call', 'step', 'extension', 'handoff', 'status');--> statement-breakpoint
CREATE TYPE "public"."party" AS ENUM('union', 'management');--> statement-breakpoint
CREATE TYPE "public"."step_completion" AS ENUM('done', 'no_response', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."step_origin" AS ENUM('rules', 'llm', 'manual');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'steward');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"entry_id" uuid,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_articles" (
	"case_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "case_articles_case_id_article_id_pk" PRIMARY KEY("case_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "case_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"stage" text NOT NULL,
	"name" text NOT NULL,
	"party" "party" NOT NULL,
	"days" integer NOT NULL,
	"day_type" "day_type" NOT NULL,
	"roll_forward" boolean DEFAULT true NOT NULL,
	"started_on" date,
	"completed_on" date,
	"completion" "step_completion",
	"extended_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"contract_id" uuid NOT NULL,
	"grievant_name" text NOT NULL,
	"grievant_contact" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"supervisor" text DEFAULT '' NOT NULL,
	"incident_date" date NOT NULL,
	"aware_date" date,
	"summary" text DEFAULT '' NOT NULL,
	"remedy" text DEFAULT '' NOT NULL,
	"steward_id" uuid,
	"created_by" uuid,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"outcome" "case_outcome",
	"resolution" text DEFAULT '' NOT NULL,
	"closed_on" date,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("number", '') || ' ' || coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("summary", '') || ' ' || coalesce("resolution", '')), 'B') || setweight(to_tsvector('english', coalesce("remedy", '') || ' ' || coalesce("department", '') || ' ' || coalesce("grievant_name", '') || ' ' || coalesce("supervisor", '')), 'C')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'C')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rule" jsonb NOT NULL,
	"matched" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"stage" text NOT NULL,
	"name" text NOT NULL,
	"party" "party" NOT NULL,
	"days" integer NOT NULL,
	"day_type" "day_type" NOT NULL,
	"source" text,
	"phrase" text,
	"origin" "step_origin" DEFAULT 'manual' NOT NULL,
	"confidence" text,
	"notes" text[] DEFAULT '{}'::text[] NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"employer" text DEFAULT '' NOT NULL,
	"effective_date" date,
	"expiration_date" date,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"workdays" integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL,
	"roll_forward" boolean DEFAULT true NOT NULL,
	"source_text" text DEFAULT '' NOT NULL,
	"source_filename" text,
	"extraction" jsonb,
	"created_by" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"local_name" text NOT NULL,
	"union_name" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "timeline_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" "entry_kind" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"role" "user_role" DEFAULT 'steward' NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"calendar_token" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_calendar_token_unique" UNIQUE("calendar_token")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_entry_id_timeline_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."timeline_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_articles" ADD CONSTRAINT "case_articles_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_articles" ADD CONSTRAINT "case_articles_article_id_contract_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."contract_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_steward_id_users_id_fk" FOREIGN KEY ("steward_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_articles" ADD CONSTRAINT "contract_articles_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_holidays" ADD CONSTRAINT "contract_holidays_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_steps" ADD CONSTRAINT "contract_steps_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_steps" ADD CONSTRAINT "contract_steps_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_case_idx" ON "attachments" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "attachments_entry_idx" ON "attachments" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "case_articles_article_idx" ON "case_articles" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "case_steps_case_idx" ON "case_steps" USING btree ("case_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_number_idx" ON "cases" USING btree ("number");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_steward_idx" ON "cases" USING btree ("steward_id");--> statement-breakpoint
CREATE INDEX "cases_search_idx" ON "cases" USING gin ("search");--> statement-breakpoint
CREATE INDEX "contract_articles_contract_idx" ON "contract_articles" USING btree ("contract_id","sort");--> statement-breakpoint
CREATE INDEX "contract_articles_search_idx" ON "contract_articles" USING gin ("search");--> statement-breakpoint
CREATE INDEX "contract_holidays_contract_idx" ON "contract_holidays" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_steps_contract_idx" ON "contract_steps" USING btree ("contract_id","position");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "timeline_case_idx" ON "timeline_entries" USING btree ("case_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_client_idx" ON "timeline_entries" USING btree ("client_id");