import { z } from "zod";

// The 9 critique dimensions this app currently measures. "originality" was
// removed — it duplicated the separate standalone Originality studio
// feature — and "depth" was replaced by "restraint" (see spectrum.ts for
// what each one operationalizes and which design-book principle grounds
// it). Both retired keys still exist in the Postgres enum (append-only,
// see src/lib/db/schema.ts) and can appear in historical rows; read paths
// for persisted data must tolerate them rather than assume this list.
export const dimensionSchema = z.enum([
  "hierarchy",
  "color",
  "rhythm",
  "typography",
  "layout",
  "contrast",
  "spacing",
  "balance",
  "restraint",
]);
export type Dimension = z.infer<typeof dimensionSchema>;

export const severitySchema = z.enum(["critical", "major", "minor"]);
export type Severity = z.infer<typeof severitySchema>;

// Emitted by Track A (Python analyzer service) — everything here is a
// measurement, never a VLM opinion.
export const trackAFindingSchema = z.object({
  id: z.string(), // stable id so Track B can attach message/fix by reference
  dimension: dimensionSchema,
  severity: severitySchema,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  measured: z.object({
    value: z.number(),
    expected: z.tuple([z.number(), z.number()]),
    unit: z.string(),
  }),
});
export type TrackAFinding = z.infer<typeof trackAFindingSchema>;

export const analyzerResponseSchema = z.object({
  pipelineVersion: z.string(),
  width: z.number(),
  height: z.number(),
  findings: z.array(trackAFindingSchema),
  // Which dimensions an analyzer actually ran to completion for, as opposed
  // to skipping (too little signal — e.g. <3 text lines). Averaging a
  // critique's score over every dimension in DIMENSION_ORDER regardless of
  // whether it was measured gave every skipped dimension a free 100 and
  // inflated the overall score; `computeScores` (grounding.ts) averages
  // over this list instead. `.default([])` keeps old `analyses.raw` blobs
  // (persisted before this field existed) parseable.
  evaluated: z.array(dimensionSchema).default([]),
});
export type AnalyzerResponse = z.infer<typeof analyzerResponseSchema>;

// Final finding after Track B (VLM) grounds an explanation to a Track A
// measurement. bbox/measured/severity are copied verbatim from Track A.
export const findingSchema = trackAFindingSchema.extend({
  // Human slug the VLM names, e.g. "wcag-contrast-aa" — resolved to the
  // design_principles.id uuid at persistence time, not by the model.
  principleSlug: z.string().nullable(),
  message: z.string(),
  fix: z.string(),
  confidence: z.number().min(0).max(1),
});
export type Finding = z.infer<typeof findingSchema>;

export const critiqueResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  // Partial, not a full record: only dimensions an analyzer actually
  // evaluated get a score (see AnalyzerResponse.evaluated) — a dimension
  // that was skipped for lack of signal has no entry at all, rather than a
  // free 100 that would inflate the overall average.
  dimensionScores: z.partialRecord(dimensionSchema, z.number().min(0).max(100)),
  summary: z.string(),
  findings: z.array(findingSchema),
});
export type CritiqueResult = z.infer<typeof critiqueResultSchema>;

// ---------------------------------------------------------------------------
// What the client actually reads — over SSE on a live run, or
// server-rendered directly for an analysis that's already complete. Both
// paths go through the same schemas so they can never disagree about how to
// handle a stale row.
// ---------------------------------------------------------------------------

const DIMENSION_KEYS = new Set<string>(dimensionSchema.options);

/** Reads a persisted `dimension_scores` blob. Deliberately NOT
 * `z.record`/`z.partialRecord` over the enum: on zod v4 an enum-keyed
 * record is both exhaustive AND closed, so it rejects every historical row
 * (which can carry retired keys like "originality"/"depth" — the jsonb
 * column isn't constrained by the Postgres enum) *and* every new row
 * (which is intentionally partial, per `AnalyzerResponse.evaluated` above —
 * a design missing enough text lines for `rhythm` to evaluate has no
 * "rhythm" key at all). Unknown keys are dropped rather than failing the
 * whole parse. */
export const dimensionScoresSchema = z.record(z.string(), z.number()).transform((raw) => {
  const out: Partial<Record<Dimension, number>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (DIMENSION_KEYS.has(k)) out[k as Dimension] = v;
  }
  return out;
});

export const streamFindingSchema = z.object({
  id: z.string(),
  dimension: dimensionSchema,
  severity: severitySchema,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  measured: z.object({
    value: z.number(),
    expected: z.tuple([z.number(), z.number()]),
    unit: z.string(),
  }),
  message: z.string(),
  fix: z.string(),
  confidence: z.number(),
});
export type StreamFinding = z.infer<typeof streamFindingSchema>;

export const streamCompleteSchema = z.object({
  critique: z.object({
    id: z.string(),
    overallScore: z.number(),
    dimensionScores: dimensionScoresSchema,
    summary: z.string(),
  }),
  // A single finding referencing a retired dimension (or otherwise
  // malformed) must not blank out an entire, otherwise-good critique — drop
  // it and keep the rest, rather than letting one bad row fail the whole
  // `safeParse` and read as "Analysis failed" to the user.
  findings: z.array(z.unknown()).transform((rows) =>
    rows.flatMap((r) => {
      const parsed = streamFindingSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});
export type StreamComplete = z.infer<typeof streamCompleteSchema>;
