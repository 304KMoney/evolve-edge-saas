import type { Metadata } from "next";
import type { Route } from "next";
import { notFound } from "next/navigation";
import {
  AuthorityListCard,
  AuthorityPageShell,
  AuthoritySection
} from "../../../components/authority-sections";
import { PageAnalyticsTracker } from "../../../components/page-analytics-tracker";
import { FRAMEWORK_COVERAGE_ENTRIES } from "../../../lib/authority-content";
import { getFrameworkCoverageEntryBySlug } from "../../../lib/authority";

export function generateStaticParams() {
  return FRAMEWORK_COVERAGE_ENTRIES.map((framework) => ({ slug: framework.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const framework = getFrameworkCoverageEntryBySlug(slug);

  if (!framework) {
    return {
      title: "Framework Coverage | Evolve Edge"
    };
  }

  return {
    title: `${framework.name} | Evolve Edge`,
    description: framework.overview
  };
}

export default async function FrameworkCoverageDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const framework = getFrameworkCoverageEntryBySlug(slug);

  if (!framework) {
    notFound();
  }

  return (
    <>
      <PageAnalyticsTracker
        eventName="marketing.framework_page_viewed"
        payload={{ slug: framework.slug, location: "framework-detail" }}
        source={`framework-${framework.slug}`}
        storageKey={`analytics:framework-${framework.slug}`}
      />
      <AuthorityPageShell
        eyebrow={framework.code}
        title={framework.name}
        body={framework.overview}
        primaryCta={{ href: "/contact-sales?intent=framework-review&source=framework-page" as Route, label: "Discuss your program" }}
        secondaryCta={{ href: "/frameworks" as Route, label: "All frameworks" }}
      >
        <div className="grid gap-5 lg:grid-cols-4">
          <AuthorityListCard title="Buyer fit" items={framework.buyerFit} />
          <AuthorityListCard title="Coverage areas" items={framework.coverageAreas} />
          <AuthorityListCard title="Executive questions" items={framework.executiveQuestions} />
          <AuthorityListCard title="Monitoring signals" items={framework.monitoringSignals} />
        </div>

        <AuthoritySection
          title="Executive output expectations"
          description="Framework detail pages explain what a premium buyer should expect from delivery, not inflated promises about certification or legal outcomes."
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <AuthorityListCard title="Report outputs" items={framework.reportOutputs} />
            <AuthorityListCard
              title="Why this page exists"
              items={[
                "Support buyer education before the first sales call",
                "Give founders a consistent structure for future framework pages",
                "Make it easy to add deeper proof and downloadable assets later"
              ]}
            />
          </div>
        </AuthoritySection>
      </AuthorityPageShell>
    </>
  );
}
