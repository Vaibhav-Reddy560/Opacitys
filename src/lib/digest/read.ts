import "server-only";
import { z } from "zod";
import { generateGrounded, generateJson, MODELS, type ResearchSource } from "@/lib/ai/models";
import { tavilySearch } from "@/lib/trends/tavily";

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

const styleItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  // Optional supporting evidence, same "filter to what pass 1 actually
  // returned" treatment as trends' currents — a style still renders with
  // zero surviving URLs, it just shows no source chip.
  sourceUrls: z.array(z.string()).max(2),
});
export const dailyStylesSchema = z.object({
  items: z.array(styleItemSchema).min(1).max(5),
  basis: z.string(),
});
export type DailyStyles = z.infer<typeof dailyStylesSchema>;
export type DailyStyleItem = z.infer<typeof styleItemSchema>;

const newsItemSchema = z.object({
  title: z.string(),
  summary: z.string(),
  url: z.string(),
  source: z.string(),
});
export const dailyNewsSchema = z.object({
  items: z.array(newsItemSchema).min(1).max(6),
  basis: z.string(),
});
export type DailyNews = z.infer<typeof dailyNewsSchema>;
export type DailyNewsItem = z.infer<typeof newsItemSchema>;

// ---------------------------------------------------------------------------
// Pass 1 — research (shared shape, kind-specific query/prompt)
// ---------------------------------------------------------------------------

const MAX_RESULTS = 8;
const CONTENT_CHARS = 900; // per result, a hard cap on how much of Tavily's snippet feeds the prompt

function monthYear(date: Date): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function todayStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function stylesSystem(today: Date): string {
  return `You research what graphic design STYLES are currently getting attention, for a working designer's daily briefing.

Today's date is ${todayStr(today)}. Base claims only on the search results below.

Find 3-5 distinct, NAMED visual styles — specific enough that two designers would recognize the same look from the name, not one broad "trend" and not a single brand's one-off campaign. For each, describe concretely what it looks like: color, type, composition, texture — actual visual traits, not a mood word.

Base every claim ONLY on the search results below — do not use outside knowledge, and do not cite a source that isn't in this list.`;
}

function newsSystem(today: Date): string {
  return `You round up graphic-design-industry NEWS for a working designer's daily briefing — new tools or major tool updates, notable studio/agency moves, rebrands, platform changes that affect designers, award or competition news. Something has to have actually HAPPENED — a launch, an acquisition, a rebrand, a tool update, an award, a notable hire or agency move, a platform policy change.

Do NOT include: course listings, bootcamps, webinars, "how to" articles, or training-program advertisements — those are marketing content, not news, even when they carry a date. Do NOT include generic "trend report" content-marketing pieces with no actual news event in them. If the search results are mostly this kind of noise, report fewer items rather than padding with them.

Today's date is ${todayStr(today)}. Base claims only on the search results below.

Find 3-6 distinct items. For each, one sentence on what happened and why a graphic designer would care.

Base every claim ONLY on the search results below — do not use outside knowledge, and do not cite a source that isn't in this list.`;
}

/**
 * Search + prose digest, shared by both kinds — mirrors researchScope in
 * src/lib/trends/read.ts, minus the scope/window params this has no use for
 * (one fixed query per kind per day, not a designer-typed scope).
 */
async function researchAndDigest(params: {
  query: string;
  system: string;
}): Promise<{ digest: string; sources: ResearchSource[]; tokensUsed: number }> {
  const results = await tavilySearch({ query: params.query, maxResults: MAX_RESULTS, timeRange: "month" });

  if (results.length === 0) {
    throw new Error(`No recent web results found for "${params.query}".`);
  }

  const sources: ResearchSource[] = results.map((r) => ({ title: r.title, url: r.url }));
  const sourceBlock = results
    .map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n${r.content.slice(0, CONTENT_CHARS)}`)
    .join("\n\n");

  const { text, usage } = await generateGrounded({
    model: MODELS.reasoning,
    system: params.system,
    messages: [{ role: "user", content: `Search results:\n${sourceBlock}` }],
    maxOutputTokens: 1200,
  });

  const tokensUsed = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  return { digest: text, sources, tokensUsed };
}

export async function researchStyles(
  today: Date = new Date(),
): Promise<{ digest: string; sources: ResearchSource[]; tokensUsed: number }> {
  return researchAndDigest({
    query: `graphic design styles trends ${monthYear(today)}`,
    system: stylesSystem(today),
  });
}

export async function researchNews(
  today: Date = new Date(),
): Promise<{ digest: string; sources: ResearchSource[]; tokensUsed: number }> {
  return researchAndDigest({
    query: `graphic design industry news ${monthYear(today)}`,
    system: newsSystem(today),
  });
}

// ---------------------------------------------------------------------------
// Pass 2 — structure
// ---------------------------------------------------------------------------

const STYLES_STRUCTURE_SYSTEM = `You turn design-research notes into a structured daily briefing for a working designer.

Rules:
- Use only the digest and source list given to you — do not add outside knowledge or invent styles not present in the digest.
- "description": concrete visual traits, not a mood.
- "sourceUrls": only URLs that appear verbatim in the numbered source list you're given. Never write a URL that isn't in that list. Empty array is fine if none apply.
- "basis": one honest sentence on what this reads from (e.g. "recent design-trend coverage found via live web search").

Return ONLY valid JSON matching the schema.`;

const NEWS_STRUCTURE_SYSTEM = `You turn design-industry research notes into a structured daily news briefing for a working designer.

Rules:
- Use only the digest and source list given to you — do not add outside knowledge or invent items not present in the digest.
- "url": MUST be the exact URL (verbatim, from the numbered source list) the item's claim actually came from. Never write a URL that isn't in that list.
- "source": the publication or site name, not the full URL.
- "summary": one sentence, concrete — what happened, not a category label.
- "basis": one honest sentence on what this reads from (e.g. "recent design-industry coverage found via live web search").

Return ONLY valid JSON matching the schema.`;

function formatSourceList(sources: ResearchSource[]): string {
  return sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join("\n");
}

async function structureWith<T>(params: {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  digest: string;
  sources: ResearchSource[];
}): Promise<{ data: T; tokensUsed: number }> {
  const { data, usage } = await generateJson({
    model: MODELS.reasoning,
    schema: params.schema,
    schemaName: params.schemaName,
    system: params.system,
    maxOutputTokens: 1800,
    messages: [
      {
        role: "user",
        content: `Research notes:\n${params.digest}\n\nSources consulted (cite ONLY from this list, by exact URL):\n${formatSourceList(params.sources)}`,
      },
    ],
  });
  return { data, tokensUsed: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) };
}

export async function structureStyles(params: {
  digest: string;
  sources: ResearchSource[];
}): Promise<{ result: DailyStyles; tokensUsed: number }> {
  const { data, tokensUsed } = await structureWith({
    schema: dailyStylesSchema,
    schemaName: "daily_styles",
    system: STYLES_STRUCTURE_SYSTEM,
    ...params,
  });
  const known = new Set(params.sources.map((s) => s.url));
  return {
    result: { ...data, items: data.items.map((item) => ({ ...item, sourceUrls: item.sourceUrls.filter((u) => known.has(u)) })) },
    tokensUsed,
  };
}

export async function structureNews(params: {
  digest: string;
  sources: ResearchSource[];
}): Promise<{ result: DailyNews; tokensUsed: number }> {
  const { data, tokensUsed } = await structureWith({
    schema: dailyNewsSchema,
    schemaName: "daily_news",
    system: NEWS_STRUCTURE_SYSTEM,
    ...params,
  });
  const known = new Set(params.sources.map((s) => s.url));
  // Unlike styles' sourceUrls (supporting evidence, filter-not-drop), a news
  // item's url IS the claim's citation — one that isn't in the whitelist
  // means pass 2 invented or mis-copied it, so the whole item is dropped
  // rather than kept with a broken link.
  return { result: { ...data, items: data.items.filter((item) => known.has(item.url)) }, tokensUsed };
}
