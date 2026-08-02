import { z } from "zod";

export const dimensionSchema = z.enum([
  "hierarchy",
  "color",
  "typography",
  "layout",
  "spacing",
  "balance",
  "originality",
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
  dimensionScores: z.record(dimensionSchema, z.number().min(0).max(100)),
  summary: z.string(),
  findings: z.array(findingSchema),
});
export type CritiqueResult = z.infer<typeof critiqueResultSchema>;
