"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ImageOff, Camera } from "lucide-react";
import { Dropzone } from "@/components/upload/dropzone";
import { PrismPanel, OpacityMeter } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { VoiceMicButton } from "@/components/voice/voice-mic-button";
import { AssetPicker } from "@/components/library/asset-picker";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";
import { appendFix, type Fix } from "@/lib/geo/capture";
import type { AssetSummary } from "@/lib/library/queries";

const ACCENT = SPECTRUM.balance.color;

const BASIS_NOTE =
  "A screenshot is read directly, grounded in what's actually on your screen — no search involved. Without one, this searches current docs and changelogs, capped tight to stay within a free-tier daily budget, and caches repeat questions for a week.";

/**
 * Two real paths behind one form, mirroring the split in
 * src/lib/tools/answer.ts:
 *   - a screenshot attached -> one synchronous vision call (~15s), no meter
 *     needed beyond a brief spinner
 *   - no screenshot -> the same queued + SSE + progress-meter pattern as
 *     Currents (src/components/trends/trends-form.tsx), since research can
 *     take 30-70s+
 */
type Status = "idle" | "starting" | "queued" | "searching" | "writing";

const METER_START: Record<Exclude<Status, "idle">, number> = {
  starting: 20,
  queued: 32,
  searching: 48,
  writing: 84,
};

const METER_COPY: Record<Exclude<Status, "idle">, string> = {
  starting: "Starting…",
  queued: "Queued — waiting for a slot.",
  searching: "Searching current docs and changelogs.",
  writing: "Sources in. Writing up the answer.",
};

export function ToolsForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [tool, setTool] = useState("");
  const [version, setVersion] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
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

  async function handleFile(file: File, fix: Fix | null) {
    setError(null);
    setAttaching(true);
    try {
      const params = new URLSearchParams({ filename: file.name });
      appendFix(params, fix);
      const { assetId: id } = await fetchJson<{ assetId: string }>(
        `/api/upload?${params}`,
        { method: "POST", headers: { "Content-Type": file.type }, body: file },
        "Upload failed",
      );
      setAssetId(id);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach that screenshot");
    } finally {
      setAttaching(false);
    }
  }

  function handlePick(asset: Pick<AssetSummary, "id" | "storageKey" | "originalName">) {
    setError(null);
    setAssetId(asset.id);
    setImagePreview(asset.storageKey);
  }

  function clearImage() {
    setAssetId(null);
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  }

  async function handleSubmit() {
    if (!question.trim()) return;
    setError(null);
    teardown();

    try {
      setStatus("starting");
      setMeter(METER_START.starting);

      const { id, mode } = await fetchJson<{ id: string; mode: "sync" | "cached" | "queued" }>(
        "/api/tools",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            tool: tool.trim() || undefined,
            version: version.trim() || undefined,
            assetId: assetId ?? undefined,
          }),
        },
        "Could not start the read",
      );

      if (mode === "sync" || mode === "cached") {
        setMeter(100);
        router.push(`/studio/tools/${id}`);
        return;
      }

      setStatus("queued");
      setMeter(METER_START.queued);

      const source = new EventSource(`/api/tools/${id}/stream`);
      sourceRef.current = source;

      source.addEventListener("progress", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.status === "queued") {
          setStatus("queued");
          setMeter(METER_START.queued);
          return;
        }
        if (data.status !== "running") return;

        if (data.stage === "writing") {
          if (creepRef.current) {
            clearInterval(creepRef.current);
            creepRef.current = null;
          }
          setStatus("writing");
          setMeter(METER_START.writing);
          return;
        }

        if (creepRef.current) return;
        setStatus("searching");
        setMeter(METER_START.searching);
        creepRef.current = setInterval(() => {
          setMeter((v) => v + (78 - v) * 0.06);
        }, 1000);
      });

      source.addEventListener("complete", () => {
        teardown();
        setMeter(100);
        router.push(`/studio/tools/${id}`);
      });

      source.addEventListener("failed", (e) => {
        let reason: string | null = null;
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (typeof data?.error === "string") reason = data.error;
        } catch {
          // no parseable reason — the generic message below still shows
        }
        fail(reason ?? "Something went wrong answering that. Try again.");
      });

      source.addEventListener("timeout", () => {
        fail("This is taking longer than expected. Try again in a moment.");
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const busy = status !== "idle";

  return (
    <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Ask about a tool</h2>
        <VoiceMicButton onFinalText={(t) => setQuestion((prev) => (prev ? `${prev} ${t}` : t))} />
      </div>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        disabled={busy}
        placeholder="e.g. Where did Figma move variable scoping? or What is Kittl good for, compared to Canva?"
        className="mt-3 w-full resize-y rounded-xl border border-white/[0.09] bg-black/25 p-3.5 text-[13.5px] leading-relaxed text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15 disabled:opacity-60"
      />

      <div className="mt-3 flex flex-wrap gap-3">
        <input
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          disabled={busy}
          placeholder="Tool (optional)"
          className="flex-1 rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-[12.5px] text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15 disabled:opacity-60"
        />
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          disabled={busy}
          placeholder="Version (optional)"
          className="flex-1 rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-[12.5px] text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15 disabled:opacity-60"
        />
      </div>

      <div className="mt-5 border-t border-white/[0.07] pt-5">
        <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-foreground/52">
          <Camera className="size-3.5" aria-hidden />
          Optional — attach a screenshot to point at the real control
        </h3>
        {imagePreview ? (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL or external Blob URL preview, not an optimizable local asset */}
            <img src={imagePreview} alt="Attached screenshot" className="size-16 rounded-lg border border-white/10 object-cover" />
            <button
              type="button"
              onClick={clearImage}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground/58 hover:text-foreground/85 disabled:opacity-50"
            >
              <ImageOff className="size-3.5" aria-hidden />
              Remove
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <Dropzone onFileSelected={handleFile} disabled={attaching || busy} />
            <AssetPicker onSelect={handlePick} disabled={attaching || busy} />
            {attaching && (
              <p className="mt-2 flex items-center gap-2 text-[12.5px] text-foreground/58">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Attaching…
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        <ChromeButton onClick={handleSubmit} disabled={busy || attaching || !question.trim()}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {imagePreview ? "Reading your screenshot…" : "Looking that up…"}
            </>
          ) : (
            "Ask"
          )}
        </ChromeButton>
      </div>

      {busy && !imagePreview && (
        <div className="mt-6 max-w-xs">
          <OpacityMeter value={meter} accent={ACCENT} />
          <p className="mt-2 text-[13px] text-foreground/58">{METER_COPY[status]}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[13px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
          {error}
        </p>
      )}

      <p className="mt-5 text-[11.5px] leading-relaxed text-foreground/50">{BASIS_NOTE}</p>
    </PrismPanel>
  );
}
