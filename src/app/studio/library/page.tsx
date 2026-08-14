import { LibraryBig } from "lucide-react";
import { readSession } from "@/lib/auth/session";
import { listAssets, listWork } from "@/lib/library/queries";
import { PrismIcon, PrismRule } from "@/components/brand/prism";
import { LibraryContent } from "@/components/library/library-content";
import { META_ACCENT } from "@/lib/critique/spectrum";

const ACCENT = META_ACCENT;

// Server component — direct DB reads, no client fetch. Deletion and the
// feature filter are the only interactive pieces, handled by client islands
// (DeleteButton, LibraryContent) below.
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

        <LibraryContent assets={assets} work={work} />

        <p className="mt-5 px-1 text-[11.5px] leading-relaxed text-foreground/45">
          Deleting an image removes every result run on it. Deleting a read removes only that read.
        </p>
      </div>
    </div>
  );
}
