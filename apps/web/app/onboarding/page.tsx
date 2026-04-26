import { getCurrentSession } from "../../lib/auth";
import { prisma } from "@evolve-edge/db";
import { getWorkspaceLaunchProgress } from "../../lib/conversion-funnel";
import { completeOnboardingAction } from "./actions";
import { redirect } from "next/navigation";
import { getRevenuePlanDefinition } from "../../lib/revenue-catalog";
import {
  getCanonicalCommercialPlanDefinition,
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode,
  resolveRevenuePlanCodeForCommercialSelection
} from "../../lib/commercial-catalog";

const FALLBACK_FRAMEWORKS = [
  { id: "soc2", code: "soc2", name: "SOC 2", category: "Security" },
  { id: "hipaa", code: "hipaa", name: "HIPAA", category: "Privacy" },
  { id: "nist-csf", code: "nist-csf", name: "NIST CSF", category: "Security" },
  { id: "gdpr", code: "gdpr", name: "GDPR", category: "Privacy" },
  { id: "pci-dss", code: "pci-dss", name: "PCI DSS", category: "Compliance" }
];

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    plan?: string;
    leadSource?: string;
    leadIntent?: string;
    leadPlanCode?: string;
  }>;
}) {
  const session = await getCurrentSession();
  const frameworks =
    (await prisma.framework.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }]
    })) || [];

  if (session.organization && !session.onboardingRequired) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const selectedRevenuePlanCode =
    getRevenuePlanDefinition(params.plan ?? "")?.code ??
    resolveRevenuePlanCodeForCommercialSelection(params.plan ?? "") ??
    "";
  const selectedCanonicalPlanCode =
    resolveCanonicalPlanCode(params.plan ?? "") ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(selectedRevenuePlanCode);
  const selectedPlan =
    getCanonicalCommercialPlanDefinition(selectedCanonicalPlanCode) ??
    (selectedRevenuePlanCode ? getRevenuePlanDefinition(selectedRevenuePlanCode) : null);
  const selectedPlanName =
    getCanonicalCommercialPlanDefinition(selectedCanonicalPlanCode)?.displayName ??
    getRevenuePlanDefinition(selectedRevenuePlanCode)?.name ??
    null;
  const launchProgress = getWorkspaceLaunchProgress({
    selectedPlanName,
    firstAssessmentName: "Initial AI Governance Assessment"
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-10">
      <div className="w-full rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-panel backdrop-blur md:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
          Customer Onboarding
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">
          Create your first Evolve Edge workspace
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-steel">
          We have your account identity. Finish workspace setup so assessments,
          billing, reports, and roadmap workflows attach to a real organization.
        </p>
        <div className="mt-6 rounded-2xl border border-line bg-mist p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">Launch progress</p>
              <p className="mt-2 text-sm text-steel">{launchProgress.summary}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold text-ink">
                {launchProgress.progressPercent}%
              </p>
              <p className="text-xs uppercase tracking-[0.18em] text-steel">
                guided setup
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-white">
            <div
              className="h-2 rounded-full bg-accent transition-all"
              style={{ width: `${launchProgress.progressPercent}%` }}
            />
          </div>
        </div>
        {selectedPlan ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Your pricing selection will start this workspace on <strong>{selectedPlanName}</strong> after onboarding so your first assessment, reporting flow, and executive roadmap guidance match the selected commercial path.
          </div>
        ) : null}

        {params.error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            Account name is required to create your workspace.
          </div>
        ) : null}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <form action={completeOnboardingAction} className="grid gap-5">
          <input type="hidden" name="planCode" value={selectedRevenuePlanCode} />
          <input type="hidden" name="leadSource" value={params.leadSource ?? ""} />
          <input type="hidden" name="leadIntent" value={params.leadIntent ?? ""} />
          <input
            type="hidden"
            name="leadPlanCode"
            value={params.leadPlanCode ?? selectedCanonicalPlanCode ?? selectedRevenuePlanCode}
          />
          <input type="hidden" name="sourcePath" value="/onboarding" />
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Company name</span>
              <input
                name="accountName"
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink">Industry</span>
              <input
                name="industry"
                defaultValue="AI Services"
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              />
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Company size</span>
              <select
                name="sizeBand"
                defaultValue="11-50"
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              >
                <option value="1-10">1-10</option>
                <option value="11-50">11-50</option>
                <option value="51-200">51-200</option>
                <option value="201-1000">201-1000</option>
                <option value="1000+">1000+</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink">Country</span>
              <input
                name="country"
                defaultValue="US"
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-ink">
              AI usage summary
            </span>
            <textarea
              name="aiUsageSummary"
              rows={4}
              defaultValue="Describe the AI systems, copilots, automations, and business workflows your team currently uses."
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            />
          </label>

          <fieldset className="block">
            <legend className="text-sm font-medium text-ink">
              Priority frameworks
            </legend>
            <p className="mt-2 text-sm text-steel">
              Choose the frameworks that should shape the first assessment and
              reporting workflow.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(frameworks.length > 0 ? frameworks : FALLBACK_FRAMEWORKS).map((framework) => (
                <label
                  key={framework.id}
                  className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4"
                >
                  <input
                    type="checkbox"
                    name="frameworkCodes"
                    value={framework.code}
                    defaultChecked={["soc2", "hipaa", "nist-csf"].includes(
                      framework.code
                    )}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      {framework.name}
                    </span>
                    <span className="mt-1 block text-sm text-steel">
                      {framework.category}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-ink">
              First assessment name
            </span>
            <input
              name="firstAssessmentName"
              defaultValue="Initial AI Governance Assessment"
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            />
            <p className="mt-2 text-sm text-steel">
              We&apos;ll create this draft assessment automatically so the
              workspace is immediately actionable after setup.
            </p>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">
              Set a permanent owner password
            </span>
            <input
              name="password"
              type="password"
              minLength={10}
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            />
            <p className="mt-2 text-sm text-steel">
              If you leave this blank, the bootstrap password remains active
              until you update credentials later.
            </p>
          </label>

          <button
            type="submit"
            className="mt-2 inline-flex w-fit rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white"
          >
            Create Workspace
          </button>
          </form>

          <aside className="rounded-[28px] border border-line bg-mist p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              Activation path
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">
              First value = first executive report
            </h2>
            <p className="mt-3 text-sm leading-7 text-steel">
              This onboarding flow is designed to move the workspace quickly from setup into one real assessment and then into the first stakeholder-ready report.
            </p>

            <div className="mt-6 space-y-3">
              {launchProgress.steps.map((step, index) => (
                <div key={step.key} className="rounded-2xl bg-white p-4">
                  <p className="text-sm font-semibold text-ink">
                    {index + 1}. {step.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-steel">
                    {step.detail}
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    {step.tone === "completed"
                      ? "Ready"
                      : step.tone === "current"
                        ? "Current step"
                        : "Next"}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
              {selectedPlan
                ? `Your selected ${selectedPlanName} plan will carry into the workspace, and the post-onboarding guidance will adapt to that plan's report and assessment access.`
                : "Post-onboarding guidance will adapt to the live plan state, usage state, and any existing assessments or reports already in the workspace."}
            </div>
            <div className="mt-4 rounded-2xl border border-line bg-white p-4 text-sm text-steel">
              Setup is intentionally short so operators can move from signup into a real assessment quickly. Intake drafts save inside the assessment workflow after the workspace is created, and the workspace can then expand into deeper reporting, roadmap, and recurring oversight based on fit.
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
