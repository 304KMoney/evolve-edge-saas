"use server";

import {
  EvidenceCategory,
  EvidenceProcessingStatus,
  EvidenceReviewStatus,
  EvidenceSource
} from "@evolve-edge/db";
import { redirect } from "next/navigation";
import {
  getServerAuditRequestContext
} from "../../../lib/audit";
import { requireOrganizationPermission } from "../../../lib/auth";
import { requireEntitlement } from "../../../lib/entitlements";
import {
  addEvidenceAnnotation,
  createEvidenceUpload,
  parseEvidenceTags,
  updateEvidenceProcessingState,
  updateEvidenceReviewState
} from "../../../lib/evidence";
import { findFrameworkControlIdByCode } from "../../../lib/framework-intelligence";

function parseEvidenceCategory(value: string): EvidenceCategory {
  if (Object.values(EvidenceCategory).includes(value as EvidenceCategory)) {
    return value as EvidenceCategory;
  }

  return EvidenceCategory.OTHER;
}

function parseEvidenceReviewStatus(value: string): EvidenceReviewStatus {
  if (Object.values(EvidenceReviewStatus).includes(value as EvidenceReviewStatus)) {
    return value as EvidenceReviewStatus;
  }

  throw new Error("Invalid evidence review status.");
}

function parseEvidenceProcessingStatus(value: string): EvidenceProcessingStatus {
  if (
    Object.values(EvidenceProcessingStatus).includes(
      value as EvidenceProcessingStatus
    )
  ) {
    return value as EvidenceProcessingStatus;
  }

  throw new Error("Invalid evidence processing status.");
}

export async function uploadEvidenceAction(formData: FormData) {
  const session = await requireOrganizationPermission("evidence.manage");
  await requireEntitlement(session.organization!.id, "uploads.manage", {
    failureRedirect: "/dashboard/evidence?error=plan"
  });
  const file = formData.get("file");

  if (!(file instanceof File) || file.size <= 0) {
    redirect("/dashboard/evidence?error=missing-file" as never);
  }

  const frameworkId = String(formData.get("frameworkId") ?? "").trim() || null;
  const frameworkControlCode =
    String(formData.get("frameworkControlCode") ?? "").trim() || null;

  try {
    const frameworkControlId =
      frameworkId && frameworkControlCode
        ? await findFrameworkControlIdByCode({
            frameworkId,
            controlCode: frameworkControlCode
          })
        : String(formData.get("frameworkControlId") ?? "").trim() || null;

    await createEvidenceUpload({
      organizationId: session.organization!.id,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      file,
      title: String(formData.get("title") ?? "").trim() || null,
      visibleSummary: String(formData.get("visibleSummary") ?? "").trim() || null,
      category: parseEvidenceCategory(String(formData.get("category") ?? "OTHER")),
      tags: parseEvidenceTags(String(formData.get("tags") ?? "")),
      engagementProgramId:
        String(formData.get("engagementProgramId") ?? "").trim() || null,
      assessmentId: String(formData.get("assessmentId") ?? "").trim() || null,
      findingId: String(formData.get("findingId") ?? "").trim() || null,
      frameworkId,
      frameworkControlId,
      analystNote: String(formData.get("analystNote") ?? "").trim() || null,
      requestContext: await getServerAuditRequestContext()
    });
  } catch (error) {
    redirect(
      `/dashboard/evidence?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Upload failed."
      )}` as never
    );
  }

  redirect("/dashboard/evidence?uploaded=1" as never);
}

export async function createManualEvidenceNoteAction(formData: FormData) {
  const session = await requireOrganizationPermission("evidence.manage");
  await requireEntitlement(session.organization!.id, "evidence.manage", {
    failureRedirect: "/dashboard/evidence?error=plan"
  });
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!title || !body) {
    redirect(
      "/dashboard/evidence?error=Manual%20evidence%20notes%20require%20a%20title%20and%20body." as never
    );
  }

  const file = new File([body], `${title}.md`, {
    type: "text/markdown"
  });

  const frameworkId = String(formData.get("frameworkId") ?? "").trim() || null;
  const frameworkControlCode =
    String(formData.get("frameworkControlCode") ?? "").trim() || null;

  try {
    const frameworkControlId =
      frameworkId && frameworkControlCode
        ? await findFrameworkControlIdByCode({
            frameworkId,
            controlCode: frameworkControlCode
          })
        : null;

    await createEvidenceUpload({
      organizationId: session.organization!.id,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      file,
      source: EvidenceSource.MANUAL_ENTRY,
      category: EvidenceCategory.ANALYST_NOTE,
      title,
      visibleSummary: String(formData.get("visibleSummary") ?? "").trim() || null,
      tags: parseEvidenceTags(String(formData.get("tags") ?? "")),
      engagementProgramId:
        String(formData.get("engagementProgramId") ?? "").trim() || null,
      assessmentId: String(formData.get("assessmentId") ?? "").trim() || null,
      findingId: String(formData.get("findingId") ?? "").trim() || null,
      frameworkId,
      frameworkControlId,
      analystNote: body,
      requestContext: await getServerAuditRequestContext()
    });
  } catch (error) {
    redirect(
      `/dashboard/evidence?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Manual note upload failed."
      )}` as never
    );
  }

  redirect("/dashboard/evidence?uploaded=1" as never);
}

export async function replaceEvidenceVersionAction(formData: FormData) {
  const session = await requireOrganizationPermission("evidence.manage");
  await requireEntitlement(session.organization!.id, "uploads.manage", {
    failureRedirect: "/dashboard/evidence?error=plan"
  });
  const evidenceFileId = String(formData.get("evidenceFileId") ?? "");
  const file = formData.get("file");

  if (!evidenceFileId || !(file instanceof File) || file.size <= 0) {
    redirect(`/dashboard/evidence/${evidenceFileId || ""}?error=missing-file` as never);
  }

  try {
    await createEvidenceUpload({
      organizationId: session.organization!.id,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      replaceEvidenceId: evidenceFileId,
      file,
      title: String(formData.get("title") ?? "").trim() || null,
      visibleSummary: String(formData.get("visibleSummary") ?? "").trim() || null,
      category: parseEvidenceCategory(String(formData.get("category") ?? "OTHER")),
      tags: parseEvidenceTags(String(formData.get("tags") ?? "")),
      analystNote: String(formData.get("analystNote") ?? "").trim() || null,
      requestContext: await getServerAuditRequestContext()
    });
  } catch (error) {
    redirect(
      `/dashboard/evidence/${evidenceFileId}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Version upload failed."
      )}` as never
    );
  }

  redirect(`/dashboard/evidence/${evidenceFileId}?versionUploaded=1` as never);
}

export async function updateEvidenceReviewStatusAction(formData: FormData) {
  const session = await requireOrganizationPermission("evidence.manage");
  await requireEntitlement(session.organization!.id, "evidence.manage", {
    failureRedirect: "/dashboard/evidence?error=plan"
  });
  const evidenceFileId = String(formData.get("evidenceFileId") ?? "");

  if (!evidenceFileId) {
    redirect("/dashboard/evidence?error=missing-evidence" as never);
  }

  try {
    await updateEvidenceReviewState({
      organizationId: session.organization!.id,
      evidenceFileId,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      reviewStatus: parseEvidenceReviewStatus(
        String(formData.get("reviewStatus") ?? "")
      ),
      note: String(formData.get("note") ?? "").trim() || null,
      requestContext: await getServerAuditRequestContext()
    });
  } catch (error) {
    redirect(
      `/dashboard/evidence/${evidenceFileId}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Review update failed."
      )}` as never
    );
  }

  redirect(`/dashboard/evidence/${evidenceFileId}?reviewUpdated=1` as never);
}

export async function updateEvidenceProcessingStatusAction(formData: FormData) {
  const session = await requireOrganizationPermission("evidence.manage");
  await requireEntitlement(session.organization!.id, "evidence.manage", {
    failureRedirect: "/dashboard/evidence?error=plan"
  });
  const evidenceFileId = String(formData.get("evidenceFileId") ?? "");

  if (!evidenceFileId) {
    redirect("/dashboard/evidence?error=missing-evidence" as never);
  }

  try {
    await updateEvidenceProcessingState({
      organizationId: session.organization!.id,
      evidenceFileId,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      processingStatus: parseEvidenceProcessingStatus(
        String(formData.get("processingStatus") ?? "")
      ),
      parserVersion: String(formData.get("parserVersion") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
      requestContext: await getServerAuditRequestContext()
    });
  } catch (error) {
    redirect(
      `/dashboard/evidence/${evidenceFileId}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Processing update failed."
      )}` as never
    );
  }

  redirect(`/dashboard/evidence/${evidenceFileId}?processingUpdated=1` as never);
}

export async function addEvidenceAnnotationAction(formData: FormData) {
  const session = await requireOrganizationPermission("evidence.manage");
  await requireEntitlement(session.organization!.id, "evidence.manage", {
    failureRedirect: "/dashboard/evidence?error=plan"
  });
  const evidenceFileId = String(formData.get("evidenceFileId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!evidenceFileId || !body) {
    redirect(`/dashboard/evidence/${evidenceFileId || ""}?error=missing-note` as never);
  }

  await addEvidenceAnnotation({
    organizationId: session.organization!.id,
    evidenceFileId,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    body,
    requestContext: await getServerAuditRequestContext()
  });

  redirect(`/dashboard/evidence/${evidenceFileId}?annotationAdded=1` as never);
}
