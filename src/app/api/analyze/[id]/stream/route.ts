import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// SSE runs fine on the default Node runtime (Fluid Compute) — no need for
// `runtime = "edge"`. Explicitly Node so we keep full DB client support.
export const runtime = "nodejs";

const POLL_MS = 1200;
const MAX_MS = 3 * 60 * 1000; // matches the 30-120s pipeline estimate + margin

// GET /api/analyze/[id]/stream -> Server-Sent Events with analysis status.
//
// Polls the DB rather than subscribing to Inngest directly — simplest thing
// that works for v1. Swap for @inngest/realtime if polling latency (up to
// POLL_MS) becomes a real UX problem.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: analysisId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const startedAt = Date.now();

      const tick = async () => {
        const [analysis] = await db
          .select({ status: schema.analyses.status })
          .from(schema.analyses)
          .where(eq(schema.analyses.id, analysisId))
          .limit(1);

        if (!analysis) {
          send("error", { message: "analysis not found" });
          controller.close();
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
          controller.close();
          return;
        }

        if (analysis.status === "failed") {
          send("failed", { analysisId });
          controller.close();
          return;
        }

        send("progress", { status: analysis.status });

        if (Date.now() - startedAt > MAX_MS) {
          send("timeout", { analysisId });
          controller.close();
          return;
        }

        setTimeout(tick, POLL_MS);
      };

      send("progress", { status: "queued" });
      tick();
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
