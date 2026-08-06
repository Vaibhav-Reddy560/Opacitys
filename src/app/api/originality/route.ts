import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { measureImageFull } from "@/lib/measure";
import { readOriginality } from "@/lib/originality/read";
import { GroqRateLimitError, MODELS } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  description: z.string().min(1).max(2000),
  assetId: z.string().uuid().optional(),
});

// POST /api/originality { description, assetId? } -> reads the direction
// against widely-documented movements/studios/campaigns, persists the
// result, returns { id }. assetId is optional — a described-only direction
// is a fully valid check, an attached sketch just adds a second read stage.
export async function POST(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set — add it to .env.local to use Originality." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A description is required." }, { status: 400 });
  }

  let imageUrl: string | undefined;
  if (parsed.data.assetId) {
    const [asset] = await db
      .select({ userId: schema.assets.userId, storageKey: schema.assets.storageKey })
      .from(schema.assets)
      .where(eq(schema.assets.id, parsed.data.assetId))
      .limit(1);
    if (!asset || asset.userId !== session.userId) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    imageUrl = asset.storageKey;
  }

  try {
    let facts;
    if (imageUrl && parsed.data.assetId) {
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) throw new Error(`Could not fetch the uploaded image (${imageRes.status}).`);
      const imageBytes = Buffer.from(await imageRes.arrayBuffer());
      ({ facts } = await measureImageFull(imageBytes));
      // Previously computed and dropped on the floor once the prompt was
      // built. Same facts Fingerprint's palette/type rollup reads.
      await db.update(schema.assets).set({ facts }).where(eq(schema.assets.id, parsed.data.assetId));
    }

    const result = await readOriginality({ description: parsed.data.description, imageUrl, facts });

    const [row] = await db
      .insert(schema.originalityChecks)
      .values({
        userId: session.userId,
        assetId: parsed.data.assetId ?? null,
        inputText: parsed.data.description,
        nearest: result.neighbours,
        saturationScore: result.crowding,
        result,
        model: `groq/${MODELS.reasoning}`,
      })
      .returning({ id: schema.originalityChecks.id });

    return NextResponse.json({ id: row.id });
  } catch (err) {
    const message =
      err instanceof GroqRateLimitError
        ? err.message
        : err instanceof Error
          ? `Could not read that direction: ${err.message}`
          : "Could not read that direction.";
    return NextResponse.json({ error: message }, { status: err instanceof GroqRateLimitError ? 429 : 502 });
  }
}
