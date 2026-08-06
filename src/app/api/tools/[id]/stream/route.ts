import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

// SSE runs fine on the default Node runtime (Fluid Compute) — no need for
// `runtime = "edge"`. Explicitly Node so we keep full DB client support.
export const runtime = "nodejs";

// Mirrors /api/trends/[id]/stream exactly — see that file's comments for the
// full rationale on the maxDuration/MAX_MS/STALE_MS ordering and the
// closed-flag/cancel() pattern.
export const maxDuration = 300;

const POLL_MS = 1200;
const MAX_MS = 4 * 60 * 1000;
const STALE_MS = 3.5 * 60 * 1000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireUser();
  if (authError) return authError;

  const { id: answerId } = await params;

  // Ownership check once, up front — this only ever streams a row the
  // caller just created via POST /api/tools (research path, never cached
  // yet), so it should always match the session that created it.
  const [owned] = await db
    .select({ userId: schema.toolAnswers.userId })
    .from(schema.toolAnswers)
    .where(eq(schema.toolAnswers.id, answerId))
    .limit(1);
  if (!owned || owned.userId !== session.userId) {
    return new Response("Not found", { status: 404 });
  }

  let pendingTick: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting — fine.
        }
      };

      const startedAt = Date.now();

      const tick = async () => {
        if (closed) return;

        const [row] = await db
          .select({
            status: schema.toolAnswers.status,
            stage: schema.toolAnswers.stage,
            error: schema.toolAnswers.error,
            createdAt: schema.toolAnswers.createdAt,
          })
          .from(schema.toolAnswers)
          .where(eq(schema.toolAnswers.id, answerId))
          .limit(1);

        if (closed) return;

        if (!row) {
          send("error", { message: "answer not found" });
          finish();
          return;
        }

        if (row.status === "complete") {
          send("complete", { answerId });
          finish();
          return;
        }

        if (row.status === "failed") {
          send("failed", { answerId, error: row.error ?? null });
          finish();
          return;
        }

        if (row.status === "running" && Date.now() - row.createdAt.getTime() > STALE_MS) {
          const error = "The read timed out before it finished.";
          await db.update(schema.toolAnswers).set({ status: "failed", error }).where(eq(schema.toolAnswers.id, answerId));
          send("failed", { answerId, error });
          finish();
          return;
        }

        send("progress", { status: row.status, stage: row.stage });

        if (Date.now() - startedAt > MAX_MS) {
          send("timeout", { answerId });
          finish();
          return;
        }

        pendingTick = setTimeout(tick, POLL_MS);
      };

      send("progress", { status: "queued", stage: null });
      tick();
    },
    cancel() {
      closed = true;
      if (pendingTick) clearTimeout(pendingTick);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
