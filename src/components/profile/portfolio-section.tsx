"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Unlink } from "lucide-react";
import { PrismPanel } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { DribbbleConnection } from "@/lib/portfolio/dribbble";

const ACCENT = SPECTRUM.rhythm.color;

/**
 * The Dribbble half of Portfolio — a real OAuth connection with a live shot
 * list. No view/like counts even here, since v2 dropped them. Plain-URL
 * links (the honest ceiling for Behance, whose public API Adobe closed
 * entirely) are edited and shown in SelfReported just above this panel;
 * this component doesn't repeat them.
 */
export function PortfolioSection({
  dribbble,
  dribbbleAvailable,
  dribbbleUnavailableReason,
}: {
  dribbble: DribbbleConnection | null;
  dribbbleAvailable: boolean;
  dribbbleUnavailableReason: string | null;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/dribbble/sync", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not sync.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync.");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Dribbble? Your synced shots will be removed from this page.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      await fetch("/api/portfolio/dribbble/sync", { method: "DELETE" });
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
      <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Portfolio — Dribbble</h2>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] text-foreground/85">Dribbble</p>
            <p className="mt-0.5 text-[11.5px] text-foreground/45">
              No view or like counts — Dribbble&rsquo;s current API doesn&rsquo;t return them.
            </p>
          </div>

          {dribbble ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={sync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-foreground/62 transition-colors hover:text-foreground/90 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
                Sync
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-foreground/52 transition-colors hover:text-[oklch(0.72_0.19_18)] disabled:opacity-50"
              >
                <Unlink className="size-3.5" aria-hidden />
                Disconnect
              </button>
            </div>
          ) : dribbbleAvailable ? (
            <ChromeButton onClick={() => (window.location.href = "/api/portfolio/dribbble/start")}>
              Connect Dribbble
            </ChromeButton>
          ) : (
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10.5px] uppercase tracking-[0.06em] text-foreground/40">
              Not connected
            </span>
          )}
        </div>

        {!dribbble && !dribbbleAvailable && dribbbleUnavailableReason && (
          <p className="mt-2 text-[11.5px] text-foreground/40">{dribbbleUnavailableReason}</p>
        )}

        {dribbble && (
          <div className="mt-4">
            <p className="text-[11.5px] text-foreground/45">
              @{dribbble.externalHandle}
              {dribbble.lastSync && ` · synced ${new Date(dribbble.lastSync).toLocaleDateString()}`}
            </p>
            {dribbble.shots.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {dribbble.shots.slice(0, 8).map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group aspect-square overflow-hidden rounded-lg border border-white/[0.09] transition-colors hover:border-white/25"
                    title={s.title}
                  >
                    {s.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- external Dribbble CDN thumbnail, not an optimizable local asset
                      <img src={s.imageUrl} alt={s.title} className="size-full object-cover" />
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-foreground/45">No shots found on this account.</p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px]" style={{ color: "oklch(0.72 0.19 18)" }}>
          {error}
        </p>
      )}
    </PrismPanel>
  );
}
