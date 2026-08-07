CREATE TABLE "rebuild_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"parent_id" uuid,
	"image_url" text,
	"width" integer,
	"height" integer,
	"instruction" text,
	"label" text,
	"status" "analysis_status" DEFAULT 'queued' NOT NULL,
	"stage" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "layers" ADD COLUMN "version_id" uuid;--> statement-breakpoint
ALTER TABLE "rebuild_versions" ADD CONSTRAINT "rebuild_versions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rebuild_versions_analysis_created_idx" ON "rebuild_versions" USING btree ("analysis_id","created_at");--> statement-breakpoint
CREATE INDEX "layers_version_zindex_idx" ON "layers" USING btree ("version_id","z_index");