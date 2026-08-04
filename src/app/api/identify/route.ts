import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { measureImageFull } from "@/lib/measure";
import { readStyle } from "@/lib/identify/read";
import { findTaxonomyEntry } from "@/lib/identify/taxonomy";
import { GroqRateLimitError } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  assetId: z.string().uuid(),
});

// POST /api/identify { assetId } -> measures the uploaded image, reads it
// against the style taxonomy, persists the result, returns { analysisId }.
// One vision call (~5s) so this runs inline rather than through the
// queued/streamed flow Critique uses for its heavier two-track pipeline.
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to use Identify." }, { status: 401 });
  }
  if (session.kind === "guest") {
    return NextResponse.json(
      { error: "Guest sessions aren't saved — create an account to run this." },
      { status: 403 },
    );
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set — add it to .env.local to use Identify." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid assetId is required." }, { status: 400 });
  }

  const [asset] = await db
    .select({ id: schema.assets.id, userId: schema.assets.userId, storageKey: schema.assets.storageKey })
    .from(schema.assets)
    .where(eq(schema.assets.id, parsed.data.assetId))
    .limit(1);

  if (!asset || asset.userId !== session.userId) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const [analysis] = await db
    .insert(schema.analyses)
    .values({ assetId: asset.id, kind: "identify", status: "running", pipelineVersion: "v1" })
    .returning({ id: schema.analyses.id });

  try {
    const imageRes = await fetch(asset.storageKey);
    if (!imageRes.ok) throw new Error(`Could not fetch the uploaded image (${imageRes.status}).`);
    const imageBytes = Buffer.from(await imageRes.arrayBuffer());

    const { response: trackA, facts } = await measureImageFull(imageBytes);

    await db
      .update(schema.analyses)
      .set({ raw: { ...trackA, facts }, pipelineVersion: "v1" })
      .where(eq(schema.analyses.id, analysis.id));

    const read = await readStyle({ imageUrl: asset.storageKey, facts, findings: trackA.findings });

    await db.insert(schema.styleReads).values({
      analysisId: analysis.id,
      summary: read.summary,
      model: `groq/vision`,
    });

    for (const style of read.styles) {
      const taxonomyEntry = findTaxonomyEntry(style.name);
      if (!taxonomyEntry) {
        console.warn(`[identify] model returned an unrecognized style name: ${JSON.stringify(style.name)}`);
        continue;
      }

      const [row] = await db
        .insert(schema.styleTaxonomy)
        .values({ name: taxonomyEntry.name, description: taxonomyEntry.tell, era: taxonomyEntry.era })
        .onConflictDoUpdate({
          target: schema.styleTaxonomy.name,
          set: { description: taxonomyEntry.tell, era: taxonomyEntry.era },
        })
        .returning({ id: schema.styleTaxonomy.id });

      await db.insert(schema.styleScores).values({
        analysisId: analysis.id,
        taxonomyId: row.id,
        weight: style.weight / 100,
        evidence: { text: style.evidence },
      });
    }

    await db.update(schema.analyses).set({ status: "complete" }).where(eq(schema.analyses.id, analysis.id));

    return NextResponse.json({ analysisId: analysis.id });
  } catch (err) {
    const message =
      err instanceof GroqRateLimitError
        ? err.message
        : err instanceof Error
          ? `Could not read that design: ${err.message}`
          : "Could not read that design.";
    await db
      .update(schema.analyses)
      .set({ status: "failed", error: message })
      .where(eq(schema.analyses.id, analysis.id));
    return NextResponse.json({ error: message }, { status: err instanceof GroqRateLimitError ? 429 : 502 });
  }
}
