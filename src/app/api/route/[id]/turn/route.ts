import { NextResponse, after } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { runRouteTurn } from "@/lib/workflow/pipeline";
import { GroqRateLimitError } from "@/lib/ai/models";

export const runtime = "nodejs";
// Kept in sync with the turn stream route's own ceiling — same reasoning
// as every other after()-bounded route in this app.
export const maxDuration = 300;

const bodySchema = z.object({
  question: z.string().trim().min(1).max(2000),
});

// POST /api/route/[id]/turn { question } -> records the question as its own
// "complete" turn, queues the assistant's reply, and runs it in the
// background via after(). Client subscribes to
// /api/route/turn/[turnId]/stream for progress. Two rows per exchange
// (user question, assistant reply) rather than one — see route_turns'
// schema comment for why: a failed reply must never take the question
// down with it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id: planId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  const { question } = parsed.data;

  const [plan] = await db
    .select({ userId: schema.routePlans.userId, status: schema.routePlans.status })
    .from(schema.routePlans)
    .where(eq(schema.routePlans.id, planId))
    .limit(1);
  if (!plan || plan.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (plan.status !== "complete") {
    return NextResponse.json({ error: "This plan hasn't finished yet." }, { status: 409 });
  }

  // No .returning() needed — the pipeline re-reads this turn from the DB
  // (it just needs to exist as "complete" before after() fires).
  await db.insert(schema.routeTurns).values({ planId, role: "user", content: question, status: "complete" });

  const [assistantTurn] = await db
    .insert(schema.routeTurns)
    .values({ planId, role: "assistant", content: null, status: "queued" })
    .returning({ id: schema.routeTurns.id });

  after(async () => {
    try {
      await runRouteTurn({ turnId: assistantTurn.id, planId });
    } catch (err) {
      if (!(err instanceof GroqRateLimitError)) {
        console.error("[route] turn failed:", err);
      }
    }
  });

  return NextResponse.json({ turnId: assistantTurn.id }, { status: 202 });
}
