import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

// SSE runs fine on the default Node runtime (Fluid Compute) — no need for
// `runtime = "edge"`. Explicitly Node so we keep full DB client support.
export const runtime = "nodejs";

// Ordered deliberately: analyze's own ceiling >= this route's ceiling >
// MAX_MS > STALE_MS > a realistic pipeline p99. `after()` (in
// /api/analyze) is bounded by the invocation's own `maxDuration` — if that
// route's ceiling is shorter than what this route waits for, the pipeline
// gets killed before its own catch block can persist "failed", and the row
// is stuck at "running" forever. See STALE_MS below for what actually
// recovers from that.
export const maxDuration = 300;

const POLL_MS = 1200;
const MAX_MS = 4 * 60 * 1000; // matches the 30-120s pipeline estimate + margin
// If a row has been "running" longer than this, the function that was
// supposed to finish it was almost certainly killed by its own
// `maxDuration` before its catch block could persist a failure — without
// this, that row sits at "running" forever and every future visit re-times
// out against MAX_MS instead of failing fast with a real reason.
const STALE_MS = 3.5 * 60 * 1000;

// GET /api/analyze/[id]/stream -> Server-Sent Events with analysis status.
//
// Polls the DB rather than subscribing to Inngest directly — simplest thing
// that works for v1. Swap for @inngest/realtime if polling latency (up to
// POLL_MS) becomes a real UX problem.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireUser();
  if (authError) return authError;

  const { id: analysisId } = await params;

  // Ownership check once, up front — this is what closed the gap where any
  // signed-in caller who had (or guessed) an analysisId could stream another
  // user's critique status. The POST that creates this row already checks
  // asset.userId; this route previously didn't, since /api routes sit
  // outside the proxy's matcher and had no guard of their own.
  const [owned] = await db
    .select({ userId: schema.assets.userId })
    .from(schema.analyses)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.analyses.id, analysisId))
    .limit(1);
  if (!owned || owned.userId !== session.userId) {
    return new Response("Not found", { status: 404 });
  }

  let pendingTick: ReturnType<typeof setTimeout> | null = null;
  // Set once the client disconnects (tab closed, navigated away) or the
  // stream reaches a terminal event. Without this, a still-scheduled
  // `tick()` fires after the underlying controller is gone and throws
  // "Controller is already closed" on the next `enqueue` — reproduced live
  // by navigating away mid-poll. `cancel()` below is the Web Streams API's
  // hook for exactly that disconnect, so this checks it before every write
  // instead of only reacting to the resulting exception.
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected between the `closed` check and this write —
          // nothing left to notify, so just stop.
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

        const [analysis] = await db
          .select({
            status: schema.analyses.status,
            error: schema.analyses.error,
            pipelineVersion: schema.analyses.pipelineVersion,
            createdAt: schema.analyses.createdAt,
          })
          .from(schema.analyses)
          .where(eq(schema.analyses.id, analysisId))
          .limit(1);

        if (closed) return; // may have disconnected during the query above

        if (!analysis) {
          send("error", { message: "analysis not found" });
          finish();
          return;
        }

        if (analysis.status === "complete") {
          const [critique] = await db
            .select({
              id: schema.critiques.id,
              overallScore: schema.critiques.overallScore,
              dimensionScores: schema.critiques.dimensionScores,
              summary: schema.critiques.summary,
            })
            .from(schema.critiques)
            .where(eq(schema.critiques.analysisId, analysisId))
            .limit(1);

          const findings = critique
            ? await db
                .select()
                .from(schema.critiqueFindings)
                .where(eq(schema.critiqueFindings.critiqueId, critique.id))
            : [];

          send("complete", { critique, findings });
          finish();
          return;
        }

        if (analysis.status === "failed") {
          send("failed", { analysisId, error: analysis.error ?? null });
          finish();
          return;
        }

        // A "running" row past STALE_MS means the function that was
        // measuring it got killed by its own maxDuration before its catch
        // block ran — self-heal here rather than leaving it stuck forever.
        if (
          analysis.status === "running" &&
          Date.now() - analysis.createdAt.getTime() > STALE_MS
        ) {
          const error = "The read timed out before it finished.";
          await db
            .update(schema.analyses)
            .set({ status: "failed", error })
            .where(eq(schema.analyses.id, analysisId));
          send("failed", { analysisId, error });
          finish();
          return;
        }

        // Track A (deterministic measurement, ~1-2s) flips pipelineVersion
        // from "pending" to a real value before Track B (the 30-120s Groq
        // call) even starts — free signal for the upload page's progress
        // meter to distinguish "still measuring" from "measurements are in,
        // writing up what they mean" without any new column.
        send("progress", {
          status: analysis.status,
          measured: analysis.pipelineVersion !== "pending",
        });

        if (Date.now() - startedAt > MAX_MS) {
          send("timeout", { analysisId });
          finish();
          return;
        }

        pendingTick = setTimeout(tick, POLL_MS);
      };

      send("progress", { status: "queued", measured: false });
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
