import { z } from "zod";

/**
 * Pure types/constants/schemas for the stored half of Fingerprint —
 * deliberately split out of ./stored.ts (which has `server-only` and pulls
 * in `db`/`postgres`, itself needing Node's `tls`/`net`). SelfReported is a
 * Client Component and needs SKILL_LEVELS as a runtime value, not just a
 * type — importing it from stored.ts pulled the whole DB client into the
 * browser bundle and broke the page. Nothing in this file touches the
 * database.
 */

export const SKILL_LEVELS = ["learning", "working", "senior", "lead"] as const;

export const portfolioLinkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url().max(300),
});
export type PortfolioLink = z.infer<typeof portfolioLinkSchema>;

export const profilePatchSchema = z.object({
  skillLevel: z.enum(SKILL_LEVELS).nullish(),
  tools: z.array(z.string().trim().min(1).max(40)).max(30).nullish(),
  portfolioLinks: z.array(portfolioLinkSchema).max(10).nullish(),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export interface StoredProfile {
  skillLevel: (typeof SKILL_LEVELS)[number] | null;
  tools: string[];
  portfolioLinks: PortfolioLink[];
  narrative: string | null;
  narrativeBasis: string | null;
  narrativeAt: Date | null;
}
