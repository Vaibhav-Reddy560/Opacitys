-- Auto-generated; journal "when" hand-bumped afterward, same as 0008.
-- drizzle-kit stamped this 1785951175506 (real clock), which sorts BEFORE
-- 0008's hand-set 1786007733000, and drizzle-orm skips any migration older
-- than the last applied one — it would have silently no-op'd exactly like
-- 0006 did. Bumped to 1786007734000 in meta/_journal.json before migrating.
-- See drizzle/0005_dimension_restraint.sql for the original landmine.
ALTER TABLE "assets" ADD COLUMN "facts" jsonb;--> statement-breakpoint
ALTER TABLE "designer_profiles" ADD COLUMN "portfolio_links" jsonb;--> statement-breakpoint
ALTER TABLE "designer_profiles" ADD COLUMN "narrative" text;--> statement-breakpoint
ALTER TABLE "designer_profiles" ADD COLUMN "narrative_basis" text;--> statement-breakpoint
ALTER TABLE "designer_profiles" ADD COLUMN "narrative_at" timestamp;--> statement-breakpoint
ALTER TABLE "designer_profiles" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_connections" ADD COLUMN "external_handle" text;--> statement-breakpoint
ALTER TABLE "portfolio_connections" ADD COLUMN "shots" jsonb;--> statement-breakpoint
CREATE INDEX "critique_findings_critique_idx" ON "critique_findings" USING btree ("critique_id");--> statement-breakpoint
CREATE INDEX "critiques_analysis_idx" ON "critiques" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "style_scores_analysis_idx" ON "style_scores" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "style_scores_taxonomy_idx" ON "style_scores" USING btree ("taxonomy_id");