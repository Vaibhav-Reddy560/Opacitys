import "server-only";
import { z } from "zod";
import { generateGrounded, MODELS } from "@/lib/ai/gateway";

export const clientInterpretationSchema = z.object({
  readingOfIt: z.string(),
  actionable: z.array(
    z.object({
      note: z.string(),
      likelyMeans: z.string(),
      move: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
  costly: z.array(z.object({ note: z.string(), why: z.string() })),
  questionsToAsk: z.array(z.string()),
  replyDraft: z.string(),
});
export type ClientInterpretation = z.infer<typeof clientInterpretationSchema>;

const SYSTEM = `You help a graphic designer interpret client feedback.

Clients rarely know design vocabulary. When they say "make it pop" or "it feels
cheap", they are reporting a real perception with the wrong words. Your job is
to recover the perception and turn it into moves.

Rules:
- Be on the designer's side, but never disparage the client. They are describing
  a real reaction; they just lack the terminology. Assume good faith always.
- Separate notes that would genuinely improve the work from notes that would
  quietly hurt it (hurt readability, break hierarchy, dilute the concept). For
  the second group, explain the trade-off in plain, non-defensive language the
  designer could actually say out loud in a meeting.
- Mark confidence honestly. If a note is too vague to act on, put it in
  questionsToAsk instead of inventing an interpretation.
- replyDraft should be a short, warm, professional message the designer can send:
  it confirms what they understood, proposes the concrete changes, and where
  relevant explains one trade-off without being combative or condescending.

Return ONLY valid JSON:
{
  "readingOfIt": "2-3 sentences on what the client is probably reacting to overall",
  "actionable": [{ "note": "their words", "likelyMeans": "...", "move": "specific change to make", "confidence": "high|medium|low" }],
  "costly": [{ "note": "their words", "why": "what it would cost and how to raise it kindly" }],
  "questionsToAsk": ["specific question that would resolve a genuine ambiguity"],
  "replyDraft": "..."
}`;

/**
 * Shared by /api/client-messages/[id]/interpret (persisted, Correspondence)
 * — extracted so both call sites use one prompt and one parse path.
 */
export async function interpretClientMessage(params: {
  message: string;
  context?: string;
}): Promise<ClientInterpretation> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is not set — add it to .env.local to use Correspondence.");
  }

  const { text } = await generateGrounded({
    model: MODELS.fast,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          params.context ? `Project context: ${params.context}` : null,
          `Client message:\n${params.message}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return clientInterpretationSchema.parse(JSON.parse(raw.trim()));
}
