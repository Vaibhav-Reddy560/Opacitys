CREATE TABLE "daily_digest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"digest_date" date NOT NULL,
	"status" "analysis_status" DEFAULT 'queued' NOT NULL,
	"digest" text,
	"items" jsonb,
	"sources" jsonb,
	"model" text,
	"error" text,
	"tokens_used" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_digest_seen" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_seen_styles_at" timestamp,
	"last_seen_news_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "user_digest_seen" ADD CONSTRAINT "user_digest_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_digest_kind_date_idx" ON "daily_digest" USING btree ("kind","digest_date");