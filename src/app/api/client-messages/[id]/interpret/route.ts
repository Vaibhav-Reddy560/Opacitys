import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { interpretClientMessage } from "@/lib/ai/client-interpretation";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/client-messages/[id]/interpret -> reads an entry back into what
// the client probably meant, and persists it (upsert — a re-run replaces the
// prior interpretation rather than accumulating duplicates).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to interpret this entry." }, { status: 401 });
  }

  const { id } = await params;
  let message: typeof schema.clientMessages.$inferSelect;
  try {
    const [found] = await db
      .select()
      .from(schema.clientMessages)
      .where(and(eq(schema.clientMessages.id, id), eq(schema.clientMessages.userId, session.userId)))
      .limit(1);
    if (!found) {
      return NextResponse.json({ error: "No entry found." }, { status: 404 });
    }
    message = found;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load that entry." },
      { status: 503 },
    );
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json(
      { error: "AI_GATEWAY_API_KEY is not set — add it to .env.local to interpret entries." },
      { status: 503 },
    );
  }

  try {
    const result = await interpretClientMessage({
      message: message.rawText,
      context: message.channel ?? undefined,
    });

    const [translation] = await db
      .insert(schema.clientTranslations)
      .values({
        messageId: message.id,
        filtered: { readingOfIt: result.readingOfIt, costly: result.costly, questionsToAsk: result.questionsToAsk },
        actionableSteps: result.actionable,
        pushbackScript: result.replyDraft,
      })
      .onConflictDoUpdate({
        target: schema.clientTranslations.messageId,
        set: {
          filtered: { readingOfIt: result.readingOfIt, costly: result.costly, questionsToAsk: result.questionsToAsk },
          actionableSteps: result.actionable,
          pushbackScript: result.replyDraft,
        },
      })
      .returning();

    return NextResponse.json({ result, translation });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Could not read that back: ${err.message}`
            : "Could not read that back.",
      },
      { status: 502 },
    );
  }
}
