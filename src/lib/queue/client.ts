import "server-only";
import { Inngest } from "inngest";
import { z } from "zod";

// Inngest v4's schema API (EventType/StandardSchema) is designed around
// defining + exporting each event as its own const, which is more
// boilerplate than this app needs yet. We validate event payloads with zod
// at the boundary (functions.ts) instead of via Inngest's built-in schema
// wiring -- same safety, less ceremony. Revisit if/when more event types
// are added and shared validation starts paying for itself.
export const analysisRequestedSchema = z.object({
  analysisId: z.string().uuid(),
  assetId: z.string().uuid(),
  imageUrl: z.string().url(),
});
export const analysisProgressSchema = z.object({
  analysisId: z.string().uuid(),
  stage: z.string(),
  pct: z.number(),
});
export const analysisCompletedSchema = z.object({
  analysisId: z.string().uuid(),
  critiqueId: z.string().uuid(),
});
export const analysisFailedSchema = z.object({
  analysisId: z.string().uuid(),
  error: z.string(),
});

export const inngest = new Inngest({ id: "opacitys" });
