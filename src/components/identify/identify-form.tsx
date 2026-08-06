"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Dropzone } from "@/components/upload/dropzone";
import { AssetPicker } from "@/components/library/asset-picker";
import { fetchJson } from "@/lib/http";
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

export function IdentifyForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function runIdentify(assetId: string) {
    setStatus("reading");
    const { analysisId } = await fetchJson<{ analysisId: string }>(
      "/api/identify",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) },
      "Could not read that design",
    );
    router.push(`/studio/identify/${analysisId}`);
  }

  async function handleFile(file: File) {
    setError(null);
    try {
      setStatus("uploading");
      const { width, height } = await readImageDimensions(file);
      const params = new URLSearchParams({ width: String(width), height: String(height), filename: file.name });
      const { assetId } = await fetchJson<{ assetId: string }>(
        `/api/upload?${params}`,
        { method: "POST", headers: { "Content-Type": file.type }, body: file },
        "Upload failed",
      );
      await runIdentify(assetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  async function handlePick(asset: Pick<AssetSummary, "id" | "storageKey" | "originalName">) {
    setError(null);
    try {
      await runIdentify(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  const busy = status !== "idle";

  return (
    <>
      <Dropzone onFileSelected={handleFile} disabled={busy} />
      <AssetPicker onSelect={handlePick} disabled={busy} />

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
    </>
  );
}
