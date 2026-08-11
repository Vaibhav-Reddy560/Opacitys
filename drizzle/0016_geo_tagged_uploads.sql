ALTER TABLE "assets" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "location_accuracy" double precision;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "place_label" text;--> statement-breakpoint
CREATE INDEX "assets_user_located_idx" ON "assets" USING btree ("user_id","latitude");