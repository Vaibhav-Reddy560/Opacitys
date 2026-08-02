"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanEye } from "lucide-react";
import { Dropzone } from "@/components/upload/dropzone";
import { PageHeader } from "@/components/studio/page-header";
import { OpacityMeter } from "@/components/brand/prism";
import { MODULES } from "@/lib/copy";
import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";

const MODULE = MODULES.find((m) => m.slug === "critique")!;

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

export default function CritiquePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "starting">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/demo-user")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setUserId(d.userId))
      .catch(() =>
        setError(
          "Could not start a session. This needs DATABASE_URL set and the database reachable.",
        ),
      );
  }, []);

  async function handleFile(file: File) {
    if (!userId) return;
    setError(null);
    try {
      setStatus("uploading");
      const { width, height } = await readImageDimensions(file);
      const params = new URLSearchParams({
        userId,
        width: String(width),
        height: String(height),
      });
      const uploadRes = await fetch(`/api/upload?${params}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error((await uploadRes.json()).error ?? "Upload failed");
      const { assetId } = await uploadRes.json();

      setStatus("starting");
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      if (!analyzeRes.ok)
        throw new Error((await analyzeRes.json()).error ?? "Could not start the read");
      const { analysisId } = await analyzeRes.json();

      router.push(`/studio/critique/${analysisId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  const busy = status !== "idle";

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<ScanEye className="size-4" aria-hidden />} />

        <Dropzone onFileSelected={handleFile} disabled={busy || !userId} />

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
            <OpacityMeter
              value={status === "uploading" ? 35 : 70}
              accent={SPECTRUM.color.color}
            />
            <p className="mt-2 text-[13px] text-foreground/58">
              {status === "uploading" ? "Bringing your file in…" : "Starting the read…"}
            </p>
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
      </div>
    </div>
  );
}
