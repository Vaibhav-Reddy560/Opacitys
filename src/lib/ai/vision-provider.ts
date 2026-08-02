import "server-only";

// Swappable adapter over hosted vision inference (Replicate / fal.ai today,
// self-hosted Modal/RunPod later — only this file changes when that happens).
//
// Only OCR is wired for Phase 1 (text-region detection feeds the typography
// analyzer's grounding). Segmentation/depth/inpainting/vectorization are
// Phase 5 (decomposition) and are typed now, implemented then.

export type BBox = [x: number, y: number, w: number, h: number];

export interface TextRegion {
  bbox: BBox;
  text: string;
  confidence: number;
}

export interface VisionProvider {
  detectText(imageUrl: string): Promise<TextRegion[]>;
  segment(imageUrl: string): Promise<{ maskUrl: string; label: string; confidence: number }[]>;
  estimateDepth(imageUrl: string): Promise<{ depthMapUrl: string }>;
  inpaint(imageUrl: string, maskUrl: string): Promise<{ resultUrl: string }>;
  vectorize(imageUrl: string): Promise<{ svg: string }>;
}

class ReplicateVisionProvider implements VisionProvider {
  #token: string;

  constructor(token: string) {
    this.#token = token;
  }

  async #run(model: string, input: Record<string, unknown>) {
    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#token}`,
        "Content-Type": "application/json",
        Prefer: "wait", // block until complete; fine for sub-minute models
      },
      body: JSON.stringify({ version: model, input }),
    });
    if (!res.ok) {
      throw new Error(`Replicate prediction failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async detectText(imageUrl: string): Promise<TextRegion[]> {
    // Surya / PaddleOCR model on Replicate — placeholder model ref, pin the
    // real version hash before Phase 1 ships.
    const prediction = await this.#run(process.env.REPLICATE_OCR_MODEL ?? "", {
      image: imageUrl,
    });
    return (prediction.output ?? []) as TextRegion[];
  }

  async segment(): Promise<{ maskUrl: string; label: string; confidence: number }[]> {
    throw new Error("segment() lands in Phase 5 (decomposition)");
  }

  async estimateDepth(): Promise<{ depthMapUrl: string }> {
    throw new Error("estimateDepth() lands in Phase 5 (decomposition)");
  }

  async inpaint(): Promise<{ resultUrl: string }> {
    throw new Error("inpaint() lands in Phase 5 (decomposition)");
  }

  async vectorize(): Promise<{ svg: string }> {
    throw new Error("vectorize() lands in Phase 5 (decomposition)");
  }
}

let cached: VisionProvider | null = null;

export function getVisionProvider(): VisionProvider {
  if (cached) return cached;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is not set. Add it to .env.local.");
  }
  cached = new ReplicateVisionProvider(token);
  return cached;
}
