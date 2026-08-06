-- Auto-generated, one manual fix applied after: drizzle-kit stamped this
-- migration's journal "when" with the real generation timestamp
-- (1785945236767), which landed BEFORE 0007's hand-set timestamp
-- (1786007732000 — itself downstream of the future-dated 0005/0006 landmine
-- documented in 0005_dimension_restraint.sql). Left alone, this migration
-- would have silently no-op'd exactly like 0006 did. Bumped to 1786007733000
-- in meta/_journal.json before running `drizzle-kit migrate`.
CREATE TABLE "rights_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question" text NOT NULL,
	"country" text NOT NULL,
	"result" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question" text NOT NULL,
	"tool" text,
	"version" text,
	"asset_id" uuid,
	"cache_key" text,
	"status" "analysis_status" DEFAULT 'queued' NOT NULL,
	"stage" text,
	"digest" text,
	"result" jsonb,
	"sources" jsonb,
	"model" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "original_name" text;--> statement-breakpoint
ALTER TABLE "rights_answers" ADD CONSTRAINT "rights_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_answers" ADD CONSTRAINT "tool_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_answers" ADD CONSTRAINT "tool_answers_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rights_answers_user_created_idx" ON "rights_answers" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tool_answers_cache_idx" ON "tool_answers" USING btree ("cache_key","created_at");--> statement-breakpoint
CREATE INDEX "tool_answers_user_created_idx" ON "tool_answers" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "analyses_asset_created_idx" ON "analyses" USING btree ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_user_created_idx" ON "assets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "originality_checks_user_created_idx" ON "originality_checks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "trend_reads_user_created_idx" ON "trend_reads" USING btree ("user_id","created_at");