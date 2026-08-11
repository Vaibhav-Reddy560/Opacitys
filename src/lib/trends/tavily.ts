import "server-only";

/**
 * Tavily — Currents' search backend, replacing Groq's own `browser_search`
 * tool. That tool ran entirely server-side in one opaque turn with no
 * `stopWhen`/`maxSteps` hook the SDK could use to cap it (browser_search
 * runs inside Groq's own turn, invisible to the client) — confirmed live to
 * matter: a single call burned 222,941 tokens (more than an entire day's
 * 200k free-tier cap) despite the prompt asking for "at most 2 searches, 2
 * opens," a request the model had no structural way to be held to.
 *
 * Doing search in application code instead makes the result count and
 * content length real, enforced caps — not a request a model can ignore —
 * and stops touching Groq's token budget for the search step entirely; only
 * the (now small, bounded) digest-writing text call still does.
 *
 * Free tier: 1,000 credits/month, no credit card (confirmed directly against
 * tavily.com/pricing, 2026-08-08) — 1 basic search = 1 credit, so up to
 * 1,000 Currents reads/month before any cost.
 */

const BASE = "https://api.tavily.com";

export function hasTavilyKey(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface RawTavilyResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
}

function requireKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set.");
  return key;
}

export async function tavilySearch(params: {
  query: string;
  maxResults: number;
  /** Tavily has no "N months" option — "year" is used as a coarse recency bias; the caller still enforces its own exact cutoff date on the results. */
  timeRange?: "month" | "year";
}): Promise<TavilyResult[]> {
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireKey()}` },
    body: JSON.stringify({
      query: params.query,
      max_results: params.maxResults,
      search_depth: "basic",
      ...(params.timeRange ? { time_range: params.timeRange } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily search failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { results?: unknown };
  const rawResults = Array.isArray(json.results) ? (json.results as RawTavilyResult[]) : [];

  return rawResults
    .map((r) => ({
      title: typeof r.title === "string" ? r.title : "Untitled",
      url: typeof r.url === "string" ? r.url : "",
      content: typeof r.content === "string" ? r.content : "",
    }))
    .filter((r) => r.url);
}
