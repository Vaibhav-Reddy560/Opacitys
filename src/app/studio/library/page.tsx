import { LibraryBig } from "lucide-react";
import { readSession } from "@/lib/auth/session";
import { listAssets, listWork } from "@/lib/library/queries";
import { RESULT_HREF, KIND_LABEL } from "@/lib/library/hrefs";
import { PrismPanel, PrismIcon, PrismRule } from "@/components/brand/prism";
import { UploadsPanel } from "@/components/library/uploads-panel";
import { WorkRow } from "@/components/library/work-row";
import { META_ACCENT } from "@/lib/critique/spectrum";

const ACCENT = META_ACCENT;

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Server component — direct DB reads, no client fetch. Deletion is the only
// interactive piece, handled by the small client DeleteButton islands below.
export default async function LibraryPage() {
  const session = await readSession();
  if (!session) return null; // proxy already gates /studio; this satisfies TS

  const [assets, work] = await Promise.all([
    listAssets(session.userId, 60),
    listWork(session.userId, undefined, 40),
  ]);

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <div className="flex items-start gap-4">
            <PrismIcon accent={ACCENT} size={46}>
              <LibraryBig className="size-4" aria-hidden />
            </PrismIcon>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl tracking-tight" style={{ fontVariationSettings: '"wght" 550' }}>
                Your work
              </h1>
              <p className="mt-1 text-[14px] text-foreground/58">
                Every upload and every read, kept — reuse an image across features, revisit a result, or remove
                something for good. Nothing here disappears when you navigate away.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <PrismRule />
          </div>
        </header>

        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <UploadsPanel assets={assets} />
        </PrismPanel>

        <div className="mt-6">
          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Reads ({work.length})</h2>

            {work.length === 0 ? (
              <p className="mt-4 text-[13px] text-foreground/55">
                Nothing yet — Currents, Instruments, Clearance and Originality reads will show up here.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {work.map((item) => (
                  <WorkRow
                    key={`${item.kind}-${item.id}`}
                    href={RESULT_HREF[item.kind](item.id)}
                    badge={KIND_LABEL[item.kind]}
                    title={item.title}
                    date={formatDate(item.createdAt)}
                    deleteUrl={`/api/library/work/${item.kind}/${item.id}`}
                    deleteConfirm="Delete this read? This can't be undone."
                  />
                ))}
              </ul>
            )}
          </PrismPanel>
        </div>

        <p className="mt-5 px-1 text-[11.5px] leading-relaxed text-foreground/45">
          Deleting an image removes every result run on it. Deleting a read removes only that read.
        </p>
      </div>
    </div>
  );
}
