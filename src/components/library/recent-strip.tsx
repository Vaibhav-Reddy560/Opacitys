import Link from "next/link";
import { readSession } from "@/lib/auth/session";
import { listWork, listRecentAnalyses } from "@/lib/library/queries";
import { RESULT_HREF as HREF, type AnyResultKind as RecentKind } from "@/lib/library/hrefs";

export type { RecentKind };

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * "Recent" strip under a feature's form — the actual fix for results
 * disappearing on navigation: leaving a feature and coming back lands on a
 * form with the last runs listed under it, not an empty dropzone with the
 * result stranded at a URL nobody kept. Server component, reads straight
 * from the DB — no client fetch, no loading state.
 */
export async function RecentStrip({ kind, accent }: { kind: RecentKind; accent: string }) {
  const session = await readSession();
  if (!session) return null;

  if (kind === "critique" || kind === "identify" || kind === "rebuild") {
    const items = await listRecentAnalyses(session.userId, kind, 8);
    if (items.length === 0) return null;
    return (
      <div className="mt-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Recent</p>
        <div className="mt-2.5 flex gap-2.5 overflow-x-auto pb-1">
          {items.map((item) => (
            <Link
              key={item.analysisId}
              href={HREF[kind](item.analysisId)}
              data-cursor-accent={accent}
              className="group relative size-16 shrink-0 overflow-hidden rounded-lg border border-white/[0.09] transition-colors hover:border-white/25"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external Blob URL thumbnail, not an optimizable local asset */}
              <img src={item.storageKey} alt="" className="size-full object-cover" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const items = await listWork(session.userId, kind, 6);
  if (items.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Recent</p>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={HREF[kind](item.id)}
              data-cursor-accent={accent}
              className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-[12.5px] text-foreground/68 transition-colors hover:bg-white/[0.03] hover:text-foreground/92"
            >
              <span className="block min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-foreground/40">{formatDate(item.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
