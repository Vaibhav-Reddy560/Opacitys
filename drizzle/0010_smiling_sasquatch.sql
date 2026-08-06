ALTER TABLE "analyses" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "layers" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "layers" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "layers" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "layers_analysis_zindex_idx" ON "layers" USING btree ("analysis_id","z_index");