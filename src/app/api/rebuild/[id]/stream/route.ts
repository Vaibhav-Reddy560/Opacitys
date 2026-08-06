import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
// Kept in sync with /api/rebuild's own maxDuration — see the comment there.
export const maxDuration = 300;

const POLL_MS = 1200;
const MAX_MS = 4 * 60 * 1000;
// A "running" row past this long almost certainly means the function that
// was working on it got killed by its own maxDuration before its catch
// block could persist "failed" — self-heal here instead of leaving it
// stuck forever, same pattern as the analyze/tools stream routes.
const STALE_MS = 3.5 * 60 * 1000;

// GET /api/rebuild/[id]/stream -> Server-Sent Events with pipeline progress.
// Polls the DB — same shape as /api/analyze/[id]/stream and
// /api/tools/[id]/stream, `progress` payload carries `stage` (Rebuild
// writes a real one: "tracing" | "separating" | "naming") rather than the
// pipelineVersion boolean trick the older two routes use.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireUser();
  if (authError) return authError;

  const { id: analysisId } = await params;

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

        const [analysis] = await db
          .select({
            status: schema.analyses.status,
            stage: schema.analyses.stage,
            error: schema.analyses.error,
            createdAt: schema.analyses.createdAt,
          })
          .from(schema.analyses)
          .where(eq(schema.analyses.id, analysisId))
          .limit(1);

        if (closed) return;

        if (!analysis) {
          send("error", { message: "analysis not found" });
          finish();
          return;
        }

        if (analysis.status === "complete") {
          // The client navigates to the result page and re-reads from the
          // DB itself — same as the Instruments stream — so this only
          // needs to carry the id, not the full layer set.
          send("complete", { analysisId });
          finish();
          return;
        }

        if (analysis.status === "failed") {
          send("failed", { analysisId, error: analysis.error ?? null });
          finish();
          return;
        }

        if (analysis.status === "running" && Date.now() - analysis.createdAt.getTime() > STALE_MS) {
          const error = "The rebuild timed out before it finished.";
          await db.update(schema.analyses).set({ status: "failed", error, stage: null }).where(eq(schema.analyses.id, analysisId));
          send("failed", { analysisId, error });
          finish();
          return;
        }

        send("progress", { status: analysis.status, stage: analysis.stage });

        if (Date.now() - startedAt > MAX_MS) {
          send("timeout", { analysisId });
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

