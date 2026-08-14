ALTER TABLE "rebuild_versions" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "rebuild_versions" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "rebuild_versions" ADD COLUMN "changed_ratio" real;--> statement-breakpoint
ALTER TABLE "rebuild_versions" ADD COLUMN "attempts" integer;--> statement-breakpoint
ALTER TABLE "rebuild_versions" ADD COLUMN "font_note" text;