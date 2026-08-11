import type { WorkKind } from "./queries";

export type AnyResultKind = "critique" | "identify" | "rebuild" | WorkKind;

export const RESULT_HREF: Record<AnyResultKind, (id: string) => string> = {
  critique: (id) => `/studio/critique/${id}`,
  identify: (id) => `/studio/identify/${id}`,
  rebuild: (id) => `/studio/rebuild/${id}`,
  originality: (id) => `/studio/originality/${id}`,
  trends: (id) => `/studio/trends/${id}`,
  tools: (id) => `/studio/tools/${id}`,
  rights: (id) => `/studio/rights/${id}`,
  workflow: (id) => `/studio/workflow/${id}`,
};

export const KIND_LABEL: Record<AnyResultKind, string> = {
  critique: "Critique",
  identify: "Identify",
  rebuild: "Rebuild",
  originality: "Originality",
  trends: "Currents",
  tools: "Instruments",
  rights: "Clearance",
  workflow: "Route",
};
