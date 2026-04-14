import Link from "next/link";
import { Prisma, prisma } from "@evolve-edge/db";
import { ActivationTipCard } from "../../../components/activation-guide";
import { requireCurrentSession } from "../../../lib/auth";
import { getOrganizationActivationSnapshot } from "../../../lib/activation";
import { getCurrentSubscription } from "../../../lib/billing";
import { UpsellOfferStack } from "../../../components/upsell-offer-stack";
import { getOrganizationEntitlements } from "../../../lib/entitlements";
import { getExpansionOffers } from "../../../lib/expansion-engine";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";
import {
  getOrganizationUsageMeteringSnapshot,
  getUsageMetricSnapshot
} from "../../../lib/usage-metering";
import { createAssessmentAction } from "./actions";

export const dynamic = "force-dynamic";

const assessmentListInclude = {
  sections: {
    orderBy: { orderIndex: "asc" }
  }
} satisfies Prisma.AssessmentInclude;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export default async function AssessmentsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const session = await requireCurrentSession({ requireOrganization: true });
  type AssessmentListItem = Prisma.AssessmentGetPayload<{
    include: typeof assessmentListInclude;
  }>;

  let assessments: AssessmentListItem[] = [];
  const params = await searchParams;
  let entitlements:
    | Awaited<ReturnType<typeof getOrganizationEntitlements>>
    | null = null;
  let currentSubscription: Awaited<ReturnType<typeof getCurrentSubscription>> | null = null;
  let assessmentUsage: ReturnType<typeof getUsageMetricSnapshot> = null;
  let activation:
    | Awaited<ReturnType<typeof getOrganizationActivationSnapshot>>
    | null = null;
  let upsellOffers: ReturnType<typeof getExpansionOffers> = [];
  let runtimeCompatibilityWarning = false;

  try {
    [assessments, entitlements, currentSubscription] = await Promise.all([
      prisma.assessment.findMany({
        where: { organizationId: session.organization!.id },
        include: assessmentListInclude,
        orderBy: { createdAt: "desc" }
      }),
      getOrganizationEntitlements(session.organization!.id),
      getCurrentSubscription(session.organization!.id)
    ]);
    const usageMetering = await getOrganizationUsageMeteringSnapshot(
      session.organization!.id,
      entitlements.planCode
    );
    activation = await getOrganizationActivationSnapshot(
      session.organization!.id,
      entitlements
    );
    assessmentUsage = getUsageMetricSnapshot(usageMetering, "activeAssessments");
    upsellOffers = getExpansionOffers({
      placement: "assessments",
      session,
      entitlements,
      usageMetering,
      currentPlanCode: currentSubscription?.plan.code ?? entitlements.planCode,
      hasStripeCustomer: Boolean(currentSubscription?.stripeCustomerId)
    });
  } catch (error) {
    if (!isPrismaRuntimeCompatibilityError(error)) {
      throw error;
    }

    runtimeCompatibilityWarning = true;
    logPrismaRuntimeCompatibilityError("dashboard.assessments", error, {
      organizationId: session.organization!.id
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Assessments</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Active assessment queue
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        {params.error === "limit" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Your current plan reached its active assessment limit. Upgrade
            billing or archive an older assessment to create a new one.
          </div>
        ) : null}

        {runtimeCompatibilityWarning ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Workspace support data is temporarily unavailable in this deployment,
            so billing-aware assessment controls are running in a safe fallback
            mode until the production database schema is aligned.
          </div>
        ) : null}

        {!runtimeCompatibilityWarning &&
        !entitlements?.canCreateAssessment &&
        entitlements?.workspaceMode === "INACTIVE" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            This workspace is inactive. Reactivate billing before creating new
            assessments.
          </div>
        ) : null}

        {params.error === "missing-name" ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            Assessment name is required.
          </div>
        ) : null}

        {params.error === "missing-assessment" ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            That assessment could not be found for this workspace.
          </div>
        ) : null}

        {params.created ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Assessment created successfully.
          </div>
        ) : null}

        {upsellOffers.length > 0 ? (
          <div className="mt-6">
            <UpsellOfferStack
              offers={upsellOffers}
              title="Assessment expansion"
              description="Keep assessment creation moving by surfacing the next clean commercial step only when it matches current workspace usage."
            />
          </div>
        ) : null}

        {!runtimeCompatibilityWarning &&
        activation &&
        !activation.steps.find((step) => step.key === "assessmentStarted")?.completed ? (
          <div className="mt-6">
            <ActivationTipCard
              title="Start the first assessment to unlock the real workflow"
              body="The fastest path to product value starts here. Once the first intake is underway, the workspace has real operating context for findings, reports, and roadmap generation."
              href="/dashboard/assessments"
              label="Create first assessment"
            />
          </div>
        ) : null}

        <div className="mt-8 rounded-[24px] border border-line bg-mist p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">
                Create a new assessment
              </p>
              <p className="mt-2 text-sm text-steel">
                {assessmentUsage?.usageLabel ??
                  (runtimeCompatibilityWarning
                    ? "Assessment capacity details are temporarily unavailable while workspace support tables recover."
                    : `${entitlements?.activeAssessments ?? assessments.length} of ${entitlements?.activeAssessmentsLimit ?? "unlimited"} assessment slots are currently in use.`)}
              </p>
            </div>
            <form
              action={createAssessmentAction}
              className="flex w-full gap-3 md:w-auto"
            >
              <input
                name="name"
                placeholder="Quarterly AI governance review"
                className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none md:w-[340px]"
              />
              <button
                type="submit"
                disabled={runtimeCompatibilityWarning || !entitlements?.canCreateAssessment}
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create
              </button>
            </form>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {assessments.map((assessment) => (
            <Link
              key={assessment.id}
              href={`/dashboard/assessments/${assessment.id}`}
              className="rounded-2xl border border-line bg-mist p-5"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">
                    {assessment.name}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {assessment.sections.length} intake sections configured
                  </p>
                </div>
                <div className="text-sm text-steel">
                  <p>{assessment.status.replaceAll("_", " ")}</p>
                  <p className="mt-1">Updated {formatDate(assessment.updatedAt)}</p>
                </div>
              </div>
            </Link>
          ))}

          {assessments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-steel">
              {runtimeCompatibilityWarning
                ? "Assessment records are not fully available yet. Setup may still be finishing, so this page is showing a safe empty state."
                : "No assessments exist yet. Create the first one to start the product's core workflow."}
            </div>
          ) : null}

          {assessments.length > 0 &&
          !runtimeCompatibilityWarning &&
          activation &&
          !activation.steps.find((step) => step.key === "assessmentSubmitted")?.completed ? (
            <ActivationTipCard
              title="Complete enough intake to queue analysis"
              body="Submitting one real assessment is the bridge between setup work and first measurable value. Once it is queued, the report workflow becomes available."
              href={`/dashboard/assessments/${assessments[0]!.id}`}
              label="Complete intake"
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
