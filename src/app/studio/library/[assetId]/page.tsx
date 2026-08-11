import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Compass, ScanEye, Aperture } from "lucide-react";
import { readSession } from "@/lib/auth/session";
import { getAsset } from "@/lib/library/queries";
import { PrismPanel } from "@/components/brand/prism";
import { DeleteButton } from "@/components/library/delete-button";
import { RunOnAsset } from "@/components/library/run-on-asset";
import { META_ACCENT } from "@/lib/critique/spectrum";

const ACCENT = META_ACCENT;

const GHOST_LINK =
  "inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-7 py-3 text-sm text-foreground/80 transition-colors hover:text-foreground";

export default async function AssetDetailPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const session = await readSession();
  if (!session) notFound();

  const asset = await getAsset(session.userId, assetId);
  if (!asset) notFound();

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/studio/library"
            className="inline-flex items-center gap-2 text-[13px] text-foreground/55 transition-colors hover:text-foreground/90"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to your work
          </Link>
          <DeleteButton
            url={`/api/library/assets/${asset.id}`}
            confirmMessage="Delete this image and every result run on it? This can't be undone."
            label="Delete image"
            className="text-[12.5px]"
          />
        </div>

        <div className="mt-8 space-y-6">
          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            {/* eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not an optimizable local asset */}
            <img
              src={asset.storageKey}
              alt={asset.originalName ?? "Uploaded design"}
              className="max-h-[420px] w-full rounded-xl border border-white/[0.08] object-contain"
            />
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-foreground/52">
              <span className="flex items-center gap-1.5">
                {asset.originalName ?? "Untitled upload"}
                {asset.placeLabel && (
                  <span className="text-foreground/40">· {asset.placeLabel}</span>
                )}
              </span>
              <span className="font-mono text-[10.5px] text-foreground/40">
                {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}
                {new Date(asset.createdAt).toLocaleDateString()}
              </span>
            </div>
          </PrismPanel>

          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Run a feature on this</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {asset.critiqueAnalysisId ? (
                <Link href={`/studio/critique/${asset.critiqueAnalysisId}`} className={GHOST_LINK}>
                  <ScanEye className="size-3.5" aria-hidden />
                  View Critique result
                </Link>
              ) : (
                <RunOnAsset assetId={asset.id} kind="critique" />
              )}

              {asset.identifyAnalysisId ? (
                <Link href={`/studio/identify/${asset.identifyAnalysisId}`} className={GHOST_LINK}>
                  <Aperture className="size-3.5" aria-hidden />
                  View Identify result
                </Link>
              ) : (
                <RunOnAsset assetId={asset.id} kind="identify" />
              )}

              <Link href={`/studio/originality?assetId=${asset.id}`} className={GHOST_LINK}>
                <Compass className="size-3.5" aria-hidden />
                Check originality
              </Link>
            </div>

            {asset.originalityCheckIds.length > 0 && (
              <div className="mt-5 border-t border-white/[0.07] pt-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                  Past Originality checks on this image
                </p>
                <ul className="mt-2 space-y-1">
                  {asset.originalityCheckIds.map((id) => (
                    <li key={id}>
                      <Link
                        href={`/studio/originality/${id}`}
                        className="text-[12.5px] text-foreground/62 underline decoration-white/20 underline-offset-2 transition-colors hover:text-foreground/90"
                      >
                        View check
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </PrismPanel>
        </div>
      </div>
    </div>
  );
}
