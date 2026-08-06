import "server-only";
import { z } from "zod";
import { generateResearched, generateJson, MODELS, type ResearchSource } from "@/lib/ai/models";

/**
 * Same normalization contract as normalizeScope in src/lib/trends/read.ts —
 * absorbs whitespace/case/punctuation noise so near-identical questions
 * collide in the cache, without attempting real question understanding.
 */
export function normalizeQuestion(question: string): string {
  return question
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:'"]+$/g, "");
}

export function cacheKeyFor(params: { question: string; tool: string | null; version: string | null }): string {
  return `${normalizeQuestion(params.question)}|${params.tool?.trim().toLowerCase() ?? "any"}|${params.version?.trim().toLowerCase() ?? "any"}`;
}

// ---------------------------------------------------------------------------
// Result shape — shared by both paths
// ---------------------------------------------------------------------------

export const toolAnswerSchema = z.object({
  answer: z.string(),
  toolName: z.string().nullable(),
  // What this was verified against, and when/how — e.g. "Figma desktop,
  // current as of your screenshot" or "per Figma's help center, Aug 2026".
  // Deliberately prose, not a version enum — no tool's versioning scheme is
  // uniform enough to model as one.
  versionNote: z.string().nullable(),
  steps: z.array(z.string()).max(8),
  confidence: z.enum(["low", "medium", "high"]),
  caveats: z.array(z.string()),
  // Empty on the screenshot path (nothing was searched); validated against
  // the pass-1 whitelist on the research path — same contract as Currents'
  // sourceUrls (src/lib/trends/read.ts).
  sourceUrls: z.array(z.string()).max(4),
});
export type ToolAnswer = z.infer<typeof toolAnswerSchema>;

// jsonb `sources`/`result` round-trip through `unknown` at the DB layer —
// same tolerant-parse pattern as src/lib/trends/read.ts's sourcesSchema.
export const toolSourcesSchema = z.array(z.object({ title: z.string(), url: z.string() })).catch([]);

export function validateCitations(answer: ToolAnswer, whitelist: ResearchSource[]): ToolAnswer {
  const known = new Set(whitelist.map((s) => s.url));
  return { ...answer, sourceUrls: answer.sourceUrls.filter((u) => known.has(u)) };
}

// ---------------------------------------------------------------------------
// Path 1 — screenshot (vision, no search, synchronous)
// ---------------------------------------------------------------------------

const SCREENSHOT_SYSTEM = `You help a graphic designer find a specific
control in a design tool by reading a screenshot of their actual screen.

Rules:
- Point at what is ACTUALLY VISIBLE in the image — the real panel, menu, icon
  or button, described so the designer can find it by looking (e.g. "in the
  right sidebar, under Fill, click the chain-link icon" not "go to Edit >
  Preferences").
- If the control the question asks about is NOT visible in this screenshot
  (wrong panel open, wrong tool entirely), say so plainly rather than
  guessing where it might be in a version you can't see.
- "steps" is the click path, in order, using only what you can see. Empty
  array if the question isn't a "where is X" kind of question.
- "toolName": name the tool if it's identifiable from the UI chrome; null if
  you can't tell.
- "versionNote": something like "read directly from your screenshot" — never
  invent a version number you can't see.
- "confidence": "high" if the control/answer is clearly visible, "low" if
  you're inferring from a partial or ambiguous view.
- "caveats": empty array if nothing to flag.
- "sourceUrls" must be an empty array — nothing was searched for this answer.

Return ONLY valid JSON with EVERY one of these keys present, even when a
value is null or an empty array — never omit a key:
{
  "answer": "the explanation",
  "toolName": "name or null",
  "versionNote": "note or null",
  "steps": ["step one", "step two"],
  "confidence": "low" | "medium" | "high",
  "caveats": ["caveat text"],
  "sourceUrls": []
}`;

export async function readFromScreenshot(params: {
  imageUrl: string;
  question: string;
  tool: string | null;
  version: string | null;
}): Promise<ToolAnswer> {
  const context = [params.tool && `Tool (as named by the designer): ${params.tool}`, params.version && `Version: ${params.version}`]
    .filter(Boolean)
    .join("\n");

  const { data } = await generateJson({
    model: MODELS.vision,
    schema: toolAnswerSchema,
    schemaName: "tool_answer_screenshot",
    system: SCREENSHOT_SYSTEM,
    maxOutputTokens: 1200,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${context ? context + "\n\n" : ""}Question: ${params.question}` },
          { type: "image", image: params.imageUrl },
        ],
      },
    ],
  });
  return { ...data, sourceUrls: [] };
}

// ---------------------------------------------------------------------------
// Path 2 — live research (no screenshot)
// ---------------------------------------------------------------------------

/**
 * Pass 1: search current docs/changelogs/help centers, write up findings in
 * prose. Same two-pass shape as Currents (src/lib/trends/read.ts) and for
 * the same reason: browser_search can't be combined with JSON mode.
 *
 * Caps are tighter than Currents' (2 searches / 2 opens vs. 3/4) — this is a
 * second consumer of the same Groq 200k-token/day free-tier budget Currents
 * already strains, for a question that's usually narrower in scope than a
 * trends read.
 */
async function researchTool(params: {
  question: string;
  tool: string | null;
  version: string | null;
  today: Date;
}): Promise<{ digest: string; sources: ResearchSource[] }> {
  const todayStr = params.today.toISOString().slice(0, 10);
  const context = [params.tool && `Tool named: ${params.tool}`, params.version && `Version named: ${params.version}`]
    .filter(Boolean)
    .join("\n");

  const system = `You research current, version-aware answers about design
tools (Figma, Photoshop, Illustrator, Canva, and newer/niche entrants like
Kittl, Uizard, Recraft) for a working designer.

Today's date is ${todayStr}. Tool UIs and pricing change often — put the year in
search queries when it matters (e.g. "Figma variables 2026"), and prefer the
vendor's own current docs, changelog, or help center over old blog posts or
forum threads that may describe a stale version.

Keep research tight — this runs on a metered free tier. Aim for at most 2
searches and at most 2 page opens. Prefer what a search result's own title
and snippet already tell you; only open a page when the exact click path or
a specific claim genuinely needs the full text.

Give the concrete click path where the question asks "where is X" — actual
panel/menu/button names, in order. Note which version or date what you found
applies to. If you can't find a current, specific answer, say so plainly
rather than guessing from general tool knowledge.`;

  const { text, sources, usage } = await generateResearched({
    model: MODELS.reasoning,
    system,
    messages: [
      {
        role: "user",
        content: `${context ? context + "\n\n" : ""}Question: ${params.question}`,
      },
    ],
    maxOutputTokens: 2000,
  });

  console.log(`[tools] research pass: ${usage.totalTokens ?? "?"} tokens, ${sources.length} sources`);
  return { digest: text, sources };
}

const STRUCTURE_SYSTEM = `You turn tool-research notes into a structured
answer for a working designer.

Rules:
- Use only the digest and source list given to you — do not add outside
  knowledge or invent anything not present in the digest.
- "steps": the concrete click path if the digest describes one, in order.
  Empty array if the question wasn't a "where is X" kind of question.
- "sourceUrls": only URLs that appear verbatim in the numbered source list
  you're given. Never write a URL that isn't in that list.
- "versionNote": what version/date the digest's findings apply to, stated
  plainly — never invent a version number the digest doesn't mention.
- "confidence": "low" if the digest is thin, hedged, or admits it couldn't
  find a current answer; "high" only if clearly grounded in a specific,
  current source.
- "caveats": anything likely to have changed since, or that the digest
  itself flagged as uncertain.

Return ONLY valid JSON matching the schema.`;

function formatSourceList(sources: ResearchSource[]): string {
  return sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join("\n");
}

async function structureToolDigest(params: { digest: string; sources: ResearchSource[] }): Promise<ToolAnswer> {
  const { data } = await generateJson({
    model: MODELS.reasoning,
    schema: toolAnswerSchema,
    schemaName: "tool_answer_research",
    system: STRUCTURE_SYSTEM,
    maxOutputTokens: 1500,
    messages: [
      {
        role: "user",
        content: `Research notes:\n${params.digest}\n\nSources consulted (cite ONLY from this list, by exact URL):\n${formatSourceList(params.sources)}`,
      },
    ],
  });
  return data;
}

// Exported separately, not composed into one function — same reason as
// Currents' researchTrends/structureTrends split (src/lib/trends/read.ts):
// the pipeline needs to persist pass-1's digest/sources immediately, before
// attempting pass 2, so a pass-2 failure never discards already-fetched
// research.
export async function researchToolAnswer(params: {
  question: string;
  tool: string | null;
  version: string | null;
  today?: Date;
}): Promise<{ digest: string; sources: ResearchSource[] }> {
  return researchTool({ ...params, today: params.today ?? new Date() });
}

export async function structureToolAnswer(params: {
  digest: string;
  sources: ResearchSource[];
}): Promise<ToolAnswer> {
  const structured = await structureToolDigest(params);
  return validateCitations(structured, params.sources);
}
