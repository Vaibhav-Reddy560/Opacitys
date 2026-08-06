import "server-only";
import { z } from "zod";
import { generateResearched, generateJson, MODELS, type ResearchSource } from "@/lib/ai/models";

/**
 * Normalizes a designer's scope string into a stable cache key component —
 * "Editorial  Poster Design!" and "editorial poster design" must collide.
 * Deliberately simple (no stemming/synonyms): the goal is only to absorb
 * whitespace/case/punctuation noise, not to understand the query.
 */
export function normalizeScope(scope: string): string {
  return scope
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:'"]+$/g, "");
}

export type TrendKind = "category" | "platform" | "brand";

export function cacheKeyFor(params: { scope: string; kind: TrendKind | null; windowMonths: number }): string {
  return `${normalizeScope(params.scope)}|${params.kind ?? "auto"}|${params.windowMonths}`;
}

// ---------------------------------------------------------------------------
// Pass 2 result shape
// ---------------------------------------------------------------------------

const currentSchema = z.object({
  name: z.string(),
  look: z.string(),
  origin: z.string(),
  why: z.string(),
  stage: z.enum(["emerging", "peaking", "established", "fading"]),
  executionSteps: z.array(z.string()).min(2).max(6),
  // Validated against the pass-1 source whitelist in code (see
  // validateCitations below) — the schema alone can't enforce "must be a URL
  // we actually visited," only "must be a string."
  sourceUrls: z.array(z.string()).max(4),
});

export const trendReadSchema = z.object({
  summary: z.string(),
  currents: z.array(currentSchema).min(1).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  // One honest sentence on what this is grounded in — same pattern as
  // Originality's "basis" field (src/lib/originality/read.ts).
  basis: z.string(),
});
export type TrendRead = z.infer<typeof trendReadSchema>;
export type TrendCurrent = z.infer<typeof currentSchema>;

// The jsonb `sources` column round-trips through `unknown` at the DB layer
// (src/lib/db/schema.ts's jsonb() has no static type) — this is the
// tolerant parse the result page uses to read it back safely, mirroring how
// critique's streamCompleteSchema (src/lib/critique/types.ts) handles the
// same kind of untyped jsonb read. `.catch([])` rather than failing the
// whole page over a malformed sources array — the currents themselves are
// what matters; source chips are enrichment.
export const sourcesSchema = z
  .array(z.object({ title: z.string(), url: z.string() }))
  .catch([]);

/**
 * Drops any sourceUrl the model names but pass 1 never actually visited.
 * This is what makes "cite everything" literally true instead of aspirational
 * — a URL invented at pass 2 (models do this) cannot survive this filter. A
 * current left with zero surviving URLs still renders; it just shows no
 * source chips, which is honest about what was and wasn't verified.
 */
export function validateCitations(read: TrendRead, whitelist: ResearchSource[]): TrendRead {
  const known = new Set(whitelist.map((s) => s.url));
  return {
    ...read,
    currents: read.currents.map((c) => ({
      ...c,
      sourceUrls: c.sourceUrls.filter((u) => known.has(u)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Pass 1 — research
// ---------------------------------------------------------------------------

const KIND_HINT: Record<TrendKind, string> = {
  category: "a design category or discipline",
  platform: "a platform or channel design shows up on",
  brand: "a specific brand or studio",
};

function windowLabel(months: number): string {
  if (months === 12) return "the last 12 months";
  return `the last ${months} months`;
}

/**
 * Pass 1: search the live web and write up what's moving, in prose.
 *
 * `browser_search` cannot be combined with JSON mode (confirmed live: Groq
 * 400s with "json mode cannot be combined with tool/function calling"), so
 * this pass is deliberately unstructured — pass 2 (structureTrends below)
 * turns the digest into the real schema afterward.
 *
 * Two hard constraints, both from measurements against this exact call:
 *   - Recency: without a stated cutoff the model drifted to 2024 sources
 *     even when asked about "now." Today's date and the cutoff date are
 *     stated explicitly, and every search query is required to carry a year.
 *   - Budget: one unconstrained run cost ~199.5k of Groq's 200k token/day
 *     free-tier cap (8 searches, 15 page opens, 24 tool turns). The caps
 *     below are a SOFT ask, not a hard limit — browser_search runs entirely
 *     inside Groq's own turn, so the SDK has no `stopWhen`/`maxSteps` hook
 *     into it. `maxOutputTokens` only bounds the reply, not the browsing.
 */
async function researchScope(params: {
  scope: string;
  kind: TrendKind | null;
  windowMonths: number;
  today: Date;
}): Promise<{ digest: string; sources: ResearchSource[] }> {
  const cutoff = new Date(params.today);
  cutoff.setMonth(cutoff.getMonth() - params.windowMonths);
  const todayStr = params.today.toISOString().slice(0, 10);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const kindLine = params.kind
    ? `Treat the scope as ${KIND_HINT[params.kind]}.`
    : "Infer from the scope itself whether it's a category, a platform, or a brand.";

  const system = `You research what is CURRENTLY moving in graphic design, for a working designer.

Today's date is ${todayStr}. Only use sources published on or after ${cutoffStr} (${windowLabel(params.windowMonths)}). Put the year in every search query you run. If you open a page and it's older than the cutoff, do not cite it and do not base a claim on it.

Keep research tight — this runs on a metered free tier. Aim for at most 3 searches and at most 4 page opens. Prefer what a search result's own title and snippet already tell you; only open a page when a specific claim genuinely needs the full text.

${kindLine}

Find 3-5 distinct, NAMED currents (not one broad "trend" — specific enough that two people would recognize the same thing from the name). If recent sources are thin, say so plainly and report fewer currents rather than padding with older material.

For each current, cover:
- What it looks like, concretely — not a mood, actual visual/structural traits
- Where it came from / what it's reacting against
- Why it's catching on now
- How a designer would actually execute it

Every claim should trace back to a page you searched or opened.`;

  const { text, sources, usage } = await generateResearched({
    model: MODELS.reasoning, // openai/gpt-oss-120b — the only reasoning-tier model with browser_search
    system,
    messages: [
      {
        role: "user",
        content: `Scope: ${params.scope}\nWindow: ${windowLabel(params.windowMonths)} (since ${cutoffStr})`,
      },
    ],
    maxOutputTokens: 3000,
  });

  // Cheap breadcrumb for judging whether the soft caps above are holding in
  // practice — not asserted on, just visible in server logs.
  console.log(`[trends] research pass: ${usage.totalTokens ?? "?"} tokens, ${sources.length} sources`);

  return { digest: text, sources };
}

// ---------------------------------------------------------------------------
// Pass 2 — structure
// ---------------------------------------------------------------------------

const STRUCTURE_SYSTEM = `You turn design-research notes into a structured report for a working designer.

Rules:
- Use only the digest and source list given to you — do not add outside knowledge or invent currents not present in the digest.
- "stage" is your honest read of where each current sits: emerging (just starting to appear), peaking (widely visible right now), established (already the norm), or fading (losing steam). Never invent a numeric momentum score — that would be false precision this isn't grounded to.
- "sourceUrls" for each current: only URLs that appear verbatim in the numbered source list you're given. Never write a URL that isn't in that list.
- "executionSteps": concrete moves a designer could actually follow, not restated description.
- "confidence": "low" if the digest itself is thin or hedged, "high" only if it's clearly grounded in multiple specific sources.
- "basis": one honest sentence on what this reads from (e.g. "recent design-trend coverage and portfolio writeups found via live web search") — never imply this is a live index of every platform.

Return ONLY valid JSON matching the schema.`;

function formatSourceList(sources: ResearchSource[]): string {
  return sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join("\n");
}

/**
 * Pass 2: structure pass-1's prose digest into the real schema.
 *
 * MODELS.reasoning (gpt-oss-120b) with STRICT structured outputs, not
 * MODELS.fast — reverted after two real, live failures on
 * llama-3.3-70b-versatile's non-strict JSON mode against this schema: one
 * likely truncation (finishReason: "length", under a since-raised token
 * cap), then a second with finishReason: "stop" — a genuinely malformed
 * object despite finishing cleanly, meaning it wasn't just a length problem.
 * Non-strict mode has no provider-level schema enforcement, only prompt
 * instructions, and this schema (nested array of objects, several enums) is
 * evidently past what that holds up for reliably. gpt-oss-120b supports
 * `structuredOutputs: true` (see STRICT_SCHEMA_MODELS) — the same
 * provider-enforced pattern src/lib/originality/read.ts already uses
 * successfully for a similarly-shaped nested result. This does concentrate
 * both passes on gpt-oss-120b's daily budget rather than spreading across
 * two models, but pass 1's browsing already dominates that budget by an
 * order of magnitude (measured 85k-190k tokens vs. pass 2's low thousands),
 * so the added cost is marginal against the reliability gained.
 */
async function structureDigest(params: {
  digest: string;
  sources: ResearchSource[];
}): Promise<TrendRead> {
  const { data } = await generateJson({
    model: MODELS.reasoning,
    schema: trendReadSchema,
    schemaName: "trend_read",
    system: STRUCTURE_SYSTEM,
    // 5 currents, each with look/origin/why prose plus 2-6 execution steps
    // and up to 4 source URLs, can genuinely need more than 2000 tokens —
    // an earlier run failed with AI_NoObjectGeneratedError or a truncated
    // response under a tighter cap.
    maxOutputTokens: 3500,
    messages: [
      {
        role: "user",
        content: `Research notes:\n${params.digest}\n\nSources consulted (cite ONLY from this list, by exact URL):\n${formatSourceList(params.sources)}`,
      },
    ],
  });
  return data;
}

/**
 * The two passes are exported SEPARATELY rather than composed into one
 * `readTrends()` — deliberately, after a real bug: an earlier version wrapped
 * both in a single async function and only returned once both had
 * succeeded, so when pass 2 threw, pass 1's digest/sources — already fetched,
 * already worth persisting — were silently discarded instead of reaching the
 * pipeline's intermediate save. The pipeline (src/lib/trends/pipeline.ts)
 * needs to persist digest/sources right after pass 1 regardless of whether
 * pass 2 succeeds, both so the progress meter's "writing" stage is real and
 * so a pass-2 failure doesn't erase pass-1's work.
 */
export async function researchTrends(params: {
  scope: string;
  kind: TrendKind | null;
  windowMonths: number;
  today?: Date;
}): Promise<{ digest: string; sources: ResearchSource[] }> {
  return researchScope({ ...params, today: params.today ?? new Date() });
}

export async function structureTrends(params: {
  digest: string;
  sources: ResearchSource[];
}): Promise<TrendRead> {
  const structured = await structureDigest(params);
  return validateCitations(structured, params.sources);
}
