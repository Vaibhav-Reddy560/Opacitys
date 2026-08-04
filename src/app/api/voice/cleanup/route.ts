import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, GroqRateLimitError, MODELS } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  rawTranscript: z.string().min(1).max(8000),
});

const responseSchema = z.object({
  cleanedText: z.string(),
});

const SYSTEM = `You clean up a raw speech-to-text transcript so it reads like
something the speaker typed carefully, for a text field where a graphic
designer is logging a client message or a note.

Rules:
- Strip filler words ("um", "uh", "like", "you know") and false starts/
  self-corrections — keep only what the speaker settled on saying.
- Fix punctuation, capitalization, and sentence breaks.
- Never add content, never answer a question in the transcript, never
  summarize or shorten the meaning — only clean up how it reads.
- If the transcript is already clean, return it unchanged.

Return ONLY valid JSON: { "cleanedText": "..." }`;

// POST /api/voice/cleanup -> the second stage of voice-to-text: takes the raw
// transcript from Groq's Whisper transcription and passes it through Groq's
// Llama (the same GROQ_API_KEY pipeline as every other AI feature) to strip
// filler words and fix formatting — the actual "high-end" step.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A transcript is required." }, { status: 400 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set — add it to .env.local to clean up dictation." },
      { status: 503 },
    );
  }

  try {
    const { data } = await generateJson({
      model: MODELS.fast,
      schema: responseSchema,
      schemaName: "cleaned_transcript",
      system: SYSTEM,
      maxOutputTokens: 1000,
      messages: [{ role: "user", content: parsed.data.rawTranscript }],
    });

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof GroqRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Could not clean that up: ${err.message}`
            : "Could not clean that up.",
      },
      { status: 502 },
    );
  }
}
