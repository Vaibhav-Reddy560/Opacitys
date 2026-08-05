import "server-only";
import type { AnalyzerResponse, Dimension, TrackAFinding } from "@/lib/critique/types";
import { decodeForMeasurement } from "./image";
import { detectTextLines } from "./text-lines";
import { computeFacts, type MeasuredFacts } from "./facts";
import { analyzeColor } from "./analyzers/color";
import { analyzeTypography } from "./analyzers/typography";
import { analyzeContrast } from "./analyzers/contrast";
import { analyzeRhythm } from "./analyzers/rhythm";
import { analyzeLayout } from "./analyzers/layout";
import { analyzeSpacing } from "./analyzers/spacing";
import { analyzeHierarchy } from "./analyzers/hierarchy";
import { analyzeBalance } from "./analyzers/balance";
import { analyzeRestraint } from "./analyzers/restraint";
import type { AnalyzerResult } from "./analyzers/_result";

export type { MeasuredFacts } from "./facts";

const PIPELINE_VERSION = "v2-ts";

/**
 * Track A: deterministic measurement, entirely in-process. Replaces the
 * Python `services/analyzer` FastAPI service — same six analyzers, same
 * thresholds, same output shape (`AnalyzerResponse`), so nothing downstream
 * (grounding, persistence, `AnnotatedCanvas`) needs to change. Fetches the
 * image once, detects text-line boxes once, and runs every analyzer against
 * that shared state — mirroring `services/analyzer/pipeline.py`'s
 * `run_pipeline`.
 *
 * Also returns `facts`: raw descriptive measurements (palette, contrast,
 * alignment ratio, gap CV, saliency distribution, type-size count) reported
 * unconditionally rather than only when something falls outside an expected
 * range. Critique only needs "findings" — Identify and Originality need
 * "what's actually here" even on a design that trips no thresholds at all,
 * so they read `facts` instead.
 *
 * Each analyzer is individually try/caught: one failing (e.g. a saliency
 * edge case on a degenerate image) costs that dimension's findings, not the
 * whole measurement pass.
 */
export async function measureImageFull(
  imageBytes: Buffer | ArrayBuffer,
): Promise<{ response: AnalyzerResponse; facts: MeasuredFacts }> {
  const decoded = await decodeForMeasurement(imageBytes);
  const { width, height, rgb, gray, scale, sourceWidth, sourceHeight } = decoded;

  const textLines = safeRun("text-lines", () => detectTextLines(gray, width, height)) ?? [];

  const runs: [Dimension, () => AnalyzerResult][] = [
    ["color", () => analyzeColor(rgb, width, height, textLines)],
    ["typography", () => analyzeTypography(textLines)],
    ["contrast", () => analyzeContrast(textLines)],
    ["rhythm", () => analyzeRhythm(textLines)],
    ["layout", () => analyzeLayout(gray, width, height, textLines)],
    ["spacing", () => analyzeSpacing(gray, width, height, textLines)],
    ["hierarchy", () => analyzeHierarchy(gray, width, height)],
    ["balance", () => analyzeBalance(gray, width, height)],
    ["restraint", () => analyzeRestraint(rgb, gray, width, height)],
  ];

  const findings: TrackAFinding[] = [];
  const evaluated: Dimension[] = [];
  for (const [dim, run] of runs) {
    // A thrown analyzer counts as not-evaluated, same as a SKIPPED result —
    // a crash measured nothing, so it shouldn't score a free 100 either.
    const result = safeRun(dim, run);
    if (!result?.evaluated) continue;
    evaluated.push(dim);
    findings.push(...result.findings);
  }

  const facts = safeRun("facts", () => computeFacts(rgb, gray, width, height, textLines)) ?? {
    dominantColors: [],
    avgTextContrast: null,
    alignmentRatio: null,
    gapCoefficientOfVariation: null,
    topBandSaliencyShare: null,
    distinctTypeSizes: null,
    textLineCount: textLines.length,
  };

  // Project every bbox from working space back to the original upload's
  // pixel space — this is the space asset.width/height and AnnotatedCanvas
  // are in.
  const inv = scale > 0 ? 1 / scale : 1;
  const projected = findings.map((f) => ({
    ...f,
    bbox: f.bbox.map((v) => Math.round(v * inv)) as [number, number, number, number],
  }));

  return {
    response: {
      pipelineVersion: PIPELINE_VERSION,
      width: sourceWidth,
      height: sourceHeight,
      findings: projected,
      evaluated,
    },
    facts,
  };
}

/** Findings-only convenience wrapper for callers (Critique) that don't need
 * `facts`. */
export async function measureImage(imageBytes: Buffer | ArrayBuffer): Promise<AnalyzerResponse> {
  const { response } = await measureImageFull(imageBytes);
  return response;
}

function safeRun<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    console.error(`[measure] ${label} failed:`, err);
    return undefined;
  }
}
