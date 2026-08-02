"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { ChromeButton } from "@/components/ui/chrome-button";
import { Magnetic } from "@/components/motion/magnetic";
import { ClickSpark } from "@/components/motion/click-spark";
import { HERO } from "@/lib/copy";

export function LandingCta() {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <ClickSpark>
        <Magnetic radius={70} strength={0.3}>
          <ChromeButton onClick={() => router.push("/signup")}>
            {HERO.primaryCta}
            <ArrowUpRight className="size-4" />
          </ChromeButton>
        </Magnetic>
      </ClickSpark>
      <Magnetic radius={70} strength={0.3}>
        <ChromeButton
          variant="ghost"
          onClick={() =>
            document.getElementById("how")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          {HERO.secondaryCta}
        </ChromeButton>
      </Magnetic>
    </div>
  );
}
