"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aperture, Loader2 } from "lucide-react";
import { Dropzone } from "@/components/upload/dropzone";
import { PageHeader } from "@/components/studio/page-header";
import { PrismPanel } from "@/components/brand/prism";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { STYLE_TAXONOMY } from "@/lib/identify/taxonomy";
import { fetchJson } from "@/lib/http";

const MODULE = MODULES.find((m) => m.slug === "identify")!;
const ACCENT = SPECTRUM.hierarchy.color;

export default function IdentifyPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);

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

  async function handleFile(file: File) {
    setError(null);
    try {
      setStatus("uploading");
      const { width, height } = await readImageDimensions(file);
      const params = new URLSearchParams({ width: String(width), height: String(height) });
      const { assetId } = await fetchJson<{ assetId: string }>(
        `/api/upload?${params}`,
        { method: "POST", headers: { "Content-Type": file.type }, body: file },
        "Upload failed",
      );

      setStatus("reading");
      const { analysisId } = await fetchJson<{ analysisId: string }>(
        "/api/identify",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) },
        "Could not read that design",
      );

      router.push(`/studio/identify/${analysisId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  const busy = status !== "idle";

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<Aperture className="size-4" aria-hidden />} />

        <Dropzone onFileSelected={handleFile} disabled={busy} />

        {busy && (
          <p className="mt-4 flex items-center gap-2 text-[13px] text-foreground/58">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {status === "uploading" ? "Bringing your file in…" : "Reading it against the taxonomy…"}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 text-[13px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
            {error}
          </p>
        )}

        <div className="mt-8">
          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The vocabulary</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-foreground/58">
              The full taxonomy every read is scored against — {STYLE_TAXONOMY.length} styles, curated by hand
              rather than generated, so classification stays reproducible.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {STYLE_TAXONOMY.map((t) => (
                <li
                  key={t.slug}
                  title={t.tell}
                  className="rounded-full border border-white/[0.09] bg-white/[0.02] px-2.5 py-1 text-[11.5px] text-foreground/62"
                >
                  {t.name}
                </li>
              ))}
            </ul>
          </PrismPanel>
        </div>
      </div>
    </div>
  );
}
