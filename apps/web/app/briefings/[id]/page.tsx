import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { getExecutiveBriefingById } from "../../../lib/executive-briefing";
import { requireOrganizationPermissionForOrganization } from "../../../lib/auth";
import { ExportPdfButton } from "./export-pdf-button";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export default async function BriefingPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const briefing = await getExecutiveBriefingById(id);

  if (!briefing) {
    notFound();
  }

  await requireOrganizationPermissionForOrganization(
    "reports.view",
    briefing.organizationId
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e8fbff,transparent_34%),linear-gradient(135deg,#f8f4ea,#eef7f7)] px-5 py-8 text-ink print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-panel backdrop-blur md:p-9">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
                Executive Briefing
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-5xl">
                {briefing.reportTitle}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-steel">
                {briefing.summary}
              </p>
              <p className="mt-3 text-sm text-steel">
                {briefing.assessmentName} - Created {formatDate(briefing.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 print:hidden">
              <ExportPdfButton />
              <Link
                href={`/dashboard/reports/${briefing.reportId}` as Route}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
              >
                Back to report
              </Link>
            </div>
          </div>

          <section className="mt-8 grid gap-4">
            {briefing.structuredSections.map((section) => (
              <article
                key={section.key}
                className="rounded-[26px] border border-line bg-[linear-gradient(180deg,#ffffff,#f9fcfb)] p-6"
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">
                  {section.title}
                </p>
                <p className="mt-3 text-base leading-8 text-ink">{section.body}</p>
                {section.bullets.length > 0 ? (
                  <ul className="mt-4 grid gap-3">
                    {section.bullets.map((bullet, index) => (
                      <li
                        key={`${section.key}-${index}`}
                        className="rounded-2xl border border-white bg-mist px-4 py-3 text-sm leading-6 text-steel"
                      >
                        {bullet}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </section>

          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-warning print:hidden">
            This briefing is derived from the validated report only. It is advisory
            material for client walkthroughs and does not replace legal,
            compliance, or certification review.
          </div>
        </div>
      </div>
    </main>
  );
}
