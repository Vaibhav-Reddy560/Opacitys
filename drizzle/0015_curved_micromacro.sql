CREATE TABLE "route_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brief" text NOT NULL,
	"deadline" text,
	"tools" text[],
	"skill_level" text,
	"status" "analysis_status" DEFAULT 'queued' NOT NULL,
	"stage" text,
	"result" jsonb,
	"model" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text,
	"revised_plan" jsonb,
	"change_summary" text,
	"status" "analysis_status" DEFAULT 'queued' NOT NULL,
	"stage" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_turns" ADD CONSTRAINT "route_turns_plan_id_route_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."route_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_plans_user_created_idx" ON "route_plans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "route_turns_plan_created_idx" ON "route_turns" USING btree ("plan_id","created_at");