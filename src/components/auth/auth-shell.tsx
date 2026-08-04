"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PrismaticAurora } from "@/components/visual/prismatic-aurora";
import { TitleImage } from "@/components/brand/title-image";
import { PrismRule } from "@/components/brand/prism";

export function AuthShell({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="relative isolate grid min-h-svh place-items-center overflow-hidden px-6 py-12">
      <PrismaticAurora className="absolute inset-0 -z-20 h-full w-full" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(85% 60% at 50% 45%, oklch(0.145 0.012 265 / 0.55) 0%, oklch(0.145 0.012 265 / 0.8) 60%)",
        }}
      />

      <div className="w-full max-w-[380px]">
        <div className="mb-9 text-center">
          <Link href="/" className="inline-block">
            <TitleImage width={591} height={88} className="h-8 sm:h-[52px] w-auto" size="hero" priority />
          </Link>
          <h1
            className="mt-8 text-xl tracking-tight"
            style={{ fontVariationSettings: '"wght" 550' }}
          >
            {title}
          </h1>
          <p className="text-pretty mx-auto mt-2 max-w-[300px] text-[13.5px] leading-relaxed text-foreground/58">
            {lede}
          </p>
        </div>

        <div className="mb-8">
          <PrismRule />
        </div>

        {children}

        <div className="mt-7 text-center text-[13px] text-foreground/58">{footer}</div>
      </div>
    </main>
  );
}
