"use server";

import { AuditActorType, prisma } from "@evolve-edge/db";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../../lib/audit";
import { requireAdminSession, requirePlatformPermission } from "../../../../lib/auth";
import { recoverOrganizationBillingSync } from "../../../../lib/billing-admin";
import { retryCustomerRun } from "../../../../lib/customer-runs";
import {
  requireOperatorConfirmation,
  validateOperatorReason
} from "../../../../lib/operator-safeguards";

export async function retryCustomerRunAction(formData: FormData) {
  const session = await requireAdminSession();
  const runId = String(formData.get("runId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!runId || !organizationId) {
    redirect("/admin?error=missing-run");
  }

  let reason = "";

  try {
    reason = validateOperatorReason(formData.get("reason"));
    requireOperatorConfirmation(formData.get("confirmation"), "RETRY");

    const result = await retryCustomerRun(runId, {
      actorEmail: session.user.email,
      reason
    });

    await writeAuditLog(prisma, {
      userId: session.user.id,
      actorType: AuditActorType.ADMIN,
      actorLabel: session.user.email,
      action: "admin.customer_run_retried",
      entityType: "customerRun",
      entityId: runId,
      metadata: {
        organizationId,
        recoveredStep: result.recoveredStep,
        reason
      },
      requestContext: await getServerAuditRequestContext()
    });
  } catch (error) {
    const errorHref =
      `/admin/accounts/${organizationId}?runRecoveryError=${encodeURIComponent(
        error instanceof Error ? error.message : "Unknown error"
      )}` as Route;

    await writeAuditLog(prisma, {
      userId: session.user.id,
      actorType: AuditActorType.ADMIN,
      actorLabel: session.user.email,
      action: "admin.customer_run_retry_failed",
      entityType: "customerRun",
      entityId: runId,
      metadata: {
        organizationId,
        message: error instanceof Error ? error.message : "Unknown error",
        reason
      },
      requestContext: await getServerAuditRequestContext()
    });

    redirect(errorHref);
  }

  revalidatePath(`/admin/accounts/${organizationId}`);
  redirect(`/admin/accounts/${organizationId}?runRecovered=1` as Route);
}

export async function resyncBillingSubscriptionAction(formData: FormData) {
  const session = await requirePlatformPermission("platform.jobs.manage");
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!organizationId) {
    redirect("/admin?error=missing-organization");
  }

  let reason = "";

  try {
    reason = validateOperatorReason(formData.get("reason"));
    requireOperatorConfirmation(formData.get("confirmation"), "RESYNC");

    const result = await recoverOrganizationBillingSync({
      organizationId,
      reason,
      actorUserId: session.user.id,
      actorType: AuditActorType.ADMIN,
      actorLabel: session.user.email,
      requestContext: await getServerAuditRequestContext()
    });

    await writeAuditLog(prisma, {
      userId: session.user.id,
      actorType: AuditActorType.ADMIN,
      actorLabel: session.user.email,
      action: "admin.billing_subscription_resynced",
      entityType: "organization",
      entityId: organizationId,
      metadata: {
        subscriptionId: result.id,
        stripeSubscriptionId: result.stripeSubscriptionId,
        status: result.status,
        accessState: result.accessState,
        reason
      },
      requestContext: await getServerAuditRequestContext()
    });
  } catch (error) {
    const errorHref =
      `/admin/accounts/${organizationId}?billingResyncError=${encodeURIComponent(
        error instanceof Error ? error.message : "Unknown error"
      )}` as Route;

    await writeAuditLog(prisma, {
      userId: session.user.id,
      actorType: AuditActorType.ADMIN,
      actorLabel: session.user.email,
      action: "admin.billing_subscription_resync_failed",
      entityType: "organization",
      entityId: organizationId,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error",
        reason
      },
      requestContext: await getServerAuditRequestContext()
    });

    redirect(errorHref);
  }

  revalidatePath(`/admin/accounts/${organizationId}`);
  redirect(`/admin/accounts/${organizationId}?billingResynced=1` as Route);
}
