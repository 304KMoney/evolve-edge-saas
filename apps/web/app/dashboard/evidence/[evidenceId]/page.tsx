import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import {
  EvidenceProcessingStatus,
  EvidenceReviewStatus
} from "@evolve-edge/db";
import {
  getSessionAuthorizationContext,
  requireOrganizationPermission
} from "../../../../lib/auth";
import { hasPermission } from "../../../../lib/authorization";
import { formatBytes } from "../../../../lib/usage-metering";
import { getEvidenceDetailSnapshot } from "../../../../lib/evidence";
import {
  addEvidenceAnnotationAction,
  replaceEvidenceVersionAction,
  updateEvidenceProcessingStatusAction,
  updateEvidenceReviewStatusAction
} from "../actions";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ") || input.email || "Workspace user";
}

export default async function EvidenceDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ evidenceId: string }>;
  searchParams: Promise<{
    reviewUpdated?: string;
    processingUpdated?: string;
    versionUploaded?: string;
    annotationAdded?: string;
    error?: string;
  }>;
}) {
  const session = await requireOrganizationPermission("evidence.view");
  const authz = getSessionAuthorizationContext(session);
  const canManageEvidence = hasPermission(authz, "evidence.manage");
  const { evidenceId } = await params;
  const query = await searchParams;
  const evidence = await getEvidenceDetailSnapshot(session.organization!.id, evidenceId);

  if (!evidence) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Evidence Detail</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              {evidence.title || evidence.fileName}
            </h1>
            <p className="mt-3 text-sm text-steel">
              {evidence.fileName} · {formatStatus(evidence.category)} ·{" "}
              {formatStatus(evidence.reviewStatus)} · {formatStatus(evidence.processingStatus)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/evidence/${evidence.id}/download`}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
            >
              Download current
            </a>
            <Link
              href={"/dashboard/evidence" as Route}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
            >
              Back to library
            </Link>
          </div>
        </div>

        {query.reviewUpdated === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Evidence review status updated.
          </div>
        ) : null}
        {query.processingUpdated === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Evidence processing status updated.
          </div>
        ) : null}
        {query.versionUploaded === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            A new evidence version was uploaded successfully.
          </div>
        ) : null}
        {query.annotationAdded === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Internal annotation added.
          </div>
        ) : null}
        {query.error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            {query.error}
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Uploaded</p>
            <p className="mt-2 text-lg font-semibold text-ink">{formatDate(evidence.uploadedAt)}</p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Current file size</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {evidence.sizeBytes ? formatBytes(evidence.sizeBytes) : "Unknown"}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Uploaded by</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {evidence.uploadedBy ? getDisplayName(evidence.uploadedBy) : "Workspace user"}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Current version</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              v{evidence.versions[0]?.versionNumber ?? 1}
            </p>
          </article>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Metadata and linkage</p>
            <div className="mt-4 space-y-2 text-sm text-steel">
              <p>Source: {formatStatus(evidence.source)}</p>
              <p>MIME type: {evidence.mimeType ?? "Unknown"}</p>
              <p>SHA-256: {evidence.sha256Hash ?? "Unavailable"}</p>
              <p>Engagement: {evidence.engagementProgram?.name ?? "Not linked"}</p>
              <p>Assessment: {evidence.assessment?.name ?? "Not linked"}</p>
              <p>Report: {evidence.report?.title ?? "Not linked"}</p>
              <p>Finding: {evidence.finding?.title ?? evidence.monitoringFinding?.title ?? "Not linked"}</p>
              <p>
                Framework:{" "}
                {evidence.framework?.name ??
                  evidence.frameworkControl?.framework.name ??
                  "Not linked"}
              </p>
              <p>
                Control:{" "}
                {evidence.frameworkControl
                  ? `${evidence.frameworkControl.code} · ${evidence.frameworkControl.title}`
                  : "Not linked"}
              </p>
              <p>
                Duplicate of:{" "}
                {evidence.duplicateOfEvidence ? evidence.duplicateOfEvidence.fileName : "No"}
              </p>
            </div>
            {evidence.visibleSummary ? (
              <div className="mt-5 rounded-2xl bg-mist p-4">
                <p className="text-sm font-medium text-steel">Customer-visible summary</p>
                <p className="mt-2 text-sm leading-6 text-steel">{evidence.visibleSummary}</p>
              </div>
            ) : null}
          </article>

          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Processing and review</p>
            <div className="mt-4 space-y-2 text-sm text-steel">
              <p>Processing: {formatStatus(evidence.processingStatus)}</p>
              <p>Review: {formatStatus(evidence.reviewStatus)}</p>
              <p>Parsed at: {formatDate(evidence.parsedAt)}</p>
              <p>Reviewed at: {formatDate(evidence.reviewedAt)}</p>
              <p>
                Reviewed by:{" "}
                {evidence.reviewedBy ? getDisplayName(evidence.reviewedBy) : "Not reviewed"}
              </p>
            </div>
            {canManageEvidence ? (
              <div className="mt-5 space-y-4">
                <form action={updateEvidenceProcessingStatusAction} className="space-y-3">
                  <input type="hidden" name="evidenceFileId" value={evidence.id} />
                  <select
                    name="processingStatus"
                    defaultValue={evidence.processingStatus}
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                  >
                    {Object.values(EvidenceProcessingStatus).map((status) => (
                      <option key={status} value={status}>
                        {formatStatus(status)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    name="parserVersion"
                    defaultValue={evidence.parserVersion ?? ""}
                    placeholder="Parser version or extractor label"
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                  />
                  <textarea
                    name="note"
                    rows={2}
                    placeholder="Internal processing note"
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                  >
                    Update processing status
                  </button>
                </form>

                <form action={updateEvidenceReviewStatusAction} className="space-y-3">
                  <input type="hidden" name="evidenceFileId" value={evidence.id} />
                  <select
                    name="reviewStatus"
                    defaultValue={evidence.reviewStatus}
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                  >
                    {Object.values(EvidenceReviewStatus).map((status) => (
                      <option key={status} value={status}>
                        {formatStatus(status)}
                      </option>
                    ))}
                  </select>
                  <textarea
                    name="note"
                    rows={2}
                    placeholder="Internal review note"
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                  >
                    Update review status
                  </button>
                </form>
              </div>
            ) : null}
          </article>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <article className="rounded-2xl border border-line bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-steel">Version history</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">
                  Stored revisions
                </h2>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {evidence.versions.map((version) => (
                <div key={version.id} className="rounded-2xl bg-mist p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        Version {version.versionNumber}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        {version.fileName} ·{" "}
                        {version.sizeBytes ? formatBytes(version.sizeBytes) : "Unknown size"}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        Uploaded {formatDate(version.createdAt)} by{" "}
                        {version.createdBy ? getDisplayName(version.createdBy) : "Workspace user"}
                      </p>
                    </div>
                    <a
                      href={`/api/evidence/${evidence.id}/download?versionId=${version.id}`}
                      className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {canManageEvidence ? (
              <form action={replaceEvidenceVersionAction} className="mt-6 space-y-3">
                <input type="hidden" name="evidenceFileId" value={evidence.id} />
                <input type="hidden" name="category" value={evidence.category} />
                <input type="hidden" name="title" value={evidence.title ?? ""} />
                <input
                  type="hidden"
                  name="visibleSummary"
                  value={evidence.visibleSummary ?? ""}
                />
                <input
                  type="hidden"
                  name="tags"
                  value={Array.isArray(evidence.tags) ? evidence.tags.join(", ") : ""}
                />
                <label className="space-y-2 text-sm text-steel">
                  <span>Upload a new version</span>
                  <input
                    type="file"
                    name="file"
                    required
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink"
                  />
                </label>
                <textarea
                  name="analystNote"
                  rows={2}
                  placeholder="Why this version replaces the previous upload"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <button
                  type="submit"
                  className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Upload new version
                </button>
              </form>
            ) : null}
          </article>

          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Internal annotations</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Reviewer notes</h2>
            <div className="mt-5 space-y-4">
              {evidence.annotations.filter((annotation) => annotation.visibility === "INTERNAL").length > 0 ? (
                evidence.annotations
                  .filter((annotation) => annotation.visibility === "INTERNAL")
                  .map((annotation) => (
                    <div key={annotation.id} className="rounded-2xl bg-mist p-4">
                      <p className="text-sm leading-6 text-steel">{annotation.body}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-steel">
                        {annotation.author ? getDisplayName(annotation.author) : "Workspace user"} ·{" "}
                        {formatDate(annotation.createdAt)}
                      </p>
                    </div>
                  ))
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                  No internal annotations have been added yet.
                </div>
              )}
            </div>

            {canManageEvidence ? (
              <form action={addEvidenceAnnotationAction} className="mt-6 space-y-3">
                <input type="hidden" name="evidenceFileId" value={evidence.id} />
                <textarea
                  name="body"
                  rows={3}
                  placeholder="Add an internal-only analyst annotation."
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <button
                  type="submit"
                  className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Add internal note
                </button>
              </form>
            ) : null}
          </article>
        </section>
      </div>
    </main>
  );
}
