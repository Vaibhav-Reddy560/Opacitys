ALTER TABLE "client_messages" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "iteration_number" integer;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "responded_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "turnaround_minutes" integer;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_translations" ADD CONSTRAINT "client_translations_message_id_unique" UNIQUE("message_id");--> statement-breakpoint
CREATE INDEX "client_messages_user_created_idx" ON "client_messages" USING btree ("user_id","created_at");
