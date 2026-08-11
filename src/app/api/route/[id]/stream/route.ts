import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

// SSE runs fine on the default Node runtime (Fluid Compute) — no need for
// `runtime = "edge"`.
export const runtime = "nodejs";

// Mirrors /api/tools/[id]/stream exactly — see that file's comments for the
// full rationale on the maxDuration/MAX_MS/STALE_MS ordering and the
// closed-flag/cancel() pattern.
export const maxDuration = 300;

const POLL_MS = 1200;
const MAX_MS = 4 * 60 * 1000;
const STALE_MS = 3.5 * 60 * 1000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireUser();
  if (authError) return authError;

  const { id: planId } = await params;

  const [owned] = await db
    .select({ userId: schema.routePlans.userId })
    .from(schema.routePlans)
    .where(eq(schema.routePlans.id, planId))
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
            status: schema.routePlans.status,
            stage: schema.routePlans.stage,
            error: schema.routePlans.error,
            createdAt: schema.routePlans.createdAt,
          })
          .from(schema.routePlans)
          .where(eq(schema.routePlans.id, planId))
          .limit(1);

        if (closed) return;

        if (!row) {
          send("error", { message: "plan not found" });
          finish();
          return;
        }

        if (row.status === "complete") {
          send("complete", { planId });
          finish();
          return;
        }

        if (row.status === "failed") {
          send("failed", { planId, error: row.error ?? null });
          finish();
          return;
        }

        if (row.status === "running" && Date.now() - row.createdAt.getTime() > STALE_MS) {
          const error = "The plan timed out before it finished.";
          await db.update(schema.routePlans).set({ status: "failed", error }).where(eq(schema.routePlans.id, planId));
          send("failed", { planId, error });
          finish();
          return;
        }

        send("progress", { status: row.status, stage: row.stage });

        if (Date.now() - startedAt > MAX_MS) {
          send("timeout", { planId });
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
