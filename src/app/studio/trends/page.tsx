import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { Blueprint } from "@/components/studio/blueprint";
import { MODULES } from "@/lib/copy";

const MODULE = MODULES.find((m) => m.slug === "trends")!;

export default function TrendsPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<TrendingUp className="size-4" aria-hidden />} />
        <Blueprint
          dimension={MODULE.dimension}
          steps={[
            {
              title: "Ingest from sources that permit it",
              body: "Behance and Dribbble via OAuth, Pinterest Trends, Are.na, the YouTube Data API, and design-publication feeds. Instagram and TikTok scraping is deliberately excluded — it breaks constantly and violates their terms, which would put the whole product at risk.",
            },
            {
              title: "Cluster into named currents",
              body: "Embed each item, cluster by visual and semantic similarity, and track how fast a cluster is growing to separate a genuine current from a single viral post.",
            },
            {
              title: "Trace the philosophy underneath",
              body: "For each current, pull the writing about it and synthesise where it came from, what it is reacting against, and why it caught — the Apple and Nike lineage question, answered with sources rather than vibes.",
            },
            {
              title: "Turn it into execution",
              body: "Break the look into the decisions that produce it — type choices, grid, palette relationships, texture, finish — as steps you can follow in a specific tool.",
            },
            {
              title: "Cite everything",
              body: "Every claim links back to the item it came from, so you can judge the source yourself instead of trusting a summary.",
            },
          ]}
          requires={["source ToS review", "ingestion worker", "trend clustering", "pgvector index"]}
        />
      </div>
    </div>
  );
}
