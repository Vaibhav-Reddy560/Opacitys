"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PrismaticBackdrop } from "@/components/visual/prismatic-backdrop";
import { TitleImage } from "@/components/brand/title-image";
import { PrismRule, PrismPanel } from "@/components/brand/prism";
import { BorderTrace } from "@/components/motion/border-trace";

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
      <PrismaticBackdrop intensity={0.8} />

      <div className="w-full max-w-[460px]">
        {/* relative so BorderTrace's absolute inset-0 SVG traces this box
            exactly, not the outer max-w-[460px] wrapper. */}
        <div className="relative">
          <BorderTrace />
          <PrismPanel className="p-9 sm:p-11">
            <Link href="/" className="mb-7 flex justify-center">
              <TitleImage width={1200} height={158} className="h-7 sm:h-9 w-auto" size="compact" priority />
            </Link>

            <div className="text-center">
              <h1
                className="text-2xl tracking-tight sm:text-[28px]"
                style={{ fontVariationSettings: '"wght" 550' }}
              >
                {title}
              </h1>
              <p className="text-pretty mx-auto mt-3 max-w-[360px] text-[15px] leading-relaxed text-foreground/58">
                {lede}
              </p>
            </div>

            <div className="my-8">
              <PrismRule />
            </div>

            {children}
          </PrismPanel>
        </div>

        <div className="mt-7 text-center text-sm text-foreground/58">{footer}</div>
      </div>
    </main>
  );
}
