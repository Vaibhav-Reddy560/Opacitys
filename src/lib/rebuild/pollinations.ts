import "server-only";

/**
 * Pollinations.ai — an image-editing provider for Rebuild. Tried FIRST in
 * edit.ts's escalation (its models are the best-tested for instruction
 * quality), but not reliable as the only provider — its credit model
 * disqualifies it from being load-bearing on its own. Pollen starts at
 * 0.0000, is earned only by manually completing "Quests" at
 * enter.pollinations.ai, and does NOT renew on any schedule. Measured
 * 2026-08-13: a handful of edits exhausted the balance and every model below
 * began returning 402. A feature cannot sit on a finite, hand-refilled
 * balance alone, which is why Cloudflare Workers AI (10k Neurons/day,
 * resetting at 00:00 UTC — see ./cloudflare.ts) escalates behind this.
 *
 * The real endpoint is `gen.pollinations.ai` (a Cloudflare Worker) — NOT the
 * documented `image.pollinations.ai`, which is legacy anonymous-only
 * infrastructure that rejects authenticated models outright with a
 * misleading "only available on enter.pollinations.ai" message.
 *
 * ── URL SHAPE. Read this before touching buildUrl(). ──
 *
 * The path is `/image/{prompt}` — NOT `/image/prompt/{prompt}`. The legacy
 * `image.` host used a literal `/prompt/` path segment; the `gen.` host does
 * not, and treats EVERYTHING after `/image/` as the prompt text. Getting this
 * wrong does not fail: it silently prepends the token "prompt/" to every
 * instruction. This was live in the app until 2026-08-13, verified against
 * the API's own echoed metadata, which came back reading:
 *
 *     "prompt": "prompt/Change the word Techonomy to Opacitys..."
 *
 * Every edit the feature ever made was polluted this way. The API echoes the
 * prompt it actually parsed in the response's EXIF, which is the only
 * reliable way to check this — assert on it, don't eyeball the URL.
 *
 * ── Model characteristics, all MEASURED live (2026-08-13), not read off the
 *    docs, because the docs get several of these wrong: ──
 *
 *   gptimage (GPT Image 1 Mini)  ~0.011/img  follows instructions reliably and
 *     renders text correctly, but only emits 1024x1024 / 1536x1024 /
 *     1024x1536 and snaps to one of them. Do not trust it even to honour
 *     the ORIENTATION asked for: a 1024x1536 (portrait) request came back
 *     1536x1024 (landscape). Callers must handle the returned size, never
 *     assume the requested one.
 *   gpt-image-2                   ~0.036/img  best prompt following of the set,
 *     max_reference_images 16. The escalation target.
 *   gptimage-large (GPT Image 1.5) ~0.05/img  high fidelity, rarely worth 5x.
 *   klein (FLUX.2 Klein 4B)       0.005/img  honors arbitrary width/height
 *     exactly, up to ~2.4MP, but is UNRELIABLE at instruction following — in
 *     live A/B it returned one test image completely unchanged while gptimage
 *     performed the same edit correctly. It is no longer used for edits; the
 *     old routing rule ("fall back to klein for extreme aspect ratios") sent
 *     the single most common case — a wide text layer — straight to it, which
 *     is a large part of why edits appeared to do nothing.
 *   kontext (FLUX.1 Kontext Pro)  0.040/img  same text weakness at 8x price.
 *
 * So the model is a decision, not a constant, and the decision is now
 * "gptimage, escalating to gpt-image-2", never klein.
 */

const BASE = "https://gen.pollinations.ai";

/** The only output sizes gptimage-family models can produce. Anything else snaps. */
const GPTIMAGE_SIZES = [
  { w: 1024, h: 1024 },
  { w: 1536, h: 1024 },
  { w: 1024, h: 1536 },
] as const;

/** klein's documented ceiling — 2.4MP. Kept a little under to be safe. */
const KLEIN_MAX_PIXELS = 2_300_000;

/**
 * Edit models, in escalation order. The caller retries down this list when
 * verification says an edit didn't land (see ./verify.ts) — a different model
 * is a far better second attempt than the same model with a new seed.
 */
export const EDIT_MODELS = ["gptimage", "gpt-image-2"] as const;
export type EditModel = (typeof EDIT_MODELS)[number] | "klein" | "gptimage-large";

export interface PlannedSize {
  width: number;
  height: number;
  /** True when the model cannot produce the requested aspect and will reframe. */
  reframed: boolean;
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

/** Not "broken", just "no Pollen" — so the caller can fall back rather than fail. */
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
 * The size a given model will ACTUALLY produce for a requested box.
 *
 * `reframed` is the important field: when true, the model is going to letterbox
 * or crop the content into a different aspect, and the caller MUST NOT scale
 * the result back with `fit: "fill"` — that squashes the design. It should
 * `fit: "cover"` and centre-crop instead, or decline the edit.
 */
export function planSize(model: EditModel, width: number, height: number): PlannedSize {
  const ratio = width / height;

  if (model === "klein") {
    // Snap to /16: diffusion models quantize dimensions, and rounding here
    // keeps the returned size predictable instead of silently off-by-a-few.
    const scale = Math.min(1, Math.sqrt(KLEIN_MAX_PIXELS / (width * height)));
    return {
      width: Math.max(16, Math.round((width * scale) / 16) * 16),
      height: Math.max(16, Math.round((height * scale) / 16) * 16),
      reframed: false,
    };
  }

  let best: { w: number; h: number } = GPTIMAGE_SIZES[0];
  let bestErr = Infinity;
  for (const size of GPTIMAGE_SIZES) {
    const err = Math.abs(Math.log(size.w / size.h / ratio));
    if (err < bestErr) {
      bestErr = err;
      best = size;
    }
  }
  // 8% is about where reframing becomes visible to the eye.
  return { width: best.w, height: best.h, reframed: bestErr > 0.08 };
}

function buildUrl(params: {
  instruction: string;
  model: EditModel;
  images: string[];
  width: number;
  height: number;
  seed: number;
}): URL {
  // `/image/{prompt}` — see the URL SHAPE note at the top of this file. The
  // prompt is a PATH segment, so it is encoded here and nowhere else.
  const url = new URL(`${BASE}/image/${encodeURIComponent(params.instruction)}`);
  url.searchParams.set("model", params.model);
  // Multiple reference images are comma-separated; verified live 2026-08-13,
  // the API echoes them back as a parsed array. Each URL must be encoded
  // individually so that a comma inside one can't split the list.
  url.searchParams.set("image", params.images.map((u) => encodeURIComponent(u)).join(","));
  url.searchParams.set("width", String(params.width));
  url.searchParams.set("height", String(params.height));
  url.searchParams.set("seed", String(params.seed));
  url.searchParams.set("nologo", "true");
  if (params.model !== "klein") url.searchParams.set("quality", "high");
  return url;
}

/**
 * The prompt the API says it actually parsed, read out of the response's own
 * EXIF blob. This is the only trustworthy check that the URL shape is right —
 * a malformed path does not error, it silently mangles the prompt. Returns
 * null when the metadata isn't present or isn't parseable, which is not
 * itself a failure.
 */
export function parseEchoedPrompt(bytes: Buffer): string | null {
  const head = bytes.subarray(0, 4096).toString("latin1");
  const start = head.indexOf('{"prompt"');
  if (start < 0) return null;
  // The blob is followed by binary, so walk back from the end to the longest
  // prefix that parses rather than trying to find the closing brace.
  const candidate = head.slice(start);
  for (let end = Math.min(candidate.length, 2048); end > 16; end--) {
    try {
      const parsed = JSON.parse(candidate.slice(0, end)) as { prompt?: unknown };
      return typeof parsed.prompt === "string" ? parsed.prompt : null;
    } catch {
      // keep shrinking
    }
  }
  return null;
}

/**
 * Applies a natural-language instruction to one or more images, via their
 * PUBLIC URLs — Pollinations fetches them server-side. There is no POST or
 * base64 form of this endpoint, which is why callers have to upload a crop
 * before they can edit it.
 *
 * `images[0]` is the image being edited. Any further entries are context/style
 * references (the full design, typically) — models in EDIT_MODELS accept up
 * to 16. Giving the model the whole design is what makes an instruction like
 * "match the font used elsewhere" answerable at all; editing a bare crop
 * cannot honour it.
 *
 * The returned bytes are JPEG (the API has no alpha-capable output), so the
 * caller owns compositing this back over the original.
 */
export async function editImage(params: {
  images: string[];
  instruction: string;
  /** The region's true pixel size. planSize() decides what to actually ask for. */
  width: number;
  height: number;
  model?: EditModel;
  /** Vary between retries — a repeated seed reproduces a failed edit exactly. */
  seed?: number;
}): Promise<{
  bytes: Buffer;
  width: number;
  height: number;
  model: EditModel;
  reframed: boolean;
  echoedPrompt: string | null;
}> {
  const model = params.model ?? EDIT_MODELS[0];
  const seed = params.seed ?? Math.floor(Math.random() * 1_000_000);
  const plan = planSize(model, params.width, params.height);

  const url = buildUrl({
    instruction: params.instruction,
    model,
    images: params.images,
    width: plan.width,
    height: plan.height,
    seed,
  });

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

  const echoedPrompt = parseEchoedPrompt(bytes);
  // Loud, because the failure mode is silent corruption of every prompt.
  if (echoedPrompt && echoedPrompt !== params.instruction) {
    console.warn(
      `[rebuild] Pollinations parsed a different prompt than was sent.\n  sent: ${JSON.stringify(params.instruction.slice(0, 120))}\n  got:  ${JSON.stringify(echoedPrompt.slice(0, 120))}`,
    );
  }

  return {
    bytes,
    width: plan.width,
    height: plan.height,
    model,
    reframed: plan.reframed,
    echoedPrompt,
  };
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
      "Pollinations is out of Pollen. It's earned for free (never bought) by completing Quests at enter.pollinations.ai, and doesn't refill on its own.",
    );
  }
  return new PollinationsError(`The edit service failed (${status}): ${message}`, status);
}
