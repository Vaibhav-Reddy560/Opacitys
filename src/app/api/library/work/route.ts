import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { listWork, type WorkKind } from "@/lib/library/queries";

export const runtime = "nodejs";

const kindSchema = z.enum(["originality", "trends", "tools", "rights"]);

// GET /api/library/work?kind=&limit= -> the signed-in user's text-only work
// (Currents/Instruments/Clearance answers, Originality checks), newest
// first. Omitting kind unions every kind — used by the library page's
// "reads" section; a single kind is what each feature page's recent strip
// requests. Critique/Identify recents are asset-bound and served by
// listRecentAnalyses instead — see src/components/library/recent-strip.tsx.
export async function GET(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const url = new URL(req.url);
  const parsedKind = kindSchema.safeParse(url.searchParams.get("kind") ?? undefined);
  const kind: WorkKind | undefined = parsedKind.success ? parsedKind.data : undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);

  const work = await listWork(session.userId, kind, limit);
  return NextResponse.json({ work });
}
