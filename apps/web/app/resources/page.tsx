import type { Metadata } from "next";
import type { Route } from "next";
import { AuthorityCardGrid, AuthorityPageShell, AuthoritySection } from "../../components/authority-sections";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import { CASE_STUDY_SCAFFOLDS, RESOURCE_SCAFFOLDS } from "../../lib/authority-content";

export const metadata: Metadata = {
  title: "Resources | Evolve Edge",
  description:
    "Explore buyer-ready resources, case studies, and thought leadership for regulated enterprise teams."
};

export default function ResourcesPage() {
  return (
    <>
      <PageAnalyticsTracker
        eventName="marketing.resources_page_viewed"
        payload={{ location: "resources-page" }}
        source="resources-page"
        storageKey="analytics:resources-page-viewed"
      />
      <AuthorityPageShell
        eyebrow="Resources"
        title="Resources and proof points for high-trust buyers."
        body="Explore practical guides, executive briefing materials, and case-study content designed for regulated and high-trust teams."
        primaryCta={{ href: "/trust" as Route, label: "Open trust center" }}
        secondaryCta={{ href: "/contact-sales?intent=resource-request&source=resources-page" as Route, label: "Request material" }}
      >
        <AuthoritySection
          title="Featured resources"
          description="Use these materials to support internal planning, executive discussions, and buyer evaluation."
        >
          <AuthorityCardGrid
            items={RESOURCE_SCAFFOLDS.map((resource) => ({
              title: resource.title,
              body: resource.summary,
              eyebrow: `${resource.format} · ${resource.audience}`
            }))}
          />
        </AuthoritySection>

        <AuthoritySection
          title="Case study snapshots"
          description="Representative examples of how structured AI risk work supports executive clarity and operational follow-through."
        >
          <AuthorityCardGrid
            items={CASE_STUDY_SCAFFOLDS.map((study) => ({
              title: `${study.segment} case study`,
              body: `${study.challenge} ${study.outcome}`,
              eyebrow: study.segment,
              footer: study.proofPoints.join(" · ")
            }))}
          />
        </AuthoritySection>
      </AuthorityPageShell>
    </>
  );
}
