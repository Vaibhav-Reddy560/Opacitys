CREATE TYPE "public"."analysis_status" AS ENUM('queued', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."dimension" AS ENUM('hierarchy', 'color', 'typography', 'layout', 'spacing', 'balance', 'originality');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'major', 'minor');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"status" "analysis_status" DEFAULT 'queued' NOT NULL,
	"pipeline_version" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer,
	"height" integer,
	"phash" text,
	"embedding" vector(768),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"channel" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"filtered" jsonb,
	"actionable_steps" jsonb,
	"pushback_script" text
);
--> statement-breakpoint
CREATE TABLE "critique_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"critique_id" uuid NOT NULL,
	"dimension" "dimension" NOT NULL,
	"severity" "severity" NOT NULL,
	"bbox" jsonb NOT NULL,
	"principle_id" uuid,
	"measured" jsonb NOT NULL,
	"message" text NOT NULL,
	"fix" text NOT NULL,
	"confidence" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "critiques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"overall_score" real NOT NULL,
	"dimension_scores" jsonb NOT NULL,
	"summary" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_principles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"canonical_text" text NOT NULL,
	"source" text,
	"citations" jsonb,
	"embedding" vector(768),
	CONSTRAINT "design_principles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "designer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"skill_level" text,
	"tools" text[],
	"style_vector" vector(768),
	"taste_prefs" jsonb
);
--> statement-breakpoint
CREATE TABLE "document_ops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"op" "bytea" NOT NULL,
	"actor" text,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"yjs_state" "bytea",
	"snapshot" jsonb,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"parent_id" uuid,
	"z_index" integer NOT NULL,
	"kind" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"style" jsonb,
	"mask_key" text,
	"confidence" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "originality_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"nearest" jsonb,
	"saturation_score" real
);
--> statement-breakpoint
CREATE TABLE "portfolio_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"oauth_token_enc" text NOT NULL,
	"last_sync" timestamp
);
--> statement-breakpoint
CREATE TABLE "portfolio_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"views" integer,
	"likes" integer,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_name" text,
	"brief" text,
	"specs" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"taxonomy_id" uuid NOT NULL,
	"weight" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_taxonomy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"era" text,
	"exemplar_keys" text[],
	"embedding" vector(768)
);
--> statement-breakpoint
CREATE TABLE "tool_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" text NOT NULL,
	"version" text,
	"feature" text NOT NULL,
	"ui_path" jsonb,
	"screenshot_key" text,
	"source_url" text,
	"verified_at" timestamp,
	"confidence" real
);
--> statement-breakpoint
CREATE TABLE "trend_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kind" text,
	"captured_at" timestamp DEFAULT now(),
	"content" text
);
--> statement-breakpoint
CREATE TABLE "trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"philosophy" text,
	"execution_steps" jsonb,
	"first_seen" timestamp,
	"momentum_score" real,
	"embedding" vector(768)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_translations" ADD CONSTRAINT "client_translations_message_id_client_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."client_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critique_findings" ADD CONSTRAINT "critique_findings_critique_id_critiques_id_fk" FOREIGN KEY ("critique_id") REFERENCES "public"."critiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critique_findings" ADD CONSTRAINT "critique_findings_principle_id_design_principles_id_fk" FOREIGN KEY ("principle_id") REFERENCES "public"."design_principles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critiques" ADD CONSTRAINT "critiques_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designer_profiles" ADD CONSTRAINT "designer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_ops" ADD CONSTRAINT "document_ops_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layers" ADD CONSTRAINT "layers_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "originality_checks" ADD CONSTRAINT "originality_checks_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_connections" ADD CONSTRAINT "portfolio_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_metrics" ADD CONSTRAINT "portfolio_metrics_connection_id_portfolio_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."portfolio_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_scores" ADD CONSTRAINT "style_scores_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_scores" ADD CONSTRAINT "style_scores_taxonomy_id_style_taxonomy_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."style_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_sources" ADD CONSTRAINT "trend_sources_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_phash_idx" ON "assets" USING btree ("phash");--> statement-breakpoint
CREATE INDEX "document_ops_doc_seq_idx" ON "document_ops" USING btree ("document_id","seq");