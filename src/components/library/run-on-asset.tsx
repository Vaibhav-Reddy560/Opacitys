"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ChromeButton } from "@/components/ui/chrome-button";
import { fetchJson } from "@/lib/http";

/**
 * "Run Critique / Identify on this" — skips upload entirely, using an
 * assetId already in the library. Both routes already accept an existing
 * assetId (no backend change needed); this just calls the same endpoint the
 * feature's own form does and navigates the same way.
 */
export function RunOnAsset({ assetId, kind }: { assetId: string; kind: "critique" | "identify" | "rebuild" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (kind === "critique") {
        const { analysisId } = await fetchJson<{ analysisId: string }>(
          "/api/analyze",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) },
          "Could not start the read",
        );
        router.push(`/studio/critique/${analysisId}`);
      } else if (kind === "identify") {
        const { analysisId } = await fetchJson<{ analysisId: string }>(
          "/api/identify",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) },
          "Could not read that design",
        );
        router.push(`/studio/identify/${analysisId}`);
      } else {
        const { analysisId } = await fetchJson<{ analysisId: string }>(
          "/api/rebuild",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) },
          "Could not start taking this apart",
        );
        router.push(`/studio/rebuild/${analysisId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const label = kind === "critique" ? "Critique" : kind === "identify" ? "Identify" : "Rebuild";

  return (
    <div>
      <ChromeButton variant="ghost" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        Run {label} on this
      </ChromeButton>
      {error && (
        <p role="alert" className="mt-2 text-[12px]" style={{ color: "oklch(0.72 0.19 18)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
