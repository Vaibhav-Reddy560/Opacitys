import { NextResponse } from "next/server";
import { transcribe } from "ai";
import { groq } from "@ai-sdk/groq";
import { readSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // 25MB — well above a few minutes of speech

// POST /api/voice/transcribe -> the first stage of voice-to-text: the full
// recorded clip (body: raw audio bytes, Content-Type set to the recorder's
// mime type) is transcribed by Groq's open-source Whisper model. The second
// stage, /api/voice/cleanup, then strips filler words and fixes formatting.
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to use voice input." }, { status: 401 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set — add it to .env.local to use voice input." },
      { status: 503 },
    );
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Recording is too long." }, { status: 413 });
  }

  try {
    const result = await transcribe({
      model: groq.transcription("whisper-large-v3"),
      audio: buffer,
    });

    return NextResponse.json({ rawTranscript: result.text });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Could not transcribe that: ${err.message}`
            : "Could not transcribe that.",
      },
      { status: 502 },
    );
  }
}
