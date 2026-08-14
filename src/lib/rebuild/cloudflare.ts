import "server-only";

/**
 * Cloudflare Workers AI — Rebuild's generative edit provider for anything
 * that isn't a text replacement. Free tier, 10,000 Neurons/day resetting at
 * 00:00 UTC — a renewable daily budget, unlike Pollinations' Pollen, which
 * starts at 0.0000 and has no refill schedule at all (earned only by
 * completing Quests at enter.pollinations.ai, by hand).
 *
 * Two models, two genuinely different contracts. Both were verified live
 * against this account (2026-08-14), not read off Cloudflare's docs — the
 * docs for both are incomplete or actively wrong in ways that matter:
 *
 *   flux-2-klein-9b (@cf/black-forest-labs/flux-2-klein-9b)
 *     multipart/form-data request (a plain JSON body errors: "required
 *     properties at '/' are 'multipart'"). Fields: "prompt" (text), "image"
 *     (a Blob — optional, omit for pure generation). A "mask" field is
 *     ACCEPTED WITHOUT ERROR but has no effect: sending the same crop and
 *     prompt with and without a mask produced near-identical output. This is
 *     img2img/crop-regeneration, not true inpainting, despite Cloudflare's
 *     own catalog describing it as "editing" — treat it exactly like
 *     Pollinations' models (see ./pollinations): crop, regenerate the whole
 *     thing, composite the result back through OUR OWN feathered mask.
 *     Response is JSON: {"result":{"image": "<base64 JPEG>"}}. Always
 *     1024x1024 regardless of input size — never trust the input aspect to
 *     survive.
 *     Quality, measured on the reference poster (a design element with
 *     existing detail, asked to become "a plain navy blue circular badge,
 *     no text, flat color"): followed the instruction exactly — flat navy
 *     circle, no hallucinated text. This is the model to prefer.
 *
 *   stable-diffusion-v1-5-inpainting (@cf/runwayml/stable-diffusion-v1-5-inpainting)
 *     Plain JSON body. Fields: "prompt" (text), "image" (array of PNG-ENCODED
 *     bytes — i.e. Array.from(pngBuffer), NOT raw decoded pixels: sending raw
 *     pixel bytes fails server-side with a PIL "UnidentifiedImageError",
 *     because the model re-decodes the array as an image file), "mask" (same
 *     shape, white = edit), "num_steps" (max 20). Response is RAW BINARY PNG
 *     directly in the body — not JSON, not base64 — a genuinely different
 *     envelope from klein's, on the same platform.
 *     This one's mask IS real: a simple fill request respected the boundary
 *     exactly (confirmed pixel-for-pixel against the untouched region). But
 *     on the same hard prompt above it hallucinated a garbled crest with
 *     nonsense pseudo-text — identical failure mode to what this app's own
 *     abandoned local Core ML build of the exact same checkpoint produced.
 *     Same weights Cloudflare hosts as this app once ran locally — not a
 *     coincidence, a confirmation: this is SD1.5 itself being weak at
 *     instructions and text, not an implementation bug on either side.
 *     Kept as a secondary attempt for its precise mask boundary, not as the
 *     first choice.
 */

const ACCOUNT_ENV = "CLOUDFLARE_ACCOUNT_ID";
const TOKEN_ENV = "CLOUDFLARE_API_TOKEN";

export function hasCloudflareCredentials(): boolean {
  return !!process.env[ACCOUNT_ENV] && !!process.env[TOKEN_ENV];
}

function baseUrl(model: string): string {
  const account = process.env[ACCOUNT_ENV];
  if (!account) throw new Error(`${ACCOUNT_ENV} is not set.`);
  return `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`;
}

function requireToken(): string {
  const token = process.env[TOKEN_ENV];
  if (!token) throw new Error(`${TOKEN_ENV} is not set.`);
  return token;
}

export class CloudflareError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudflareError";
    this.status = status;
  }
}

/** Free-tier daily Neuron budget exhausted, or a transient rate limit — distinct so the caller can fall back rather than treat it as a hard failure. */
export class CloudflareRateLimitError extends CloudflareError {
  constructor(message: string) {
    super(message, 429);
    this.name = "CloudflareRateLimitError";
  }
}

async function parseError(res: Response): Promise<CloudflareError> {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 400);
  try {
    const parsed = JSON.parse(text);
    message = parsed?.errors?.[0]?.message ?? message;
  } catch {
    // not JSON — the raw text is all there is
  }
  if (res.status === 429) {
    return new CloudflareRateLimitError(
      "Cloudflare's free daily Neuron budget is exhausted (10,000/day, resets at 00:00 UTC).",
    );
  }
  return new CloudflareError(`Cloudflare Workers AI request failed (${res.status}): ${message}`, res.status);
}

/** klein always emits this, regardless of what was asked for. */
export const KLEIN_OUTPUT_SIZE = { width: 1024, height: 1024 } as const;

/**
 * Crop-and-regenerate via flux-2-klein-9b. No real mask support (see the
 * module doc comment) — this is a whole-crop regeneration; the caller owns
 * compositing the result back through its own selection mask, exactly the
 * shape Pollinations' editImage() already requires.
 *
 * Takes bytes directly rather than a public URL: unlike Pollinations (which
 * fetches server-side and therefore needs a URL it can reach), Cloudflare's
 * multipart upload accepts the crop's bytes inline, so no temporary Blob
 * upload is needed for this provider.
 */
export async function editImageKlein(params: {
  image: Buffer;
  instruction: string;
}): Promise<{ bytes: Buffer; width: number; height: number }> {
  const form = new FormData();
  form.set("prompt", params.instruction);
  form.set("image", new Blob([new Uint8Array(params.image)], { type: "image/png" }), "image.png");

  const res = await fetch(baseUrl("@cf/black-forest-labs/flux-2-klein-9b"), {
    method: "POST",
    headers: { Authorization: `Bearer ${requireToken()}` },
    body: form,
  });
  if (!res.ok) throw await parseError(res);

  const data = (await res.json()) as { result?: { image?: string }; errors?: Array<{ message: string }> };
  const b64 = data.result?.image;
  if (!b64) {
    throw new CloudflareError(
      `klein returned no image: ${data.errors?.[0]?.message ?? JSON.stringify(data).slice(0, 300)}`,
      502,
    );
  }
  return { bytes: Buffer.from(b64, "base64"), width: KLEIN_OUTPUT_SIZE.width, height: KLEIN_OUTPUT_SIZE.height };
}

/**
 * True mask-guided inpainting via stable-diffusion-v1-5-inpainting. `mask`
 * must be the same pixel dimensions as `image` — white (or near-white)
 * marks what the model may repaint, matching this app's own regionMask()
 * convention. Both `image` and `mask` must be PNG-ENCODED bytes (the output
 * of sharp's .png().toBuffer()), not raw decoded pixels — see the module
 * doc comment for the exact server-side error this produces when violated.
 */
export async function inpaintSd15(params: {
  image: Buffer;
  mask: Buffer;
  instruction: string;
  steps?: number;
}): Promise<Buffer> {
  const res = await fetch(baseUrl("@cf/runwayml/stable-diffusion-v1-5-inpainting"), {
    method: "POST",
    headers: { Authorization: `Bearer ${requireToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: params.instruction,
      image: Array.from(params.image),
      mask: Array.from(params.mask),
      num_steps: Math.min(20, params.steps ?? 20),
    }),
  });
  if (!res.ok) throw await parseError(res);

  const contentType = res.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!contentType.startsWith("image/")) {
    let message = bytes.toString("utf8").slice(0, 400);
    try {
      message = JSON.parse(message)?.errors?.[0]?.message ?? message;
    } catch {
      // not JSON
    }
    throw new CloudflareError(`stable-diffusion-v1-5-inpainting returned no image: ${message}`, 502);
  }
  return bytes;
}
