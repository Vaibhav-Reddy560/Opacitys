import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { MODELS } from "@/lib/ai/models";
import { researchToolAnswer, structureToolAnswer } from "./answer";

/**
 * Runs one research-path Instruments answer. Mirrors src/lib/trends/pipeline.ts
 * exactly — same status/stage transitions, same catch-persists-the-real-
 * reason-then-rethrows contract. Only ever called for the no-screenshot
 * path; a screenshot answer is synchronous (see /api/tools/route.ts) and
 * never touches this pipeline.
 */
export async function runToolAnswer(params: {
  answerId: string;
  question: string;
  tool: string | null;
  version: string | null;
}): Promise<{ answerId: string }> {
  const { answerId, question, tool, version } = params;

  await db
    .update(schema.toolAnswers)
    .set({ status: "running", stage: "searching" })
    .where(eq(schema.toolAnswers.id, answerId));

  try {
    const { digest, sources } = await researchToolAnswer({ question, tool, version });

    await db
      .update(schema.toolAnswers)
      .set({ digest, sources, stage: "writing" })
      .where(eq(schema.toolAnswers.id, answerId));

    const result = await structureToolAnswer({ digest, sources });

    await db
      .update(schema.toolAnswers)
      .set({
        result,
        model: `groq/${MODELS.reasoning}`,
        status: "complete",
        stage: null,
      })
      .where(eq(schema.toolAnswers.id, answerId));

    return { answerId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The read failed.";
    await db
      .update(schema.toolAnswers)
      .set({ status: "failed", error: message, stage: null })
      .where(eq(schema.toolAnswers.id, answerId));
    throw err;
  }
}
