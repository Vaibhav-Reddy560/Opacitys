import type { Metadata } from "next";
import { StudioSidebar } from "@/components/studio/sidebar";
import { readSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Studio — Opacitys",
};

export default async function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The proxy gate already keeps unauthenticated visits out; reading the
  // session again here is only to tell the sidebar which account state to
  // show (and, for guests, that it's a guest) — not a second security check.
  const session = await readSession();

  return (
    <div className="lg:flex">
      <StudioSidebar sessionKind={session?.kind ?? null} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
