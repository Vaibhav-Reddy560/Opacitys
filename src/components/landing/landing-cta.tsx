"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { ChromeButton } from "@/components/ui/chrome-button";
import { Magnetic } from "@/components/motion/magnetic";
import { ClickSpark } from "@/components/motion/click-spark";
import { HERO } from "@/lib/copy";

export function LandingCta() {
  const router = useRouter();

  // This CTA is what actually starts the trip to the studio, so the target
  // route's RSC payload is worth having warm before the click rather than
  // fetching cold at click time — `<Link>` gets this for free via
  // viewport-prefetch, but this button is deliberately a styled
  // Magnetic/ClickSpark wrapper around onClick, not a real anchor.
  useEffect(() => {
    router.prefetch("/login");
  }, [router]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <ClickSpark>
        <Magnetic radius={70} strength={0.3}>
          {/* /signup is a pure server-redirect() to /login (see its
              page.tsx) — going straight there skips a whole extra
              navigation round trip for every click of this button. */}
          <ChromeButton onClick={() => router.push("/login")}>
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
