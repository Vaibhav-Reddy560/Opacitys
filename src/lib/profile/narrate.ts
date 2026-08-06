import "server-only";
import { z } from "zod";
import { generateJson, MODELS } from "@/lib/ai/models";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { Fingerprint } from "./fingerprint";

/**
 * The one model call in Fingerprint — a short written read of numbers that
 * were already computed deterministically.
 *
 * It is handed the AGGREGATE ONLY, never raw rows: it can restate and
 * connect measurements, but it has nothing to invent from. That's the whole
 * point of layering it on top rather than asking a model to "read the work".
 *
 * MODELS.fast: no vision, no search — the cheapest call in the app. It is
 * never triggered by a page view; see the route for the caching contract.
 */

const narrativeSchema = z.object({
  reading: z.string(),
  throughLine: z.string(),
  watchOut: z.string(),
});
export type ProfileNarrative = z.infer<typeof narrativeSchema>;

// MODELS.fast is NOT in STRICT_SCHEMA_MODELS — it runs in non-strict
// json_object mode where the zod schema is only a client-side check after
// the fact. A literal every-key template is what actually keeps it
// compliant; a prose field list is not enough. Same lesson as Instruments'
// screenshot path (which silently dropped trailing keys until templated).
const SYSTEM = `You write a short, plain read of a designer's own working
patterns, from measurements already taken across their real uploads.

Rules:
- Use ONLY the numbers given to you. Never invent a style, a color, a score,
  or a tendency that isn't in the input.
- Address the designer as "you". No preamble, no flattery, no "as an AI".
- "reading": 2-3 sentences on what the numbers say about how they work —
  what they reach for, what shows up repeatedly.
- "throughLine": one sentence naming the single most consistent thing across
  their work.
- "watchOut": one sentence on the weakest measured dimension or the most
  recurring finding, phrased as an observation, not a scolding. If nothing is
  genuinely weak, say what to keep an eye on as the body of work grows.
- A dimension marked "not enough signal yet" has NOT been measured enough to
  judge — never describe it as a strength or a weakness.
- Keep every sentence concrete. "Your contrast averages 55/100 across 16
  pieces" beats "your color work could be stronger".

Return ONLY valid JSON with EVERY key present:
{
  "reading": "2-3 sentences",
  "throughLine": "one sentence",
  "watchOut": "one sentence"
}`;

/** Renders the aggregate as the plain-text brief the model actually sees. */
function toBrief(f: Fingerprint): string {
  const lines: string[] = [
    `Pieces analyzed: ${f.pieces} (of ${f.uploads} uploads)`,
    `Critiques run: ${f.craft.critiques}${f.craft.avgOverall !== null ? `, average overall score ${f.craft.avgOverall}/100` : ""}`,
  ];

  if (f.styleSignature.length > 0) {
    lines.push(
      "\nStyles scored across their work (style — average weight 0-1, number of pieces it appeared in):",
      ...f.styleSignature.map((s) => `- ${s.name}${s.era ? ` (${s.era})` : ""} — ${s.avgWeight}, in ${s.appearsIn} piece(s)`),
    );
  }

  const stated = f.craft.perDimension.filter((d) => d.avg !== null);
  if (stated.length > 0) {
    lines.push(
      "\nCritique dimension averages (0-100, and how many critiques measured it):",
      ...stated.map((d) => `- ${SPECTRUM[d.dimension].label}: ${d.avg} (from ${d.sampled} critiques)`),
    );
  }
  const unstated = f.craft.perDimension.filter((d) => d.avg === null);
  if (unstated.length > 0) {
    lines.push(
      `\nNot enough signal yet to judge (do NOT call these strengths or weaknesses): ${unstated
        .map((d) => SPECTRUM[d.dimension].label)
        .join(", ")}`,
    );
  }

  if (f.craft.recurringNotes.length > 0) {
    lines.push(
      "\nMost recurring critique findings:",
      ...f.craft.recurringNotes.map((n) => `- ${SPECTRUM[n.dimension].label}, ${n.severity}: ${n.count} time(s)`),
    );
  }

  if (f.palette.length > 0) {
    lines.push(
      "\nPalette they reach for (color family — times it appeared as a dominant color):",
      ...f.palette.map((p) => `- ${p.label} (${p.hex}) — ${p.count}`),
    );
  }

  if (f.typeHabits) {
    const t = f.typeHabits;
    const bits = [
      t.medianTypeSizes !== null && `median distinct type sizes ${t.medianTypeSizes}`,
      t.medianContrast !== null && `median text contrast ${t.medianContrast}:1`,
      t.medianAlignment !== null && `median alignment ratio ${t.medianAlignment}`,
      t.medianGapCV !== null && `median spacing variation (CV) ${t.medianGapCV}`,
    ].filter(Boolean);
    if (bits.length > 0) lines.push(`\nStructural habits: ${bits.join(", ")}`);
  }

  if (f.originality.checks > 0) {
    lines.push(
      `\nOriginality checks: ${f.originality.checks}${
        f.originality.avgCrowding !== null ? `, average crowding ${f.originality.avgCrowding}/100` : ""
      }`,
    );
    if (f.originality.territories.length > 0) {
      lines.push(
        `Territories their directions sat near: ${f.originality.territories.map((t) => t.name).join(", ")}`,
      );
    }
  }

  return lines.join("\n");
}

export async function narrateFingerprint(f: Fingerprint): Promise<ProfileNarrative> {
  const { data } = await generateJson({
    model: MODELS.fast,
    schema: narrativeSchema,
    schemaName: "profile_narrative",
    system: SYSTEM,
    maxOutputTokens: 700,
    messages: [{ role: "user", content: toBrief(f) }],
  });
  return data;
}
