CREATE TABLE "trend_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"kind" text,
	"window_months" integer NOT NULL,
	"cache_key" text NOT NULL,
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
ALTER TABLE "trend_reads" ADD CONSTRAINT "trend_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trend_reads_cache_idx" ON "trend_reads" USING btree ("cache_key","created_at");