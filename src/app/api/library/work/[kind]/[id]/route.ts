import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { deleteWork } from "@/lib/library/queries";

export const runtime = "nodejs";

const kindSchema = z.enum(["originality", "trends", "tools", "rights"]);

// DELETE /api/library/work/[kind]/[id] -> removes one text-only work item
// (a Currents read, Instruments answer, Clearance answer, or Originality
// check) after checking ownership.
export async function DELETE(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { kind: rawKind, id } = await params;
  const parsedKind = kindSchema.safeParse(rawKind);
  if (!parsedKind.success) {
    return NextResponse.json({ error: "Unknown work kind." }, { status: 400 });
  }

  const ok = await deleteWork(session.userId, parsedKind.data, id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
