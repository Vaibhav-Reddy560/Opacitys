import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
// Kept in sync with the edit route's own maxDuration — see the comment there.
export const maxDuration = 300;

const POLL_MS = 1200;
const MAX_MS = 4 * 60 * 1000;
// A row stuck "running" past this almost certainly means the function that
// was generating it was killed by its own maxDuration before its catch
// could persist a failure. Same self-heal as the analyze/tools streams.
const STALE_MS = 3.5 * 60 * 1000;

// GET /api/rebuild/version/[id]/stream -> SSE over one edit's progress.
// Same shape as /api/rebuild/[id]/stream, but polling rebuild_versions so
// concurrent edits each get their own stream instead of sharing the
// analysis row's single status field.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireUser();
  if (authError) return authError;

  const { id: versionId } = await params;

  const [owned] = await db
    .select({ userId: schema.assets.userId })
    .from(schema.rebuildVersions)
    .innerJoin(schema.analyses, eq(schema.analyses.id, schema.rebuildVersions.analysisId))
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.rebuildVersions.id, versionId))
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

        const [version] = await db
          .select({
            status: schema.rebuildVersions.status,
            stage: schema.rebuildVersions.stage,
            error: schema.rebuildVersions.error,
            createdAt: schema.rebuildVersions.createdAt,
          })
          .from(schema.rebuildVersions)
          .where(eq(schema.rebuildVersions.id, versionId))
          .limit(1);

        if (closed) return;

        if (!version) {
          send("error", { message: "version not found" });
          finish();
          return;
        }

        if (version.status === "complete") {
          send("complete", { versionId });
          finish();
          return;
        }

        if (version.status === "failed") {
          send("failed", { versionId, error: version.error ?? null });
          finish();
          return;
        }

        if (version.status === "running" && Date.now() - version.createdAt.getTime() > STALE_MS) {
          const error = "That edit timed out before it finished.";
          await db
            .update(schema.rebuildVersions)
            .set({ status: "failed", error, stage: null })
            .where(eq(schema.rebuildVersions.id, versionId));
          send("failed", { versionId, error });
          finish();
          return;
        }

        send("progress", { status: version.status, stage: version.stage });

        if (Date.now() - startedAt > MAX_MS) {
          send("timeout", { versionId });
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
