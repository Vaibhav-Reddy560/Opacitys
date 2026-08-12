import type { ReactNode } from "react";
import { PrismaticBackdrop } from "@/components/visual/prismatic-backdrop";
import { cn } from "@/lib/utils";

const WIDTH = {
  content: "max-w-5xl",
  wide: "max-w-6xl",
  full: "max-w-[1680px]",
} as const;

/**
 * Standardizes the landing page's section shell — width, vertical rhythm,
 * and the border between sections — which today drift across
 * max-w-5xl/6xl/2xl/[1680px] and py-28 sm:py-36 vs py-32 sm:py-44 with no
 * single source. A server component (no hooks) so composing `page.tsx` out
 * of these doesn't pull it into the client bundle.
 *
 * Not yet wired into page.tsx's existing sections — that migration (and the
 * actual padding tightening from py-28/32 down to py-24) is a Phase 1
 * change, deliberately kept out of Phase 0 so this phase stays a zero
 * visual diff. This file exists now so Phase 1 has it ready.
 */
export function Section({
  id,
  width = "content",
  tone = "flat",
  divider = true,
  className,
  children,
}: {
  id?: string;
  width?: keyof typeof WIDTH;
  /** "prism" renders `<PrismaticBackdrop />` behind the content — the caller
   *  still needs `relative isolate overflow-hidden` on classes below it,
   *  same contract `PrismaticBackdrop` itself documents. Runs dimmer than
   *  the hero: an interior section that matched it would compete with the
   *  first screen for the same trick. */
  tone?: "flat" | "prism";
  /** Most sections are separated by a hairline; the hero and the lit
   *  close section aren't (border-y already lives on the belt between
   *  them, and a border under a full-bleed backdrop reads as a seam). */
  divider?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative px-6 py-24 sm:py-32",
        tone === "prism" && "isolate overflow-hidden",
        divider && "border-b border-white/[0.06]",
        className,
      )}
    >
      {tone === "prism" && <PrismaticBackdrop intensity={0.72} />}
      <div className={cn("mx-auto", WIDTH[width])}>{children}</div>
    </section>
  );
}
