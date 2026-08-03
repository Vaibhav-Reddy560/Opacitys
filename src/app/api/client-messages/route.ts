import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";

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
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view your correspondence log." }, { status: 401 });
  }

  // Guest ids (`guest-<uuid>`) aren't real user rows and aren't valid uuid
  // values, so they can never have logged entries — skip the query rather
  // than let it fail against the DB.
  if (session.kind === "guest") {
    return NextResponse.json({
      entries: [],
      notice: "Guest sessions aren't saved — create an account to keep a Correspondence log.",
    });
  }

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
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to log a client message." }, { status: 401 });
  }

  if (session.kind === "guest") {
    return NextResponse.json(
      { error: "Guest sessions can't save a Correspondence log — create an account to keep one." },
      { status: 403 },
    );
  }

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
