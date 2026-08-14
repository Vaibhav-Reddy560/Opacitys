"use server";

import { readSession } from "@/lib/auth/session";
import { markSeen } from "./seen";
import type { DigestKind } from "./pipeline";

/**
 * Called client-side when the news popover is opened (news-popover.tsx).
 * Styles is marked seen server-side instead, directly in studio/layout.tsx
 * — it's always visible in the sidebar with no click needed to "open" it,
 * so rendering it there already IS seeing it.
 */
export async function markDigestSeen(kind: DigestKind): Promise<void> {
  const session = await readSession();
  if (!session) return;
  await markSeen(session.userId, kind);
}
