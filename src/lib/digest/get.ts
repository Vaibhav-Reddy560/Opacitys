import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import type { DailyStyleItem, DailyNewsItem } from "./read";

// Tolerant parse of the jsonb `items` column — same pattern as
// trends/read.ts's sourcesSchema: a malformed or legacy row shouldn't fail
// the whole sidebar/popover render, just come back empty.
const styleItemsSchema = z
  .array(z.object({ name: z.string(), description: z.string(), sourceUrls: z.array(z.string()) }))
  .catch([]);
const newsItemsSchema = z
  .array(z.object({ title: z.string(), summary: z.string(), url: z.string(), source: z.string() }))
  .catch([]);

export interface DigestResult<T> {
  items: T[];
  /** false means this is a prior day's row, shown while today's is still generating. */
  isFresh: boolean;
  createdAt: Date;
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getLatestComplete(kind: "styles" | "news") {
  const [row] = await db
    .select({
      items: schema.dailyDigest.items,
      digestDate: schema.dailyDigest.digestDate,
      createdAt: schema.dailyDigest.createdAt,
    })
    .from(schema.dailyDigest)
    .where(and(eq(schema.dailyDigest.kind, kind), eq(schema.dailyDigest.status, "complete")))
    .orderBy(desc(schema.dailyDigest.digestDate))
    .limit(1);
  return row ?? null;
}

/** Today's styles if ready, else the most recent prior complete row — never blocks on generation. */
export async function getTodayStyles(): Promise<DigestResult<DailyStyleItem> | null> {
  const row = await getLatestComplete("styles");
  if (!row) return null;
  return { items: styleItemsSchema.parse(row.items), isFresh: row.digestDate === todayDateStr(), createdAt: row.createdAt };
}

/** Today's news if ready, else the most recent prior complete row — never blocks on generation. */
export async function getTodayNews(): Promise<DigestResult<DailyNewsItem> | null> {
  const row = await getLatestComplete("news");
  if (!row) return null;
  return { items: newsItemsSchema.parse(row.items), isFresh: row.digestDate === todayDateStr(), createdAt: row.createdAt };
}
