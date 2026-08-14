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
  date,
  integer,
  real,
  doublePrecision,
  boolean,
  jsonb,
  vector,
  index,
  uniqueIndex,
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
  // Nullable: only set once a user has actually signed in via Firebase.
  // Existing rows from the pre-Firebase (email+password) system are matched
  // and adopted by email on their first Google sign-in — see
  // src/app/api/auth/google/route.ts — so this starts NULL for them too.
  firebaseUid: text("firebase_uid").unique(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// The Fingerprint module's stored half. Everything measured (style
// signature, craft scores, palette) is DERIVED on read from assets/analyses
// — see src/lib/profile/fingerprint.ts — and deliberately not cached here:
// it's cheap at this data volume and a stale copy of a number the user can
// also see computed elsewhere is worse than no copy.
//
// What lives here is only what CANNOT be derived: what the designer told us
// about themselves, and the one expensive thing (the written read) that
// would otherwise re-bill a model call on every page view.
export const designerProfiles = pgTable("designer_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Self-reported, never inferred — a critique score says nothing about
  // which apps someone owns. The UI labels these as self-reported.
  skillLevel: text("skill_level"),
  tools: text("tools").array(),
  // [{ label, url }] — Behance's public API is closed and Dribbble v2 no
  // longer returns view/like counts, so a plain link is the honest ceiling
  // for most platforms. Dribbble alone can also be connected properly, via
  // portfolioConnections below.
  portfolioLinks: jsonb("portfolio_links"),
  // The cached written read of the fingerprint. `narrativeBasis` is a hash
  // of the aggregate it was generated from: when the live aggregate hashes
  // differently, the UI knows the prose is stale and offers a refresh,
  // rather than silently re-billing a model call on every visit.
  narrative: text("narrative"),
  narrativeBasis: text("narrative_basis"),
  narrativeAt: timestamp("narrative_at"),
  styleVector: vector("style_vector", { dimensions: 768 }),
  tastePrefs: jsonb("taste_prefs"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
    // The filename the browser reported at upload time — purely for display
    // in the library grid (src/lib/library). Never used for storage paths or
    // any lookup, so it's safe to be whatever the user's OS called the file.
    originalName: text("original_name"),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    // MeasuredFacts (src/lib/measure/facts.ts) — palette, contrast, type
    // sizes, alignment, spacing. Lives on the ASSET, not on an analysis:
    // these describe the image itself, identically no matter which module
    // measured it, and `analyses` has no user_id (ownership there is a
    // 3-hop join), which would make every Fingerprint palette query a join.
    // Written opportunistically by critique/identify/originality, all of
    // which already compute it, and backfilled by
    // scripts/backfill-asset-facts.ts for rows that predate this column.
    facts: jsonb("facts"),
    phash: text("phash"),
    embedding: vector("embedding", { dimensions: 768 }),
    // Where the uploader was when they added this image — the browser's own
    // Geolocation API at upload time, NOT EXIF (that's where a photo was
    // TAKEN, often stripped by the OS, and doesn't exist at all for a
    // screenshot or an exported Figma frame — the app's actual common
    // case). doublePrecision, not `real`: `real` is float4 (~7 significant
    // digits), too coarse for a longitude like -122.4194182734912.
    // Nullable forever — every asset uploaded before this shipped has no
    // location and never can, and a denied permission prompt must still
    // produce a normal upload.
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    // Metres, straight from the browser's own `coords.accuracy`. Kept
    // because a desktop fix is IP-derived and can be tens of km off — the
    // UI shows "±34 km" rather than implying a precision the number
    // doesn't have.
    locationAccuracy: doublePrecision("location_accuracy"),
    // Reverse-geocoded "Bengaluru, India" (Nominatim). Cosmetic only —
    // filled in by after() once the upload response has already gone out,
    // so it can lag behind the coordinates or stay null without affecting
    // anything that reads lat/lng directly (the map).
    placeLabel: text("place_label"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("assets_phash_idx").on(t.phash),
    // Powers the library's "your uploads, newest first" listing — the only
    // per-user lookup on this table before now was the upload insert itself.
    index("assets_user_created_idx").on(t.userId, t.createdAt),
    // Powers the map view's "this user's located uploads" query.
    index("assets_user_located_idx").on(t.userId, t.latitude),
  ],
);

export const analyses = pgTable(
  "analyses",
  {
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
    // Real in-flight progress label for the SSE routes to surface, e.g.
    // Rebuild's "tracing" | "separating" | "naming". Text, not an enum — a
    // stage list is far more likely to change than a status list, same
    // reasoning as tool_answers.stage below. Critique/Identify don't write
    // this yet; their stream route still infers progress from
    // pipelineVersion, but the column is here for them to adopt later.
    stage: text("stage"),
    // Real failure reason for a `failed` status — surfaced to the user
    // instead of a generic "something went wrong".
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // No user_id on this table — ownership is only reachable via
    // asset_id -> assets.user_id (see src/lib/library/queries.ts). This
    // index is what keeps that join a single index scan instead of a
    // sequential scan per asset.
    index("analyses_asset_created_idx").on(t.assetId, t.createdAt),
  ],
);

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

export const critiques = pgTable(
  "critiques",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    overallScore: real("overall_score").notNull(),
    dimensionScores: jsonb("dimension_scores").notNull(),
    summary: text("summary").notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // Postgres does NOT auto-index foreign keys. Fingerprint's craft rollup
  // (src/lib/profile/fingerprint.ts) walks every critique a user owns via
  // this column, which seq-scanned before this index existed.
  (t) => [index("critiques_analysis_idx").on(t.analysisId)],
);

export const critiqueFindings = pgTable(
  "critique_findings",
  {
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
  },
  (t) => [index("critique_findings_critique_idx").on(t.critiqueId)],
);

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

export const styleScores = pgTable(
  "style_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    taxonomyId: uuid("taxonomy_id")
      .notNull()
      .references(() => styleTaxonomy.id),
    weight: real("weight").notNull(), // 0-1 (the model's 0-100 is divided at write time)
    // Which measured facts / visual cues the read pointed to for this style —
    // shown to the user so "show the evidence" is actually true.
    evidence: jsonb("evidence"),
  },
  // Both sides of Fingerprint's style-signature rollup: it groups every
  // score a user owns (analysisId) by style (taxonomyId). Neither was
  // indexed — see the note on critiques above.
  (t) => [
    index("style_scores_analysis_idx").on(t.analysisId),
    index("style_scores_taxonomy_idx").on(t.taxonomyId),
  ],
);

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

/**
 * One row per generated image in a Rebuild session — the version chain.
 *
 * Rebuild starts from an upload (version 0, `instruction` null) and every
 * edit produces a new row whose `parentId` points at the version it was
 * generated from. Editing is generative: the model returns a NEW image
 * rather than patching pixels, so each version owns its own image and its
 * own freshly-detected `layers` set.
 */
export const rebuildVersions = pgTable(
  "rebuild_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    // Self-reference left unenforced, same call as layers.parentId below —
    // a version chain is only ever walked from a known root.
    parentId: uuid("parent_id"),
    // Null until generation finishes; a queued/running row has no image yet.
    imageUrl: text("image_url"),
    width: integer("width"),
    height: integer("height"),
    instruction: text("instruction"), // null for the original upload
    label: text("label"), // short checkpoint name, e.g. "Button text updated"
    status: analysisStatusEnum("status").notNull().default("queued"),
    stage: text("stage"),
    error: text("error"),
    // How this version was produced, and what the app can actually prove
    // about it. These exist because the feature previously reported every
    // edit as a success without checking, and a version row carried no
    // record of what had made it — so a no-op and a real edit were
    // indistinguishable after the fact, in the UI and in the database.
    //
    // "text" for the deterministic path (measure the type, erase the glyphs,
    // re-set the line from font outlines — no model involved), otherwise the
    // image provider that ran.
    method: text("method"),
    model: text("model"),
    /** Fraction of the edited region that measurably changed. See lib/rebuild/verify.ts. */
    changedRatio: real("changed_ratio"),
    /** Generation attempts spent, including the ones that didn't land. */
    attempts: integer("attempts"),
    /**
     * What the text path substituted, in plain words — e.g. "Archivo 900,
     * 3.9% width match". Surfaced to the user rather than implying the
     * original typeface was reproduced exactly, which it never is.
     */
    fontNote: text("font_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("rebuild_versions_analysis_created_idx").on(t.analysisId, t.createdAt)],
);

/**
 * Rebuild's semantic layers — one row per element the detector found in a
 * given version's image (a logo, a button, a text block, a section).
 *
 * Several columns carry a different meaning than the Phase-0 design
 * intended, kept rather than renamed so the table and its migrations stay
 * stable:
 *   kind     -> logo | text | button | image | icon | shape | section | group
 *   geometry -> { bbox: [x, y, w, h] } in the version image's pixel space,
 *               plus an optional `mask` polygon when the detector returns one
 *   maskKey  -> the cropped THUMBNAIL's Blob URL (not a mask bitmap)
 *   name     -> the auto-numbered label ("text", "text 2", "button 3")
 *   parentId -> containment nesting ("navigation bar" owns "logo")
 * `style` and `confidence` still mean what they say. `geometry.d` (the old
 * vector path) is no longer written.
 */
export const layers = pgTable(
  "layers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    // Which version's image this layer was detected in. Nullable only
    // because rows written by the old vector pipeline predate versioning.
    versionId: uuid("version_id"),
    parentId: uuid("parent_id"),
    zIndex: integer("z_index").notNull(),
    kind: text("kind").notNull(),
    geometry: jsonb("geometry").notNull(),
    style: jsonb("style"),
    maskKey: text("mask_key"),
    confidence: real("confidence").notNull(),
    name: text("name"),
    note: text("note"),
    hidden: boolean("hidden").notNull().default(false),
  },
  (t) => [
    index("layers_analysis_zindex_idx").on(t.analysisId, t.zIndex),
    // The real read path now that layers are per-version: "every layer for
    // this version, in order".
    index("layers_version_zindex_idx").on(t.versionId, t.zIndex),
  ],
);

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

// One Currents read: a designer asked for a scope, we searched the live web
// for it and wrote up what's moving.
//
// This is deliberately NOT the same thing as `trends`/`trend_sources` below,
// and the two should not be "reconciled". Those model a *global, clustered*
// registry — one row per named current across all users, with an embedding,
// a momentum score and a first-seen date, built by the ingestion +
// clustering pipeline described in the Currents blueprint. This is a
// per-user, per-query read with no ingestion behind it. Same subject,
// different shape and different lifecycle.
export const trendReads = pgTable(
  "trend_reads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(), // what the designer typed, verbatim
    kind: text("kind"), // category | platform | brand | null (auto)
    windowMonths: integer("window_months").notNull(),
    // normalizeScope(scope)|kind|windowMonths — see src/lib/trends/read.ts.
    // Indexed with createdAt so the freshness lookup is one index scan.
    cacheKey: text("cache_key").notNull(),
    status: analysisStatusEnum("status").notNull().default("queued"),
    // "searching" | "writing". A plain text column rather than a new enum
    // deliberately: Postgres enums are append-only and a stage list is far
    // more likely to change than a status list.
    stage: text("stage"),
    digest: text("digest"), // pass-1 research prose, citation markers stripped
    result: jsonb("result"), // structured TrendRead
    // [{ title, url }] the model actually searched up or opened — the
    // whitelist every citation in `result` is validated against.
    sources: jsonb("sources"),
    model: text("model"),
    error: text("error"),
    // Real Groq token usage for this run (both passes combined, or whatever
    // pass 1 alone spent before a failure). The budget ledger in
    // pipeline.ts sums this GLOBALLY (across every user, over Groq's own
    // rolling 24h window) before starting a new run — Groq's free tier is
    // one shared API key for the whole app, the same reason the cache in
    // api/trends/route.ts is deliberately global rather than per-user.
    tokensUsed: integer("tokens_used"),
    // Set only when a run fails on a real day-scope Groq 429 (GroqRateLimitError
    // in src/lib/ai/models.ts) — the exact moment Groq itself said the
    // budget would refill. The token-sum ledger alone under-counts a
    // day-scope exhaustion that predates this column's own tracking (e.g.
    // usage from before this feature shipped), so the pre-flight check
    // also honors whichever of these two signals is more restrictive.
    //
    // withTimezone: true (TIMESTAMPTZ) deliberately, unlike every other
    // timestamp in this schema — every other one is written via
    // .defaultNow() (Postgres's own now(), self-consistent within Postgres
    // regardless of session timezone). This one is written from a JS Date
    // computed in application code; a bare `timestamp` column silently
    // mis-stored that (confirmed live: a Date meaning ~18:01 UTC came back
    // reading as 12:21) since there's no unambiguous instant without a
    // timezone attached to interpret it against.
    rateLimitResetAt: timestamp("rate_limit_reset_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("trend_reads_cache_idx").on(t.cacheKey, t.createdAt),
    // Powers the library's "your Currents reads" listing — the cache index
    // above is keyed by scope, not by who asked for it.
    index("trend_reads_user_created_idx").on(t.userId, t.createdAt),
    // Powers the budget ledger's global "sum every user's tokens over the
    // last 24h" query — no userId in the query, so it's not the leading
    // column here (see remainingDailyTokenBudget in pipeline.ts).
    index("trend_reads_created_tokens_idx").on(t.createdAt, t.tokensUsed),
    // Powers the budget ledger's "is there a still-future Groq-reported
    // reset time" lookup.
    index("trend_reads_reset_idx").on(t.rateLimitResetAt),
  ],
);

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

export const originalityChecks = pgTable(
  "originality_checks",
  {
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
  },
  (t) => [index("originality_checks_user_created_idx").on(t.userId, t.createdAt)],
);

// One Clearance answer: a designer asked about an asset/jurisdiction and got
// general + country-flavored guidance. Q&A, not a durable knowledge base —
// mirrors the shape of originalityChecks above.
export const rightsAnswers = pgTable(
  "rights_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    country: text("country").notNull(),
    result: jsonb("result").notNull(), // { answer, keyConsiderations, confidence }
    model: text("model").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("rights_answers_user_created_idx").on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Route — brief to ordered plan, with a conversation on top of it
// ---------------------------------------------------------------------------

/**
 * One Route session: a client brief plus what the designer actually had,
 * and the plan produced from it.
 *
 * Deliberately NOT the `projects` table above — that models a durable
 * client/project record (and is currently unwritten by anything); this is a
 * per-query result with its own job columns, the same split as
 * trendReads/trends and toolAnswers/toolKnowledge.
 */
export const routePlans = pgTable(
  "route_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brief: text("brief").notNull(),
    deadline: text("deadline"), // free text — "3 weeks", "by Friday"
    // A SNAPSHOT of designerProfiles at run time, not a live join: the plan
    // was built against what the designer had on the day they asked, and
    // editing the profile later must not silently rewrite the premise an
    // old plan was reasoned from.
    tools: text("tools").array(),
    skillLevel: text("skill_level"),
    status: analysisStatusEnum("status").notNull().default("queued"),
    stage: text("stage"), // "reading" | "planning"
    result: jsonb("result"), // RoutePlan — revision 0
    model: text("model"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("route_plans_user_created_idx").on(t.userId, t.createdAt)],
);

/**
 * The conversation on a plan — the first multi-turn exchange in this app.
 *
 * The designer's question and the assistant's reply are SEPARATE rows so a
 * failed reply never takes the question down with it, and so the whole
 * transcript reads in one ordered index scan.
 */
export const routeTurns = pgTable(
  "route_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => routePlans.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "user" | "assistant"
    content: text("content"),
    // Set ONLY when this assistant turn actually corrected the plan — an
    // ordinary clarifying question leaves it null. The newest non-null one
    // IS the current plan, the same "chain, newest wins" idea as
    // rebuildVersions above, without needing a third table for revisions.
    revisedPlan: jsonb("revised_plan"),
    changeSummary: text("change_summary"),
    status: analysisStatusEnum("status").notNull().default("queued"),
    stage: text("stage"), // "thinking"
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("route_turns_plan_created_idx").on(t.planId, t.createdAt)],
);

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

// One Instruments answer: a designer asked where a control is or how a tool
// works, and it was either read off an attached screenshot or researched
// live. Deliberately NOT toolKnowledge above — that models a durable,
// vendor-changelog-ingested knowledge base (unbuilt); this is a per-query
// answer, same split as trendReads/trends and originalityChecks/(none).
export const toolAnswers = pgTable(
  "tool_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    tool: text("tool"), // optional tool name the designer named
    version: text("version"), // optional version the designer named
    // Set only when a screenshot was attached — that path is answered
    // synchronously and never cached (see src/lib/tools/answer.ts), so this
    // is null for every research-path row.
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    // normalizeQuestion(question)|tool|version — null for screenshot
    // answers, which must never serve or be served by the cache: they're
    // specific to that exact image.
    cacheKey: text("cache_key"),
    status: analysisStatusEnum("status").notNull().default("queued"),
    stage: text("stage"), // "searching" | "writing" — null on the screenshot path
    digest: text("digest"), // research-path pass-1 prose; null on the screenshot path
    result: jsonb("result"), // structured ToolAnswer
    sources: jsonb("sources"), // [{ title, url }] — the citation whitelist; empty on the screenshot path
    model: text("model"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("tool_answers_cache_idx").on(t.cacheKey, t.createdAt),
    index("tool_answers_user_created_idx").on(t.userId, t.createdAt),
  ],
);

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

// Only `dribbble` is actually connectable. Behance's public developer API
// was closed by Adobe — there is no OAuth flow left to build against it, so
// a Behance presence can only ever be a link in
// designerProfiles.portfolioLinks. `provider` stays a plain text column
// rather than an enum so that stays true without a migration if either
// platform's access changes again.
export const portfolioConnections = pgTable("portfolio_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // dribbble (behance: API closed, link-only)
  // AES-256-GCM, keyed by PORTFOLIO_TOKEN_KEY — see src/lib/crypto.ts. The
  // column was always named `_enc`; this honors it rather than storing the
  // bearer token in plaintext.
  oauthTokenEnc: text("oauth_token_enc").notNull(),
  externalHandle: text("external_handle"),
  // [{ id, title, url, imageUrl, publishedAt }] — refetched wholesale on
  // sync, so a jsonb snapshot beats a child table with rows to reconcile.
  shots: jsonb("shots"),
  lastSync: timestamp("last_sync"),
});

// DELIBERATELY UNUSED, and not to be "wired up" — this models a per-shot
// views/likes timeseries, and no platform will supply one any more:
// Behance's API is closed entirely, and Dribbble's v2 API dropped the
// `views_count`/`likes_count` fields its v1 had. Populating it would mean
// inventing the numbers. Kept only so the shape is on record if a platform
// ever reopens that data. Same deliberate split as trendReads/trends and
// toolAnswers/toolKnowledge: the aspirational table stays, the shipped
// feature writes elsewhere.
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

// ---------------------------------------------------------------------------
// Daily digest — studio sidebar's "styles today" + navbar's "news" popover
// ---------------------------------------------------------------------------

// One row per (kind, day) — a fixed, scopeless query run at most once per
// UTC calendar day, not a per-user or per-scope cache like trendReads. The
// unique index is the concurrency guard: `ensureDailyDigest` inserts a
// "running" placeholder with `.onConflictDoNothing()`, so two studio
// navigations landing at once around day-rollover can't both kick off a
// generation for the same (kind, day). Same `items`/`sources`/`digest`
// shape either kind writes (style items vs news items both round-trip
// through jsonb regardless), so one table with a `kind` discriminator beats
// two near-duplicate tables.
export const dailyDigest = pgTable(
  "daily_digest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // "styles" | "news"
    digestDate: date("digest_date").notNull(), // UTC calendar day this covers
    status: analysisStatusEnum("status").notNull().default("queued"),
    digest: text("digest"), // pass-1 research prose
    items: jsonb("items"), // structured items — shape depends on kind, see src/lib/digest/read.ts
    sources: jsonb("sources"), // [{ title, url }] citation whitelist — same pattern as trendReads.sources
    model: text("model"),
    error: text("error"),
    tokensUsed: integer("tokens_used"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("daily_digest_kind_date_idx").on(t.kind, t.digestDate)],
);

// Per-user "have they seen today's digest" state. A separate table rather
// than columns on `users` — same split as `designerProfiles`: feature state
// that isn't identity stays out of the core identity table.
export const userDigestSeen = pgTable("user_digest_seen", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lastSeenStylesAt: timestamp("last_seen_styles_at"),
  lastSeenNewsAt: timestamp("last_seen_news_at"),
});
