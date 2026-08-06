import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const createSchema = z.object({
  rawText: z.string().min(1).max(4000),
  channel: z.string().max(60).optional(),
  iterationNumber: z.number().int().positive().optional(),
  priceCents: z.number().int().nonnegative().optional(),
});

// GET /api/client-messages -> the signed-in user's Correspondence log, newest
// first, each entry carrying its interpretation if one has been generated.
export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  try {
    const rows = await db
      .select({
        id: schema.clientMessages.id,
        rawText: schema.clientMessages.rawText,
        channel: schema.clientMessages.channel,
        iterationNumber: schema.clientMessages.iterationNumber,
        respondedAt: schema.clientMessages.respondedAt,
        turnaroundMinutes: schema.clientMessages.turnaroundMinutes,
        priceCents: schema.clientMessages.priceCents,
        createdAt: schema.clientMessages.createdAt,
        interpretation: {
          filtered: schema.clientTranslations.filtered,
          actionableSteps: schema.clientTranslations.actionableSteps,
          pushbackScript: schema.clientTranslations.pushbackScript,
        },
      })
      .from(schema.clientMessages)
      .leftJoin(schema.clientTranslations, eq(schema.clientTranslations.messageId, schema.clientMessages.id))
      .where(eq(schema.clientMessages.userId, session.userId))
      .orderBy(desc(schema.clientMessages.createdAt));

    return NextResponse.json({ entries: rows });
  } catch (err) {
    console.error("[client-messages] GET failed:", err);
    return NextResponse.json({ error: "Could not load the log." }, { status: 503 });
  }
}

// POST /api/client-messages -> log a new client entry.
export async function POST(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A client message is required." }, { status: 400 });
  }

  try {
    const [entry] = await db
      .insert(schema.clientMessages)
      .values({
        userId: session.userId,
        projectId: null,
        rawText: parsed.data.rawText,
        channel: parsed.data.channel ?? null,
        iterationNumber: parsed.data.iterationNumber ?? null,
        priceCents: parsed.data.priceCents ?? null,
      })
      .returning();

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    console.error("[client-messages] POST failed:", err);
    return NextResponse.json({ error: "Could not log that message." }, { status: 503 });
  }
}
