// Drizzle schema for Opacitys.
//
// Phase 0/1 tables (users, assets, analyses, critiques, critique_findings,
// design_principles) are live from day one. Later-phase tables
// (style_taxonomy, layers, documents, trends, tool_knowledge, client_*,
// portfolio_*) are defined now so the schema doesn't need breaking
// migrations as each phase in the roadmap lands, but stay unused until
// their phase starts.
//
// Requires the pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  vector,
  index,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";

// bytea for Yjs binary state/ops (Phase 4+)
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const severityEnum = pgEnum("severity", ["critical", "major", "minor"]);
export const analysisStatusEnum = pgEnum("analysis_status", [
  "queued",
  "running",
  "complete",
  "failed",
]);
// Mirrors the live Postgres type, which is APPEND-ONLY: Postgres has no
// `DROP VALUE`, so retired dimensions stay in the type forever as orphans
// (see drizzle/0005_dimension_restraint.sql). "originality" and "depth" are
// historical — no analyzer produces them any more. The app-level source of
// truth for what a *current* critique dimension is, is `dimensionSchema` in
// src/lib/critique/types.ts (9 values, no "originality"/"depth"). These two
// lists are deliberately different sizes; do not "reconcile" them by
// deleting values here — that requires a create-new-type/drop-old migration
// this codebase has chosen not to do (see the migration file for why).
export const dimensionEnum = pgEnum("dimension", [
  "hierarchy",
  "color",
  "typography",
  "layout",
  "spacing",
  "balance",
  "originality",
  "rhythm",
  "contrast",
  "depth",
  "restraint",
]);

// ---------------------------------------------------------------------------
// Users & profiles
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  // Nullable: guest sessions (see src/lib/auth) create a user row with no
  // password at all, and the pre-existing demo-user row predates this
  // column. NULL means "cannot sign in with a password," not "unset."
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const designerProfiles = pgTable("designer_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  skillLevel: text("skill_level"),
  tools: text("tools").array(),
  styleVector: vector("style_vector", { dimensions: 768 }),
  tastePrefs: jsonb("taste_prefs"),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clientName: text("client_name"),
  brief: text("brief"),
  specs: jsonb("specs"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Assets & analysis (Phase 0/1 core)
// ---------------------------------------------------------------------------

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    phash: text("phash"),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("assets_phash_idx").on(t.phash)],
);

export const analyses = pgTable("analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  // Which module this measurement pass belongs to — critique, identify, or
  // (image-attached) originality — all three share the same Track A
  // measurement layer and analyses/assets tables.
  kind: text("kind").notNull().default("critique"),
  status: analysisStatusEnum("status").notNull().default("queued"),
  pipelineVersion: text("pipeline_version").notNull(),
  raw: jsonb("raw"), // full Track A analyzer output
  // Real failure reason for a `failed` status — surfaced to the user
  // instead of a generic "something went wrong".
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Critique (Phase 1 — the v1 moat)
// ---------------------------------------------------------------------------

export const designPrinciples = pgTable("design_principles", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Stable human key the VLM references in prompts/output, e.g.
  // "wcag-contrast-aa" — the VLM never sees or invents the uuid.
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  canonicalText: text("canonical_text").notNull(),
  source: text("source"),
  citations: jsonb("citations"),
  embedding: vector("embedding", { dimensions: 768 }),
});

export const critiques = pgTable("critiques", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisId: uuid("analysis_id")
    .notNull()
    .references(() => analyses.id, { onDelete: "cascade" }),
  overallScore: real("overall_score").notNull(),
  dimensionScores: jsonb("dimension_scores").notNull(),
  summary: text("summary").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const critiqueFindings = pgTable("critique_findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  critiqueId: uuid("critique_id")
    .notNull()
    .references(() => critiques.id, { onDelete: "cascade" }),
  dimension: dimensionEnum("dimension").notNull(),
  severity: severityEnum("severity").notNull(),
  // [x, y, w, h] in source-image pixel space — always from Track A, never the VLM
  bbox: jsonb("bbox").notNull(),
  principleId: uuid("principle_id").references(() => designPrinciples.id),
  measured: jsonb("measured").notNull(), // { value, expected: [min,max], unit }
  message: text("message").notNull(),
  fix: text("fix").notNull(),
  confidence: real("confidence").notNull(),
});

// ---------------------------------------------------------------------------
// Style taxonomy — Identify
// ---------------------------------------------------------------------------

export const styleTaxonomy = pgTable("style_taxonomy", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Unique so the curated list in src/lib/identify/taxonomy.ts can upsert
  // idempotently on first use — no separate seed migration/script needed.
  name: text("name").notNull().unique(),
  description: text("description"),
  era: text("era"),
  exemplarKeys: text("exemplar_keys").array(),
  embedding: vector("embedding", { dimensions: 768 }),
});

export const styleScores = pgTable("style_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisId: uuid("analysis_id")
    .notNull()
    .references(() => analyses.id, { onDelete: "cascade" }),
  taxonomyId: uuid("taxonomy_id")
    .notNull()
    .references(() => styleTaxonomy.id),
  weight: real("weight").notNull(), // e.g. 0.4 for "40% Swiss Typography"
  // Which measured facts / visual cues the read pointed to for this style —
  // shown to the user so "show the evidence" is actually true.
  evidence: jsonb("evidence"),
});

// One read (summary + which model produced it) per analysis — the weighted
// breakdown itself lives in style_scores, one row per style in the blend.
export const styleReads = pgTable("style_reads", {
  analysisId: uuid("analysis_id")
    .primaryKey()
    .references(() => analyses.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Decomposition & editor (Phase 4/5)
// ---------------------------------------------------------------------------

export const layers = pgTable("layers", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisId: uuid("analysis_id")
    .notNull()
    .references(() => analyses.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  zIndex: integer("z_index").notNull(),
  kind: text("kind").notNull(), // shape | text | image | gradient | effect
  geometry: jsonb("geometry").notNull(),
  style: jsonb("style"),
  maskKey: text("mask_key"),
  confidence: real("confidence").notNull(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  yjsState: bytea("yjs_state"),
  snapshot: jsonb("snapshot"),
  version: integer("version").notNull().default(1),
});

export const documentOps = pgTable(
  "document_ops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    op: bytea("op").notNull(),
    actor: text("actor"),
    ts: timestamp("ts").defaultNow().notNull(),
  },
  (t) => [index("document_ops_doc_seq_idx").on(t.documentId, t.seq)],
);

// ---------------------------------------------------------------------------
// Trends & originality (Phase 7)
// ---------------------------------------------------------------------------

export const trends = pgTable("trends", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  summary: text("summary"),
  philosophy: text("philosophy"),
  executionSteps: jsonb("execution_steps"),
  firstSeen: timestamp("first_seen"),
  momentumScore: real("momentum_score"),
  embedding: vector("embedding", { dimensions: 768 }),
});

export const trendSources = pgTable("trend_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  trendId: uuid("trend_id")
    .notNull()
    .references(() => trends.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  kind: text("kind"), // article | video | api | submission
  capturedAt: timestamp("captured_at").defaultNow(),
  content: text("content"),
});

export const originalityChecks = pgTable("originality_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Nullable: a check can be text-only (a described direction with no
  // sketch attached) — assetId is only set when an image was uploaded.
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
  inputText: text("input_text").notNull(),
  // Neighbours the model named, each { name, kind, era, whyClose, closeness }.
  nearest: jsonb("nearest"),
  // 0-100 "how crowded is this direction" read.
  saturationScore: real("saturation_score"),
  // Full structured result (distinctives, moves, confidence, basis) beyond
  // what nearest/saturationScore capture individually.
  result: jsonb("result"),
  model: text("model"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Tool knowledge, client translation, portfolio (Phase 3/8/9)
// ---------------------------------------------------------------------------

export const toolKnowledge = pgTable("tool_knowledge", {
  id: uuid("id").primaryKey().defaultRandom(),
  tool: text("tool").notNull(),
  version: text("version"),
  feature: text("feature").notNull(),
  uiPath: jsonb("ui_path"),
  screenshotKey: text("screenshot_key"),
  sourceUrl: text("source_url"),
  verifiedAt: timestamp("verified_at"),
  confidence: real("confidence"),
});

export const clientMessages = pgTable(
  "client_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Correspondence has no project-picker UI yet, so entries are scoped
    // directly to the user rather than a project — projectId stays for when
    // that lands, but nothing sets it today.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    rawText: text("raw_text").notNull(),
    channel: text("channel"),
    iterationNumber: integer("iteration_number"),
    respondedAt: timestamp("responded_at"),
    turnaroundMinutes: integer("turnaround_minutes"),
    priceCents: integer("price_cents"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("client_messages_user_created_idx").on(t.userId, t.createdAt)],
);

export const clientTranslations = pgTable(
  "client_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Unique so an entry has at most one interpretation — a re-run upserts
    // rather than accumulating duplicates.
    messageId: uuid("message_id")
      .notNull()
      .unique()
      .references(() => clientMessages.id, { onDelete: "cascade" }),
    filtered: jsonb("filtered"),
    actionableSteps: jsonb("actionable_steps"),
    pushbackScript: text("pushback_script"),
  },
);

export const portfolioConnections = pgTable("portfolio_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // behance | dribbble
  oauthTokenEnc: text("oauth_token_enc").notNull(),
  lastSync: timestamp("last_sync"),
});

export const portfolioMetrics = pgTable("portfolio_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => portfolioConnections.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  views: integer("views"),
  likes: integer("likes"),
  ts: timestamp("ts").defaultNow().notNull(),
});
