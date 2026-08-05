"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { SpectralScore } from "./spectral-score";
import { FindingCard } from "./finding-card";
import { AnnotatedCanvas } from "./annotated-canvas";
import { dimensionSchema, severitySchema } from "@/lib/critique/types";
import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";

const streamFindingSchema = z.object({
  id: z.string(),
  dimension: dimensionSchema,
  severity: severitySchema,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  measured: z.object({
    value: z.number(),
    expected: z.tuple([z.number(), z.number()]),
    unit: z.string(),
  }),
  message: z.string(),
  fix: z.string(),
  confidence: z.number(),
});

const streamCompleteSchema = z.object({
  critique: z.object({
    id: z.string(),
    overallScore: z.number(),
    dimensionScores: z.record(dimensionSchema, z.number()),
    summary: z.string(),
  }),
  findings: z.array(streamFindingSchema),
});

type StreamComplete = z.infer<typeof streamCompleteSchema>;
type Stage = "queued" | "running" | "complete" | "failed";

export function AnalysisResult({
  analysisId,
  initialStatus,
  imageUrl,
  imageWidth,
}: {
  analysisId: string;
  initialStatus: string;
  imageUrl: string;
  imageWidth: number;
}) {
  const reduce = useReducedMotion();
  // Only short-circuit for "failed" — that needs no further data. Starting
  // straight at "complete" looked like the same optimization, but the
  // stream effect below skips connecting once stage is already terminal,
  // so `result` was left null forever and the page never left the loading
  // state. Starting at "queued" lets the effect run, which — for an
  // already-complete analysis — resolves to "complete" with real data on
  // its very first tick anyway (the stream route checks the DB status
  // immediately), so this costs at most one fast round trip.
  const [stage, setStage] = useState<Stage>(initialStatus === "failed" ? "failed" : "queued");
  const [result, setResult] = useState<StreamComplete | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  useEffect(() => {
    if (stage === "complete" || stage === "failed") return;

    const source = new EventSource(`/api/analyze/${analysisId}/stream`);

    source.addEventListener("progress", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (data.status === "running") setStage("running");
    });
    source.addEventListener("complete", (e) => {
      const parsed = streamCompleteSchema.safeParse(JSON.parse((e as MessageEvent).data));
      if (parsed.success) {
        setResult(parsed.data);
        setStage("complete");
      } else {
        setStage("failed");
      }
      source.close();
    });
    source.addEventListener("failed", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (typeof data?.error === "string") setFailureReason(data.error);
      } catch {
        // no parseable reason — the generic message below still shows
      }
      setStage("failed");
      source.close();
    });
    source.addEventListener("timeout", () => {
      setStage("failed");
      source.close();
    });

    return () => source.close();
  }, [analysisId, stage]);

  const canvasFindings = useMemo(
    () =>
      (result?.findings ?? []).map((f, i) => ({
        id: f.id,
        dimension: f.dimension,
        severity: f.severity,
        bbox: f.bbox,
        number: i + 1,
      })),
    [result],
  );

  if (stage === "failed") {
    return (
      <Shell>
        <div className="grid min-h-[60svh] place-content-center text-center">
          <AlertTriangle
            className="mx-auto size-7"
            style={{ color: "oklch(0.72 0.19 18)" }}
            aria-hidden
          />
          <p
            className="mt-4 text-lg tracking-tight"
            style={{ fontVariationSettings: '"wght" 500' }}
          >
            Analysis failed
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-foreground/55">
            {failureReason ?? "Something went wrong measuring this design. Try uploading it again."}
          </p>
        </div>
      </Shell>
    );
  }

  if (stage !== "complete" || !result) {
    return (
      <Shell>
        <MeasuringState stage={stage} />
      </Shell>
    );
  }

  return (
    <Shell>
      {/* items-start: without it, this grid row stretches to match the
          taller sidebar and the canvas — sized to the image, not the row —
          just sits in a tall box with dead space below it. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <AnnotatedCanvas
            imageUrl={imageUrl}
            imageWidth={imageWidth}
            findings={canvasFindings}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center rounded-2xl border border-white/[0.07] bg-white/[0.015] p-6"
        >
          <SpectralScore
            overall={result.critique.overallScore}
            dimensionScores={result.critique.dimensionScores}
            size={220}
          />
          <p className="text-pretty mt-5 text-center text-[13.5px] leading-relaxed text-foreground/58">
            {result.critique.summary}
          </p>

          <div className="mt-6 w-full space-y-2 border-t border-white/[0.07] pt-5">
            {DIMENSION_ORDER.map((dim) => {
              const score = result.critique.dimensionScores[dim];
              if (typeof score !== "number") return null;
              return (
                <div key={dim} className="flex items-center gap-2.5">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: SPECTRUM[dim].color }}
                  />
                  <span className="text-[11.5px] text-foreground/52">{SPECTRUM[dim].label}</span>
                  <span className="ml-auto font-mono text-[11.5px] tabular-nums text-foreground/72">
                    {Math.round(score)}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Full page width, not squeezed into the sidebar column — a narrow
          380px list left most of the page unused once there were more than
          a couple of findings. */}
      <div className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Findings</h2>
          <span className="font-mono text-[11px] text-foreground/50">{result.findings.length}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {result.findings.map((f, i) => (
              <FindingCard
                key={f.id}
                finding={f}
                index={i}
                active={activeId === f.id}
                onHover={setActiveId}
              />
            ))}
          </AnimatePresence>

          {result.findings.length === 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-6 text-center sm:col-span-2 xl:col-span-3">
              <p className="text-[13.5px] text-foreground/55">
                No measurable issues found on this pass.
              </p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

// Lives inside the studio layout now, so the wordmark and nav come from the
// sidebar — this only needs the back link.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <Link
          href="/studio/critique"
          className="inline-flex items-center gap-2 text-[13px] text-foreground/55 transition-colors hover:text-foreground/90"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Read another design
        </Link>
      </header>
      {children}
    </div>
  );
}

/**
 * Loading state that names the dimension currently being measured. A generic
 * spinner would waste the one moment the user is definitely paying attention
 * — this uses it to teach what the product actually does.
 */
function MeasuringState({ stage }: { stage: Stage }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setStep((s) => (s + 1) % DIMENSION_ORDER.length), 900);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <div className="grid min-h-[60svh] place-content-center">
      <div className="flex flex-col items-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-foreground/50">
          {stage === "queued" ? "Queued" : "Measuring"}
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={step}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="mt-2.5 text-lg tracking-tight"
            style={{
              color: SPECTRUM[DIMENSION_ORDER[step]].color,
              fontVariationSettings: '"wght" 500',
            }}
          >
            {SPECTRUM[DIMENSION_ORDER[step]].label}
          </motion.p>
        </AnimatePresence>
        <p className="mt-1.5 max-w-xs text-center text-[12.5px] text-foreground/52">
          {SPECTRUM[DIMENSION_ORDER[step]].blurb}
        </p>
      </div>
    </div>
  );
}
