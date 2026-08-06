import "server-only";

const FAL_BASE = "https://fal.run";

/**
 * FLUX.1 [schnell]/[dev] via fal.ai — genuinely open-weight (Apache 2.0),
 * not a proprietary model, accessed over the same REST pattern the rest of
 * this app uses for external APIs (raw fetch, no SDK — see
 * src/lib/portfolio/dribbble.ts). `.env.local.example` reserved
 * FAL_API_KEY for exactly this before Rebuild was built.
 *
 * Used narrowly: to turn a layer decompose couldn't cleanly vectorize
 * (its primitive fell through to "Complex path"/"Compound shape") into a
 * clean raster asset instead of a jagged multi-subpath SVG approximation.
 * Never used to reinterpret or redesign anything — see cleanupLayerImage's
 * low `strength` for why.
 */
export function hasImageGenKey(): boolean {
  return !!process.env.FAL_API_KEY;
}

interface FalImageResponse {
  images: Array<{ url: string; width: number; height: number }>;
}

async function callFal(model: string, body: Record<string, unknown>): Promise<FalImageResponse> {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY is not set.");
  const res = await fetch(`${FAL_BASE}/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fal.ai request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<FalImageResponse>;
}

async function fetchGenerated(result: FalImageResponse): Promise<Buffer> {
  const url = result.images[0]?.url;
  if (!url) throw new Error("fal.ai returned no image");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the generated image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Redraws an existing crop, staying close to the source — a cleanup pass,
 * not a reinterpretation. `strength` is deliberately low: this exists to
 * remove vectorization noise from a layer that resisted clean tracing, not
 * to replace the user's actual design with an AI's guess at it. Needs
 * `imageUrl` to already be a public URL (the raw crop uploaded to Blob),
 * since fal.ai's image-to-image endpoint takes a URL, not raw bytes.
 */
export async function cleanupLayerImage(imageUrl: string, hint: string): Promise<Buffer> {
  const result = await callFal("fal-ai/flux/dev/image-to-image", {
    image_url: imageUrl,
    prompt: `Clean flat graphic design asset: ${hint}. Preserve the exact composition and colors — only remove scan noise, jagged edges and artifacts.`,
    strength: 0.35,
    num_inference_steps: 28,
    output_format: "png",
  });
  return fetchGenerated(result);
}

/**
 * Generates a layer from scratch — used only when there are no usable
 * source pixels to clean up. Not the default path; the raster crop always
 * comes first, this is a last resort.
 */
export async function generateLayerImage(prompt: string, width: number, height: number): Promise<Buffer> {
  const result = await callFal("fal-ai/flux/schnell", {
    prompt: `Clean flat graphic design asset: ${prompt}`,
    image_size: { width: Math.max(8, Math.round(width)), height: Math.max(8, Math.round(height)) },
    num_inference_steps: 4,
    output_format: "png",
  });
  return fetchGenerated(result);
}
