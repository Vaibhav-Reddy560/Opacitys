import "server-only";
import { generateGrounded, MODELS } from "@/lib/ai/gateway";
import type { AnalyzerResponse, CritiqueResult, Finding } from "./types";
import { critiqueResultSchema } from "./types";

const SYSTEM_PROMPT = `You are a design critique engine. You are given an image and a
list of MEASURED findings produced by deterministic analyzers (color contrast,
alignment, spacing, saliency, etc.) — not your own perception.

Hard rules:
1. You may ONLY write about findings in the provided list. Never invent a new
   finding, bbox, or measurement.
2. Every "message" must reference the specific measured value and its
   expected range, in plain language a designer understands.
3. Every "fix" must be concrete and actionable (e.g. "increase contrast to
   at least 4.5:1 by darkening the text to #1a1a1a", not "improve contrast").
4. Assign each finding a principleSlug only if you can name a real, citable
   design principle as a lowercase-kebab slug (e.g. "wcag-contrast-aa",
   "modular-scale", "gestalt-proximity"); otherwise null. This is a human
   label, not a database id.
5. Compute an overall 0-100 score and a 0-100 score per dimension, weighted
   by how many critical/major findings exist in that dimension. A dimension
   with zero findings scores 100 for that dimension.
6. Write a 2-3 sentence summary a designer would read first.

Return ONLY valid JSON matching this shape:
{
  "overallScore": number,
  "dimensionScores": { "color": number, "typography": number, "layout": number, "spacing": number, "hierarchy": number, "balance": number, "originality": number },
  "summary": string,
  "findings": [
    { "id": string, "dimension": string, "severity": string, "bbox": [number,number,number,number],
      "measured": { "value": number, "expected": [number,number], "unit": string },
      "principleSlug": string | null, "message": string, "fix": string, "confidence": number }
  ]
}
The "id", "dimension", "severity", "bbox", and "measured" fields must be
copied verbatim from the input findings — do not alter them.`;

export async function groundCritique(
  imageUrl: string,
  trackA: AnalyzerResponse,
): Promise<CritiqueResult> {
  if (trackA.findings.length === 0) {
    return {
      overallScore: 100,
      dimensionScores: {
        hierarchy: 100,
        color: 100,
        typography: 100,
        layout: 100,
        spacing: 100,
        balance: 100,
        originality: 100,
      },
      summary:
        "No measurable issues found by the deterministic analyzers on this pass.",
      findings: [],
    };
  }

  const { text } = await generateGrounded({
    model: MODELS.critique,
    system: SYSTEM_PROMPT,
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

  const parsed = critiqueResultSchema.parse(extractJson(text));

  // Belt-and-suspenders: reject any finding whose bbox/measured don't match
  // a real Track A finding by id. If the model invented one, drop it rather
  // than surface it — this is the guarantee the product is built on.
  const byId = new Map(trackA.findings.map((f) => [f.id, f]));
  const verified: Finding[] = parsed.findings.filter((f) => {
    const source = byId.get(f.id);
    if (!source) return false;
    return (
      JSON.stringify(source.bbox) === JSON.stringify(f.bbox) &&
      source.measured.value === f.measured.value
    );
  });

  return { ...parsed, findings: verified };
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}
