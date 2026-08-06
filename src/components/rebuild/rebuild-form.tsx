"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/upload/dropzone";
import { OpacityMeter } from "@/components/brand/prism";
import { AssetPicker } from "@/components/library/asset-picker";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";
import type { AssetSummary } from "@/lib/library/queries";

const ACCENT = SPECTRUM.typography.color;

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
 * Same shape as CritiqueForm (src/components/critique/critique-form.tsx):
 * every stage of upload -> trace -> decompose -> naming is held on this
 * component, not a separate loading screen — it waits out the whole
 * pipeline and only navigates once real layers are ready to render.
 */
type Status = "idle" | "uploading" | "starting" | "queued" | "tracing" | "separating" | "naming";

const METER_START: Record<Exclude<Status, "idle">, number> = {
  uploading: 12,
  starting: 22,
  queued: 30,
  tracing: 42,
  separating: 62,
  naming: 84,
};

const METER_COPY: Record<Exclude<Status, "idle">, string> = {
  uploading: "Bringing your file in…",
  starting: "Starting the read…",
  queued: "Queued — waiting for a slot.",
  tracing: "Separating colors into layers.",
  separating: "Grouping layers into shapes, text and gradients.",
  naming: "Layers found. Naming each one.",
};

export function RebuildForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [meter, setMeter] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const teardown = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    if (creepRef.current) clearInterval(creepRef.current);
    creepRef.current = null;
  }, []);

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

  async function runRebuild(assetId: string) {
    try {
      setStatus("starting");
      setMeter(METER_START.starting);
      const { analysisId } = await fetchJson<{ analysisId: string }>(
        "/api/rebuild",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) },
        "Could not start the rebuild",
      );

      setStatus("queued");
      setMeter(METER_START.queued);

      const source = new EventSource(`/api/rebuild/${analysisId}/stream`);
      sourceRef.current = source;

      source.addEventListener("progress", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.status === "queued") {
          setStatus("queued");
          setMeter(METER_START.queued);
          return;
        }
        if (data.status !== "running") return;

        if (data.stage === "naming") {
          if (creepRef.current) return; // already naming — don't re-seed the meter
          setStatus("naming");
          setMeter(METER_START.naming);
          // One opaque Groq call with no further observable transition —
          // liveness indicator, not a time estimate. Only "complete" reaches 100.
          creepRef.current = setInterval(() => {
            setMeter((v) => v + (95 - v) * 0.06);
          }, 1000);
          return;
        }
        if (data.stage === "separating") {
          setStatus("separating");
          setMeter(METER_START.separating);
          return;
        }
        setStatus("tracing");
        setMeter(METER_START.tracing);
      });

      source.addEventListener("complete", () => {
        teardown();
        setMeter(100);
        router.push(`/studio/rebuild/${analysisId}`);
      });

      source.addEventListener("failed", (e) => {
        let reason: string | null = null;
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (typeof data?.error === "string") reason = data.error;
        } catch {
          // no parseable reason — the generic message below still shows
        }
        fail(reason ?? "Something went wrong taking this apart. Try uploading it again.");
      });

      source.addEventListener("timeout", () => {
        fail("This is taking longer than expected. Try uploading it again in a moment.");
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleFile(file: File) {
    setError(null);
    teardown();
    try {
      setStatus("uploading");
      setMeter(METER_START.uploading);
      const { width, height } = await readImageDimensions(file);
      const params = new URLSearchParams({ width: String(width), height: String(height), filename: file.name });
      const { assetId } = await fetchJson<{ assetId: string }>(
        `/api/upload?${params}`,
        { method: "POST", headers: { "Content-Type": file.type }, body: file },
        "Upload failed",
      );
      await runRebuild(assetId);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function handlePick(asset: Pick<AssetSummary, "id" | "storageKey" | "originalName">) {
    setError(null);
    teardown();
    runRebuild(asset.id);
  }

  const busy = status !== "idle";

  return (
    <>
      <Dropzone onFileSelected={handleFile} disabled={busy} />
      <AssetPicker onSelect={handlePick} disabled={busy} />

      <p className="mt-6 text-[12.5px] leading-relaxed text-foreground/50">
        Works best on flat graphic design — posters, logos, type, UI screenshots. A photograph is kept as
        a single image layer rather than forced into shapes it was never made of.
      </p>

      {busy && (
        <div className="mt-8 max-w-xs">
          <OpacityMeter value={meter} accent={ACCENT} />
          <p className="mt-2 text-[13px] text-foreground/58">{METER_COPY[status]}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-8 text-[13px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
          {error}
        </p>
      )}
    </>
  );
}
