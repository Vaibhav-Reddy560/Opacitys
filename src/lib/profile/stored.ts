import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { SKILL_LEVELS, portfolioLinkSchema, type ProfilePatch, type StoredProfile } from "./stored-types";

// Re-exported so existing server-side callers (routes, the page) can import
// everything from this one module — only Client Components need to reach
// past this file to ./stored-types directly. See that file for why the
// split exists.
export { SKILL_LEVELS, portfolioLinkSchema, profilePatchSchema } from "./stored-types";
export type { PortfolioLink, ProfilePatch, StoredProfile } from "./stored-types";

/**
 * The stored half of Fingerprint — what the designer told us, plus the
 * cached written read. Everything measured is derived on read instead; see
 * the module note in ./fingerprint.ts for why none of that is cached here.
 */

// jsonb round-trips through `unknown`; tolerate a malformed row rather than
// failing the whole profile page over it — same pattern as trends'
// sourcesSchema and tools' toolSourcesSchema.
const linksSchema = portfolioLinkSchema.array().catch([]);

export async function getStoredProfile(userId: string): Promise<StoredProfile> {
  const [row] = await db
    .select({
      skillLevel: schema.designerProfiles.skillLevel,
      tools: schema.designerProfiles.tools,
      portfolioLinks: schema.designerProfiles.portfolioLinks,
      narrative: schema.designerProfiles.narrative,
      narrativeBasis: schema.designerProfiles.narrativeBasis,
      narrativeAt: schema.designerProfiles.narrativeAt,
    })
    .from(schema.designerProfiles)
    .where(eq(schema.designerProfiles.userId, userId))
    .limit(1);

  // No row is the normal state for anyone who hasn't filled the form —
  // return the empty shape rather than making every caller null-check.
  if (!row) {
    return { skillLevel: null, tools: [], portfolioLinks: [], narrative: null, narrativeBasis: null, narrativeAt: null };
  }

  const skill = SKILL_LEVELS.find((s) => s === row.skillLevel) ?? null;
  return {
    skillLevel: skill,
    tools: row.tools ?? [],
    portfolioLinks: linksSchema.parse(row.portfolioLinks ?? []),
    narrative: row.narrative,
    narrativeBasis: row.narrativeBasis,
    narrativeAt: row.narrativeAt,
  };
}

/**
 * Upsert on the user_id primary key — designer_profiles has one row per
 * user and no id of its own, so this is create-or-update in one statement.
 * Only the keys actually present in `patch` are written; omitting one leaves
 * the stored value alone rather than nulling it.
 */
export async function saveStoredProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const set: Partial<typeof schema.designerProfiles.$inferInsert> = { updatedAt: new Date() };
  if (patch.skillLevel !== undefined) set.skillLevel = patch.skillLevel ?? null;
  if (patch.tools !== undefined) set.tools = patch.tools ?? [];
  if (patch.portfolioLinks !== undefined) set.portfolioLinks = patch.portfolioLinks ?? [];

  await db
    .insert(schema.designerProfiles)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: schema.designerProfiles.userId, set });
}

export async function saveNarrative(userId: string, narrative: string, basis: string): Promise<void> {
  const set = { narrative, narrativeBasis: basis, narrativeAt: new Date(), updatedAt: new Date() };
  await db
    .insert(schema.designerProfiles)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: schema.designerProfiles.userId, set });
}
