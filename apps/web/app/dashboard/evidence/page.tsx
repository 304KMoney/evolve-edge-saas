import Link from "next/link";
import {
  EvidenceCategory,
  EvidenceProcessingStatus,
  EvidenceReviewStatus
} from "@evolve-edge/db";
import { ProductSurfacePanel } from "../../../components/product-surface-panel";
import {
  getSessionAuthorizationContext,
  requireOrganizationPermission
} from "../../../lib/auth";
import {
  canManageInventoryWithContext,
  hasPermission
} from "../../../lib/authorization";
import { getOrganizationEntitlements } from "../../../lib/entitlements";
import { buildProductSurfaceModel } from "../../../lib/product-surface";
import { formatBytes, getOrganizationUsageMeteringSnapshot } from "../../../lib/usage-metering";
import { getUsageRemaining } from "../../../lib/usage-quotas";
import { getCurrentSubscription } from "../../../lib/billing";
import {
  createManualEvidenceNoteAction,
  uploadEvidenceAction
} from "./actions";
import { getEvidenceLibrarySnapshot } from "../../../lib/evidence";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function EvidencePage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    reviewStatus?: string;
    processingStatus?: string;
    engagementProgramId?: string;
    frameworkId?: string;
    from?: string;
    to?: string;
    uploaded?: string;
    error?: string;
  }>;
}) {
  const session = await requireOrganizationPermission("evidence.view");
  const params = await searchParams;
  const authz = getSessionAuthorizationContext(session);
  const canManageEvidence = hasPermission(authz, "evidence.manage");
  const [snapshot, entitlements, subscription, evidenceUploadsQuota, documentsProcessedQuota] =
    await Promise.all([
      getEvidenceLibrarySnapshot(session.organization!.id, params),
      getOrganizationEntitlements(session.organization!.id),
      getCurrentSubscription(session.organization!.id),
      getUsageRemaining(session.organization!.id, "evidence_uploads"),
      getUsageRemaining(session.organization!.id, "documents_processed")
    ]);
  const usage = await getOrganizationUsageMeteringSnapshot(
    session.organization!.id,
    subscription?.planCodeSnapshot ?? subscription?.plan?.code ?? entitlements.planCode
  );
  const storageMetric = usage.metrics.find((metric) => metric.key === "storageBytes");
  const productSurface = buildProductSurfaceModel({
    area: "evidence",
    entitlements,
    usageMetrics: storageMetric ? [storageMetric] : [],
    quotas: [
      {
        key: "evidence_uploads",
        label: "Monthly evidence uploads",
        snapshot: evidenceUploadsQuota
      },
      {
        key: "documents_processed",
        label: "Monthly documents processed",
        snapshot: documentsProcessedQuota
      }
    ]
  });

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Evidence Library</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Audit evidence and supporting artifacts
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Upload, classify, review, and retrieve audit evidence across active
              assessments, engagements, framework scope, and monitoring follow-up.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist px-5 py-4">
            <p className="text-sm font-medium text-steel">Storage tracked</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {storageMetric ? storageMetric.usageLabel : "Not available"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {storageMetric?.helperText ??
                "Evidence storage usage appears here once files are uploaded."}
            </p>
          </div>
        </div>

        {params.uploaded === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Evidence uploaded successfully.
          </div>
        ) : null}
        {params.error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            {params.error}
          </div>
        ) : null}

        <div className="mt-8">
          <ProductSurfacePanel
            model={productSurface}
            secondaryNote={
              !canManageEvidence && entitlements.featureAccess["evidence.manage"]
                ? "This account can view evidence, but your current workspace role does not include upload or review controls."
                : null
            }
          />
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Evidence items</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{snapshot.totalCount}</p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Needs review</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.statusCounts.find((row) => row.reviewStatus === "NEEDS_REVIEW")?._count._all ??
                0}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Approved</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.statusCounts.find((row) => row.reviewStatus === "APPROVED")?._count._all ??
                0}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Tracked storage</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {storageMetric ? formatBytes(storageMetric.used) : "0 B"}
            </p>
          </article>
        </section>

        <form className="mt-8 grid gap-3 rounded-2xl border border-line bg-mist p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_180px_180px_170px_170px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search title, filename, or summary"
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          />
          <select
            name="category"
            defaultValue={params.category ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All categories</option>
            {Object.values(EvidenceCategory).map((category) => (
              <option key={category} value={category}>
                {formatStatus(category)}
              </option>
            ))}
          </select>
          <select
            name="reviewStatus"
            defaultValue={params.reviewStatus ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All review states</option>
            {Object.values(EvidenceReviewStatus).map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
          <select
            name="processingStatus"
            defaultValue={params.processingStatus ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All processing states</option>
            {Object.values(EvidenceProcessingStatus).map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
          <select
            name="engagementProgramId"
            defaultValue={params.engagementProgramId ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All engagements</option>
            {snapshot.engagements.map((engagement) => (
              <option key={engagement.id} value={engagement.id}>
                {engagement.name}
              </option>
            ))}
          </select>
          <select
            name="frameworkId"
            defaultValue={params.frameworkId ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All frameworks</option>
            {snapshot.frameworks.map((framework) => (
              <option key={framework.id} value={framework.id}>
                {framework.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          />
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            Apply
          </button>
        </form>

        {canManageEvidence ? (
          <section className="mt-8 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-3xl border border-line bg-white p-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-steel">Upload evidence</p>
              <h2 className="text-2xl font-semibold text-ink">
                Add auditable supporting artifacts
              </h2>
              <p className="text-sm leading-6 text-steel">
                Upload policy files, screenshots, control exports, questionnaires,
                and other supporting documents. Internal analyst notes stay
                separated from customer-visible summary metadata.
              </p>
            </div>
            <form
              action={uploadEvidenceAction}
              className="mt-6 grid gap-4 lg:grid-cols-2"
            >
              <label className="space-y-2 text-sm text-steel">
                <span>Evidence file</span>
                <input
                  type="file"
                  name="file"
                  required
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink"
                />
              </label>
              <label className="space-y-2 text-sm text-steel">
                <span>Evidence title</span>
                <input
                  type="text"
                  name="title"
                  placeholder="Quarterly access review export"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
              </label>
              <label className="space-y-2 text-sm text-steel">
                <span>Category</span>
                <select
                  name="category"
                  defaultValue={EvidenceCategory.OTHER}
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                >
                  {Object.values(EvidenceCategory).map((category) => (
                    <option key={category} value={category}>
                      {formatStatus(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-steel">
                <span>Engagement</span>
                <select
                  name="engagementProgramId"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                >
                  <option value="">No engagement link yet</option>
                  {snapshot.engagements.map((engagement) => (
                    <option key={engagement.id} value={engagement.id}>
                      {engagement.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-steel">
                <span>Assessment</span>
                <select
                  name="assessmentId"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                >
                  <option value="">No assessment link yet</option>
                  {snapshot.assessments.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-steel">
                <span>Finding</span>
                <select
                  name="findingId"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                >
                  <option value="">No finding link yet</option>
                  {snapshot.findings.map((finding) => (
                    <option key={finding.id} value={finding.id}>
                      {finding.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-steel">
                <span>Framework</span>
                <select
                  name="frameworkId"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                >
                  <option value="">No framework link yet</option>
                  {snapshot.frameworks.map((framework) => (
                    <option key={framework.id} value={framework.id}>
                      {framework.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-steel">
                <span>Control code</span>
                <input
                  type="text"
                  name="frameworkControlCode"
                  placeholder="Optional, e.g. CC6.1"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
              </label>
              <label className="space-y-2 text-sm text-steel lg:col-span-2">
                <span>Customer-visible summary</span>
                <textarea
                  name="visibleSummary"
                  rows={3}
                  placeholder="Briefly describe what this artifact proves or supports."
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
              </label>
              <label className="space-y-2 text-sm text-steel">
                <span>Tags</span>
                <input
                  type="text"
                  name="tags"
                  placeholder="access-review, quarterly, identity"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
              </label>
              <label className="space-y-2 text-sm text-steel">
                <span>Internal analyst note</span>
                <input
                  type="text"
                  name="analystNote"
                  placeholder="Initial provenance or reviewer note"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
              </label>
              <div className="lg:col-span-2 flex items-center justify-between gap-4 rounded-2xl bg-mist p-4 text-sm text-steel">
                <p>
                  Supported formats include PDF, Word, Excel, CSV, JSON, text,
                  markdown, and common screenshot images.
                </p>
                <button
                  type="submit"
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                >
                  Upload evidence
                </button>
              </div>
            </form>
            </article>

            <article className="rounded-3xl border border-line bg-white p-6">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-steel">Manual note evidence</p>
                <h2 className="text-2xl font-semibold text-ink">
                  Capture analyst commentary
                </h2>
                <p className="text-sm leading-6 text-steel">
                  Use note evidence when the supporting artifact is analyst
                  commentary, a customer interview summary, or another structured
                  written observation that should persist alongside formal files.
                </p>
              </div>
              <form action={createManualEvidenceNoteAction} className="mt-6 space-y-4">
                <input
                  type="text"
                  name="title"
                  placeholder="Identity access review walk-through notes"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <textarea
                  name="body"
                  rows={8}
                  placeholder="Document the observation, provenance, and why it matters for the audit."
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <input
                  type="text"
                  name="visibleSummary"
                  placeholder="Optional customer-visible summary"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <input
                  type="text"
                  name="tags"
                  placeholder="notes, interview, access-review"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <select
                  name="frameworkId"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                >
                  <option value="">No framework link yet</option>
                  {snapshot.frameworks.map((framework) => (
                    <option key={framework.id} value={framework.id}>
                      {framework.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  name="frameworkControlCode"
                  placeholder="Optional control code, e.g. 164.312(a)(1)"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <button
                  type="submit"
                  className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Save note as evidence
                </button>
              </form>
            </article>
          </section>
        ) : null}

        <section className="mt-8 rounded-3xl border border-line bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-steel">Library</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                Evidence inventory
              </h2>
            </div>
            <p className="text-sm text-steel">
              {canManageInventoryWithContext(authz)
                ? "Review upload provenance, link evidence to active work, and keep artifacts organized over time."
                : "Browse evidence and download approved or in-review artifacts for current workspace workstreams."}
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {snapshot.items.length > 0 ? (
              snapshot.items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-line bg-mist p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                          {formatStatus(item.category)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                          {formatStatus(item.reviewStatus)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                          {formatStatus(item.processingStatus)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-ink">
                        {item.title || item.fileName}
                      </h3>
                      <p className="mt-2 text-sm text-steel">
                        {item.fileName} · {item.mimeType ?? "Unknown type"} ·{" "}
                        {item.sizeBytes ? formatBytes(item.sizeBytes) : "Size unavailable"}
                      </p>
                      <p className="mt-2 text-sm text-steel">
                        Uploaded {formatDate(item.uploadedAt)} by{" "}
                        {item.uploadedBy
                          ? [item.uploadedBy.firstName, item.uploadedBy.lastName]
                              .filter(Boolean)
                              .join(" ") || item.uploadedBy.email
                          : "Workspace user"}
                      </p>
                      {item.visibleSummary ? (
                        <p className="mt-3 text-sm leading-6 text-steel">
                          {item.visibleSummary}
                        </p>
                      ) : null}
                      <p className="mt-3 text-sm text-steel">
                        Engagement: {item.engagementProgram?.name ?? "Not linked"} ·
                        Assessment: {item.assessment?.name ?? "Not linked"} ·
                        Framework: {item.framework?.name ?? "Not linked"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <a
                        href={`/dashboard/evidence/${item.id}`}
                        className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                      >
                        Open detail
                      </a>
                      <a
                        href={`/api/evidence/${item.id}/download`}
                        className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                      >
                        Download current
                      </a>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-steel">
                No evidence matched the current filters yet. Upload the first
                artifact to begin building the audit evidence library.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
