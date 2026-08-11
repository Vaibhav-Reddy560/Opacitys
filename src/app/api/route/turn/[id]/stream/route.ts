import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

// SSE runs fine on the default Node runtime (Fluid Compute) — no need for
// `runtime = "edge"`.
export const runtime = "nodejs";

// Mirrors /api/route/[id]/stream and /api/tools/[id]/stream exactly.
export const maxDuration = 300;

const POLL_MS = 1200;
const MAX_MS = 4 * 60 * 1000;
const STALE_MS = 3.5 * 60 * 1000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireUser();
  if (authError) return authError;

  const { id: turnId } = await params;

  // Ownership: route_turns has no user_id of its own, only route_plans does.
  const [owned] = await db
    .select({ userId: schema.routePlans.userId })
    .from(schema.routeTurns)
    .innerJoin(schema.routePlans, eq(schema.routePlans.id, schema.routeTurns.planId))
    .where(eq(schema.routeTurns.id, turnId))
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
            status: schema.routeTurns.status,
            stage: schema.routeTurns.stage,
            error: schema.routeTurns.error,
            createdAt: schema.routeTurns.createdAt,
          })
          .from(schema.routeTurns)
          .where(eq(schema.routeTurns.id, turnId))
          .limit(1);

        if (closed) return;

        if (!row) {
          send("error", { message: "turn not found" });
          finish();
          return;
        }

        if (row.status === "complete") {
          send("complete", { turnId });
          finish();
          return;
        }

        if (row.status === "failed") {
          send("failed", { turnId, error: row.error ?? null });
          finish();
          return;
        }

        if (row.status === "running" && Date.now() - row.createdAt.getTime() > STALE_MS) {
          const error = "The reply timed out before it finished.";
          await db.update(schema.routeTurns).set({ status: "failed", error }).where(eq(schema.routeTurns.id, turnId));
          send("failed", { turnId, error });
          finish();
          return;
        }

        send("progress", { status: row.status, stage: row.stage });

        if (Date.now() - startedAt > MAX_MS) {
          send("timeout", { turnId });
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
