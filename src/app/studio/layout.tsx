import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/studio-shell";
import { readSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Studio — Opacitys",
};

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

  return (
    <StudioShell user={user} hasSession={session !== null}>
      {children}
    </StudioShell>
  );
}
