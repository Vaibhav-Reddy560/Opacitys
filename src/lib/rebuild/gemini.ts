import "server-only";
import { z } from "zod";

/**
 * Google Gemini — Rebuild's only external model dependency, chosen because
 * it is the one provider that does BOTH halves of this feature on a
 * genuinely free tier (500 requests/day, 10 RPM, no card):
 *
 *   - detectLayers -> documented bounding-box grounding. Open-vocabulary,
 *     so it returns "button"/"logo"/"navigation bar" rather than a fixed
 *     COCO class list, which is exactly the layer panel's vocabulary.
 *   - editImage    -> instruction-based image editing ("nano-banana"),
 *     strong at re-rendering text, which is what makes "change the button
 *     label" work at all.
 *
 * Raw fetch, no SDK — same shape as src/lib/portfolio/dribbble.ts.
 *
 * IMPORTANT: Google currently serves two request shapes, and which one a
 * given key/model answers on has moved over time — the newer `/interactions`
 * envelope and the long-stable `models/{id}:generateContent`. Rather than
 * betting on one, every call tries Interactions first and falls back to
 * generateContent, and both response shapes are parsed leniently. This is
 * the only file in Rebuild that touches the wire format; everything
 * downstream depends solely on the two exported functions' own types.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Text+vision model for grounding. */
const DETECT_MODEL = "gemini-2.5-flash";
/** Image-output model ("nano-banana"). */
const IMAGE_MODEL = "gemini-2.5-flash-image";

export function hasGeminiKey(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export class GeminiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

/** Rate limit / quota exhaustion on the free tier, surfaced distinctly so callers can say something useful. */
export class GeminiQuotaError extends GeminiError {
  constructor(message: string) {
    super(message, 429);
    this.name = "GeminiQuotaError";
  }
}

function requireKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");
  return key;
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": requireKey() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON error body (HTML error page, proxy timeout) — `text` still carries it.
  }
  return { ok: res.ok, status: res.status, json, text };
}

/**
 * A 404/405 means this deployment doesn't serve that envelope at all, so
 * the other one is worth trying. A 400 can mean either a genuinely bad
 * request OR an unknown-field rejection from the wrong envelope, so it also
 * falls through. Anything else (401 bad key, 429 quota, 5xx) is a real
 * failure that the other shape would hit identically.
 */
function shouldTryFallback(status: number): boolean {
  return status === 404 || status === 405 || status === 400;
}

function raise(status: number, text: string): never {
  if (status === 429) {
    throw new GeminiQuotaError(
      "Gemini's free-tier limit was hit (500 requests/day, 10 per minute). Wait a moment and try again.",
    );
  }
  throw new GeminiError(`Gemini request failed (${status}): ${text.slice(0, 300)}`, status);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface DetectedLayer {
  /** Semantic type, constrained to the layer panel's vocabulary. */
  kind: "logo" | "text" | "button" | "image" | "icon" | "shape" | "section";
  /** x, y, w, h in the SOURCE image's pixel space. */
  bbox: [number, number, number, number];
  /** One short phrase about the element's role, or null. */
  note: string | null;
  confidence: number;
}

const KINDS = ["logo", "text", "button", "image", "icon", "shape", "section"] as const;

// Gemini's documented grounding format: box_2d is [ymin, xmin, ymax, xmax]
// normalized to 0-1000, NOT pixels and NOT xywh. Getting this order wrong
// silently produces transposed boxes, so it is parsed explicitly here and
// converted once, in denormalize() below.
const detectionSchema = z.object({
  elements: z
    .array(
      z.object({
        box_2d: z.array(z.number()).length(4),
        label: z.string(),
        kind: z.string(),
        note: z.string().nullish(),
      }),
    )
    .default([]),
});

const DETECT_PROMPT = `You are decomposing a piece of graphic design (a poster, a logo, a UI screen) into the layers a designer would actually see in a layers panel.

Find every distinct visual element. For each one give:
- "box_2d": [ymin, xmin, ymax, xmax] normalized to 0-1000
- "kind": exactly one of "section", "logo", "text", "button", "image", "icon", "shape"
- "label": 1-3 words for what it is ("headline", "sign in link", "hero image")
- "note": one short phrase on its role in the design, or null

Rules:
1. Include the 2-5 large structural BANDS as kind "section" (e.g. a navigation bar, a hero/central section, a footer). These should contain the smaller elements inside them.
2. Then every individual element: each separate block of text, each button, each logo, each icon, each photo.
3. A button and its label are ONE element of kind "button" — do not also emit the label as separate text.
4. Group a paragraph of body copy into ONE "text" element, not one per line.
5. Do NOT invent elements that are not visible. Do NOT emit decorative gradients or background washes as their own element.
6. Aim for 6-20 elements total. Never more than 40.

Return ONLY valid JSON in exactly this shape, every key present on every entry:
{"elements":[{"box_2d":[120,40,180,300],"kind":"text","label":"headline","note":"The main promise of the page"}]}`;

function coerceKind(raw: string): DetectedLayer["kind"] {
  const k = raw.trim().toLowerCase();
  const hit = KINDS.find((v) => v === k);
  if (hit) return hit;
  // Common near-misses from an open-vocabulary model.
  if (k.includes("nav") || k.includes("section") || k.includes("header") || k.includes("footer")) return "section";
  if (k.includes("photo") || k.includes("picture")) return "image";
  if (k.includes("btn") || k.includes("cta") || k.includes("link")) return "button";
  if (k.includes("title") || k.includes("heading") || k.includes("label") || k.includes("paragraph")) return "text";
  if (k.includes("mark") || k.includes("brand")) return "logo";
  return "shape";
}

/**
 * 0-1000 [ymin,xmin,ymax,xmax] -> pixel [x,y,w,h], clamped to the image.
 * Returns null for a box that is degenerate or entirely outside the frame.
 */
function denormalize(
  box: number[],
  width: number,
  height: number,
): [number, number, number, number] | null {
  const [ymin, xmin, ymax, xmax] = box;
  const x0 = Math.max(0, Math.min(width, (xmin / 1000) * width));
  const y0 = Math.max(0, Math.min(height, (ymin / 1000) * height));
  const x1 = Math.max(0, Math.min(width, (xmax / 1000) * width));
  const y1 = Math.max(0, Math.min(height, (ymax / 1000) * height));
  const w = x1 - x0;
  const h = y1 - y0;
  // Sub-2px in either axis is noise, not an element a designer would name.
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2) return null;
  return [Math.round(x0), Math.round(y0), Math.round(w), Math.round(h)];
}

/** Intersection-over-union, used to drop near-duplicate boxes for the same thing. */
function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

async function callDetect(prompt: string, imageBase64: string, mime: string): Promise<string> {
  // Newer envelope first.
  const interactions = await post(`${BASE}/interactions`, {
    model: DETECT_MODEL,
    input: [
      { type: "text", text: prompt },
      { type: "image", mime_type: mime, data: imageBase64 },
    ],
  });
  if (interactions.ok) {
    const text = extractText(interactions.json);
    if (text) return text;
  } else if (!shouldTryFallback(interactions.status)) {
    raise(interactions.status, interactions.text);
  }

  const classic = await post(`${BASE}/models/${DETECT_MODEL}:generateContent`, {
    contents: [
      {
        parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: imageBase64 } }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });
  if (!classic.ok) raise(classic.status, classic.text);
  const text = extractText(classic.json);
  if (!text) throw new GeminiError("Gemini returned no text output for detection.", 502);
  return text;
}

/** Pulls text out of either envelope without asserting a rigid shape. */
function extractText(json: unknown): string | null {
  const root = json as Record<string, unknown> | null;
  if (!root) return null;

  // Interactions: { steps: [{ content: [{ type: "text", text }] }] }
  const steps = root.steps;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      const content = (step as Record<string, unknown>)?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        const p = part as Record<string, unknown>;
        if (typeof p?.text === "string" && p.text.trim()) return p.text;
      }
    }
  }

  // generateContent: { candidates: [{ content: { parts: [{ text }] } }] }
  const candidates = root.candidates;
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const parts = ((c as Record<string, unknown>)?.content as Record<string, unknown>)?.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        const p = part as Record<string, unknown>;
        if (typeof p?.text === "string" && p.text.trim()) return p.text;
      }
    }
  }
  return null;
}

/** Strips ```json fences a model may wrap JSON in despite being asked not to. */
function parseJsonLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last resort: the outermost {...} span.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new GeminiError("Gemini's detection response was not valid JSON.", 502);
  }
}

/**
 * Finds the semantic elements in an image. `width`/`height` are the SOURCE
 * pixel dimensions the returned bboxes are expressed in.
 */
export async function detectLayers(params: {
  imageBytes: Buffer;
  mime: string;
  width: number;
  height: number;
}): Promise<Array<DetectedLayer & { label: string }>> {
  const { imageBytes, mime, width, height } = params;
  const text = await callDetect(DETECT_PROMPT, imageBytes.toString("base64"), mime);
  const parsed = detectionSchema.safeParse(parseJsonLoose(text));
  if (!parsed.success) {
    throw new GeminiError("Gemini's detection response did not match the expected shape.", 502);
  }

  const out: Array<DetectedLayer & { label: string }> = [];
  for (const el of parsed.data.elements) {
    const bbox = denormalize(el.box_2d, width, height);
    if (!bbox) continue;
    const kind = coerceKind(el.kind);
    // Drop a box that essentially repeats one already kept — models
    // routinely emit both "button" and its label at nearly the same box.
    if (out.some((prev) => iou(prev.bbox, bbox) > 0.9)) continue;
    out.push({
      kind,
      bbox,
      label: el.label?.trim() || kind,
      note: el.note?.trim() || null,
      confidence: 0.9,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * Gemini renders into a fixed set of aspect ratios, not arbitrary
 * dimensions, so an edit is snapped to whichever supported ratio is closest
 * to the source. Anything else would letterbox or crop the design.
 */
const ASPECTS: Array<{ label: string; value: number }> = [
  { label: "1:1", value: 1 },
  { label: "2:3", value: 2 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "4:5", value: 4 / 5 },
  { label: "5:4", value: 5 / 4 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
  { label: "21:9", value: 21 / 9 },
];

export function nearestAspectRatio(width: number, height: number): string {
  if (!width || !height) return "1:1";
  const target = width / height;
  let best = ASPECTS[0];
  let bestDelta = Infinity;
  for (const a of ASPECTS) {
    // Compared in log space so 16:9 vs 21:9 isn't dwarfed by 1:1 vs 9:16.
    const delta = Math.abs(Math.log(a.value) - Math.log(target));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = a;
    }
  }
  return best.label;
}

/** Pulls inline image bytes out of either envelope. */
function extractImage(json: unknown): Buffer | null {
  const root = json as Record<string, unknown> | null;
  if (!root) return null;

  const fromPart = (part: unknown): Buffer | null => {
    const p = part as Record<string, unknown>;
    if (!p) return null;
    // Interactions: { type: "image", data }
    if (p.type === "image" && typeof p.data === "string") return Buffer.from(p.data, "base64");
    // generateContent: { inlineData: { data } } / snake_case variant
    const inline = (p.inlineData ?? p.inline_data) as Record<string, unknown> | undefined;
    if (inline && typeof inline.data === "string") return Buffer.from(inline.data, "base64");
    return null;
  };

  const steps = root.steps;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      const content = (step as Record<string, unknown>)?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        const buf = fromPart(part);
        if (buf) return buf;
      }
    }
  }

  const candidates = root.candidates;
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const parts = ((c as Record<string, unknown>)?.content as Record<string, unknown>)?.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        const buf = fromPart(part);
        if (buf) return buf;
      }
    }
  }
  return null;
}

/**
 * Applies a natural-language instruction to an image and returns the new
 * image's bytes.
 *
 * This is a REGENERATION, not a patch: the model redraws the whole frame
 * with the instruction applied. Regions the instruction doesn't mention
 * come back very close to the original but are not guaranteed
 * pixel-identical, and the output lands at ~1K in `aspectRatio` rather than
 * the source's exact dimensions. Callers must not present the result as an
 * edit of the user's original file.
 */
export async function editImage(params: {
  imageBytes: Buffer;
  mime: string;
  instruction: string;
  aspectRatio: string;
}): Promise<Buffer> {
  const { imageBytes, mime, instruction, aspectRatio } = params;
  const base64 = imageBytes.toString("base64");
  const prompt = `${instruction}\n\nKeep everything else in the image exactly as it is — same layout, same colors, same typography, same style. Change only what was asked for.`;

  const interactions = await post(`${BASE}/interactions`, {
    model: IMAGE_MODEL,
    input: [
      { type: "text", text: prompt },
      { type: "image", mime_type: mime, data: base64 },
    ],
    response_format: { type: "image", mime_type: "image/png", aspect_ratio: aspectRatio, image_size: "1K" },
  });
  if (interactions.ok) {
    const img = extractImage(interactions.json);
    if (img) return img;
  } else if (!shouldTryFallback(interactions.status)) {
    raise(interactions.status, interactions.text);
  }

  const classic = await post(`${BASE}/models/${IMAGE_MODEL}:generateContent`, {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  });
  if (!classic.ok) raise(classic.status, classic.text);
  const img = extractImage(classic.json);
  if (!img) throw new GeminiError("Gemini returned no image for that edit.", 502);
  return img;
}
