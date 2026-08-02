import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

const DEMO_EMAIL = "demo@opacitys.local";

// GET /api/demo-user -> { userId }
//
// Phase 0 has no auth wired yet (tracked separately). This gets the Phase 1
// critique flow runnable end-to-end without blocking on that: it upserts one
// fixed local demo user. Delete this route once real auth lands.
export async function GET() {
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_EMAIL))
    .limit(1);

  if (existing[0]) {
    return NextResponse.json({ userId: existing[0].id });
  }

  const [created] = await db
    .insert(schema.users)
    .values({ email: DEMO_EMAIL })
    .returning({ id: schema.users.id });

  return NextResponse.json({ userId: created.id });
}
