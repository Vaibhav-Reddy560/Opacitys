import { NextResponse } from "next/server";
import { z } from "zod";
import { generateGrounded, MODELS } from "@/lib/ai/gateway";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().min(1).max(1000),
  country: z.string().min(1).max(80),
});

const responseSchema = z.object({
  answer: z.string(),
  keyConsiderations: z.array(z.string()),
  confidence: z.enum(["general", "country-specific-approximate"]),
});

const SYSTEM = `You explain commercial-use and copyright basics to graphic
designers — what's typically free to use commercially versus what needs a
license, for assets like fonts, stock images, and AI-generated content.

Rules:
- Explain general, typical patterns for the named country — not statute
  numbers, not case law, not anything that reads like a citation. You are
  giving orientation, not a legal opinion.
- Never invent a specific law, court case, or exact date. If a question is too
  specific or too likely to have changed since your training to answer with
  real confidence, say so plainly in the answer itself rather than asserting.
- Set "confidence" to "general" when the answer is essentially the same
  everywhere (e.g. public domain basics), or "country-specific-approximate"
  when you're describing that country's typical pattern but it could have
  changed or have exceptions.
- Always end the answer by recommending the designer confirm with a local
  professional before relying on it commercially.

Return ONLY valid JSON:
{
  "answer": "the explanation",
  "keyConsiderations": ["short, concrete point the designer should keep in mind"],
  "confidence": "general" | "country-specific-approximate"
}`;

// POST /api/rights/qa -> general + country-flavored guidance on commercial
// use and licensing. Deliberately never the sole word on the subject — the
// page renders its own persistent disclaimer around this response.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A question and country are required." }, { status: 400 });
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json(
      { error: "AI_GATEWAY_API_KEY is not set — add it to .env.local to use Clearance." },
      { status: 503 },
    );
  }

  try {
    const { text } = await generateGrounded({
      model: MODELS.fast,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Country: ${parsed.data.country}\n\nQuestion: ${parsed.data.question}`,
        },
      ],
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
            ? `Could not put that together: ${err.message}`
            : "Could not put that together.",
      },
      { status: 502 },
    );
  }
}
