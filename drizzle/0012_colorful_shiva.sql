ALTER TABLE "trend_reads" ADD COLUMN "tokens_used" integer;--> statement-breakpoint
CREATE INDEX "trend_reads_user_tokens_idx" ON "trend_reads" USING btree ("user_id","created_at","tokens_used");