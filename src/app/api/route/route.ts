import { NextResponse, after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { runRoutePlan } from "@/lib/workflow/pipeline";
import { GroqRateLimitError } from "@/lib/ai/models";

export const runtime = "nodejs";
// Same reasoning as /api/trends and /api/tools: after() is bounded by this
// route's own maxDuration. Route is one bounded generateJson call (no web
// search), so this is generous headroom, not a measured requirement.
export const maxDuration = 300;

const bodySchema = z.object({
  brief: z.string().trim().min(1).max(4000),
  deadline: z.string().trim().max(120).nullish(),
  tools: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  skillLevel: z.string().trim().max(40).nullish(),
});

// POST /api/route { brief, deadline?, tools?, skillLevel? } -> queues a plan
// and runs it in the background via after(), returning the id immediately.
// Client subscribes to /api/route/[id]/stream for progress. No cache — a
// brief is arbitrary free text, unlike Currents' normalized scope, so a
// cache key here would rarely hit and isn't worth the complexity.
export async function POST(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set — add it to .env.local to use Route." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A brief is required." }, { status: 400 });
  }
  const { brief, tools } = parsed.data;
  const deadline = parsed.data.deadline ?? null;
  const skillLevel = parsed.data.skillLevel ?? null;

  const [row] = await db
    .insert(schema.routePlans)
    .values({
      userId: session.userId,
      brief,
      deadline,
      tools,
      skillLevel,
      status: "queued",
    })
    .returning({ id: schema.routePlans.id });

  after(async () => {
    try {
      await runRoutePlan({ planId: row.id, brief, deadline, tools, skillLevel });
    } catch (err) {
      // runRoutePlan already persisted status:"failed" + the real error
      // before rethrowing — this catch only stops that from becoming an
      // unhandled rejection in the function log.
      if (!(err instanceof GroqRateLimitError)) {
        console.error("[route] plan failed:", err);
      }
    }
  });

  return NextResponse.json({ id: row.id }, { status: 202 });
}
