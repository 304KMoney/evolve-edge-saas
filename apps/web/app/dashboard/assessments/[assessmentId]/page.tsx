import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@evolve-edge/db";
import { requireCurrentSession } from "../../../../lib/auth";
import { getAssessmentIntakeProgress } from "../../../../lib/conversion-funnel";
import {
  saveAssessmentSectionAction,
  submitAssessmentAction
} from "../actions";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function getSectionNotes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const notes = (value as Record<string, unknown>).notes;
  return typeof notes === "string" ? notes : "";
}

export default async function AssessmentDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<{ created?: string; saved?: string; submitted?: string; error?: string }>;
}) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const [{ assessmentId }, query] = await Promise.all([params, searchParams]);

  const assessment = await prisma.assessment.findFirst({
    where: {
      id: assessmentId,
      organizationId: session.organization!.id
    },
    include: {
      sections: {
        orderBy: { orderIndex: "asc" }
      },
      analysisJobs: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!assessment) {
    notFound();
  }

  const intakeProgress = getAssessmentIntakeProgress(assessment.sections);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Assessment Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              {assessment.name}
            </h1>
            <p className="mt-3 text-sm text-steel">
              Status: {assessment.status.replaceAll("_", " ")} · Updated{" "}
              {formatDate(assessment.updatedAt)}
            </p>
            <p className="mt-2 text-sm text-steel">{intakeProgress.helperText}</p>
          </div>
          <Link
            href="/dashboard/assessments"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to assessments
          </Link>
        </div>

        {query.created ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Assessment created. Complete the intake below to prepare it for analysis.
          </div>
        ) : null}

        {query.saved ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Intake section saved successfully. Sections with notes now count as an active draft, so this assessment can move toward analysis once the team is ready.
          </div>
        ) : null}

        {query.submitted ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Assessment submitted. The app queued analysis for this assessment and the downstream workflow can now generate findings and reports.
          </div>
        ) : null}

        {query.error === "incomplete" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Save at least one intake section as in progress, in review, or completed before submitting the assessment.
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Completion</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {intakeProgress.progressPercent}%
            </p>
            <p className="mt-2 text-sm text-steel">
              {intakeProgress.completedSections} of {intakeProgress.totalSections} sections complete
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Draft state</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {assessment.submittedAt ? "Submitted" : intakeProgress.statusLabel}
            </p>
            <p className="mt-2 text-sm text-steel">
              {assessment.submittedAt
                ? `Submitted ${formatDate(assessment.submittedAt)}`
                : "Section saves persist so the intake can be resumed later without losing context."}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Next best action</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {assessment.analysisJobs[0]?.status ??
                intakeProgress.nextSectionTitle ??
                "Ready to submit"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {assessment.analysisJobs[0]
                ? "The downstream analysis pipeline can now pick this up."
                : intakeProgress.nextSectionTitle
                  ? `Resume with ${intakeProgress.nextSectionTitle}.`
                  : "No analysis job has been queued yet."}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Resumable intake draft</p>
              <p className="mt-2 text-sm text-steel">
                Each section saves independently so operators can gather information across multiple sessions without restarting the assessment.
              </p>
            </div>
            <div className="rounded-full bg-mist px-4 py-2 text-sm font-medium text-ink">
              {assessment.submittedAt
                ? "Queued for analysis"
                : intakeProgress.nextSectionTitle
                  ? `Resume: ${intakeProgress.nextSectionTitle}`
                  : "Ready for analysis"}
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {assessment.sections.map((section) => (
            <form
              key={section.id}
              action={saveAssessmentSectionAction}
              className="rounded-2xl border border-line bg-mist p-5"
            >
              <input type="hidden" name="assessmentId" value={assessment.id} />
              <input type="hidden" name="sectionId" value={section.id} />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">{section.title}</p>
                  <p className="mt-2 text-sm text-steel">
                    Section key: {section.key.replaceAll("-", " ")}
                  </p>
                </div>
                <select
                  name="status"
                  defaultValue={section.status}
                  className="rounded-full border border-line bg-white px-4 py-2 text-sm text-ink"
                >
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="in_review">In review</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <textarea
                name="notes"
                defaultValue={getSectionNotes(section.responses)}
                rows={5}
                placeholder="Capture the current state, controls, owners, and evidence for this intake section."
                className="mt-4 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-steel">
                  {section.completedAt
                    ? `Completed ${formatDate(section.completedAt)}`
                    : "Save progress as the intake evolves. The draft remains available for later follow-up."}
                </p>
                <button
                  type="submit"
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                >
                  Save section
                </button>
              </div>
            </form>
          ))}
        </div>

        <div className="mt-8 rounded-[24px] border border-line bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-semibold text-ink">Submit for analysis</p>
              <p className="mt-2 text-sm text-steel">
                When the intake is ready, queue this assessment for analysis so reports and roadmap outputs can be generated later.
              </p>
              {!intakeProgress.isReadyForSubmission ? (
                <p className="mt-2 text-sm text-warning">
                  Save at least one section as in progress or completed before this assessment can move into analysis.
                </p>
              ) : null}
            </div>
            <form action={submitAssessmentAction}>
              <input type="hidden" name="assessmentId" value={assessment.id} />
              <button
                type="submit"
                disabled={!intakeProgress.isReadyForSubmission}
                className="rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Queue analysis
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
