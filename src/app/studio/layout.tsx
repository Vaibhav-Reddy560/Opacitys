import type { Metadata } from "next";
import { after } from "next/server";
import { StudioShell } from "@/components/studio/studio-shell";
import { readSession } from "@/lib/auth/session";
import { getTodayStyles, getTodayNews } from "@/lib/digest/get";
import { getSeenState, markSeen } from "@/lib/digest/seen";
import { ensureDailyDigest } from "@/lib/digest/pipeline";

export const metadata: Metadata = {
  title: "Studio — Opacitys",
};

const EPOCH = new Date(0);

export default async function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The proxy gate already keeps unauthenticated visits out; reading the
  // session again here is only for the sidebar footer's name/email/image —
  // not a second security check. Those three fields live in the session
  // cookie itself (see token.ts), so this layout — which wraps every studio
  // page, meaning it re-runs on every single studio navigation — no longer
  // pays a `users` round trip just to render an avatar. Can lag reality
  // until the next sign-in if the Google profile changes mid-session; see
  // the comment on SessionPayload for why that's an acceptable trade here.
  const session = await readSession();
  const user = session ? { name: session.name, email: session.email, image: session.image } : null;

  // Cheap indexed reads (at most today's row per kind, by primary key/unique
  // index) — never a live Tavily/Groq call in the render path itself. If
  // either digest isn't fresh (missing today, or still showing a prior
  // day's row), generation is fired via after() so this response is never
  // blocked on it; see ensureDailyDigest's own doc comment for why calling
  // it unconditionally on every stale render is safe (budget-gated,
  // concurrency-guarded by a DB unique constraint).
  const [styles, news] = await Promise.all([getTodayStyles(), getTodayNews()]);
  if (!styles?.isFresh) after(() => ensureDailyDigest("styles").catch((err) => console.error("[digest] styles generation failed:", err)));
  if (!news?.isFresh) after(() => ensureDailyDigest("news").catch((err) => console.error("[digest] news generation failed:", err)));

  let stylesUnseen = false;
  let newsUnseen = false;

  if (session) {
    const seen = await getSeenState(session.userId);
    if (styles) stylesUnseen = styles.createdAt > (seen.lastSeenStylesAt ?? EPOCH);
    if (news) newsUnseen = news.createdAt > (seen.lastSeenNewsAt ?? EPOCH);

    // Styles has no click-to-open step — it's always visible in the
    // sidebar, so simply rendering it here IS seeing it. Marked seen only
    // when it was actually unseen, to avoid a write on every navigation
    // once it's already been seen today. News marks itself seen instead,
    // client-side, only when the popover is actually opened (news-popover.tsx)
    // — it's hidden behind a click, so rendering it isn't seeing it.
    if (stylesUnseen) after(() => markSeen(session.userId, "styles"));
  }

  return (
    <StudioShell
      user={user}
      hasSession={session !== null}
      styles={styles?.items ?? []}
      stylesUnseen={stylesUnseen}
      news={news?.items ?? []}
      newsUnseen={newsUnseen}
    >
      {children}
    </StudioShell>
  );
}
