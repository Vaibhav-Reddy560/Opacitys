import "server-only";

/**
 * Pollinations.ai — Rebuild's image-EDITING provider. Chosen over Gemini's
 * own image model for one reason: it genuinely never asks for a card.
 * Gemini's `gemini-*-image` models return a hard 0-quota 429 on the free
 * tier until a Google Cloud project has billing linked (confirmed live,
 * 2026-08-07) — usage would still cost $0 under quota, but a card has to be
 * on file, which this app's constraint rules out entirely.
 *
 * The real endpoint is `gen.pollinations.ai` (a Cloudflare Worker) — NOT
 * the documented `image.pollinations.ai`, which is legacy anonymous-only
 * infrastructure that rejects authenticated models outright with a
 * misleading "only available on enter.pollinations.ai" message.
 *
 * Editing costs Pollen, earned for free (never bought) by completing
 * "Quests" at enter.pollinations.ai. A fresh account starts at 0.0000, so
 * editImage() may legitimately fail until the user does that — surfaced as
 * PollinationsBalanceError, never silently retried or faked.
 *
 * ── Model characteristics, all MEASURED live (2026-08-07), not read off
 *    the docs, because the docs get two of these wrong: ──
 *
 *   gptimage (GPT Image 1 Mini)  ~0.006/img  renders text CORRECTLY, but
 *     only emits 1024x1024 / 1536x1024 / 1024x1536 and silently snaps to
 *     the nearest — ask for 2336x640 and you get 1536x1024, reframed.
 *   klein (FLUX.2 Klein 4B)       0.005/img  honors arbitrary width/height
 *     exactly, up to ~2.4MP, but MANGLES text ("Techonomy" -> "Techommngy").
 *   kontext (FLUX.1 Kontext Pro)  0.040/img  same text weakness as klein at
 *     8x the price. Deliberately not used.
 *   gpt-image-2                              rejects transparent=true (400).
 *
 * So the model is a decision, not a constant: prefer gptimage because text
 * edits are the common case in a design tool and it is the only one that
 * gets them right; fall back to klein when the geometry we need isn't one
 * gptimage can actually produce.
 */

const BASE = "https://gen.pollinations.ai";

/** The only output sizes gptimage can actually produce. Anything else snaps. */
const GPTIMAGE_SIZES = [
  { w: 1024, h: 1024 },
  { w: 1536, h: 1024 },
  { w: 1024, h: 1536 },
] as const;

/**
 * How far a requested aspect ratio may sit from a gptimage size before we
 * give up on text fidelity and take klein's exact-dimension behaviour
 * instead. 8% is about the point where the reframing becomes visible.
 */
const RATIO_TOLERANCE = 0.08;

/** klein's documented ceiling — 2.4MP. Kept a little under to be safe. */
const KLEIN_MAX_PIXELS = 2_300_000;

export type EditModel = "gptimage" | "klein";

export interface PlannedSize {
  model: EditModel;
  width: number;
  height: number;
}

export function hasPollinationsKey(): boolean {
  return !!process.env.POLLINATIONS_API_KEY;
}

export class PollinationsError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PollinationsError";
    this.status = status;
  }
}

/** Not "broken", just "no Pollen yet" — so the caller can say something actionable. */
export class PollinationsBalanceError extends PollinationsError {
  constructor(message: string) {
    super(message, 402);
    this.name = "PollinationsBalanceError";
  }
}

function requireKey(): string {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) throw new Error("POLLINATIONS_API_KEY is not set.");
  return key;
}

/**
 * Picks the model and the exact output size for a region of `width`x`height`.
 *
 * Returning the size the model will ACTUALLY produce (rather than the one we
 * wish for) is the whole point: the caller scales the returned patch back to
 * the region's true pixel box, so a mismatch here shows up as a stretched
 * composite rather than a silent reframe.
 */
/**
 * Nearest of gptimage's 3 fixed ratios, by log-distance (so "twice as wide"
 * and "twice as tall" are treated symmetrically). This is exposed separately
 * from planSize() so a caller can shape a CROP toward gptimage's strengths
 * — reasoning about "is this worth reshaping for" is the caller's business
 * (it knows the real cost: how much extra image content a reshape sweeps
 * in); planSize() stays the single source of truth for which model a given
 * box will actually be sent to.
 */
export function nearestGptimageRatio(ratio: number): number {
  let best = GPTIMAGE_SIZES[0].w / GPTIMAGE_SIZES[0].h;
  let bestErr = Infinity;
  for (const size of GPTIMAGE_SIZES) {
    const r = size.w / size.h;
    const err = Math.abs(Math.log(r / ratio));
    if (err < bestErr) {
      bestErr = err;
      best = r;
    }
  }
  return best;
}

export function planSize(width: number, height: number): PlannedSize {
  const ratio = width / height;

  let best: { w: number; h: number } = GPTIMAGE_SIZES[0];
  let bestErr = Infinity;
  for (const size of GPTIMAGE_SIZES) {
    const err = Math.abs(size.w / size.h - ratio) / ratio;
    if (err < bestErr) {
      bestErr = err;
      best = size;
    }
  }
  if (bestErr <= RATIO_TOLERANCE) {
    return { model: "gptimage", width: best.w, height: best.h };
  }

  // Too far from anything gptimage can emit — klein honors the real ratio.
  // Snap to /16: diffusion models quantize dimensions and rounding it here
  // keeps the returned size predictable instead of silently off-by-a-few.
  const scale = Math.min(1, Math.sqrt(KLEIN_MAX_PIXELS / (width * height)));
  const w = Math.max(16, Math.round((width * scale) / 16) * 16);
  const h = Math.max(16, Math.round((height * scale) / 16) * 16);
  return { model: "klein", width: w, height: h };
}

/**
 * Applies a natural-language instruction to an image, via that image's own
 * PUBLIC URL — Pollinations fetches it server-side. There is no POST/base64
 * form of this endpoint (confirmed against their docs), which is why callers
 * have to upload a crop before they can edit it.
 *
 * The returned bytes are JPEG (the API has no alpha-capable output), so the
 * caller owns compositing this back over the original if transparency or
 * untouched pixels matter.
 */
export async function editImage(params: {
  imageUrl: string;
  instruction: string;
  /** The region's true pixel size. planSize() decides what to actually ask for. */
  width: number;
  height: number;
}): Promise<{ bytes: Buffer; width: number; height: number; model: EditModel }> {
  const { imageUrl, instruction } = params;
  const plan = planSize(params.width, params.height);

  const url = new URL(`${BASE}/image/prompt/${encodeURIComponent(instruction)}`);
  url.searchParams.set("model", plan.model);
  url.searchParams.set("image", imageUrl);
  url.searchParams.set("width", String(plan.width));
  url.searchParams.set("height", String(plan.height));
  url.searchParams.set("nologo", "true");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${requireKey()}` } });

  if (!res.ok) {
    throw await toError(res.status, await res.text().catch(() => ""));
  }

  const contentType = res.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await res.arrayBuffer());

  // A 200 that isn't an image means the edit failed in a way the API still
  // called success — surface it rather than persisting HTML as a PNG.
  if (!contentType.startsWith("image/")) {
    throw await toError(502, bytes.toString("utf8"));
  }

  return { bytes, width: plan.width, height: plan.height, model: plan.model };
}

/** Maps a failure body onto the most specific error we can justify. */
async function toError(status: number, body: string): Promise<PollinationsError> {
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body);
    message = parsed?.error?.message ?? parsed?.message ?? message;
  } catch {
    // Not JSON — the raw text above is all there is.
  }

  if (status === 402 || /insufficient balance/i.test(message)) {
    return new PollinationsBalanceError(
      "Editing needs Pollen credits, which are earned for free (never bought) by completing Quests at enter.pollinations.ai. Your account doesn't have any yet.",
    );
  }
  return new PollinationsError(`The edit service failed (${status}): ${message}`, status);
}
