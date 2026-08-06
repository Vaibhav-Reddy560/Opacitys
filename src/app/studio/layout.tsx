import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { StudioSidebar } from "@/components/studio/sidebar";
import { readSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export const metadata: Metadata = {
  title: "Studio — Opacitys",
};

export default async function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The proxy gate already keeps unauthenticated visits out; reading the
  // session again here is only to fetch the account details for the
  // sidebar's footer — not a second security check.
  const session = await readSession();

  const [user] = session
    ? await db
        .select({ name: schema.users.name, email: schema.users.email, image: schema.users.image })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1)
    : [];

  return (
    <div className="lg:flex">
      {/* hasSession is separate from `user` (the profile lookup) so a
          session whose row can't be found — e.g. deleted between the proxy's
          check and this render — still gets a working Sign out button
          instead of being stuck with no way out of a broken session. */}
      <StudioSidebar user={user ?? null} hasSession={session !== null} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
