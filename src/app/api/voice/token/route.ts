import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const responseSchema = z.object({
  key: z.string(),
  expiresAt: z.string(),
});

const TTL_SECONDS = 60;

// POST /api/voice/token -> a short-lived, scoped Deepgram key the browser can
// use to open a streaming WebSocket directly. Minted per request rather than
// reused, so the long-lived DEEPGRAM_API_KEY never leaves the server.
export async function POST() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to use voice input." }, { status: 401 });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  const projectId = process.env.DEEPGRAM_PROJECT_ID;
  if (!apiKey || !projectId) {
    return NextResponse.json(
      {
        error:
          "DEEPGRAM_API_KEY / DEEPGRAM_PROJECT_ID are not set — add them to .env.local to use voice input.",
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment: `opacitys voice input (${session.userId})`,
        scopes: ["usage:write"],
        time_to_live_in_seconds: TTL_SECONDS,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Deepgram declined to mint a key: ${res.status} ${body}`.trim() },
        { status: 502 },
      );
    }

    const json = await res.json();
    const result = responseSchema.parse({
      key: json.key,
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach Deepgram." },
      { status: 502 },
    );
  }
}
