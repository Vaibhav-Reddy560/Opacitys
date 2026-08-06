import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { dimensionSchema, type Dimension } from "@/lib/critique/types";
import { bucketPalette, type PaletteBucket } from "./palette";

/**
 * Fingerprint — what a designer's own work says about how they work.
 *
 * Entirely DERIVED, on every read, from rows Critique/Identify/Originality
 * already wrote. Nothing here is cached in `designer_profiles` (only the
 * self-reported fields and the written read live there): at this data volume
 * recomputing is cheap, and a stale cached copy of a number the user can see
 * computed elsewhere is worse than no copy.
 *
 * No model call anywhere in this file. Every number traces to a measurement
 * or a stored score.
 */

/** Below this many samples a dimension average isn't worth stating. */
export const MIN_SAMPLES = 2;

export interface StyleEntry {
  name: string;
  era: string | null;
  /** Mean stored weight, 0-1. */
  avgWeight: number;
  /** How many separate pieces this style was scored in. */
  appearsIn: number;
}

export interface DimensionStat {
  dimension: Dimension;
  /** Mean 0-100, or null when fewer than MIN_SAMPLES critiques evaluated it. */
  avg: number | null;
  /** How many critiques actually scored this dimension. */
  sampled: number;
}

export interface RecurringNote {
  dimension: Dimension;
  severity: "critical" | "major" | "minor";
  count: number;
}

export interface TypeHabits {
  medianTypeSizes: number | null;
  medianContrast: number | null;
  medianAlignment: number | null;
  medianGapCV: number | null;
}

export interface Fingerprint {
  /** Distinct uploads with at least one completed analysis. */
  pieces: number;
  /** Uploads total, including ones never analyzed. */
  uploads: number;
  styleSignature: StyleEntry[];
  craft: {
    perDimension: DimensionStat[];
    strongest: DimensionStat[];
    weakest: DimensionStat[];
    recurringNotes: RecurringNote[];
    /** Mean overall critique score, 0-100. Null with no critiques. */
    avgOverall: number | null;
    critiques: number;
  };
  palette: PaletteBucket[];
  typeHabits: TypeHabits | null;
  originality: {
    avgCrowding: number | null;
    trend: { date: Date; crowding: number }[];
    territories: { name: string; times: number }[];
    checks: number;
  };
  computedAt: Date;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * MeasuredFacts as persisted on `assets.facts`. Read back defensively rather
 * than with a strict schema: these rows are written by three different
 * modules plus a backfill script, and a shape drift should cost the palette
 * section, not the whole profile.
 */
interface StoredFacts {
  dominantColors?: unknown;
  avgTextContrast?: unknown;
  alignmentRatio?: unknown;
  gapCoefficientOfVariation?: unknown;
  distinctTypeSizes?: unknown;
  textLineCount?: unknown;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function computeFingerprint(userId: string): Promise<Fingerprint> {
  // Ownership note: `analyses` has no user_id — every join below reaches the
  // user through `assets`, which is the ONLY thing scoping these rows. Any
  // future query added here must keep that join or it will leak across
  // accounts.
  const [assets, styleRows, critiqueRows, findingRows, originalityRows] = await Promise.all([
    db
      .select({ id: schema.assets.id, facts: schema.assets.facts })
      .from(schema.assets)
      .where(eq(schema.assets.userId, userId)),

    db
      .select({
        analysisId: schema.styleScores.analysisId,
        weight: schema.styleScores.weight,
        name: schema.styleTaxonomy.name,
        era: schema.styleTaxonomy.era,
      })
      .from(schema.styleScores)
      .innerJoin(schema.styleTaxonomy, eq(schema.styleTaxonomy.id, schema.styleScores.taxonomyId))
      .innerJoin(schema.analyses, eq(schema.analyses.id, schema.styleScores.analysisId))
      .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
      .where(and(eq(schema.assets.userId, userId), eq(schema.analyses.status, "complete"))),

    db
      .select({
        id: schema.critiques.id,
        dimensionScores: schema.critiques.dimensionScores,
        overallScore: schema.critiques.overallScore,
      })
      .from(schema.critiques)
      .innerJoin(schema.analyses, eq(schema.analyses.id, schema.critiques.analysisId))
      .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
      .where(and(eq(schema.assets.userId, userId), eq(schema.analyses.status, "complete"))),

    db
      .select({ dimension: schema.critiqueFindings.dimension, severity: schema.critiqueFindings.severity })
      .from(schema.critiqueFindings)
      .innerJoin(schema.critiques, eq(schema.critiques.id, schema.critiqueFindings.critiqueId))
      .innerJoin(schema.analyses, eq(schema.analyses.id, schema.critiques.analysisId))
      .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
      .where(and(eq(schema.assets.userId, userId), eq(schema.analyses.status, "complete"))),

    db
      .select({
        saturationScore: schema.originalityChecks.saturationScore,
        nearest: schema.originalityChecks.nearest,
        createdAt: schema.originalityChecks.createdAt,
      })
      .from(schema.originalityChecks)
      .where(eq(schema.originalityChecks.userId, userId))
      .orderBy(desc(schema.originalityChecks.createdAt)),
  ]);

  // Distinct analyzed pieces — one asset run through both Critique and
  // Identify is one piece, not two.
  const analyzedAssetIds = new Set<string>();
  const pieceRows = await db
    .select({ assetId: schema.analyses.assetId })
    .from(schema.analyses)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(and(eq(schema.assets.userId, userId), eq(schema.analyses.status, "complete")));
  for (const r of pieceRows) analyzedAssetIds.add(r.assetId);

  // --- style signature ----------------------------------------------------
  const styleAcc = new Map<string, { era: string | null; total: number; analyses: Set<string> }>();
  for (const r of styleRows) {
    const cur = styleAcc.get(r.name) ?? { era: r.era, total: 0, analyses: new Set<string>() };
    cur.total += r.weight;
    cur.analyses.add(r.analysisId);
    styleAcc.set(r.name, cur);
  }
  const styleSignature: StyleEntry[] = [...styleAcc.entries()]
    .map(([name, v]) => ({
      name,
      era: v.era,
      avgWeight: round(v.total / v.analyses.size, 3),
      appearsIn: v.analyses.size,
    }))
    // Frequency first, then strength: a style present in six pieces is more
    // of a signature than one that scored higher in a single outlier.
    .sort((a, b) => b.appearsIn - a.appearsIn || b.avgWeight - a.avgWeight)
    .slice(0, 8);

  // --- craft --------------------------------------------------------------
  const dimAcc = new Map<Dimension, { total: number; n: number }>();
  for (const c of critiqueRows) {
    const scores = c.dimensionScores as Record<string, unknown>;
    if (!scores || typeof scores !== "object") continue;
    for (const [key, raw] of Object.entries(scores)) {
      // A dimension the analyzer declined to evaluate has NO KEY here — it
      // is not zero. Counting it as zero would invent a weakness the
      // measurement pass explicitly refused to claim. Retired enum values
      // ("originality", "depth") also live in old rows; dimensionSchema
      // filters them the same way dimensionScoresSchema does on read.
      const parsed = dimensionSchema.safeParse(key);
      const value = num(raw);
      if (!parsed.success || value === null) continue;
      const cur = dimAcc.get(parsed.data) ?? { total: 0, n: 0 };
      cur.total += value;
      cur.n += 1;
      dimAcc.set(parsed.data, cur);
    }
  }

  const perDimension: DimensionStat[] = dimensionSchema.options.map((d) => {
    const a = dimAcc.get(d);
    return {
      dimension: d,
      avg: a && a.n >= MIN_SAMPLES ? round(a.total / a.n, 1) : null,
      sampled: a?.n ?? 0,
    };
  });

  const stated = perDimension.filter((d): d is DimensionStat & { avg: number } => d.avg !== null);
  const byScore = [...stated].sort((a, b) => b.avg - a.avg);

  const noteAcc = new Map<string, RecurringNote>();
  for (const f of findingRows) {
    const parsed = dimensionSchema.safeParse(f.dimension);
    if (!parsed.success) continue; // retired dimension on a historical row
    const key = `${parsed.data}|${f.severity}`;
    const cur = noteAcc.get(key) ?? { dimension: parsed.data, severity: f.severity, count: 0 };
    cur.count += 1;
    noteAcc.set(key, cur);
  }

  const overalls = critiqueRows.map((c) => c.overallScore).filter((v): v is number => v !== null);

  // --- palette + type habits ---------------------------------------------
  const hexes: string[] = [];
  const typeSizes: number[] = [];
  const contrasts: number[] = [];
  const alignments: number[] = [];
  const gapCVs: number[] = [];

  for (const a of assets) {
    const f = a.facts as StoredFacts | null;
    if (!f) continue;
    if (Array.isArray(f.dominantColors)) {
      for (const c of f.dominantColors) if (typeof c === "string") hexes.push(c);
    }
    const t = num(f.distinctTypeSizes);
    if (t !== null) typeSizes.push(t);
    const c = num(f.avgTextContrast);
    if (c !== null) contrasts.push(c);
    const al = num(f.alignmentRatio);
    if (al !== null) alignments.push(al);
    const g = num(f.gapCoefficientOfVariation);
    if (g !== null) gapCVs.push(g);
  }

  const habits: TypeHabits = {
    medianTypeSizes: median(typeSizes),
    medianContrast: median(contrasts),
    medianAlignment: median(alignments),
    medianGapCV: median(gapCVs),
  };
  const hasHabits = Object.values(habits).some((v) => v !== null);

  // --- originality --------------------------------------------------------
  const crowdings = originalityRows
    .map((r) => r.saturationScore)
    .filter((v): v is number => v !== null);

  const territoryAcc = new Map<string, number>();
  for (const r of originalityRows) {
    if (!Array.isArray(r.nearest)) continue;
    for (const n of r.nearest) {
      const name = (n as { name?: unknown })?.name;
      if (typeof name !== "string" || !name.trim()) continue;
      territoryAcc.set(name, (territoryAcc.get(name) ?? 0) + 1);
    }
  }

  return {
    pieces: analyzedAssetIds.size,
    uploads: assets.length,
    styleSignature,
    craft: {
      perDimension,
      strongest: byScore.slice(0, 3),
      weakest: byScore.slice(-3).reverse(),
      recurringNotes: [...noteAcc.values()].sort((a, b) => b.count - a.count).slice(0, 6),
      avgOverall: overalls.length > 0 ? round(overalls.reduce((s, v) => s + v, 0) / overalls.length, 1) : null,
      critiques: critiqueRows.length,
    },
    palette: bucketPalette(hexes),
    typeHabits: hasHabits ? habits : null,
    originality: {
      avgCrowding:
        crowdings.length > 0 ? round(crowdings.reduce((s, v) => s + v, 0) / crowdings.length, 1) : null,
      // Oldest-first so a chart reads left to right; the query above is
      // newest-first for the territory rollup.
      trend: originalityRows
        .filter((r) => r.saturationScore !== null)
        .map((r) => ({ date: r.createdAt, crowding: r.saturationScore as number }))
        .reverse(),
      territories: [...territoryAcc.entries()]
        .map(([name, times]) => ({ name, times }))
        .sort((a, b) => b.times - a.times)
        .slice(0, 8),
      checks: originalityRows.length,
    },
    computedAt: new Date(),
  };
}

/**
 * Stable hash of the numbers a written read would describe. Stored alongside
 * the narration so the UI can tell whether the prose still matches the
 * measurements, and offer a refresh only when it genuinely doesn't — rather
 * than re-billing a model call on every page view.
 *
 * Deliberately excludes `computedAt` (which changes every call) and anything
 * the prose doesn't mention.
 */
export function fingerprintBasis(f: Fingerprint): string {
  const parts = [
    `p${f.pieces}`,
    `c${f.craft.critiques}`,
    `o${f.originality.checks}`,
    `ao${f.craft.avgOverall ?? "-"}`,
    `ac${f.originality.avgCrowding ?? "-"}`,
    ...f.styleSignature.map((s) => `${s.name}:${s.appearsIn}:${s.avgWeight}`),
    ...f.craft.perDimension.map((d) => `${d.dimension}:${d.avg ?? "-"}`),
    ...f.palette.map((p) => `${p.bucket}:${p.count}`),
  ];
  return parts.join("|");
}
