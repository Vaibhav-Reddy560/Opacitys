import "server-only";
import { z } from "zod";
import { generateJson, MODELS } from "@/lib/ai/models";
import type { MeasuredFacts } from "@/lib/measure";

const signatureSchema = z.object({
  subject: z.string(),
  composition: z.string(),
  palette: z.string(),
  typeTreatment: z.string(),
  texture: z.string(),
  eraCues: z.string(),
});

const SIGNATURE_SYSTEM = `You describe a design's direction in concrete,
specific terms — for use as input to a separate step that will compare it
against known design movements. Do not name a movement yourself here; just
describe what's actually there: the subject matter, how it's composed,
the palette, how type is treated (if any), texture/finish, and any visual
cues that suggest a particular era or scene. Use the measured facts given to
you as supporting evidence, not the only signal.

Return ONLY valid JSON:
{ "subject": string, "composition": string, "palette": string, "typeTreatment": string, "texture": string, "eraCues": string }`;

function factsToPrompt(facts: MeasuredFacts): string {
  const lines: string[] = [];
  if (facts.dominantColors.length > 0) lines.push(`Dominant colors: ${facts.dominantColors.join(", ")}`);
  if (facts.avgTextContrast !== null) lines.push(`Average text/background contrast: ${facts.avgTextContrast}:1`);
  if (facts.distinctTypeSizes !== null) lines.push(`Distinct type sizes: ${facts.distinctTypeSizes}`);
  if (facts.alignmentRatio !== null) lines.push(`Content alignment ratio: ${facts.alignmentRatio}`);
  lines.push(`Text lines detected: ${facts.textLineCount}`);
  return lines.join("\n");
}

async function describeImage(imageUrl: string, facts: MeasuredFacts): Promise<string> {
  const { data } = await generateJson({
    model: MODELS.vision,
    schema: signatureSchema,
    schemaName: "direction_signature",
    system: SIGNATURE_SYSTEM,
    maxOutputTokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Measured facts:\n${factsToPrompt(facts)}` },
          { type: "image", image: imageUrl },
        ],
      },
    ],
  });
  return [
    `Subject: ${data.subject}`,
    `Composition: ${data.composition}`,
    `Palette: ${data.palette}`,
    `Type treatment: ${data.typeTreatment}`,
    `Texture: ${data.texture}`,
    `Era cues: ${data.eraCues}`,
  ].join("\n");
}

const neighbourSchema = z.object({
  name: z.string(),
  kind: z.enum(["movement", "studio", "campaign", "artist", "platform-trend"]),
  era: z.string(),
  whyClose: z.string(),
  closeness: z.number().min(0).max(100),
});

const crowdingResultSchema = z.object({
  crowding: z.number().min(0).max(100),
  neighbours: z.array(neighbourSchema).min(0).max(6),
  distinctives: z.array(z.string()).max(6),
  moves: z.array(z.string()).max(6),
  confidence: z.enum(["low", "medium", "high"]),
  basis: z.string(),
});
export type CrowdingResult = z.infer<typeof crowdingResultSchema>;

const CROWDING_SYSTEM = `You help a graphic designer understand how crowded a
creative direction already is — not to talk them out of it, but so they know
upfront what it's already sitting close to.

Rules:
1. Only name widely-documented movements, studios, campaigns, artists, or
   platform-native trends you're genuinely confident are real and well
   known — never an obscure or invented specific work. If you can't think of
   a real, well-documented neighbor, return fewer neighbours rather than
   inventing one.
2. "crowding" (0-100): how saturated this territory is. 0 means genuinely
   hard to place against anything documented; 100 means this reads as a
   near-copy of an extremely well-known reference.
3. Each neighbour needs a concrete "whyClose" — a specific shared trait, not
   a vague "similar vibe".
4. "distinctives": what's genuinely different about this direction from its
   nearest neighbours — real differences, not consolation prizes.
5. "moves": concrete, actionable changes that would widen the gap from the
   closest neighbour — specific enough to actually do.
6. "confidence": "low" if the description is too vague/generic to place with
   any real signal, "high" only if there's a clear, specific match.
7. "basis": one honest sentence on what this read is actually grounded in
   (e.g. "documented movements and studios widely covered in design
   writing") — this is read against what's publicly documented, not a live
   index of every design that exists, and the summary should never imply
   otherwise.

Return ONLY valid JSON matching the schema.`;

export async function readOriginality(params: {
  description: string;
  imageUrl?: string;
  facts?: MeasuredFacts;
}): Promise<CrowdingResult> {
  let imageContext = "";
  if (params.imageUrl && params.facts) {
    imageContext = `\n\nAttached image, described:\n${await describeImage(params.imageUrl, params.facts)}`;
  }

  const { data } = await generateJson({
    model: MODELS.reasoning,
    schema: crowdingResultSchema,
    schemaName: "crowding_result",
    system: CROWDING_SYSTEM,
    maxOutputTokens: 2000,
    messages: [
      {
        role: "user",
        content: `Direction, described by the designer:\n${params.description}${imageContext}`,
      },
    ],
  });
  return data;
}
