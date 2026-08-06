import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

// SSE runs fine on the default Node runtime (Fluid Compute) — no need for
// `runtime = "edge"`. Explicitly Node so we keep full DB client support.
export const runtime = "nodejs";

// Ordered deliberately, mirroring /api/analyze/[id]/stream: POST's own
// maxDuration >= this route's ceiling > MAX_MS > STALE_MS > a realistic
// pipeline p99. after() (in /api/trends) is bounded by that route's own
// maxDuration — if this route waited longer than that, the read could be
// killed before its own catch could persist "failed", leaving the row stuck
// at "running" forever. STALE_MS below is what recovers from that anyway.
export const maxDuration = 300;

const POLL_MS = 1200;
const MAX_MS = 4 * 60 * 1000; // research + structuring: measured 30-70s, generous margin
// A "running" row past this long almost certainly means the function
// measuring it was killed by its own maxDuration before its catch block
// could persist a failure — self-heal here instead of leaving it stuck
// forever (copied from /api/analyze/[id]/stream, same rationale).
const STALE_MS = 3.5 * 60 * 1000;

// GET /api/trends/[id]/stream -> Server-Sent Events with read status.
// Polls the DB rather than subscribing to anything realtime — same
// simplest-thing-that-works choice as the critique stream route.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireUser();
  if (authError) return authError;

  const { id: readId } = await params;

  // Ownership check once, up front — Currents reads are cached globally
  // (any user's cached read can satisfy another user's request), but the
  // stream for a specific readId should only be watchable by whoever
  // actually kicked off that particular run.
  const [owned] = await db
    .select({ userId: schema.trendReads.userId })
    .from(schema.trendReads)
    .where(eq(schema.trendReads.id, readId))
    .limit(1);
  if (!owned || owned.userId !== session.userId) {
    return new Response("Not found", { status: 404 });
  }

  let pendingTick: ReturnType<typeof setTimeout> | null = null;
  // Set once the client disconnects or the stream reaches a terminal event —
  // without this a still-scheduled tick() fires after the controller is
  // gone and throws on the next enqueue. Same fix as the critique stream
  // route, reproduced there by navigating away mid-poll.
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
            status: schema.trendReads.status,
            stage: schema.trendReads.stage,
            error: schema.trendReads.error,
            createdAt: schema.trendReads.createdAt,
          })
          .from(schema.trendReads)
          .where(eq(schema.trendReads.id, readId))
          .limit(1);

        if (closed) return; // may have disconnected during the query above

        if (!row) {
          send("error", { message: "read not found" });
          finish();
          return;
        }

        if (row.status === "complete") {
          // Bare signal, not a payload — unlike the critique stream, which
          // carries the result inline. The upload page navigates to
          // /studio/trends/[id], which server-renders straight from the DB,
          // so shipping the result twice would just be a second parsing
          // path that can drift from the first.
          send("complete", { readId });
          finish();
          return;
        }

        if (row.status === "failed") {
          send("failed", { readId, error: row.error ?? null });
          finish();
          return;
        }

        if (row.status === "running" && Date.now() - row.createdAt.getTime() > STALE_MS) {
          const error = "The read timed out before it finished.";
          await db.update(schema.trendReads).set({ status: "failed", error }).where(eq(schema.trendReads.id, readId));
          send("failed", { readId, error });
          finish();
          return;
        }

        send("progress", { status: row.status, stage: row.stage });

        if (Date.now() - startedAt > MAX_MS) {
          send("timeout", { readId });
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
