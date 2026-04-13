import type { Metadata } from "next";
import type { Route } from "next";
import {
  AuthorityCardGrid,
  AuthorityPageShell,
  AuthoritySection
} from "../../components/authority-sections";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import { METHODOLOGY_STAGES } from "../../lib/authority-content";
import { sortMethodologyStages } from "../../lib/authority";

export const metadata: Metadata = {
  title: "Methodology | Evolve Edge",
  description:
    "Understand how Evolve Edge moves from structured intake to validated analysis, executive delivery, and recurring monitoring."
};

export default function MethodologyPage() {
  const stages = sortMethodologyStages(METHODOLOGY_STAGES);

  return (
    <>
      <PageAnalyticsTracker
        eventName="marketing.methodology_viewed"
        payload={{ location: "methodology-page" }}
        source="methodology-page"
        storageKey="analytics:methodology-viewed"
      />
      <AuthorityPageShell
        eyebrow="Methodology"
        title="A clear methodology for regulated AI risk work, not black-box automation."
        body="This page explains the product workflow in business and operational terms so buyers can understand how inputs become findings, executive packages, and recurring visibility."
        primaryCta={{ href: "/trust" as Route, label: "Review trust center" }}
        secondaryCta={{ href: "/contact-sales?intent=methodology-review&source=methodology-page" as Route, label: "Ask about the process" }}
      >
        <AuthoritySection
          title="Four-stage operating model"
          description="A clear operating model that shows how intake becomes findings, executive reporting, and ongoing visibility."
        >
          <AuthorityCardGrid
            items={stages.map((stage) => ({
              title: stage.name,
              body: stage.summary,
              eyebrow: stage.slug.replaceAll("-", " "),
              footer: `${stage.outputs.length} outputs · ${stage.operatorNotes.length} operating notes`
            }))}
          />
        </AuthoritySection>

        <AuthoritySection
          title="Why the methodology matters"
          description="Enterprise buyers are not only buying a report. They are evaluating process discipline, reviewability, and whether the product can support repeated use."
        >
          <AuthorityCardGrid
            items={stages.flatMap((stage) => [
              {
                title: `${stage.name} outputs`,
                body: stage.outputs.join(". ") + "."
              },
              {
                title: `${stage.name} operator notes`,
                body: stage.operatorNotes.join(". ") + "."
              }
            ])}
          />
        </AuthoritySection>
      </AuthorityPageShell>
    </>
  );
}
