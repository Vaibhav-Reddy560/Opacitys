import { NextResponse } from "next/server";
import { z } from "zod";
import { generateGrounded, MODELS } from "@/lib/ai/gateway";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().min(1).max(1000),
});

const responseSchema = z.object({
  answer: z.string(),
  caveats: z.array(z.string()),
});

const SYSTEM = `You are a knowledgeable design-tools guide for a graphic
designer. You know mainstream tools (Figma, Photoshop, Illustrator, Affinity,
Blender, Canva, etc.) and newer or niche tools that many designers haven't
heard of yet (e.g. Modyfi, Kittl, Uizard, Visily, Recraft, Relume, and similar
emerging entrants) — the point of this feature is real depth on tools people
don't already know about, not just repeating famous names.

Rules:
- Answer with real depth: what the tool is for, how it's positioned relative
  to alternatives, and anything genuinely distinctive about it.
- Never invent a tool that doesn't exist, or a feature a tool doesn't have.
- The tool landscape changes weekly — pricing, plan names, and exact menu
  locations are the most likely things to be stale. Whenever you mention
  something like that, also add a short note to "caveats" flagging it as
  worth double-checking, instead of stating it with false confidence.

Return ONLY valid JSON:
{
  "answer": "the explanation",
  "caveats": ["short note on anything likely to have changed since you learned it"]
}`;

// POST /api/tools/qa -> real-depth Q&A on mainstream and emerging design
// tools. Stateless, like the rest of Instruments — no DB writes.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json(
      { error: "AI_GATEWAY_API_KEY is not set — add it to .env.local to use Instruments." },
      { status: 503 },
    );
  }

  try {
    const { text } = await generateGrounded({
      model: MODELS.fast,
      system: SYSTEM,
      messages: [{ role: "user", content: parsed.data.question }],
    });

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const result = responseSchema.parse(JSON.parse(raw.trim()));

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Could not answer that: ${err.message}`
            : "Could not answer that.",
      },
      { status: 502 },
    );
  }
}
