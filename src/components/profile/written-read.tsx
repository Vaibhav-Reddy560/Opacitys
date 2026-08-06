"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, PenLine } from "lucide-react";
import { PrismPanel } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";

const ACCENT = SPECTRUM.rhythm.color;

/**
 * The one model-backed piece of Fingerprint, and the only thing on the page
 * that costs tokens.
 *
 * It never fires on render — the user asks for it. Once written it's cached
 * against a hash of the numbers it described, so re-reading the page is
 * free, and the Refresh affordance only appears when the underlying
 * measurements have actually moved (`stale`).
 */
export function WrittenRead({
  initial,
  at,
  stale,
  canNarrate,
}: {
  initial: string | null;
  at: Date | null;
  stale: boolean;
  canNarrate: boolean;
}) {
  const router = useRouter();
  const [narrative, setNarrative] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justWrote, setJustWrote] = useState(false);

  async function run(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchJson<{ narrative: string }>(
        `/api/profile/narrate${force ? "?force=1" : ""}`,
        { method: "POST" },
        "Could not write that up.",
      );
      setNarrative(res.narrative);
      setJustWrote(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write that up.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The written read</h2>
        {at && !justWrote && (
          <span className="font-mono text-[10.5px] text-foreground/40">
            {new Date(at).toLocaleDateString()}
          </span>
        )}
      </div>

      {narrative ? (
        <>
          <div className="mt-4 space-y-3">
            {narrative.split("\n\n").map((para, i) => (
              <p key={i} className="text-pretty text-[13.5px] leading-relaxed text-foreground/85">
                {para}
              </p>
            ))}
          </div>

          {stale && !justWrote && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-4">
              <p className="text-[12.5px] text-foreground/55">
                Your work has changed since this was written.
              </p>
              <button
                type="button"
                onClick={() => run(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground/70 transition-colors hover:text-foreground disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="size-3.5" aria-hidden />
                )}
                Write it again
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/55">
            {canNarrate
              ? "Every number above is already yours to read. This turns them into a paragraph — one model call, kept until your work actually changes."
              : "Run a few Critiques or Identifies first — there isn't enough measured work yet to say anything honest about it."}
          </p>
          {canNarrate && (
            <div className="mt-5">
              <ChromeButton onClick={() => run(false)} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Writing…
                  </>
                ) : (
                  <>
                    <PenLine className="size-3.5" aria-hidden />
                    Write it up
                  </>
                )}
              </ChromeButton>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[13px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
          {error}
        </p>
      )}
    </PrismPanel>
  );
}
