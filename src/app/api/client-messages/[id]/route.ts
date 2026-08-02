import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const patchSchema = z.object({
  markResponded: z.boolean().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  iterationNumber: z.number().int().positive().optional(),
});

// PATCH /api/client-messages/[id] -> mark an entry responded-to (computing
// turnaround from the original timestamp) and/or update price/iteration.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to update this entry." }, { status: 401 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Nothing valid to update." }, { status: 400 });
  }

  try {
    const [existing] = await db
      .select()
      .from(schema.clientMessages)
      .where(and(eq(schema.clientMessages.id, id), eq(schema.clientMessages.userId, session.userId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "No entry found." }, { status: 404 });
    }

    const patch: Partial<typeof schema.clientMessages.$inferInsert> = {};
    if (parsed.data.priceCents !== undefined) patch.priceCents = parsed.data.priceCents;
    if (parsed.data.iterationNumber !== undefined) patch.iterationNumber = parsed.data.iterationNumber;
    // Idempotent — a second "mark replied" doesn't overwrite the first turnaround.
    if (parsed.data.markResponded && !existing.respondedAt) {
      const now = new Date();
      patch.respondedAt = now;
      patch.turnaroundMinutes = Math.max(
        0,
        Math.round((now.getTime() - existing.createdAt.getTime()) / 60000),
      );
    }

    const [entry] = await db
      .update(schema.clientMessages)
      .set(patch)
      .where(eq(schema.clientMessages.id, id))
      .returning();

    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update this entry." },
      { status: 503 },
    );
  }
}
