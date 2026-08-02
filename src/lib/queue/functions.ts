import "server-only";
import { inngest, analysisRequestedSchema } from "./client";
import { runCritiquePipeline } from "@/lib/critique/pipeline";

export const runAnalysis = inngest.createFunction(
  { id: "run-analysis", retries: 2, triggers: [{ event: "analysis/requested" }] },
  async ({ event, step }) => {
    const { analysisId, imageUrl } = analysisRequestedSchema.parse(event.data);

    await step.sendEvent("progress-started", {
      name: "analysis/progress",
      data: { analysisId, stage: "measuring", pct: 10 },
    });

    try {
      const { critiqueId } = await step.run("run-critique-pipeline", () =>
        runCritiquePipeline({ analysisId, imageUrl }),
      );

      await step.sendEvent("progress-done", {
        name: "analysis/completed",
        data: { analysisId, critiqueId },
      });

      return { critiqueId };
    } catch (err) {
      await step.sendEvent("progress-failed", {
        name: "analysis/failed",
        data: { analysisId, error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  },
);

export const functions = [runAnalysis];
