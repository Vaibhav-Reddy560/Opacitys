import "server-only";
import { z } from "zod";
import { generateJson, MODELS } from "@/lib/ai/models";
import { STYLE_TAXONOMY } from "./taxonomy";
import type { MeasuredFacts } from "@/lib/measure";
import type { AnalyzerResponse } from "@/lib/critique/types";

// `name` is deliberately a plain string, not a strict enum of taxonomy
// names: qwen (the only vision-capable model on Groq) doesn't reliably
// reproduce a name byte-for-byte when the source list pairs it with an era
// in the same line — verified live, it sometimes folds the era into the
// name. `findTaxonomyEntry` in ./taxonomy does the real matching, with
// fallbacks for exactly that case, rather than failing the whole read over
// a formatting slip.
const styleReadSchema = z.object({
  summary: z.string(),
  styles: z
    .array(
      z.object({
        name: z.string(),
        weight: z.number().min(0).max(100),
        evidence: z.string(),
      }),
    )
    .min(1)
    .max(8),
});
export type StyleRead = z.infer<typeof styleReadSchema>;

function factsToPrompt(facts: MeasuredFacts, findings: AnalyzerResponse["findings"]): string {
  const lines: string[] = [];
  if (facts.dominantColors.length > 0) lines.push(`Dominant colors: ${facts.dominantColors.join(", ")}`);
  if (facts.avgTextContrast !== null) lines.push(`Average text/background contrast: ${facts.avgTextContrast}:1`);
  if (facts.alignmentRatio !== null) lines.push(`Content-block alignment ratio: ${facts.alignmentRatio}`);
  if (facts.gapCoefficientOfVariation !== null) lines.push(`Spacing gap variation (CV): ${facts.gapCoefficientOfVariation}`);
  if (facts.topBandSaliencyShare !== null) lines.push(`Visual weight in top 40% of canvas: ${facts.topBandSaliencyShare}`);
  if (facts.distinctTypeSizes !== null) lines.push(`Distinct type sizes detected: ${facts.distinctTypeSizes}`);
  lines.push(`Text lines detected: ${facts.textLineCount}`);
  if (findings.length > 0) {
    lines.push(
      `Notable deviations: ${findings.map((f) => `${f.dimension} (${f.measured.value}${f.measured.unit})`).join("; ")}`,
    );
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You classify a graphic design image against a fixed
taxonomy of design styles and movements. You are also given real measured
facts about the image (palette, contrast, alignment, spacing, type sizes)
computed deterministically, not by you — use them as supporting evidence,
not as the only signal.

Rules:
1. Only use style names from this exact taxonomy — never invent a new one:
${STYLE_TAXONOMY.map((s) => `- ${s.name} (${s.era}): ${s.tell}`).join("\n")}

2. Most designs are a blend. Return 2-5 styles (never just 1 unless the
   image is genuinely a pure, unambiguous example of exactly one), each with
   a weight 0-100. Weights don't need to sum to exactly 100 — they're
   independent confidence-like scores, not a strict partition.
3. "evidence" must name a specific visual feature you can point to — a
   color, a type choice, a compositional trait — optionally referencing one
   of the measured facts by name if it supports the read. Never a vague
   restatement of the style's name.
4. Write a 1-2 sentence summary of the overall read.
5. "name" must be copied exactly as it appears before the parenthesized era
   above — never append the era or anything else to it.

Return ONLY valid JSON:
{ "summary": string, "styles": [{ "name": string (exact taxonomy name, no era appended), "weight": number, "evidence": string }] }`;

export async function readStyle(params: {
  imageUrl: string;
  facts: MeasuredFacts;
  findings: AnalyzerResponse["findings"];
}): Promise<StyleRead> {
  const { data } = await generateJson({
    model: MODELS.vision,
    schema: styleReadSchema,
    schemaName: "style_read",
    system: SYSTEM_PROMPT,
    maxOutputTokens: 2500,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Measured facts:\n${factsToPrompt(params.facts, params.findings)}` },
          { type: "image", image: params.imageUrl },
        ],
      },
    ],
  });
  return data;
}
