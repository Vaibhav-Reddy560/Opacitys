"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Loader2, ImageOff } from "lucide-react";
import { Dropzone } from "@/components/upload/dropzone";
import { PageHeader } from "@/components/studio/page-header";
import { PrismPanel } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { VoiceMicButton } from "@/components/voice/voice-mic-button";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";

const MODULE = MODULES.find((m) => m.slug === "originality")!;
const ACCENT = SPECTRUM.originality.color;

const BASIS_NOTE =
  "Read against widely-documented movements, studios and campaigns the model knows — not a live index of everything that exists. Treat it as a starting orientation, not a verdict.";

export default function OriginalityPage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setAttaching(true);
    try {
      const { assetId: id } = await fetchJson<{ assetId: string }>(
        "/api/upload",
        { method: "POST", headers: { "Content-Type": file.type }, body: file },
        "Upload failed",
      );
      setAssetId(id);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach that image");
    } finally {
      setAttaching(false);
    }
  }

  function clearImage() {
    setAssetId(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  }

  async function run() {
    if (!description.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const json = await fetchJson<{ id: string }>(
        "/api/originality",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, assetId: assetId ?? undefined }),
        },
        "Could not read that direction.",
      );
      router.push(`/studio/originality/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<Compass className="size-4" aria-hidden />} />

        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
              Describe the direction
            </h2>
            <VoiceMicButton onFinalText={(t) => setDescription((prev) => (prev ? `${prev} ${t}` : t))} />
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="e.g. A poster series using hyper-reflective chrome type over soft gradient-mesh backgrounds, with a single oversized display serif headline."
            className="mt-3 w-full resize-y rounded-xl border border-white/[0.09] bg-black/25 p-3.5 text-[13.5px] leading-relaxed text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
          />

          <div className="mt-5 border-t border-white/[0.07] pt-5">
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
              Optional — attach a sketch or moodboard
            </h3>
            {imagePreview ? (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an optimizable remote asset */}
                <img src={imagePreview} alt="Attached sketch" className="size-16 rounded-lg border border-white/10 object-cover" />
                <button
                  type="button"
                  onClick={clearImage}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground/58 hover:text-foreground/85"
                >
                  <ImageOff className="size-3.5" aria-hidden />
                  Remove
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <Dropzone onFileSelected={handleFile} disabled={attaching || busy} />
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
            <ChromeButton onClick={run} disabled={busy || attaching || !description.trim()}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Reading the direction…
                </>
              ) : (
                "Check it"
              )}
            </ChromeButton>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-[13px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
              {error}
            </p>
          )}

          <p className="mt-5 text-[11.5px] leading-relaxed text-foreground/50">{BASIS_NOTE}</p>
        </PrismPanel>
      </div>
    </div>
  );
}
