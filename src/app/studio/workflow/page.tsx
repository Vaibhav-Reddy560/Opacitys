import { Route as RouteIcon } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { RouteForm } from "@/components/workflow/route-form";
import { RecentStrip } from "@/components/library/recent-strip";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { readSession } from "@/lib/auth/session";
import { getStoredProfile } from "@/lib/profile/stored";

const MODULE = MODULES.find((m) => m.slug === "workflow")!;

// Server shell — see the comment in studio/critique/page.tsx for why
// RecentStrip has to be composed here rather than inside the client form.
export default async function WorkflowPage() {
  const session = await readSession();
  const profile = session ? await getStoredProfile(session.userId) : null;

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader module={MODULE} icon={<RouteIcon className="size-4" aria-hidden />} />

        <RouteForm initialTools={profile?.tools ?? []} initialSkillLevel={profile?.skillLevel ?? null} />
        <RecentStrip kind="workflow" accent={SPECTRUM.spacing.color} />
      </div>
    </div>
  );
}
