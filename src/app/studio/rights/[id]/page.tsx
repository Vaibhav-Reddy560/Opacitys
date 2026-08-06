import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { PrismPanel } from "@/components/brand/prism";
import { SPECTRUM } from "@/lib/critique/spectrum";

const ACCENT = SPECTRUM.balance.color;

const DISCLAIMER =
  "General information, not legal advice. Laws vary by jurisdiction and change — confirm specifics with local counsel before relying on this commercially.";

interface Result {
  answer: string;
  keyConsiderations: string[];
  confidence: "general" | "country-specific-approximate";
}

export default async function RightsAnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();

  const [row] = await db
    .select({
      question: schema.rightsAnswers.question,
      country: schema.rightsAnswers.country,
      result: schema.rightsAnswers.result,
      createdAt: schema.rightsAnswers.createdAt,
      userId: schema.rightsAnswers.userId,
    })
    .from(schema.rightsAnswers)
    .where(eq(schema.rightsAnswers.id, id))
    .limit(1);

  if (!row || row.userId !== session?.userId) notFound();

  const result = row.result as Result;

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/studio/rights"
          className="inline-flex items-center gap-2 text-[13px] text-foreground/55 transition-colors hover:text-foreground/90"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Ask another question
        </Link>

        <div className="mt-8 space-y-6">
          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The question</h2>
              <span className="font-mono text-[10.5px] text-foreground/45">
                {row.country} · {new Date(row.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-pretty mt-3 text-[13.5px] leading-relaxed text-foreground/75">{row.question}</p>
          </PrismPanel>

          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <p className="text-pretty text-[14px] leading-relaxed text-foreground/85">{result.answer}</p>

            {result.keyConsiderations.length > 0 && (
              <ul className="mt-4 space-y-2">
                {result.keyConsiderations.map((k, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/70">
                    <span style={{ color: ACCENT }}>—</span>
                    {k}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-5 text-[11.5px] leading-relaxed text-foreground/50">{DISCLAIMER}</p>
          </PrismPanel>
        </div>
      </div>
    </div>
  );
}
