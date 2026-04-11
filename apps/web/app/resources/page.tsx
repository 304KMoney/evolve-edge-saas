import type { Metadata } from "next";
import type { Route } from "next";
import { AuthorityCardGrid, AuthorityPageShell, AuthoritySection } from "../../components/authority-sections";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import { CASE_STUDY_SCAFFOLDS, RESOURCE_SCAFFOLDS } from "../../lib/authority-content";

export const metadata: Metadata = {
  title: "Resources | Evolve Edge",
  description:
    "Explore founder-editable resource, case study, and thought-leadership scaffolding for regulated enterprise buyers."
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
        title="Thought-leadership and proof scaffolding for high-trust sales."
        body="The repo does not yet include a full blog engine or CMS, so this page provides a structured foundation for founder-updated resources, briefs, checklists, and case studies."
        primaryCta={{ href: "/trust" as Route, label: "Open trust center" }}
        secondaryCta={{ href: "/contact-sales?intent=resource-request&source=resources-page" as Route, label: "Request material" }}
      >
        <AuthoritySection
          title="Resource architecture"
          description="These scaffolds are content structures, not inflated marketing claims. A founder or marketer can replace placeholders with real materials later."
        >
          <AuthorityCardGrid
            items={RESOURCE_SCAFFOLDS.map((resource) => ({
              title: resource.title,
              body: resource.summary,
              eyebrow: `${resource.format} · ${resource.audience}`,
              footer: resource.status
            }))}
          />
        </AuthoritySection>

        <AuthoritySection
          title="Case study scaffolding"
          description="Use these placeholders as templates for future customer proof once live references and permissions are available."
        >
          <AuthorityCardGrid
            items={CASE_STUDY_SCAFFOLDS.map((study) => ({
              title: `${study.segment} case study`,
              body: `${study.challenge} ${study.outcome}`,
              eyebrow: study.status,
              footer: study.proofPoints.join(" · ")
            }))}
          />
        </AuthoritySection>
      </AuthorityPageShell>
    </>
  );
}
