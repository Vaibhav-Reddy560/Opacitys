DROP INDEX "trend_reads_user_tokens_idx";--> statement-breakpoint
ALTER TABLE "trend_reads" ADD COLUMN "rate_limit_reset_at" timestamp;--> statement-breakpoint
CREATE INDEX "trend_reads_created_tokens_idx" ON "trend_reads" USING btree ("created_at","tokens_used");--> statement-breakpoint
CREATE INDEX "trend_reads_reset_idx" ON "trend_reads" USING btree ("rate_limit_reset_at");