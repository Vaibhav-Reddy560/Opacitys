import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { GroqRateLimitError } from "@/lib/ai/models";
import { computeFingerprint, fingerprintBasis, MIN_SAMPLES } from "@/lib/profile/fingerprint";
import { narrateFingerprint } from "@/lib/profile/narrate";
import { getStoredProfile, saveNarrative } from "@/lib/profile/stored";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/profile/narrate -> generate and cache the written read.
//
// Deliberately a POST on an explicit user action, never a side effect of
// rendering the page: this is a fourth consumer of Groq's daily token budget
// alongside Critique, Currents and Instruments, and the numbers it describes
// are already fully readable without it.
//
// Caching contract: if a narrative exists and its stored basis hash still
// matches the live aggregate, the same one is returned WITHOUT a model call.
// Only a genuinely changed fingerprint (or ?force=1) re-bills.
export async function POST(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set — add it to .env.local to write up your fingerprint." },
      { status: 503 },
    );
  }

  const force = new URL(req.url).searchParams.get("force") === "1";
  const [fingerprint, stored] = await Promise.all([
    computeFingerprint(session.userId),
    getStoredProfile(session.userId),
  ]);

  // Nothing measured means nothing honest to say about it.
  const hasSignal =
    fingerprint.styleSignature.length > 0 ||
    fingerprint.craft.perDimension.some((d) => d.sampled >= MIN_SAMPLES) ||
    fingerprint.palette.length > 0;
  if (!hasSignal) {
    return NextResponse.json(
      { error: "There isn't enough measured work yet to write anything honest about it." },
      { status: 400 },
    );
  }

  const basis = fingerprintBasis(fingerprint);
  if (!force && stored.narrative && stored.narrativeBasis === basis) {
    return NextResponse.json({ narrative: stored.narrative, at: stored.narrativeAt, cached: true });
  }

  try {
    const result = await narrateFingerprint(fingerprint);
    // Stored as one block of prose rather than three columns — the shape is
    // presentation, and keeping it in `narrative` means the cache contract
    // has exactly one thing to invalidate.
    const narrative = [result.reading, result.throughLine, result.watchOut]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n");

    await saveNarrative(session.userId, narrative, basis);
    return NextResponse.json({ narrative, at: new Date(), cached: false });
  } catch (err) {
    if (err instanceof GroqRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? `Could not write that up: ${err.message}` : "Could not write that up." },
      { status: 502 },
    );
  }
}
