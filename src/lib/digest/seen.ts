import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { DigestKind } from "./pipeline";

export interface SeenState {
  lastSeenStylesAt: Date | null;
  lastSeenNewsAt: Date | null;
}

/** A user with no row here has never seen either digest — treated as "unseen" by the caller. */
export async function getSeenState(userId: string): Promise<SeenState> {
  const [row] = await db
    .select({
      lastSeenStylesAt: schema.userDigestSeen.lastSeenStylesAt,
      lastSeenNewsAt: schema.userDigestSeen.lastSeenNewsAt,
    })
    .from(schema.userDigestSeen)
    .where(eq(schema.userDigestSeen.userId, userId));
  return row ?? { lastSeenStylesAt: null, lastSeenNewsAt: null };
}

/** Upsert on the user_id primary key — same one-row-per-user pattern as saveStoredProfile (src/lib/profile/stored.ts). */
export async function markSeen(userId: string, kind: DigestKind): Promise<void> {
  const now = new Date();
  const set = kind === "styles" ? { lastSeenStylesAt: now } : { lastSeenNewsAt: now };
  await db
    .insert(schema.userDigestSeen)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: schema.userDigestSeen.userId, set });
}
