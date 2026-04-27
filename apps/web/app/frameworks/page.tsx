import type { Metadata } from "next";
import type { Route } from "next";
import { AuthorityCardGrid, AuthorityPageShell, AuthoritySection } from "../../components/authority-sections";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import { FRAMEWORK_COVERAGE_ENTRIES } from "../../lib/authority-content";
import { sortFrameworkCoverageEntries } from "../../lib/authority";

export const metadata: Metadata = {
  title: "Framework Coverage | Evolve Edge",
  description:
    "Explore how Evolve Edge structures framework coverage for regulated AI governance, compliance, and executive reporting."
};

export default function FrameworkCoveragePage() {
  const frameworks = sortFrameworkCoverageEntries(FRAMEWORK_COVERAGE_ENTRIES);

  return (
    <>
      <PageAnalyticsTracker
        eventName="marketing.framework_page_viewed"
        payload={{ slug: "index", location: "frameworks-index" }}
        source="frameworks-index"
        storageKey="analytics:frameworks-index-viewed"
      />
      <AuthorityPageShell
        eyebrow="Framework Coverage"
        title="Framework-specific buyer context without a consulting-spreadsheet feel."
        body="Each framework page is structured to show what Evolve Edge helps leadership understand, which questions matter to buyers, and how outputs carry into recurring visibility."
        primaryCta={{ href: "/trust" as Route, label: "Open trust center" }}
        secondaryCta={{ href: "/pricing" as Route, label: "See plans" }}
      >
        <AuthoritySection
          title="Coverage library"
          description="These pages are intentionally structured for future expansion into deeper control mappings, downloadable artifacts, and richer framework combinations."
        >
          <AuthorityCardGrid
            items={frameworks.map((framework) => ({
              title: framework.name,
              body: framework.overview,
              eyebrow: framework.category,
              href: `/frameworks/${framework.slug}` as Route,
              footer: framework.assetDownloads?.length
                ? `${framework.assetDownloads.length} downloadable assets`
                : undefined
            }))}
          />
        </AuthoritySection>
      </AuthorityPageShell>
    </>
  );
}
