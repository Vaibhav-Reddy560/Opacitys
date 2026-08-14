/**
 * All product copy lives here so the voice stays consistent and is easy to revise.
 *
 * VOICE — built on the name. Opacity is clarity. Every design starts faint:
 * a half-formed idea at 10%, a brief you can almost read, a client note you
 * cannot picture. The work is bringing it up — layer by layer — until it is
 * fully there at 100%.
 *
 * Rules:
 *   - Warm and on the designer's side. Never scold the designer or the client.
 *   - Poetic but concrete. Every line must mean something specific; no
 *     atmosphere for its own sake.
 *   - Speak in opacity, layers, light, resolve, develop. Avoid "coordinates,
 *     not compliments" style hard-edged lines — that reads as combative.
 */

export const HERO = {
  // Rendered with "Vision" and "Design" picked out in spectral color —
  // page.tsx builds the JSX, this is the plain-text fallback (aria-label).
  eyebrow: "Everything between Vision and Design",
  // "Opacitys" is picked out in page.tsx the same way.
  lede:
    "Opacitys is a creative workspace that simplifies every stage of the graphic design process, from inspiration to execution. Everything you need to turn ideas into exceptional designs — all in one place.",
  // The hero is a single lit column — wordmark, rule, eyebrow, one line, CTA —
  // sitting inside the dispersion. At that density the lede has to be one
  // claim and then get out of the way; the full `lede` above is three lines
  // and would fight the beam for the middle of the screen. `lede` is kept for
  // where length is an asset rather than a cost (OG description, a future
  // about section).
  ledeShort: "Every flaw pinned to its exact spot, with a measured number instead of an adjective.",
  primaryCta: "Open the studio",
  secondaryCta: "See how it develops",
} as const;

export const OPACITY_STAGES = [
  {
    value: 10,
    label: "The faint idea",
    body: "You can sense the design before you can describe it. Nothing is wrong yet — it is simply not visible.",
  },
  {
    value: 40,
    label: "Reference and direction",
    body: "Shapes settle. You know the register you are working in, and which way is forward.",
  },
  {
    value: 70,
    label: "Structure and craft",
    body: "Type finds a scale, the grid appears, spacing starts to breathe on purpose.",
  },
  {
    value: 100,
    label: "Fully resolved",
    body: "Every decision has a reason you could defend out loud, to a client or to yourself.",
  },
] as const;

export const PROBLEM = {
  eyebrow: "Why it stays faint",
  title: "Designing is rarely the hard part.",
  body:
    "It is the brief you have to guess at, the note that just says make it pop, the trend that moved while you were finishing, and the quiet question of whether the thing you made is actually good. Opacitys is built around those, not around the canvas.",
  frictions: [
    {
      title: "The brief arrives blurry",
      body: "Specifications, references and constraints, with no route from what you have to what they want.",
    },
    {
      title: "Feedback comes in vague",
      body: "Make it cleaner. More premium. Not quite it. All real signals, none of them actionable yet.",
    },
    {
      title: "The reference moves",
      body: "What reads as current shifts monthly, across platforms you do not have time to watch.",
    },
    {
      title: "You cannot see your own work",
      body: "After the fourth revision, nobody can tell whether it is working. Least of all you.",
    },
  ],
} as const;

/**
 * The ten modules. `status` is honest about what is wired end to end today
 * versus what is UI-complete and waiting on its backend phase — used to render
 * a badge, so nothing here overstates what the app can do.
 *
 * `input` / `output` / `steps` back the landing-page feature explorer — every
 * line has to describe something the module genuinely does; `body` is the
 * original one-paragraph summary and stays as-is. `summary` is a second,
 * shorter cut for the post-sign-in studio home grid (src/app/studio/page.tsx)
 * — nine cards need roughly matched lengths to read as one grid rather than
 * a ragged one, which `body` (deliberately full detail, tuned for the
 * module's own page header) isn't written for.
 */
export const MODULES = [
  {
    slug: "critique",
    href: "/studio/critique",
    name: "Critique",
    tagline: "See what is actually working",
    body:
      "Upload a design and get it read back to you in measurements — contrast ratios, type scale, alignment, spacing rhythm — each one pinned to the exact place on the image it came from.",
    summary:
      "Reads a design back in measurements — contrast, type scale, alignment, spacing — each one pinned to the exact spot it happens.",
    dimension: "color",
    status: "live",
    input: "A finished or in-progress design, as an image",
    output: "Every flaw pinned to its exact spot, with a measured number instead of an adjective",
    steps: [
      "Runs deterministic measurements — contrast ratios, type scale, alignment, spacing rhythm",
      "A model reads those measurements and explains what each one means for the design",
      "Findings land directly on the image, with a score per dimension",
    ],
  },
  {
    slug: "rebuild",
    href: "/studio/rebuild",
    name: "Rebuild",
    tagline: "Take a design apart, then change it by asking",
    body:
      "Upload a poster, a logo, a screen. Opacitys finds the real elements inside it — the logo, each block of type, each button — names them, and nests them under the sections they sit in. Point at one, describe the change you want, and it redraws just that part — everything else, including transparency, stays exactly as it was. Every version is kept.",
    dimension: "typography",
    // Wired end to end, on two free, no-card providers. Detection is Gemini
    // (free tier, 500/day) grounding the image into named bounding boxes —
    // open-vocabulary, so it returns "button"/"navigation bar", not a fixed
    // class list. Editing is Pollinations.ai — "gptimage" by default (the
    // only model tested that renders edited text correctly; FLUX-family
    // models measurably mangle it), falling back to "klein" for crops whose
    // ratio doesn't fit gptimage's 3 fixed output sizes. Chosen over
    // Gemini's own image-editing model specifically because that requires a
    // billing-enabled Google Cloud project even at $0 usage; Pollinations
    // never asks for a card, but a fresh account starts at 0 Pollen and
    // must earn some via its own free Quests before editing works — see
    // POLLINATIONS_API_KEY in .env.local.example.
    //
    // A scoped edit (a selected layer or a dragged region) crops that
    // region out, edits ONLY the crop, and composites it back onto the
    // untouched original at full resolution — so a one-word text fix on a
    // 6000px logo comes back at 6000px with everything else, including the
    // source's own transparency, pixel-identical outside the edited box.
    // Only an edit with nothing selected regenerates the whole frame, and
    // that one really is a new image very close to the original rather
    // than a byte-identical copy of it.
    summary:
      "Finds every element inside a design — logo, type, buttons — and redraws just the part you describe, keeping everything else untouched.",
    status: "live",
    input: "An image of a poster, logo, or finished screen",
    output: "Its elements found and named, and a redrawn version for any change you describe",
    steps: [
      "Finds the real elements — logo, type, buttons, imagery — and nests them under the sections they belong to",
      "Select a layer, or drag a box over any part of the image, and describe the change in plain language",
      "Redraws just that part at full resolution and keeps it as a named version — everything outside it, including transparency, stays untouched",
    ],
  },
  {
    slug: "identify",
    href: "/studio/identify",
    name: "Identify",
    tagline: "Name the style, in proportion",
    body:
      "Most designs are a blend, not a category. This reads an image against a labelled taxonomy and tells you the mix — sixty percent Swiss, thirty brutalist, ten editorial — with the same answer every time you ask.",
    summary:
      "Reads a design against a labelled taxonomy and returns its actual style mix — say, sixty percent Swiss, thirty brutalist, ten editorial.",
    dimension: "hierarchy",
    // Wired end to end. Needs GROQ_API_KEY for the style read and
    // DATABASE_URL to persist it.
    status: "live",
    input: "Any design image",
    output: "The style mix behind it, as percentages — not a single guessed label",
    steps: [
      "Reads the image against a labelled taxonomy of over a hundred design styles",
      "Scores how strongly each style is present",
      "Returns the blend — say, sixty percent Swiss, thirty brutalist, ten editorial",
    ],
  },
  {
    slug: "trends",
    href: "/studio/trends",
    name: "Currents",
    tagline: "Read the room, and the reason",
    body:
      "Name a category, platform or brand and it searches the live web — within the window you pick — for what's actually moving, where it came from, why it's catching on, and how to execute it. Every claim is pinned to the page it came from.",
    summary:
      "Searches the live web for what's actually moving in a category or platform, why it's catching on, and how to execute it.",
    dimension: "layout",
    // Wired end to end. Needs GROQ_API_KEY (write-up + structured synthesis)
    // and TAVILY_API_KEY (the actual web search — src/lib/trends/tavily.ts).
    // Search moved off Groq's own browser_search tool after a real failure:
    // that tool ran in one opaque server-side turn with no enforceable step
    // limit, and a single call once burned more tokens than Groq's entire
    // daily free-tier budget. Recent reads for the same scope are served
    // from cache rather than re-searched.
    status: "live",
    input: "A category, platform, or brand you want a read on, and how far back to look",
    output: "Named, distinct currents — what they look like, why they caught on, how to execute them, and the sources",
    steps: [
      "Searches the live web for recent, dated writing on that scope",
      "Names 3-5 distinct currents, each traced to where it came from and why it's catching on now",
      "Turns each into concrete execution steps, with every claim linked back to its source",
    ],
  },
  {
    slug: "workflow",
    href: "/studio/workflow",
    name: "Route",
    tagline: "From brief to build, with what you actually have",
    body:
      "Give it the client's specifications, your resources and your current skills. It returns practical directions — including ones you have not tried — as an ordered plan naming the tool and the step for each stage. Ask it anything about the plan afterward — it can explain itself, or fix a step that's genuinely wrong.",
    summary:
      "Turns a client brief and your actual resources into an ordered plan — which tool, which step, in what order to use them.",
    dimension: "spacing",
    // Wired end to end. Needs GROQ_API_KEY — one generateJson call
    // (MODELS.reasoning, provider-enforced JSON schema; a nested plan
    // needs the strict mode a lighter model doesn't reliably hold to). No
    // web search: this reasons over the brief and the designer's own
    // stated resources, not a live-web question, so it stays a single
    // bounded call. Follow-up questions (src/lib/workflow/turn.ts) are
    // this app's first real multi-turn conversation — role-tagged history,
    // capped at 8 prior turns — and can revise the plan itself when a
    // question exposes something genuinely wrong, keeping the prior
    // version rather than overwriting it. Shares Currents' Groq quota.
    status: "live",
    input: "A client brief, plus the tools and skills you actually have",
    output: "An ordered plan naming which tool does which step",
    steps: [
      "Reads the brief for what it is actually asking for",
      "Matches it against your stated resources and skill level",
      "Returns a practical route, including approaches you may not have tried",
    ],
  },
  {
    slug: "tools",
    href: "/studio/tools",
    name: "Instruments",
    tagline: "Know where everything is",
    body:
      "Attach a screenshot and it reads your actual screen to point at the real control. Ask without one and it searches current docs and changelogs instead — either way, the answer is grounded in something live, not a stored guess.",
    summary:
      "Reads your actual screen to point at the real control, or searches live docs when you don't have one to show it.",
    dimension: "balance",
    // Wired end to end. Needs GROQ_API_KEY — the screenshot path is one
    // vision call (qwen), the no-screenshot path is the same live-search +
    // structure pattern as Currents (gpt-oss-120b), capped tighter to share
    // Groq's daily budget. Recent research-path answers for the same
    // question are served from cache; screenshot answers never are.
    status: "live",
    input: "A question about a tool, or a screenshot of one",
    output: "Where the control actually is, or what a live search of current docs found",
    steps: [
      "A screenshot is read directly against what's actually visible — no search, no stored knowledge",
      "Without one, it searches current docs, changelogs and help centres instead",
      "Every research-path claim links back to the page it came from; repeat questions are served from a week-long cache",
    ],
  },
  {
    slug: "translate",
    href: "/studio/translate",
    name: "Correspondence",
    tagline: "The whole client relationship, in one thread",
    body:
      "Log what the client said, when, and through which channel. Track how many rounds a project has been through, how long each turnaround took, and what you charged for it — with every message readable back into what they probably mean and a reply you could send.",
    summary:
      "Logs every client message with its timing and cost, and reads any note back into what they meant and a reply you could send.",
    // "depth" was retired from the critique dimension set; this module's
    // accent now shares "balance" rather than a dimension no analyzer
    // measures any more. ("tools" also uses "balance", but that module is
    // still status: "planned" and unbuilt, so there's no live collision.)
    dimension: "balance",
    // Wired end to end. Needs GROQ_API_KEY for interpretation and
    // DATABASE_URL to persist the log — no Python service.
    status: "live",
    input: "What the client said, plus the channel, iteration and price",
    output: "A running log of the relationship — timing, cost, and what each note actually meant",
    steps: [
      "Logs every client message with its timestamp, channel and iteration number",
      "Tracks turnaround time and price per round, so the history is evidence, not memory",
      "Reads any entry back into concrete moves, trade-offs, and a reply you could send",
    ],
  },
  {
    slug: "originality",
    href: "/studio/originality",
    name: "Originality",
    tagline: "Check it's yours before you spend a week",
    body:
      "Describe the direction — or attach a sketch — and get a read on how crowded that territory already is: the movements and work it sits closest to, what's genuinely distinct about it, and moves that would put more daylight between you and the nearest neighbor.",
    summary:
      "Checks how crowded your direction already is — its nearest neighbors, what's genuinely distinct, and moves that would widen the gap.",
    // "originality" was retired from the critique dimension set (this
    // module is the standalone feature it duplicated); "restraint"
    // inherits the exact same color, so this accent doesn't change.
    dimension: "restraint",
    // Wired end to end. Needs GROQ_API_KEY for the read and DATABASE_URL to
    // persist it. Reads against what the model knows from published,
    // documented work — not a live index of everything that exists.
    status: "live",
    input: "A direction you're considering, described in words, plus an optional sketch",
    output: "How crowded that space is, its nearest neighbors, and what's distinct about yours",
    steps: [
      "Reads the direction — and the image, if you attach one — against widely-documented movements and work",
      "Names the closest neighbors and why they're close, not just a single verdict",
      "Suggests concrete moves that would widen the gap, and says plainly when it isn't sure",
    ],
  },
  {
    slug: "profile",
    href: "/studio/profile",
    name: "Fingerprint",
    tagline: "Your style, recorded over time",
    body:
      "Every Critique, Identify and Originality read you've run, aggregated into one record — the styles you keep returning to, your measured strengths and recurring notes, the palette you reach for. Nothing here is guessed; a dimension without enough signal says so instead of scoring zero.",
    summary:
      "Aggregates every read you've run into one record — the styles you return to, your measured strengths, and the palette you reach for.",
    dimension: "rhythm",
    // Wired end to end. Entirely derived from rows Critique/Identify/
    // Originality already write — no new model capability needed for the
    // measured sections. The one model call (a written summary of the
    // aggregate) is opt-in and cached, never automatic. Portfolio tracking
    // is a link, not a number: Behance's public API is closed and Dribbble
    // v2 no longer returns view/like counts, so neither platform can back
    // that claim any more.
    status: "live",
    input: "Your uploads — nothing new to provide",
    output: "Your measured style, craft scores and palette, plus recurring notes across everything you've made",
    steps: [
      "Aggregates every completed Critique, Identify and Originality run into one record",
      "States plainly when a dimension doesn't have enough signal yet, rather than scoring it zero",
      "Turns the aggregate into a short written read, only when you ask for one",
    ],
  },
  {
    slug: "rights",
    href: "/studio/rights",
    name: "Clearance",
    tagline: "Know what's actually yours to use",
    body:
      "General, durable principles on public domain, licensing and work-for-hire, plus a country-aware answer to a specific question about a font, image, or asset — always with a plain reminder that this is guidance, not legal advice.",
    summary:
      "General, durable guidance on public domain and licensing, plus a country-aware answer to a specific question about a font or asset.",
    dimension: "contrast",
    status: "live",
    input: "A question about an asset, plus the country you're working from",
    output: "General guidance on what's free to use commercially and what needs a license",
    steps: [
      "Starts from durable principles — public domain, licensing, work-for-hire — that don't shift by jurisdiction",
      "Reads your question against the general pattern in the country you name",
      "Says plainly when something is too specific or too likely to have changed to answer with confidence",
    ],
  },
] as const;

export type ModuleDef = (typeof MODULES)[number];

// Typed as the full status union, not `ModuleDef["status"]` — with every
// module now `"live"`, that union collapses to the single literal `"live"`
// and would reject the `planned` key as excess. Kept explicit so a future
// module added as `"planned"` doesn't have to rediscover this.
export const STATUS_LABEL: Record<"live" | "planned", string> = {
  live: "Ready",
  planned: "Next",
};

export const CLOSE = {
  title: "Bring it up to one hundred.",
  body:
    "Start with whatever you have — a photo, a half-finished file, a brief you do not understand yet. Faint is a perfectly good place to begin.",
  cta: "Open the studio",
} as const;
