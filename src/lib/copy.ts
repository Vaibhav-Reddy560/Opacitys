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
  title: "The hard part was never the drawing.",
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
 * original one-paragraph summary and stays as-is.
 */
export const MODULES = [
  {
    slug: "critique",
    href: "/studio/critique",
    name: "Critique",
    tagline: "See what is actually working",
    body:
      "Upload a design and get it read back to you in measurements — contrast ratios, type scale, alignment, spacing rhythm — each one pinned to the exact place on the image it came from.",
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
    tagline: "Take a design apart, then watch it come back",
    body:
      "Photograph a poster or a logo. Opacitys separates it into layers and elements, names them, and reconstructs it step by step — narrating each shape, gradient and effect as it goes, in an editor you can take over at any point.",
    dimension: "typography",
    status: "planned",
    input: "A photograph of a poster, logo, or finished piece",
    output: "The same design, rebuilt layer by layer inside an editor you can take over",
    steps: [
      "Separates the image into its component layers and elements",
      "Names each one and plans the order it was likely built in",
      "Reconstructs it step by step, narrating the shape, gradient or effect at each stage",
    ],
  },
  {
    slug: "identify",
    href: "/studio/identify",
    name: "Identify",
    tagline: "Name the style, in proportion",
    body:
      "Most designs are a blend, not a category. This reads an image against a labelled taxonomy and tells you the mix — sixty percent Swiss, thirty brutalist, ten editorial — with the same answer every time you ask.",
    dimension: "hierarchy",
    status: "partial",
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
      "What is moving right now, where it came from, why it caught, and how to execute it — traced back to the design philosophy underneath rather than left as a mood board.",
    dimension: "layout",
    status: "planned",
    input: "A category, platform, or brand you want a read on",
    output: "What is moving right now, why it caught on, and how to execute it yourself",
    steps: [
      "Scans current articles, reels and portfolios in that space",
      "Traces each trend back to the design philosophy underneath it",
      "Turns that into a concrete, step-by-step way to execute it",
    ],
  },
  {
    slug: "workflow",
    href: "/studio/workflow",
    name: "Route",
    tagline: "From brief to build, with what you actually have",
    body:
      "Give it the client's specifications, your resources and your current skills. It returns practical directions — including ones you have not tried — as an ordered plan naming the tool and the step for each stage.",
    dimension: "spacing",
    status: "planned",
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
      "Current, version-aware knowledge of the apps you work in. When a menu moves, the answer moves with it — and when a KB cannot be sure, it reads your screenshot and points at the real control.",
    dimension: "balance",
    status: "planned",
    input: "A question about a tool, or a screenshot of one",
    output: "Where the control actually is, in the version you are running",
    steps: [
      "Keeps current, version-aware knowledge of Figma, Photoshop and the rest",
      "Updates the answer the moment a menu or panel moves",
      "Falls back to reading your screenshot when the knowledge base cannot be sure",
    ],
  },
  {
    slug: "translate",
    href: "/studio/translate",
    name: "Correspondence",
    tagline: "The whole client relationship, in one thread",
    body:
      "Log what the client said, when, and through which channel. Track how many rounds a project has been through, how long each turnaround took, and what you charged for it — with every message readable back into what they probably mean and a reply you could send.",
    dimension: "originality",
    // Wired end to end. Needs AI_GATEWAY_API_KEY for interpretation and
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
    name: "Distance",
    tagline: "Check it is yours before you spend a week on it",
    body:
      "Describe or sketch the direction and see how crowded it already is. Not to talk you out of it — so that you know, up front, how far you are from everything adjacent.",
    dimension: "originality",
    status: "planned",
    input: "A direction you are considering, described or sketched",
    output: "How crowded that space already is, before you spend a week in it",
    steps: [
      "Compares the direction against known, published work in the same territory",
      "Measures how close the overlap actually is",
      "Reports the distance — not a verdict, just what is already out there",
    ],
  },
  {
    slug: "profile",
    href: "/studio/profile",
    name: "Fingerprint",
    tagline: "Your style, recorded over time",
    body:
      "Your uploads build a picture of how you actually work — the palettes, the type, the moves you return to. It tracks your portfolio numbers, and gives you evidence when someone calls your work a template.",
    dimension: "typography",
    status: "partial",
    input: "Your uploads and portfolio links, over time",
    output: "A record of your actual style — evidence, not opinion",
    steps: [
      "Builds a picture of the palettes, type and moves you keep returning to",
      "Tracks your portfolio numbers across Behance and Dribbble",
      "Gives you something concrete when someone calls your work a template",
    ],
  },
  {
    slug: "rights",
    href: "/studio/rights",
    name: "Clearance",
    tagline: "Know what's actually yours to use",
    body:
      "General, durable principles on public domain, licensing and work-for-hire, plus a country-aware answer to a specific question about a font, image, or asset — always with a plain reminder that this is guidance, not legal advice.",
    dimension: "balance",
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

export const STATUS_LABEL: Record<ModuleDef["status"], string> = {
  live: "Ready",
  partial: "In progress",
  planned: "Next",
};

export const CLOSE = {
  title: "Bring it up to one hundred.",
  body:
    "Start with whatever you have — a photo, a half-finished file, a brief you do not understand yet. Faint is a perfectly good place to begin.",
  cta: "Open the studio",
} as const;
