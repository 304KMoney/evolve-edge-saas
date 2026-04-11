import type { Metadata } from "next";
import type { Route } from "next";
import {
  AUTHORITY_FAQ,
  FRAMEWORK_COVERAGE_ENTRIES,
  METHODOLOGY_STAGES,
  TRUST_CENTER_CONTENT
} from "../../lib/authority-content";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import {
  AuthorityCardGrid,
  AuthorityFaq,
  AuthorityPageShell,
  AuthoritySection
} from "../../components/authority-sections";

export const metadata: Metadata = {
  title: "Trust Center | Evolve Edge",
  description:
    "Review the Evolve Edge trust center foundation, framework coverage, methodology, and delivery rigor for regulated buyers."
};

export default function TrustCenterPage() {
  return (
    <>
      <PageAnalyticsTracker
        eventName="marketing.trust_center_viewed"
        payload={{ location: "trust-center" }}
        source="trust-center"
        storageKey="analytics:trust-center-viewed"
      />
      <AuthorityPageShell
        eyebrow={TRUST_CENTER_CONTENT.hero.eyebrow}
        title={TRUST_CENTER_CONTENT.hero.title}
        body={TRUST_CENTER_CONTENT.hero.body}
        primaryCta={{ href: "/pricing" as Route, label: "Review plans" }}
        secondaryCta={{ href: "/contact-sales?intent=trust-review&source=trust-center" as Route, label: "Talk to Evolve Edge" }}
      >
        <AuthorityCardGrid
          items={TRUST_CENTER_CONTENT.trustSignals.map((signal) => ({
            title: signal.title,
            body: signal.body
          }))}
        />

        <AuthoritySection
          title="Trust artifacts foundation"
          description="The first version is deliberately structured so a founder can publish credible materials now and extend into richer legal, security, and questionnaire artifacts later."
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
          title="Coverage and methodology"
          description="Use reusable framework and methodology pages to explain what Evolve Edge evaluates, how executive packages are produced, and what recurring visibility looks like after the first report."
        >
          <AuthorityCardGrid
            items={[
              {
                title: "Framework coverage",
                body: `Structured coverage pages for ${FRAMEWORK_COVERAGE_ENTRIES.length} launch frameworks with buyer-fit, executive questions, and monitoring signals.`,
                href: "/frameworks" as Route
              },
              {
                title: "Methodology",
                body: `A ${METHODOLOGY_STAGES.length}-stage explanation of intake, validated analysis, executive delivery, and recurring monitoring.`,
                href: "/methodology" as Route
              },
              {
                title: "Security posture",
                body: "A reusable security and compliance module structure for procurement, legal, and enterprise buyers.",
                href: "/security" as Route
              }
            ]}
          />
        </AuthoritySection>

        <AuthoritySection
          title="Enterprise buyer FAQ"
          description="Concise answers for regulated buyers evaluating product credibility, updateability, and trust posture."
        >
          <AuthorityFaq items={[...TRUST_CENTER_CONTENT.enterpriseFaq, ...AUTHORITY_FAQ]} />
        </AuthoritySection>
      </AuthorityPageShell>
    </>
  );
}
