import type { TextLine } from "../text-lines";

/**
 * Shared by typography.ts, contrast.ts and facts.ts — all three need to
 * group text lines into distinct type sizes, and previously did so with two
 * independent copies of the same greedy-clustering logic (typography.ts and
 * facts.ts). One implementation here; each caller reads the view of it that
 * it actually needs (typography: how many clusters; contrast: which one is
 * the body and which is the display size; facts: just the count).
 */
export interface TypeCluster {
  meanHeight: number;
  lines: TextLine[];
}

const CLUSTER_TOLERANCE_PX = 3;

/** Greedily groups text lines by height: sort ascending, start a new
 * cluster whenever the gap to the previous height exceeds the tolerance. */
export function clusterTextLines(textLines: TextLine[]): TypeCluster[] {
  if (textLines.length === 0) return [];
  const sorted = [...textLines].sort((a, b) => a.bbox[3] - b.bbox[3]);

  const clusters: TextLine[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const line = sorted[i];
    const last = clusters[clusters.length - 1];
    const lastHeight = last[last.length - 1].bbox[3];
    if (line.bbox[3] - lastHeight <= CLUSTER_TOLERANCE_PX) {
      last.push(line);
    } else {
      clusters.push([line]);
    }
  }

  return clusters.map((lines) => ({
    meanHeight: lines.reduce((sum, l) => sum + l.bbox[3], 0) / lines.length,
    lines,
  }));
}
