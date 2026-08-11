"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/upload/dropzone";
import { OpacityMeter } from "@/components/brand/prism";
import { AssetPicker } from "@/components/library/asset-picker";
import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";
import { appendFix, type Fix } from "@/lib/geo/capture";
import type { AssetSummary } from "@/lib/library/queries";

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
}

/**
 * Every stage of upload -> measure -> interpret is held on THIS component
 * rather than navigating to a separate loading screen. `AnalysisResult`'s
 * `MeasuringState` still exists for the case of visiting an in-flight
 * analysis's URL directly (a bookmark, a second tab) — but a fresh upload
 * from here never sees it: this waits out the whole pipeline itself and
 * only navigates once the real result is ready to render.
 */
type Status = "idle" | "uploading" | "starting" | "queued" | "measuring" | "interpreting";

const METER_START: Record<Exclude<Status, "idle">, number> = {
  uploading: 15,
  starting: 30,
  queued: 42,
  measuring: 58,
  interpreting: 72,
};

const METER_COPY: Record<Exclude<Status, "idle">, string> = {
  uploading: "Bringing your file in…",
  starting: "Starting the read…",
  queued: "Queued — waiting for a slot.",
  measuring: "Measuring — contrast, type, alignment, spacing.",
  interpreting: "Measurements in. Writing up what they mean.",
};

export function CritiqueForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [meter, setMeter] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const teardown = useCallback(() => {
    sourceRef.current?.close(); // idempotent — close() on an already-closed source is a no-op
    sourceRef.current = null;
    if (creepRef.current) clearInterval(creepRef.current);
    creepRef.current = null;
  }, []);

  // Unmount / navigate away mid-run.
  useEffect(() => teardown, [teardown]);

  const fail = useCallback(
    (message: string) => {
      teardown();
      setError(message);
      setStatus("idle");
      setMeter(0);
    },
    [teardown],
  );

  // Shared by a fresh upload and picking an existing asset from the
  // library — the pipeline only ever needs an assetId, never the file
  // itself, so a re-selected asset skips straight here.
  async function runAnalysis(assetId: string) {
    try {
      setStatus("starting");
      setMeter(METER_START.starting);
      const { analysisId } = await fetchJson<{ analysisId: string }>(
        "/api/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId }),
        },
        "Could not start the read",
      );

      setStatus("queued");
      setMeter(METER_START.queued);

      const source = new EventSource(`/api/analyze/${analysisId}/stream`);
      sourceRef.current = source;

      source.addEventListener("progress", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.status !== "running") return;
        if (data.measured) {
          if (creepRef.current) return; // already interpreting — don't re-seed the meter
          setStatus("interpreting");
          setMeter(METER_START.interpreting);
          // The Groq call is one opaque 30-120s block with no further
          // observable transitions — a bar frozen at 72 for that long reads
          // as hung. This is a liveness indicator, not a time estimate: it
          // eases toward 92 and never reaches 100 on its own — only a real
          // "complete" event does that, below.
          creepRef.current = setInterval(() => {
            setMeter((v) => v + (92 - v) * 0.06);
          }, 1000);
        } else {
          setStatus("measuring");
          setMeter(METER_START.measuring);
        }
      });

      source.addEventListener("complete", () => {
        teardown();
        setMeter(100);
        router.push(`/studio/critique/${analysisId}`);
      });

      source.addEventListener("failed", (e) => {
        let reason: string | null = null;
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (typeof data?.error === "string") reason = data.error;
        } catch {
          // no parseable reason — the generic message below still shows
        }
        fail(reason ?? "Something went wrong measuring this design. Try uploading it again.");
      });

      source.addEventListener("timeout", () => {
        fail("This is taking longer than expected. Try uploading it again in a moment.");
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleFile(file: File, fix: Fix | null) {
    setError(null);
    teardown(); // guards a double-submit and React StrictMode's double-invoke

    try {
      setStatus("uploading");
      setMeter(METER_START.uploading);
      const { width, height } = await readImageDimensions(file);
      const params = new URLSearchParams({ width: String(width), height: String(height), filename: file.name });
      appendFix(params, fix);
      const { assetId } = await fetchJson<{ assetId: string }>(
        `/api/upload?${params}`,
        { method: "POST", headers: { "Content-Type": file.type }, body: file },
        "Upload failed",
      );
      await runAnalysis(assetId);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function handlePick(asset: Pick<AssetSummary, "id" | "storageKey" | "originalName">) {
    setError(null);
    teardown();
    runAnalysis(asset.id);
  }

  const busy = status !== "idle";

  return (
    <>
      <Dropzone onFileSelected={handleFile} disabled={busy} />
      <AssetPicker onSelect={handlePick} disabled={busy} />

      <div className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {DIMENSION_ORDER.map((dim) => (
          <div key={dim} className="flex items-baseline gap-3">
            <span
              className="mt-1.5 size-1.5 shrink-0 rounded-full"
              style={{ background: SPECTRUM[dim].color }}
            />
            <span className="w-[84px] shrink-0 text-[12px] text-foreground/62">
              {SPECTRUM[dim].label}
            </span>
            <span className="text-[11.5px] leading-relaxed text-foreground/50">
              {SPECTRUM[dim].blurb}
            </span>
          </div>
        ))}
      </div>

      {busy && (
        <div className="mt-8 max-w-xs">
          <OpacityMeter value={meter} accent={SPECTRUM.color.color} />
          <p className="mt-2 text-[13px] text-foreground/58">{METER_COPY[status]}</p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-8 text-[13px] leading-relaxed"
          style={{ color: "oklch(0.72 0.19 18)" }}
        >
          {error}
        </p>
      )}
    </>
  );
}
