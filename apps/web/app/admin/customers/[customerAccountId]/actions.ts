"use server";

import { AuditActorType, CustomerLifecycleStage, prisma } from "@evolve-edge/db";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../../lib/audit";
import { requireAdminSession } from "../../../../lib/auth";
import {
  addCustomerAccountNote,
  resendCustomerAccountStatusSync,
  resyncCustomerAccount,
  setCustomerAccountLifecycleStage,
  updateCustomerAccountFounderReview,
  updateCustomerAccountNextAction
} from "../../../../lib/customer-accounts";
import { retryCustomerRun } from "../../../../lib/customer-runs";
import {
  requireOperatorConfirmation,
  validateOperatorReason
} from "../../../../lib/operator-safeguards";

function buildCustomerAccountHref(customerAccountId: string, query?: string) {
  return (`/admin/customers/${customerAccountId}${query ?? ""}`) as Route;
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(`${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function revalidateCustomerAccountPaths(customerAccountId: string, organizationId?: string | null) {
  revalidatePath("/admin");
  revalidatePath(`/admin/customers/${customerAccountId}`);
  if (organizationId) {
    revalidatePath(`/admin/accounts/${organizationId}`);
  }
}

export async function updateCustomerAccountStageAction(formData: FormData) {
  const session = await requireAdminSession();
  const customerAccountId = String(formData.get("customerAccountId") ?? "");
  const stage = String(formData.get("stage") ?? "") as CustomerLifecycleStage;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!customerAccountId || !Object.values(CustomerLifecycleStage).includes(stage)) {
    redirect("/admin?error=invalid-customer-stage");
  }

  const account = await setCustomerAccountLifecycleStage({
    customerAccountId,
    stage,
    actorUserId: session.user.id,
    actorLabel: session.user.email,
    reason
  });

  await writeAuditLog(prisma, {
    organizationId: account.organizationId,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.customer_account_stage_updated",
    entityType: "customerAccount",
    entityId: customerAccountId,
    metadata: {
      lifecycleStage: stage,
      reason
    },
    requestContext: await getServerAuditRequestContext()
  });

  revalidateCustomerAccountPaths(customerAccountId, account.organizationId);
  redirect(buildCustomerAccountHref(customerAccountId, "?stageUpdated=1"));
}

export async function updateCustomerAccountNextActionAction(formData: FormData) {
  const session = await requireAdminSession();
  const customerAccountId = String(formData.get("customerAccountId") ?? "");

  if (!customerAccountId) {
    redirect("/admin?error=missing-customer-account");
  }

  const account = await updateCustomerAccountNextAction({
    customerAccountId,
    nextActionLabel: String(formData.get("nextActionLabel") ?? ""),
    nextActionOwner: String(formData.get("nextActionOwner") ?? ""),
    nextActionDueAt: parseOptionalDate(formData.get("nextActionDueAt")),
    actorUserId: session.user.id,
    actorLabel: session.user.email
  });

  await writeAuditLog(prisma, {
    organizationId: account.organizationId,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.customer_account_next_action_updated",
    entityType: "customerAccount",
    entityId: customerAccountId,
    metadata: {
      nextActionLabel: account.nextActionLabel,
      nextActionOwner: account.nextActionOwner,
      nextActionDueAt: account.nextActionDueAt?.toISOString() ?? null
    },
    requestContext: await getServerAuditRequestContext()
  });

  revalidateCustomerAccountPaths(customerAccountId, account.organizationId);
  redirect(buildCustomerAccountHref(customerAccountId, "?taskUpdated=1"));
}

export async function addCustomerAccountNoteAction(formData: FormData) {
  const session = await requireAdminSession();
  const customerAccountId = String(formData.get("customerAccountId") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!customerAccountId || !note.trim()) {
    redirect("/admin?error=missing-customer-note");
  }

  const noteEntry = await addCustomerAccountNote({
    customerAccountId,
    note,
    actorUserId: session.user.id,
    actorLabel: session.user.email
  });

  await writeAuditLog(prisma, {
    organizationId: noteEntry.organizationId,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.customer_account_note_added",
    entityType: "customerAccount",
    entityId: customerAccountId,
    metadata: {
      noteLength: note.trim().length
    },
    requestContext: await getServerAuditRequestContext()
  });

  revalidateCustomerAccountPaths(customerAccountId, noteEntry.organizationId);
  redirect(buildCustomerAccountHref(customerAccountId, "?noteAdded=1"));
}

export async function resyncCustomerAccountAction(formData: FormData) {
  const session = await requireAdminSession();
  const customerAccountId = String(formData.get("customerAccountId") ?? "");

  if (!customerAccountId) {
    redirect("/admin?error=missing-customer-account");
  }

  const account = await resyncCustomerAccount({
    customerAccountId,
    actorUserId: session.user.id,
    actorLabel: session.user.email
  });

  await writeAuditLog(prisma, {
    organizationId: account?.organizationId ?? null,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.customer_account_resynced",
    entityType: "customerAccount",
    entityId: customerAccountId,
    requestContext: await getServerAuditRequestContext()
  });

  revalidateCustomerAccountPaths(customerAccountId, account?.organizationId);
  redirect(buildCustomerAccountHref(customerAccountId, "?resynced=1"));
}

export async function resendCustomerAccountStatusSyncAction(formData: FormData) {
  const session = await requireAdminSession();
  const customerAccountId = String(formData.get("customerAccountId") ?? "");

  if (!customerAccountId) {
    redirect("/admin?error=missing-customer-account");
  }

  const reason = validateOperatorReason(formData.get("reason"));

  const event = await resendCustomerAccountStatusSync({
    customerAccountId,
    actorUserId: session.user.id,
    actorLabel: session.user.email,
    reason
  });

  await writeAuditLog(prisma, {
    organizationId: event?.orgId ?? null,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.customer_account_status_sync_republished",
    entityType: "customerAccount",
    entityId: customerAccountId,
    metadata: {
      eventType: event?.type ?? "customer_account.stage_changed",
      reason
    },
    requestContext: await getServerAuditRequestContext()
  });

  revalidateCustomerAccountPaths(customerAccountId, event?.orgId ?? null);
  redirect(buildCustomerAccountHref(customerAccountId, "?crmSyncQueued=1"));
}

export async function updateCustomerAccountFounderReviewAction(formData: FormData) {
  const session = await requireAdminSession();
  const customerAccountId = String(formData.get("customerAccountId") ?? "");
  const founderReviewRequired = String(formData.get("founderReviewRequired") ?? "") === "true";
  const founderReviewReason = String(formData.get("founderReviewReason") ?? "").trim();

  if (!customerAccountId) {
    redirect("/admin?error=missing-customer-account");
  }

  const account = await updateCustomerAccountFounderReview({
    customerAccountId,
    founderReviewRequired,
    founderReviewReason,
    actorUserId: session.user.id,
    actorLabel: session.user.email
  });

  await writeAuditLog(prisma, {
    organizationId: account.organizationId,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: founderReviewRequired
      ? "admin.customer_account_founder_review_requested"
      : "admin.customer_account_founder_review_cleared",
    entityType: "customerAccount",
    entityId: customerAccountId,
    metadata: {
      founderReviewRequired,
      founderReviewReason: founderReviewRequired ? founderReviewReason : null
    },
    requestContext: await getServerAuditRequestContext()
  });

  revalidateCustomerAccountPaths(customerAccountId, account.organizationId);
  redirect(
    buildCustomerAccountHref(
      customerAccountId,
      founderReviewRequired ? "?founderReviewRequested=1" : "?founderReviewCleared=1"
    )
  );
}

export async function retryCustomerRunFromCustomerAccountAction(formData: FormData) {
  const session = await requireAdminSession();
  const customerAccountId = String(formData.get("customerAccountId") ?? "");
  const runId = String(formData.get("runId") ?? "");

  if (!customerAccountId || !runId) {
    redirect("/admin?error=missing-customer-run");
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
      action: "admin.customer_account_run_retried",
      entityType: "customerRun",
      entityId: runId,
      metadata: {
        recoveredStep: result.recoveredStep,
        customerAccountId,
        reason
      },
      requestContext: await getServerAuditRequestContext()
    });

    revalidateCustomerAccountPaths(customerAccountId, null);
    redirect(buildCustomerAccountHref(customerAccountId, "?runRecovered=1"));
  } catch (error) {
    await writeAuditLog(prisma, {
      userId: session.user.id,
      actorType: AuditActorType.ADMIN,
      actorLabel: session.user.email,
      action: "admin.customer_account_run_retry_failed",
      entityType: "customerRun",
      entityId: runId,
      metadata: {
        customerAccountId,
        message: error instanceof Error ? error.message : "Unknown error",
        reason
      },
      requestContext: await getServerAuditRequestContext()
    });

    redirect(
      buildCustomerAccountHref(
        customerAccountId,
        `?runRecoveryError=${encodeURIComponent(
          error instanceof Error ? error.message : "Unknown error"
        )}`
      )
    );
  }
}
