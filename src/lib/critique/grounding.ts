import "server-only";
import { z } from "zod";
import { generateJson, GroqRateLimitError, MODELS } from "@/lib/ai/models";
import { DIMENSION_ORDER, SEVERITY, SPECTRUM } from "./spectrum";
import type { AnalyzerResponse, CritiqueResult, Dimension, Finding, Severity, TrackAFinding } from "./types";

const notesSchema = z.object({
  summary: z.string(),
  notes: z.array(
    z.object({
      id: z.string(),
      message: z.string(),
      fix: z.string(),
      principleSlug: z.string().nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You are a design critique engine. You are given an image and a
list of MEASURED findings produced by deterministic analyzers (color contrast,
alignment, spacing, saliency, etc.) — not your own perception. Scores and
severities are already computed; your only job is to explain each finding in
plain language a designer — even a beginner, not a specialist — understands.

Hard rules:
1. Write a "message" and a "fix" for every finding id given to you — never
   skip one, and never invent a new id, bbox, or measurement of your own.
2. Start every "message" with what is actually wrong in plain English —
   what the eye would notice, or what problem it causes for a reader or
   user — BEFORE citing any number. Never open a message by just restating
   the measured value and its range (e.g. never write something structurally
   like "Measured 3.42:1, outside the expected 4.5–21:1 range" as the whole
   message) — that tells the reader nothing about what it looks or feels
   like. The number comes second, as evidence for the plain-language claim,
   not as the claim itself.
   Bad: "Measured 3.42:1 in this area, outside the expected 4.5–21:1 range."
   Good: "This label is too faint to read comfortably against its
   background — it measures 3.42:1 contrast, short of the 4.5:1 minimum for
   body text."
3. Every "fix" must be concrete and actionable (e.g. "increase contrast to
   at least 4.5:1 by darkening the text to #1a1a1a", not "improve contrast").
4. Assign each finding a principleSlug only if you can name a real, citable
   design principle as a lowercase-kebab slug (e.g. "wcag-contrast-aa",
   "modular-scale", "gestalt-proximity"); otherwise null.
5. Write a 2-3 sentence overall summary a designer would read first, in the
   same plain-language-first style — lead with the overall read, not a
   recap of the score.

Return ONLY valid JSON:
{ "summary": string, "notes": [{ "id": string, "message": string, "fix": string, "principleSlug": string | null }] }`;

// Point penalty per finding, by severity — mirrors the visual weight
// SEVERITY already assigns each severity level elsewhere in the app, scaled
// to a 0-100 score. A dimension with zero findings scores 100; each finding
// against it subtracts its severity's penalty, floored at 0.
const PENALTY: Record<Severity, number> = {
  critical: Math.round(SEVERITY.critical.weight * 40),
  major: Math.round(SEVERITY.major.weight * 40),
  minor: Math.round(SEVERITY.minor.weight * 40),
};

function computeScores(findings: TrackAFinding[]): {
  overallScore: number;
  dimensionScores: Record<Dimension, number>;
} {
  const dimensionScores = {} as Record<Dimension, number>;
  for (const dim of DIMENSION_ORDER) {
    const penalty = findings
      .filter((f) => f.dimension === dim)
      .reduce((sum, f) => sum + PENALTY[f.severity], 0);
    dimensionScores[dim] = Math.max(0, Math.round(100 - penalty));
  }
  const overallScore = Math.round(
    DIMENSION_ORDER.reduce((sum, d) => sum + dimensionScores[d], 0) / DIMENSION_ORDER.length,
  );
  return { overallScore, dimensionScores };
}

/** Plain-language fallback used when the model call fails or skips a
 * finding — degrades the prose, never drops the finding itself.
 *
 * Written per dimension rather than generically: each of the six
 * deterministic analyzers (see src/lib/measure/analyzers) measures something
 * specific enough — a contrast ratio, how off-center the visual weight is,
 * how many type sizes are on the page — that a template can say what's
 * actually wrong in plain terms, not just restate the number. The number
 * still appears, but as evidence after the claim, not as the claim itself. */
const FALLBACK_COPY: Partial<
  Record<Dimension, (value: number, lo: number, hi: number) => { message: string; fix: string }>
> = {
  color: (value, lo) => ({
    message: `The text or shapes here don't have enough contrast against their background to read comfortably — it measures ${value}:1, short of the ${lo}:1 minimum for easy reading.`,
    fix: `Darken the foreground or lighten the background until the contrast ratio reaches at least ${lo}:1.`,
  }),
  hierarchy: (value, lo) => ({
    message: `There's no clear focal point near the top of this design — only ${Math.round(value * 100)}% of the visual weight sits there, short of the ${Math.round(lo * 100)}% a strong first impression needs.`,
    fix: `Make the most important element bigger, bolder, or move it higher so it's the first thing a viewer's eye catches.`,
  }),
  layout: (value, lo) => ({
    message: `Not everything here lines up to a shared edge — only ${Math.round(value * 100)}% of the elements align to the same grid, short of the ${Math.round(lo * 100)}% a tidy layout needs.`,
    fix: `Snap these elements to the same left edge, column, or baseline grid.`,
  }),
  spacing: (value, _lo, hi) => ({
    message: `The gaps between elements here are inconsistent — spacing varies by ${Math.round(value * 100)}%, more than the ${Math.round(hi * 100)}% a calm, deliberate layout should have.`,
    fix: `Snap the gaps between these elements to a consistent spacing scale, like multiples of 8px.`,
  }),
  typography: (value, lo, hi) =>
    value > hi
      ? {
          message: `This design uses ${value} different text sizes — more than the ${hi} a clear type hierarchy needs, which makes it harder to tell what matters most.`,
          fix: `Consolidate down to about ${hi} sizes that step up on a consistent scale, e.g. roughly 1.25x each step.`,
        }
      : {
          message: `This design only uses ${value} text size, where at least ${lo} would let size itself tell the reader what's most important.`,
          fix: `Introduce at least ${lo} distinct sizes so headings, subheads and body text are visually distinct.`,
        },
  balance: (value, _lo, hi) => ({
    message: `The visual weight of this design leans to one side — its center of mass sits ${Math.round(value * 100)}% off the true center, more than the ${Math.round(hi * 100)}% that still reads as balanced.`,
    fix: `Add visual weight — a shape, image, or block of text — on the lighter side, or move a heavy element back toward the center.`,
  }),
};

function templatedNote(f: TrackAFinding): { message: string; fix: string } {
  const [lo, hi] = f.measured.expected;
  const copy = FALLBACK_COPY[f.dimension];
  if (copy) return copy(f.measured.value, lo, hi);
  // Only reachable for dimensions with no deterministic analyzer (rhythm,
  // contrast, depth, originality) — Track A never actually produces a
  // finding for those, but this keeps the function total over `Dimension`.
  const dim = SPECTRUM[f.dimension];
  const direction = f.measured.value < lo ? "short of" : "past";
  return {
    message: `This spot affects ${dim.blurb.toLowerCase()} — it measures ${f.measured.value}${f.measured.unit}, ${direction} the ${lo}–${hi}${f.measured.unit} range that reads well.`,
    fix: `Bring it back within ${lo}–${hi}${f.measured.unit}.`,
  };
}

export async function groundCritique(
  imageUrl: string,
  trackA: AnalyzerResponse,
): Promise<CritiqueResult> {
  const { overallScore, dimensionScores } = computeScores(trackA.findings);

  if (trackA.findings.length === 0) {
    return {
      overallScore,
      dimensionScores,
      summary: "No measurable issues found by the deterministic analyzers on this pass.",
      findings: [],
    };
  }

  let summary = `${trackA.findings.length} measured issue${trackA.findings.length === 1 ? "" : "s"} found across ${new Set(trackA.findings.map((f) => f.dimension)).size} dimension(s).`;
  const notesById = new Map<string, { message: string; fix: string; principleSlug: string | null }>();

  try {
    const { data } = await generateJson({
      model: MODELS.vision,
      schema: notesSchema,
      schemaName: "critique_notes",
      system: SYSTEM_PROMPT,
      maxOutputTokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Measured findings:\n${JSON.stringify(trackA.findings, null, 2)}` },
            { type: "image", image: imageUrl },
          ],
        },
      ],
    });
    summary = data.summary;
    for (const note of data.notes) notesById.set(note.id, note);
  } catch (err) {
    // A flaky model call degrades the prose (templated fallback below), not
    // the findings themselves — those came from deterministic measurement
    // and are never contingent on this call succeeding.
    if (err instanceof GroqRateLimitError) throw err;
    console.error("[critique] narration failed, falling back to templated notes:", err);
  }

  const findings: Finding[] = trackA.findings.map((f) => {
    const note = notesById.get(f.id);
    const fallback = templatedNote(f);
    return {
      ...f,
      principleSlug: note?.principleSlug ?? null,
      message: note?.message ?? fallback.message,
      fix: note?.fix ?? fallback.fix,
      confidence: note ? 0.85 : 0.5,
    };
  });

  return { overallScore, dimensionScores, summary, findings };
}
