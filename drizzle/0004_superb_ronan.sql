CREATE TABLE "style_reads" (
	"analysis_id" uuid PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "originality_checks" ALTER COLUMN "asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "kind" text DEFAULT 'critique' NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "originality_checks" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "originality_checks" ADD COLUMN "input_text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "originality_checks" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "originality_checks" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "originality_checks" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "style_scores" ADD COLUMN "evidence" jsonb;--> statement-breakpoint
ALTER TABLE "style_reads" ADD CONSTRAINT "style_reads_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "originality_checks" ADD CONSTRAINT "originality_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_taxonomy" ADD CONSTRAINT "style_taxonomy_name_unique" UNIQUE("name");