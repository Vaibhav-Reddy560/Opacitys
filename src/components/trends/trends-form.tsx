"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PrismPanel, OpacityMeter } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { VoiceMicButton } from "@/components/voice/voice-mic-button";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";
import type { TrendKind } from "@/lib/trends/read";

const ACCENT = SPECTRUM.layout.color;

const BASIS_NOTE =
  "Reads publicly published writing from the window you pick, via live web search — not a continuously running index of every platform. Every current here links back to the page it came from.";

/**
 * Every stage of search -> structure is held on THIS component (the same
 * pattern as Critique's form): no separate loading screen, a real
 * SSE-driven progress meter, and a navigation only once the result is
 * actually ready.
 */
type Status = "idle" | "starting" | "queued" | "searching" | "writing";

const METER_START: Record<Exclude<Status, "idle">, number> = {
  starting: 20,
  queued: 32,
  searching: 48,
  writing: 84,
};

const METER_COPY: Record<Exclude<Status, "idle">, string> = {
  starting: "Starting the read…",
  queued: "Queued — waiting for a slot.",
  searching: "Searching and reading current sources.",
  writing: "Sources in. Writing up what's moving.",
};

const KIND_OPTIONS: { value: TrendKind | null; label: string }[] = [
  { value: null, label: "Auto" },
  { value: "category", label: "Category" },
  { value: "platform", label: "Platform" },
  { value: "brand", label: "Brand" },
];

const WINDOW_OPTIONS: { value: 3 | 6 | 12; label: string }[] = [
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
];

function Pill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border px-3 py-1.5 text-[12px] transition-colors disabled:pointer-events-none disabled:opacity-50"
      style={
        active
          ? {
              color: ACCENT,
              borderColor: `color-mix(in oklch, ${ACCENT} 45%, transparent)`,
              background: `color-mix(in oklch, ${ACCENT} 14%, transparent)`,
            }
          : {
              color: "oklch(1 0 0 / 0.62)",
              borderColor: "oklch(1 0 0 / 0.09)",
            }
      }
    >
      {children}
    </button>
  );
}

export function TrendsForm() {
  const router = useRouter();
  const [scope, setScope] = useState("");
  const [kind, setKind] = useState<TrendKind | null>(null);
  const [windowMonths, setWindowMonths] = useState<3 | 6 | 12>(6);
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

  async function handleSubmit() {
    if (!scope.trim()) return;
    setError(null);
    teardown(); // guards a double-submit and React StrictMode's double-invoke

    try {
      setStatus("starting");
      setMeter(METER_START.starting);

      const { id, cached } = await fetchJson<{ id: string; cached: boolean }>(
        "/api/trends",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, kind, windowMonths }),
        },
        "Could not start the read",
      );

      if (cached) {
        setMeter(100);
        router.push(`/studio/trends/${id}`);
        return;
      }

      setStatus("queued");
      setMeter(METER_START.queued);

      const source = new EventSource(`/api/trends/${id}/stream`);
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

        // stage === "searching" — the research pass is one opaque block
        // (measured 30-70s+) with no further observable transitions, so a
        // bar frozen at 48 for that long reads as hung. This is a liveness
        // indicator, not a time estimate: it eases toward 78 and never
        // reaches "writing"'s 84 on its own.
        if (creepRef.current) return; // already searching — don't re-seed
        setStatus("searching");
        setMeter(METER_START.searching);
        creepRef.current = setInterval(() => {
          setMeter((v) => v + (78 - v) * 0.06);
        }, 1000);
      });

      source.addEventListener("complete", () => {
        teardown();
        setMeter(100);
        router.push(`/studio/trends/${id}`);
      });

      source.addEventListener("failed", (e) => {
        let reason: string | null = null;
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (typeof data?.error === "string") reason = data.error;
        } catch {
          // no parseable reason — the generic message below still shows
        }
        fail(reason ?? "Something went wrong reading this. Try again.");
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
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
          What do you want a read on?
        </h2>
        <VoiceMicButton onFinalText={(t) => setScope((prev) => (prev ? `${prev} ${t}` : t))} />
      </div>
      <input
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        disabled={busy}
        placeholder="e.g. editorial poster design, skincare packaging, Nike"
        className="mt-3 w-full rounded-xl border border-white/[0.09] bg-black/25 p-3.5 text-[13.5px] text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15 disabled:opacity-60"
      />

      <div className="mt-5 border-t border-white/[0.07] pt-5">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Kind</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {KIND_OPTIONS.map((opt) => (
            <Pill
              key={opt.label}
              active={kind === opt.value}
              disabled={busy}
              onClick={() => setKind(opt.value)}
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t border-white/[0.07] pt-5">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Timeframe</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {WINDOW_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              active={windowMonths === opt.value}
              disabled={busy}
              onClick={() => setWindowMonths(opt.value)}
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <ChromeButton onClick={handleSubmit} disabled={busy || !scope.trim()}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Reading the room…
            </>
          ) : (
            "Read the room"
          )}
        </ChromeButton>
      </div>

      {busy && (
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
