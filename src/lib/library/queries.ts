import "server-only";
import { del } from "@vercel/blob";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// "Your work" — everything a signed-in user has ever produced, queryable and
// deletable in one place. This is the retrieval layer that makes the
// existing per-feature persistence (assets, analyses, originality_checks,
// trend_reads, tool_answers, rights_answers) actually visible again instead
// of stranded at a URL nobody kept.

// Only the text-only kinds that have their own userId-keyed table — critique
// and identify are asset-bound (no standalone table of their own; ownership
// only exists via analyses.assetId -> assets.userId) and are surfaced
// through listAssets/getAsset's ranKinds instead of through listWork.
export type WorkKind = "originality" | "trends" | "tools" | "rights" | "workflow";

export interface AssetSummary {
  id: string;
  storageKey: string;
  originalName: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  createdAt: Date;
  /** Browser Geolocation fix at upload time — null for anything uploaded
   *  before this shipped, or where the toggle was off/denied. Never both
   *  set without the other; the map treats "has latitude" as "is located". */
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  /** Reverse-geocoded "Bengaluru, India" — cosmetic, filled in shortly
   *  after upload; can stay null even on a located asset if that lookup failed. */
  placeLabel: string | null;
  /** Which features have a completed result on this exact image, for the chip row. */
  ranKinds: ("critique" | "identify" | "rebuild" | "originality")[];
}

/**
 * Every image the user has uploaded, newest first, with a cheap per-kind
 * "has this run" flag — one grouped query rather than N+1 per asset.
 */
export async function listAssets(userId: string, limit = 60): Promise<AssetSummary[]> {
  const assets = await db
    .select({
      id: schema.assets.id,
      storageKey: schema.assets.storageKey,
      originalName: schema.assets.originalName,
      mime: schema.assets.mime,
      width: schema.assets.width,
      height: schema.assets.height,
      createdAt: schema.assets.createdAt,
      latitude: schema.assets.latitude,
      longitude: schema.assets.longitude,
      locationAccuracy: schema.assets.locationAccuracy,
      placeLabel: schema.assets.placeLabel,
    })
    .from(schema.assets)
    .where(eq(schema.assets.userId, userId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(limit);

  if (assets.length === 0) return [];
  const assetIds = assets.map((a) => a.id);

  const [analysisKinds, originalityAssetIds] = await Promise.all([
    db
      .selectDistinct({ assetId: schema.analyses.assetId, kind: schema.analyses.kind })
      .from(schema.analyses)
      .where(and(inArray(schema.analyses.assetId, assetIds), eq(schema.analyses.status, "complete"))),
    db
      .selectDistinct({ assetId: schema.originalityChecks.assetId })
      .from(schema.originalityChecks)
      .where(inArray(schema.originalityChecks.assetId, assetIds)),
  ]);

  const kindsByAsset = new Map<string, Set<AssetSummary["ranKinds"][number]>>();
  for (const { assetId, kind } of analysisKinds) {
    if (kind !== "critique" && kind !== "identify" && kind !== "rebuild") continue; // "originality" images run through their own table, not analyses
    if (!kindsByAsset.has(assetId)) kindsByAsset.set(assetId, new Set());
    kindsByAsset.get(assetId)!.add(kind);
  }
  for (const { assetId } of originalityAssetIds) {
    if (!assetId) continue;
    if (!kindsByAsset.has(assetId)) kindsByAsset.set(assetId, new Set());
    kindsByAsset.get(assetId)!.add("originality");
  }

  return assets.map((a) => ({ ...a, ranKinds: [...(kindsByAsset.get(a.id) ?? [])] }));
}

export interface AssetWithResults extends AssetSummary {
  critiqueAnalysisId: string | null;
  identifyAnalysisId: string | null;
  rebuildAnalysisId: string | null;
  originalityCheckIds: string[];
}

/** One asset plus the id of every result run on it, for the detail page's "open result" / "run this feature" buttons. */
export async function getAsset(userId: string, assetId: string): Promise<AssetWithResults | null> {
  const [asset] = await db
    .select({
      id: schema.assets.id,
      storageKey: schema.assets.storageKey,
      originalName: schema.assets.originalName,
      mime: schema.assets.mime,
      width: schema.assets.width,
      height: schema.assets.height,
      createdAt: schema.assets.createdAt,
      latitude: schema.assets.latitude,
      longitude: schema.assets.longitude,
      locationAccuracy: schema.assets.locationAccuracy,
      placeLabel: schema.assets.placeLabel,
      userId: schema.assets.userId,
    })
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  if (!asset || asset.userId !== userId) return null;

  const [analyses, originalityChecks] = await Promise.all([
    db
      .select({ id: schema.analyses.id, kind: schema.analyses.kind })
      .from(schema.analyses)
      .where(and(eq(schema.analyses.assetId, assetId), eq(schema.analyses.status, "complete")))
      .orderBy(desc(schema.analyses.createdAt)),
    db
      .select({ id: schema.originalityChecks.id })
      .from(schema.originalityChecks)
      .where(eq(schema.originalityChecks.assetId, assetId))
      .orderBy(desc(schema.originalityChecks.createdAt)),
  ]);

  const critiqueAnalysisId = analyses.find((a) => a.kind === "critique")?.id ?? null;
  const identifyAnalysisId = analyses.find((a) => a.kind === "identify")?.id ?? null;
  const rebuildAnalysisId = analyses.find((a) => a.kind === "rebuild")?.id ?? null;

  return {
    id: asset.id,
    storageKey: asset.storageKey,
    originalName: asset.originalName,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt,
    latitude: asset.latitude,
    longitude: asset.longitude,
    locationAccuracy: asset.locationAccuracy,
    placeLabel: asset.placeLabel,
    ranKinds: [
      ...(critiqueAnalysisId ? (["critique"] as const) : []),
      ...(identifyAnalysisId ? (["identify"] as const) : []),
      ...(rebuildAnalysisId ? (["rebuild"] as const) : []),
      ...(originalityChecks.length ? (["originality"] as const) : []),
    ],
    critiqueAnalysisId,
    identifyAnalysisId,
    rebuildAnalysisId,
    originalityCheckIds: originalityChecks.map((c) => c.id),
  };
}

export interface WorkItem {
  id: string;
  kind: WorkKind;
  title: string;
  createdAt: Date;
}

export interface RecentAnalysis {
  analysisId: string;
  storageKey: string;
  createdAt: Date;
}

/**
 * Recent completed Critique/Identify/Rebuild runs, each with the source
 * image so the recent strip can show a thumbnail instead of text —
 * analyses has no title field of its own (it's a measurement pass on an
 * image, not a question).
 */
export async function listRecentAnalyses(
  userId: string,
  kind: "critique" | "identify" | "rebuild",
  limit = 6,
): Promise<RecentAnalysis[]> {
  const rows = await db
    .select({ analysisId: schema.analyses.id, storageKey: schema.assets.storageKey, createdAt: schema.analyses.createdAt })
    .from(schema.analyses)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(and(eq(schema.assets.userId, userId), eq(schema.analyses.kind, kind), eq(schema.analyses.status, "complete")))
    .orderBy(desc(schema.analyses.createdAt))
    .limit(limit);
  return rows;
}

/**
 * The text-only (non-image) work — Currents reads, Instruments answers,
 * Clearance answers — for the library's "reads" section and each feature
 * page's recent strip. `kind` narrows which table(s) are queried; omitted,
 * every table is unioned and sorted by date.
 */
export async function listWork(userId: string, kind?: WorkKind, limit = 20): Promise<WorkItem[]> {
  const queries: Promise<WorkItem[]>[] = [];

  if (!kind || kind === "trends") {
    queries.push(
      db
        .select({ id: schema.trendReads.id, title: schema.trendReads.scope, createdAt: schema.trendReads.createdAt })
        .from(schema.trendReads)
        .where(and(eq(schema.trendReads.userId, userId), eq(schema.trendReads.status, "complete")))
        .orderBy(desc(schema.trendReads.createdAt))
        .limit(limit)
        .then((rows) => rows.map((r) => ({ ...r, kind: "trends" as const }))),
    );
  }
  if (!kind || kind === "tools") {
    queries.push(
      db
        .select({ id: schema.toolAnswers.id, title: schema.toolAnswers.question, createdAt: schema.toolAnswers.createdAt })
        .from(schema.toolAnswers)
        .where(and(eq(schema.toolAnswers.userId, userId), eq(schema.toolAnswers.status, "complete")))
        .orderBy(desc(schema.toolAnswers.createdAt))
        .limit(limit)
        .then((rows) => rows.map((r) => ({ ...r, kind: "tools" as const }))),
    );
  }
  if (!kind || kind === "rights") {
    queries.push(
      db
        .select({ id: schema.rightsAnswers.id, title: schema.rightsAnswers.question, createdAt: schema.rightsAnswers.createdAt })
        .from(schema.rightsAnswers)
        .where(eq(schema.rightsAnswers.userId, userId))
        .orderBy(desc(schema.rightsAnswers.createdAt))
        .limit(limit)
        .then((rows) => rows.map((r) => ({ ...r, kind: "rights" as const }))),
    );
  }
  if (!kind || kind === "originality") {
    queries.push(
      db
        .select({ id: schema.originalityChecks.id, title: schema.originalityChecks.inputText, createdAt: schema.originalityChecks.createdAt })
        .from(schema.originalityChecks)
        .where(eq(schema.originalityChecks.userId, userId))
        .orderBy(desc(schema.originalityChecks.createdAt))
        .limit(limit)
        .then((rows) => rows.map((r) => ({ ...r, kind: "originality" as const }))),
    );
  }
  if (!kind || kind === "workflow") {
    queries.push(
      db
        .select({ id: schema.routePlans.id, title: schema.routePlans.brief, createdAt: schema.routePlans.createdAt })
        .from(schema.routePlans)
        .where(and(eq(schema.routePlans.userId, userId), eq(schema.routePlans.status, "complete")))
        .orderBy(desc(schema.routePlans.createdAt))
        .limit(limit)
        .then((rows) => rows.map((r) => ({ ...r, kind: "workflow" as const }))),
    );
  }

  const results = (await Promise.all(queries)).flat();
  results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return kind ? results : results.slice(0, limit);
}

/**
 * Deletes an asset, its Blob object, and every result that references it
 * (FK cascade takes analyses/originality_checks/tool_answers.assetId). Hard
 * delete, not a soft `deletedAt` flag — the user asked to actually remove
 * things, and a flag that still counts against storage isn't a real delete.
 */
export async function deleteAsset(userId: string, assetId: string): Promise<boolean> {
  const [asset] = await db
    .select({ storageKey: schema.assets.storageKey, userId: schema.assets.userId })
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  if (!asset || asset.userId !== userId) return false;

  await db.delete(schema.assets).where(eq(schema.assets.id, assetId));
  // Best-effort — a Blob delete failure shouldn't resurrect the DB row or
  // block the user from having deleted their work; an orphaned Blob object
  // costs storage, not correctness.
  await del(asset.storageKey).catch((err) => {
    console.error(`[library] failed to delete blob ${asset.storageKey}:`, err);
  });
  return true;
}

const WORK_TABLES = {
  trends: schema.trendReads,
  tools: schema.toolAnswers,
  rights: schema.rightsAnswers,
  originality: schema.originalityChecks,
  // Deleting a plan cascades to its route_turns via the FK — no separate
  // cleanup needed here, same as rebuild_versions -> layers.
  workflow: schema.routePlans,
} as const;

/** Deletes one text-only work item after checking ownership. */
export async function deleteWork(userId: string, kind: keyof typeof WORK_TABLES, id: string): Promise<boolean> {
  const table = WORK_TABLES[kind];
  const [row] = await db
    .select({ userId: table.userId })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  if (!row || row.userId !== userId) return false;

  await db.delete(table).where(eq(table.id, id));
  return true;
}

/** Total counts for the library's empty-state / summary line. */
export async function getWorkCounts(userId: string): Promise<{ assets: number; work: number }> {
  const [[assetCount], [workCount]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(schema.assets).where(eq(schema.assets.userId, userId)),
    Promise.all(
      (Object.keys(WORK_TABLES) as (keyof typeof WORK_TABLES)[]).map(async (k) => {
        const table = WORK_TABLES[k];
        const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(eq(table.userId, userId));
        return row.count;
      }),
    ).then((counts) => [{ count: counts.reduce((a, b) => a + b, 0) }]),
  ]);
  return { assets: assetCount.count, work: workCount.count };
}
