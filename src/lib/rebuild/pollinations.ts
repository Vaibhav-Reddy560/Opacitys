import "server-only";

/**
 * Pollinations.ai — Rebuild's image-EDITING provider. Chosen over Gemini's
 * own image model for one reason: it genuinely never asks for a card.
 * Gemini's `gemini-*-image` models return a hard 0-quota 429 on the free
 * tier until a Google Cloud project has billing linked (confirmed live,
 * 2026-08-07) — usage would still cost $0 under quota, but a card has to be
 * on file, which this app's constraint rules out entirely.
 *
 * The real endpoint is `gen.pollinations.ai` (a Cloudflare Worker) — NOT
 * the documented `image.pollinations.ai`, which is legacy anonymous-only
 * infrastructure that rejects the `kontext` (edit) model outright with a
 * misleading "only available on enter.pollinations.ai" message. Confirmed
 * live by testing both.
 *
 * `kontext` costs real Pollen credits, earned for free (never bought) by
 * completing "Quests" at enter.pollinations.ai — star the repo, use the
 * API, etc. A freshly registered account starts at a 0.0000 balance, so
 * editImage() genuinely may not work until the user does that. This is
 * surfaced as a real, honest error (PollinationsBalanceError), never
 * silently retried or faked.
 */

const BASE = "https://gen.pollinations.ai";

export function hasPollinationsKey(): boolean {
  return !!process.env.POLLINATIONS_API_KEY;
}

export class PollinationsError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PollinationsError";
    this.status = status;
  }
}

/** A real, distinct case — not "broken", just "no Pollen yet" — so the caller can say something actionable rather than a generic failure. */
export class PollinationsBalanceError extends PollinationsError {
  constructor(message: string) {
    super(message, 402);
    this.name = "PollinationsBalanceError";
  }
}

function requireKey(): string {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) throw new Error("POLLINATIONS_API_KEY is not set.");
  return key;
}

/**
 * Applies a natural-language instruction to an image, via the source
 * image's own PUBLIC URL (Pollinations fetches it server-side — no bytes
 * are uploaded from here). Returns the edited image's bytes.
 *
 * This is a REGENERATION, not a patch: the model redraws the frame with
 * the instruction applied. Regions the instruction doesn't mention come
 * back close to the original but are not guaranteed pixel-identical.
 */
export async function editImage(params: { imageUrl: string; instruction: string }): Promise<Buffer> {
  const { imageUrl, instruction } = params;
  const prompt = `${instruction}\n\nKeep everything else in the image exactly as it is — same layout, same colors, same typography, same style. Change only what was asked for.`;

  const url = new URL(`${BASE}/image/prompt/${encodeURIComponent(prompt)}`);
  url.searchParams.set("model", "kontext");
  url.searchParams.set("image", imageUrl);
  url.searchParams.set("nologo", "true");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${requireKey()}` } });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    let message = bodyText.slice(0, 300);
    try {
      const parsed = JSON.parse(bodyText);
      message = parsed?.error?.message ?? parsed?.message ?? message;
    } catch {
      // Non-JSON body — the raw text above is all there is.
    }

    if (res.status === 402 || /insufficient balance/i.test(message)) {
      throw new PollinationsBalanceError(
        "Editing needs Pollen credits, which are earned for free (never bought) by completing Quests at enter.pollinations.ai. Your account doesn't have any yet.",
      );
    }
    throw new PollinationsError(`Pollinations edit failed (${res.status}): ${message}`, res.status);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await res.arrayBuffer());

  // A non-image response with a 200 status means the edit itself failed in
  // a way the API still called "success" — surface it as a real error
  // instead of trying to persist non-image bytes as a PNG.
  if (!contentType.startsWith("image/")) {
    let message = bytes.toString("utf8").slice(0, 300);
    try {
      const parsed = JSON.parse(bytes.toString("utf8"));
      message = parsed?.error?.message ?? parsed?.message ?? message;
    } catch {
      // Not JSON either — the raw text above is all there is.
    }
    if (/insufficient balance/i.test(message)) {
      throw new PollinationsBalanceError(
        "Editing needs Pollen credits, which are earned for free (never bought) by completing Quests at enter.pollinations.ai. Your account doesn't have any yet.",
      );
    }
    throw new PollinationsError(`Pollinations returned a non-image response: ${message}`, 502);
  }

  return bytes;
}
