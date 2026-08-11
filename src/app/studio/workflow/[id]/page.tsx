import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { routePlanSchema } from "@/lib/workflow/plan";
import { RouteConversation } from "@/components/workflow/route-conversation";

export default async function RoutePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();

  const [plan] = await db
    .select({
      userId: schema.routePlans.userId,
      brief: schema.routePlans.brief,
      deadline: schema.routePlans.deadline,
      tools: schema.routePlans.tools,
      skillLevel: schema.routePlans.skillLevel,
      status: schema.routePlans.status,
      error: schema.routePlans.error,
      result: schema.routePlans.result,
      createdAt: schema.routePlans.createdAt,
    })
    .from(schema.routePlans)
    .where(eq(schema.routePlans.id, id))
    .limit(1);

  if (!plan || plan.userId !== session?.userId) notFound();

  const turnRows = await db
    .select({
      id: schema.routeTurns.id,
      role: schema.routeTurns.role,
      content: schema.routeTurns.content,
      revisedPlan: schema.routeTurns.revisedPlan,
      changeSummary: schema.routeTurns.changeSummary,
      status: schema.routeTurns.status,
      error: schema.routeTurns.error,
      createdAt: schema.routeTurns.createdAt,
    })
    .from(schema.routeTurns)
    .where(eq(schema.routeTurns.planId, id))
    .orderBy(schema.routeTurns.createdAt);

  const initialPlan = plan.status === "complete" ? routePlanSchema.safeParse(plan.result) : null;

  const turns = turnRows.map((t) => ({
    id: t.id,
    role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: t.content,
    // Round-tripped through jsonb as `unknown` — tolerate a malformed row
    // rather than crashing the whole page over one bad revision (same
    // tolerant-parse pattern as Currents' sourcesSchema).
    revisedPlan: t.revisedPlan ? routePlanSchema.safeParse(t.revisedPlan).data ?? null : null,
    changeSummary: t.changeSummary,
    status: t.status,
    error: t.error,
    createdAt: t.createdAt,
  }));

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <RouteConversation
          planId={id}
          brief={plan.brief}
          deadline={plan.deadline}
          tools={plan.tools ?? []}
          skillLevel={plan.skillLevel}
          planStatus={plan.status}
          planError={plan.error}
          createdAt={plan.createdAt}
          initialPlan={initialPlan?.success ? initialPlan.data : null}
          turns={turns}
        />
      </div>
    </div>
  );
}
