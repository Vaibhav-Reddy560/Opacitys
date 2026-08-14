"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StudioNav } from "./studio-nav";
import { StudioSidebar } from "./sidebar";
import { ScrollProgress } from "@/components/landing/scroll-progress";

interface ShellUser {
  name: string | null;
  email: string;
  image: string | null;
}

/**
 * Owns the one piece of state StudioNav and StudioSidebar both need: whether
 * the mobile drawer is open. StudioNav's hamburger toggles it, StudioSidebar
 * is the drawer it toggles — that pairing has to live above both, and
 * studio/layout.tsx (a Server Component, it awaits readSession()) can't hold
 * client state itself, hence this thin client wrapper between them.
 *
 * Plain document scroll, not an internally-scrolling `main` — this used to
 * pin the whole shell to `h-svh` with `main` as its own `overflow-y-auto`
 * container, which kept the nav/sidebar visually in place but meant the
 * WINDOW never actually scrolled at desktop width. ScrollProgress (below)
 * is built on Motion's `useScroll()` with no target, which tracks window
 * scroll specifically — under the old structure it would have sat frozen
 * at desktop width, the one place a right-edge progress rail matters most.
 * Removing the height/overflow containment and leaning on each piece's own
 * `sticky` positioning (StudioNav is `sticky top-0`, StudioSidebar is
 * `lg:sticky lg:top-16`) gets the identical "nav and sidebar stay, content
 * scrolls past" result through a real scrolling document instead — the same
 * mechanism the landing page's SiteNav + ScrollProgress already use.
 */
export function StudioShell({
  user,
  hasSession,
  children,
}: {
  user: ShellUser | null;
  hasSession: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Closing on navigation is what makes the drawer feel like a drawer and
  // not a second permanent sidebar that happens to be hideable — without
  // this, picking a module on mobile leaves the whole screen covered by the
  // now-pointless-open drawer over the page it just navigated to.
  //
  // Adjusted during render rather than in an effect — React's own guidance
  // for "reset state when a value changes": an effect that just calls
  // setState in response to a changed dependency is an extra, avoidable
  // render pass (mount → effect fires → re-render), and the lint rule
  // (react-hooks/set-state-in-effect) catches exactly this pattern.
  // Comparing against a ref-free "previous value in state" is the
  // documented alternative for exactly this case.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <div>
      <StudioNav user={user} hasSession={hasSession} open={open} onToggle={() => setOpen((v) => !v)} />
      <ScrollProgress />
      <div className="lg:flex">
        <StudioSidebar user={user} hasSession={hasSession} open={open} onNavigate={() => setOpen(false)} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
