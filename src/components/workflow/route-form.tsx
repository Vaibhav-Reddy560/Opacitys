"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { PrismPanel, OpacityMeter } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { VoiceMicButton } from "@/components/voice/voice-mic-button";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";
import { SKILL_LEVELS } from "@/lib/profile/stored-types";

const ACCENT = SPECTRUM.spacing.color;

const SKILL_LABEL: Record<(typeof SKILL_LEVELS)[number], string> = {
  learning: "Learning",
  working: "Working designer",
  senior: "Senior",
  lead: "Lead / director",
};

const field =
  "w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-[13px] text-foreground/90 placeholder:text-foreground/45 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15 disabled:opacity-60";

// Only one stage ("planning") — see src/lib/workflow/pipeline.ts's doc
// comment on why there's no research midpoint to show progress against.
type Status = "idle" | "starting" | "queued" | "planning";

const METER_START: Record<Exclude<Status, "idle">, number> = {
  starting: 20,
  queued: 35,
  planning: 55,
};

const METER_COPY: Record<Exclude<Status, "idle">, string> = {
  starting: "Starting…",
  queued: "Queued — waiting for a slot.",
  planning: "Reading the brief and sequencing a plan.",
};

/**
 * Tools + skill level prefill from the designer's stored profile
 * (Fingerprint's self-reported half) but stay editable per run — a plan is
 * a SNAPSHOT of what was true when it was asked for (see route_plans'
 * schema comment), not a live join, so this is the one moment those values
 * get copied in rather than read fresh forever.
 */
export function RouteForm({ initialTools, initialSkillLevel }: { initialTools: string[]; initialSkillLevel: string | null }) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [deadline, setDeadline] = useState("");
  const [tools, setTools] = useState<string[]>(initialTools);
  const [customTool, setCustomTool] = useState("");
  const [skillLevel, setSkillLevel] = useState<string | null>(initialSkillLevel);
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

  function removeTool(t: string) {
    setTools((prev) => prev.filter((x) => x !== t));
  }

  function addCustomTool() {
    const t = customTool.trim();
    if (!t || tools.includes(t)) return;
    setTools((prev) => [...prev, t]);
    setCustomTool("");
  }

  async function handleSubmit() {
    if (!brief.trim()) return;
    setError(null);
    teardown();

    try {
      setStatus("starting");
      setMeter(METER_START.starting);

      const { id } = await fetchJson<{ id: string }>(
        "/api/route",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief,
            deadline: deadline.trim() || undefined,
            tools,
            skillLevel: skillLevel ?? undefined,
          }),
        },
        "Could not start that plan",
      );

      setStatus("queued");
      setMeter(METER_START.queued);

      const source = new EventSource(`/api/route/${id}/stream`);
      sourceRef.current = source;

      source.addEventListener("progress", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.status === "queued") {
          setStatus("queued");
          setMeter(METER_START.queued);
          return;
        }
        if (data.status !== "running") return;
        if (creepRef.current) return;
        setStatus("planning");
        setMeter(METER_START.planning);
        creepRef.current = setInterval(() => {
          setMeter((v) => v + (88 - v) * 0.06);
        }, 1000);
      });

      source.addEventListener("complete", () => {
        teardown();
        setMeter(100);
        router.push(`/studio/workflow/${id}`);
      });

      source.addEventListener("failed", (e) => {
        let reason: string | null = null;
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (typeof data?.error === "string") reason = data.error;
        } catch {
          // no parseable reason — the generic message below still shows
        }
        fail(reason ?? "Something went wrong building that plan. Try again.");
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
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The brief</h2>
        <VoiceMicButton onFinalText={(t) => setBrief((prev) => (prev ? `${prev} ${t}` : t))} />
      </div>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={5}
        disabled={busy}
        placeholder="Paste the client's brief, or describe the job — what they're asking for, any constraints they've mentioned."
        className={`mt-3 resize-y leading-relaxed ${field}`}
      />

      <div className="mt-4">
        <label className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Deadline (optional)</label>
        <input
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          disabled={busy}
          placeholder="e.g. 3 weeks, by Friday"
          className={`mt-1.5 ${field}`}
        />
      </div>

      <div className="mt-4">
        <label className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Tools you actually have</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {tools.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.02] px-2.5 py-1 text-[12px] text-foreground/72"
            >
              {t}
              <button type="button" onClick={() => removeTool(t)} disabled={busy} className="text-foreground/40 hover:text-foreground/80 disabled:opacity-50">
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={customTool}
            onChange={(e) => setCustomTool(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTool();
              }
            }}
            disabled={busy}
            placeholder="Add a tool"
            className={`flex-1 ${field}`}
          />
          <button
            type="button"
            onClick={addCustomTool}
            disabled={busy || !customTool.trim()}
            className="inline-flex items-center justify-center rounded-xl border border-white/[0.09] px-3 text-foreground/72 transition-colors hover:border-white/20 hover:text-foreground/95 disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        {tools.length === 0 && (
          <p className="mt-1.5 text-[11.5px] text-foreground/45">
            Nothing listed yet — anything the plan needs that isn&apos;t here will be named as a gap instead of assumed.
          </p>
        )}
      </div>

      <div className="mt-4">
        <label className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Skill level</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {SKILL_LEVELS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSkillLevel(s)}
              disabled={busy}
              className="rounded-full border px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-50"
              style={
                skillLevel === s
                  ? {
                      color: ACCENT,
                      borderColor: `color-mix(in oklch, ${ACCENT} 45%, transparent)`,
                      background: `color-mix(in oklch, ${ACCENT} 14%, transparent)`,
                    }
                  : { color: "oklch(1 0 0 / 0.62)", borderColor: "oklch(1 0 0 / 0.09)" }
              }
            >
              {SKILL_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <ChromeButton onClick={handleSubmit} disabled={busy || !brief.trim()}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Building the plan…
            </>
          ) : (
            "Build the route"
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

      <p className="mt-5 text-[11.5px] leading-relaxed text-foreground/50">
        Answer follow-up questions on the result — asking for clarity gets an explanation; pointing out something
        genuinely wrong gets the plan corrected, with the earlier version kept.
      </p>
    </PrismPanel>
  );
}
