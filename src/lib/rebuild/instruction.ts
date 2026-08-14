import "server-only";
import { z } from "zod";
import { generateJson, MODELS } from "@/lib/ai/models";

/**
 * Turns what a person typed into what an image model can act on.
 *
 * These two are not the same thing, and the gap is a real source of failed
 * edits. A frustrated user quite reasonably spells the change out — the
 * instruction behind the reference failure was 250 characters that said the
 * same thing four times:
 *
 *   'Here, change the text of "starting" to "closing". But try to keep the
 *    font the same. Imagine it in the same font, and also I want the font
 *    size to be the same. I don't want you to make a different font size.
 *    Keep it the same as the font size for the text "starting".'
 *
 * Image models follow a short imperative far better than a long one with
 * repeated hedging, and the old code made this worse by appending its own
 * paragraph of "preserve everything else" boilerplate on top — so the actual
 * request ended up a minority of the prompt. Normalising first is cheap
 * (Groq, free tier, already wired) and strictly improves what the image model
 * sees.
 *
 * The classification is load-bearing too: a `text` edit can be done
 * deterministically — erase the old glyphs, render the new string from font
 * outlines — with no generative model touching the letterforms at all, which
 * is both free and exact. Everything else has to go through a model.
 */

export type EditKind = "text" | "color" | "remove" | "other";

export interface NormalizedInstruction {
  /** Short imperative, the thing actually sent to the image model. */
  directive: string;
  kind: EditKind;
  /** For `text` edits: the string being replaced, verbatim, as it appears in the design. */
  fromText: string | null;
  /** For `text` edits: what it should say instead. */
  toText: string | null;
}

const schema = z.object({
  directive: z.string(),
  kind: z.enum(["text", "color", "remove", "other"]),
  fromText: z.string().nullish(),
  toText: z.string().nullish(),
});

const SYSTEM = `You rewrite a designer's edit request into a single short command for an image-editing model, and classify it.

Rules:
- "directive": ONE imperative sentence, under 20 words. Strip all politeness, repetition, hedging and restated constraints. Do not add "keep everything else the same" — the caller adds its own preservation clause.
- "kind": "text" if the request replaces or rewrites written words in the image. "color" if it only changes a colour. "remove" if it deletes an element. Otherwise "other".
- "fromText": for kind "text", the EXACT existing string being replaced, copied verbatim from the request. Otherwise null.
- "toText": for kind "text", the exact replacement string. Otherwise null.
- Preserve the user's capitalisation for fromText/toText. Do not invent text that wasn't specified.

Example input:
  Here, change the text of "starting" to "closing". But try to keep the font the same. I want the font size to be the same too.

Return ONLY valid JSON in exactly this shape, every key present:
{"directive":"Replace the word \\"starting\\" with \\"closing\\".","kind":"text","fromText":"starting","toText":"closing"}`;

/**
 * A conservative local read, used when the model call fails. It must never
 * guess a text replacement — a wrong fromText/toText would send the
 * deterministic text path at the wrong glyphs, which is worse than falling
 * back to the generic model path.
 */
function fallback(instruction: string): NormalizedInstruction {
  return {
    directive: instruction.trim().slice(0, 300),
    kind: "other",
    fromText: null,
    toText: null,
  };
}

export async function normalizeInstruction(instruction: string): Promise<NormalizedInstruction> {
  try {
    const { data } = await generateJson({
      model: MODELS.reasoning,
      schema,
      schemaName: "rebuild_edit_instruction",
      system: SYSTEM,
      messages: [{ role: "user", content: instruction }],
      maxOutputTokens: 300,
    });

    const directive = data.directive?.trim();
    if (!directive) return fallback(instruction);

    const fromText = data.fromText?.trim() || null;
    const toText = data.toText?.trim() || null;
    // A "text" classification without both halves can't drive the
    // deterministic path, so demote it rather than half-applying it.
    const kind: EditKind = data.kind === "text" && !(fromText && toText) ? "other" : data.kind;

    return { directive, kind, fromText, toText };
  } catch (err) {
    console.error("[rebuild] instruction normalization failed, using the raw text:", err);
    return fallback(instruction);
  }
}

/**
 * Wraps a normalized directive with a preservation clause and, for a scoped
 * edit, where to apply it.
 *
 * Deliberately short. The previous version of this prompt was three sentences
 * of "do not move, resize, recolor or remove anything else", which competed
 * with the instruction for the model's attention while the model could only
 * see a bare crop anyway — it had no way to honour "match the rest of the
 * design" because the rest of the design wasn't in the request. The crop is
 * now sent alongside the full design as a second reference image, so the
 * preservation clause can be brief and actually meaningful.
 */
export function buildEditPrompt(params: {
  directive: string;
  /** Present for a scoped edit: the selected layer's name and where it sits. */
  target?: string | null;
  /** True when a second reference image (the full design) is attached. */
  hasContextImage: boolean;
}): string {
  const where = params.target ? `In ${params.target}: ` : "";
  const context = params.hasContextImage
    ? " The second image is the full design for style reference only — do not copy its framing."
    : "";
  return `${where}${params.directive} Change nothing else; keep the existing layout, colours and typography.${context}`;
}
