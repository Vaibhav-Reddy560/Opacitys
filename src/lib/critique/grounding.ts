import "server-only";
import { z } from "zod";
import { generateJson, GroqRateLimitError, MODELS } from "@/lib/ai/models";
import { DIMENSION_ORDER, SEVERITY } from "./spectrum";
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
plain language a designer understands.

Hard rules:
1. Write a "message" and a "fix" for every finding id given to you — never
   skip one, and never invent a new id, bbox, or measurement of your own.
2. Every "message" must reference the specific measured value and its
   expected range in plain language.
3. Every "fix" must be concrete and actionable (e.g. "increase contrast to
   at least 4.5:1 by darkening the text to #1a1a1a", not "improve contrast").
4. Assign each finding a principleSlug only if you can name a real, citable
   design principle as a lowercase-kebab slug (e.g. "wcag-contrast-aa",
   "modular-scale", "gestalt-proximity"); otherwise null.
5. Write a 2-3 sentence overall summary a designer would read first.

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
 * finding — degrades the prose, never drops the finding itself. */
function templatedNote(f: TrackAFinding): { message: string; fix: string } {
  const [lo, hi] = f.measured.expected;
  return {
    message: `Measured ${f.measured.value}${f.measured.unit} in this area, outside the expected ${lo}–${hi}${f.measured.unit} range.`,
    fix: `Bring this back toward ${lo}–${hi}${f.measured.unit}.`,
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
