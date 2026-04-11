"use server";

import { ControlImplementationStatus, prisma } from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requireOrganizationPermission } from "../../../lib/auth";
import { updateControlAssessmentReview } from "../../../lib/framework-intelligence";

function parseControlImplementationStatus(value: string) {
  if (
    Object.values(ControlImplementationStatus).includes(
      value as ControlImplementationStatus
    )
  ) {
    return value as ControlImplementationStatus;
  }

  throw new Error("Invalid control implementation status.");
}

function parseScore(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Control score must be between 0 and 100.");
  }

  return Math.round(parsed);
}

export async function updateControlAssessmentReviewAction(formData: FormData) {
  const session = await requireOrganizationPermission("findings.manage");
  const controlAssessmentId = String(formData.get("controlAssessmentId") ?? "");
  const frameworkCode = String(formData.get("frameworkCode") ?? "");

  if (!controlAssessmentId || !frameworkCode) {
    redirect("/dashboard/frameworks?error=missing-control" as never);
  }

  const requestContext = await getServerAuditRequestContext();

  try {
    const updated = await updateControlAssessmentReview({
      organizationId: session.organization!.id,
      controlAssessmentId,
      actorUserId: session.user.id,
      status: parseControlImplementationStatus(String(formData.get("status") ?? "")),
      score: parseScore(String(formData.get("score") ?? "")),
      rationale: String(formData.get("rationale") ?? "").trim() || null
    });

    await writeAuditLog(prisma, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "framework_control.review_updated",
      entityType: "controlAssessment",
      entityId: updated.id,
      metadata: {
        frameworkId: updated.frameworkId,
        frameworkControlId: updated.frameworkControlId,
        status: updated.status,
        score: updated.score,
        scoreSource: updated.scoreSource
      },
      requestContext
    });
  } catch (error) {
    redirect(
      `/dashboard/frameworks/${frameworkCode}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Control review update failed."
      )}` as never
    );
  }

  redirect(`/dashboard/frameworks/${frameworkCode}?updated=1` as never);
}
