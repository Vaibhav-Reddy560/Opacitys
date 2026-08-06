import "server-only";
import { z } from "zod";
import { generateJson, GroqRateLimitError, MODELS } from "@/lib/ai/models";
import type { DesignElement } from "./decompose";

const namesSchema = z.object({
  names: z.array(z.object({ id: z.string(), name: z.string(), note: z.string() })),
});

// qwen (MODELS.vision) is not in STRICT_SCHEMA_MODELS — the literal
// every-key JSON template below is load-bearing, not decoration. Omitting
// it dropped required fields on Instruments' screenshot path in live
// testing (see feedback_non_strict_json_schema_prompting in project memory).
const SYSTEM_PROMPT = `You are labeling the layers of a decomposed graphic design. You are given
the original image and a MEASURED inventory of elements — each one's kind
(shape/text/gradient/image/effect), primitive if it's a shape, bounding box,
and fill color. These were computed deterministically by pixel measurement.
You never see or guess geometry; you only name and describe what's already
measured.

Your only job: for every element id in the inventory, give it
(1) a short name (2-4 words) a designer would actually use in a layers
panel — e.g. "Headline", "Background gradient", "CTA button", "Logo mark" —
and (2) a one-line note about its role in the design.

Hard rules:
1. Respond for EVERY id given — never skip one, never invent a new one.
2. Never restate or contradict kind/bbox/fill — you only add a name and a note.
3. If you can't tell anything specific about an element's role, give it a
   plain descriptive name close to its primitive/kind rather than guessing
   — e.g. "Rounded rectangle" rather than inventing "Submit button".

Return ONLY valid JSON in exactly this shape, one entry per id, every key present:
{ "names": [ { "id": "el_0", "name": "Background gradient", "note": "Sets the page's overall mood" } ] }`;

export interface ElementName {
  name: string;
  note: string;
}

/**
 * One vision call over the whole element inventory at once — not one call
 * per element, which would multiply the Groq budget by element count. The
 * model receives only the computed inventory and the source image; it
 * cannot move a bbox or invent a kind, matching grounding.ts's contract for
 * Critique (measurement is truth, the model writes prose). A failed or
 * rate-limited call means an empty map — callers keep the deterministic
 * primitive-fitter names already on each DesignElement, never a blank layer.
 */
export async function nameElements(imageUrl: string, elements: DesignElement[]): Promise<Map<string, ElementName>> {
  const result = new Map<string, ElementName>();
  if (elements.length === 0) return result;

  const inventory = elements.map((el) => ({
    id: el.id,
    kind: el.kind,
    primitive: el.primitive ?? null,
    bbox: el.bbox.map((v) => Math.round(v)),
    fill: el.fill,
    confidence: Math.round(el.confidence * 100) / 100,
  }));

  try {
    const { data } = await generateJson({
      model: MODELS.vision,
      schema: namesSchema,
      schemaName: "rebuild_names",
      system: SYSTEM_PROMPT,
      maxOutputTokens: 2500,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Measured elements:\n${JSON.stringify(inventory, null, 2)}` },
            { type: "image", image: imageUrl },
          ],
        },
      ],
    });
    for (const n of data.names) result.set(n.id, { name: n.name, note: n.note });
  } catch (err) {
    if (err instanceof GroqRateLimitError) throw err;
    console.error("[rebuild] naming failed, falling back to deterministic names:", err);
  }

  return result;
}
