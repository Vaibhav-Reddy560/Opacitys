"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/wordmark";

export function SiteNav() {
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-background/80 backdrop-blur-md",
      )}
    >
      <nav className="mx-auto flex max-w-[1680px] items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" aria-label="Opacitys home">
          {/* The wordmark's box is now cropped tight to the glyphs (no
              descender headroom), while the sibling nav text's line-height
              carries extra space below its baseline. Centered against each
              other by flex, the tight glyph box reads as sitting above the
              text's optical middle — this nudges it down to match. */}
          <Wordmark
            className="mt-[6px] text-[30px] tracking-[0.075em]"
            interactive={false}
          />
        </Link>

        <div className="flex items-center gap-1 sm:gap-5">
          <Link
            href="/#how"
            className="hidden px-2 text-[13px] text-foreground/62 transition-colors hover:text-foreground sm:block"
          >
            How it works
          </Link>
          <Link
            href="/#studio"
            className="hidden px-2 text-[13px] text-foreground/62 transition-colors hover:text-foreground sm:block"
          >
            The studio
          </Link>
          <Link
            href="/login"
            className="px-3 text-[13px] text-foreground/62 transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/studio"
            className="rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-foreground/90 transition-colors hover:bg-white/[0.08]"
          >
            Open studio
          </Link>
        </div>
      </nav>
    </header>
  );
}
