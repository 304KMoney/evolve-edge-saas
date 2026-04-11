import type { Metadata } from "next";
import type { Route } from "next";
import { AuthorityCardGrid, AuthorityFaq, AuthorityPageShell, AuthoritySection } from "../../components/authority-sections";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import { AUTHORITY_FAQ, SECURITY_POSTURE_MODULES, TRUST_CENTER_CONTENT } from "../../lib/authority-content";

export const metadata: Metadata = {
  title: "Security and Compliance Posture | Evolve Edge",
  description:
    "Review the Evolve Edge security and compliance posture modules designed for regulated enterprise buyers."
};

export default function SecurityPage() {
  return (
    <>
      <PageAnalyticsTracker
        eventName="marketing.security_page_viewed"
        payload={{ location: "security-page" }}
        source="security-page"
        storageKey="analytics:security-page-viewed"
      />
      <AuthorityPageShell
        eyebrow="Security and Compliance"
        title="A structured posture page for procurement, legal, and security review."
        body="This page is the first infrastructure layer for founder-maintained security and compliance posture content. It is intentionally modular so future trust artifacts and legal pages can attach cleanly."
        primaryCta={{ href: "/trust" as Route, label: "Open trust center" }}
        secondaryCta={{ href: "/contact-sales?intent=security-review&source=security-page" as Route, label: "Request a review" }}
      >
        <AuthoritySection
          title="Core posture modules"
          description="Use these modules as stable sections for future questionnaire responses, trust documents, and security review workflows."
        >
          <AuthorityCardGrid
            items={SECURITY_POSTURE_MODULES.map((module) => ({
              title: module.title,
              body: module.body
            }))}
          />
        </AuthoritySection>

        <AuthoritySection
          title="Current trust artifacts"
          description="These modules show what exists now and where richer materials can be added later without redesigning the page."
        >
          <AuthorityCardGrid
            items={TRUST_CENTER_CONTENT.trustArtifacts.map((artifact) => ({
              title: artifact.title,
              body: artifact.summary,
              eyebrow: artifact.audience,
              footer: artifact.status
            }))}
          />
        </AuthoritySection>

        <AuthoritySection
          title="FAQ for enterprise reviewers"
          description="Keep answers precise and restrained. This layer is meant to support trust, not make claims the system cannot support."
        >
          <AuthorityFaq items={AUTHORITY_FAQ} />
        </AuthoritySection>
      </AuthorityPageShell>
    </>
  );
}
