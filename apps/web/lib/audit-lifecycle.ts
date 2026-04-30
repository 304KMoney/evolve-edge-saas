import { Prisma, prisma } from "@evolve-edge/db";

export const AUDIT_LIFECYCLE_STATUSES = [
  "intake_pending",
  "intake_complete",
  "routing_complete",
  "analysis_pending",
  "analysis_running",
  "analysis_complete",
  "report_ready",
  "briefing_ready",
  "delivered",
  "failed_review_required"
] as const;

export type AuditLifecycleStatus = (typeof AUDIT_LIFECYCLE_STATUSES)[number];

export type AuditLifecycleTransitionInput = {
  organizationId: string;
  assessmentId: string;
  toStatus: AuditLifecycleStatus;
  actorUserId?: string | null;
  actorType?: "USER" | "SYSTEM" | "INTERNAL_API" | "WEBHOOK" | "JOB" | "ADMIN";
  actorLabel?: string | null;
  reasonCode?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
  linkages?: {
    routingSnapshotId?: string | null;
    workflowDispatchId?: string | null;
    reportId?: string | null;
    briefingId?: string | null;
  };
  evidence?: {
    intakeComplete?: boolean;
    routingSnapshotId?: string | null;
    analysisJobId?: string | null;
    reportId?: string | null;
    briefingId?: string | null;
    deliveredAt?: Date | string | null;
    failureReason?: string | null;
  };
};

export type AuditLifecycleTimelineStage = {
  status: AuditLifecycleStatus;
  label: string;
  description: string;
  completed: boolean;
  active: boolean;
  failed: boolean;
  timestamp: Date | null;
};

type AuditLifecycleDb = Pick<typeof prisma, "$queryRaw" | "$executeRaw">;

function supportsAuditLifecyclePersistence(db: unknown): db is AuditLifecycleDb {
  return (
    Boolean(db) &&
    typeof (db as { $queryRaw?: unknown }).$queryRaw === "function" &&
    typeof (db as { $executeRaw?: unknown }).$executeRaw === "function"
  );
}

const STATUS_TO_DB = {
  intake_pending: "INTAKE_PENDING",
  intake_complete: "INTAKE_COMPLETE",
  routing_complete: "ROUTING_COMPLETE",
  analysis_pending: "ANALYSIS_PENDING",
  analysis_running: "ANALYSIS_RUNNING",
  analysis_complete: "ANALYSIS_COMPLETE",
  report_ready: "REPORT_READY",
  briefing_ready: "BRIEFING_READY",
  delivered: "DELIVERED",
  failed_review_required: "FAILED_REVIEW_REQUIRED"
} as const satisfies Record<AuditLifecycleStatus, string>;

const DB_TO_STATUS = Object.fromEntries(
  Object.entries(STATUS_TO_DB).map(([key, value]) => [value, key])
) as Record<string, AuditLifecycleStatus>;

const TIMESTAMP_COLUMN = {
  intake_pending: "intakePendingAt",
  intake_complete: "intakeCompleteAt",
  routing_complete: "routingCompleteAt",
  analysis_pending: "analysisPendingAt",
  analysis_running: "analysisRunningAt",
  analysis_complete: "analysisCompleteAt",
  report_ready: "reportReadyAt",
  briefing_ready: "briefingReadyAt",
  delivered: "deliveredAt",
  failed_review_required: "failedReviewRequiredAt"
} as const satisfies Record<AuditLifecycleStatus, string>;

const STAGE_COPY = {
  intake_pending: {
    label: "Intake pending",
    description: "Required audit intake has not been completed."
  },
  intake_complete: {
    label: "Intake complete",
    description: "Required intake data is saved and ready for controlled routing."
  },
  routing_complete: {
    label: "Routing complete",
    description: "The backend created a routing snapshot and workflow selection."
  },
  analysis_pending: {
    label: "Analysis pending",
    description: "Analysis is queued and waiting for backend execution."
  },
  analysis_running: {
    label: "Analysis running",
    description: "Backend execution is running through the controlled AI layer."
  },
  analysis_complete: {
    label: "Analysis complete",
    description: "Validated analysis output has been persisted."
  },
  report_ready: {
    label: "Report ready",
    description: "A structured report is available for customer review."
  },
  briefing_ready: {
    label: "Briefing ready",
    description: "The executive briefing has been generated from report data."
  },
  delivered: {
    label: "Delivered",
    description: "The deliverable has been marked delivered."
  },
  failed_review_required: {
    label: "Review required",
    description: "The lifecycle is blocked until an operator reviews the failure."
  }
} as const;

const ORDERED_STATUSES = AUDIT_LIFECYCLE_STATUSES.filter(
  (status) => status !== "failed_review_required"
);

function statusIndex(status: AuditLifecycleStatus) {
  return (ORDERED_STATUSES as readonly AuditLifecycleStatus[]).indexOf(status);
}

export function normalizeAuditLifecycleStatus(value: string): AuditLifecycleStatus | null {
  const lower = value.toLowerCase();
  if ((AUDIT_LIFECYCLE_STATUSES as readonly string[]).includes(lower)) {
    return lower as AuditLifecycleStatus;
  }

  return DB_TO_STATUS[value.toUpperCase()] ?? null;
}

export function validateAuditLifecycleTransition(input: {
  fromStatus: AuditLifecycleStatus | null;
  toStatus: AuditLifecycleStatus;
  evidence?: AuditLifecycleTransitionInput["evidence"];
}) {
  const fromStatus = input.fromStatus ?? "intake_pending";
  const toStatus = input.toStatus;

  if (fromStatus === toStatus) {
    return { ok: true as const, idempotent: true as const };
  }

  if (fromStatus === "delivered" || fromStatus === "failed_review_required") {
    return {
      ok: false as const,
      reason: `Cannot transition from terminal status ${fromStatus}.`
    };
  }

  if (toStatus !== "failed_review_required") {
    if (statusIndex(toStatus) < statusIndex(fromStatus)) {
      return { ok: true as const, idempotent: true as const };
    }

    if (statusIndex(toStatus) !== statusIndex(fromStatus) + 1) {
      return {
        ok: false as const,
        reason: `Invalid audit lifecycle transition from ${fromStatus} to ${toStatus}.`
      };
    }
  }

  const evidence = input.evidence ?? {};
  if (toStatus === "intake_complete" && evidence.intakeComplete !== true) {
    return { ok: false as const, reason: "Intake completion requires valid intake data." };
  }
  if (toStatus === "routing_complete" && !evidence.routingSnapshotId) {
    return { ok: false as const, reason: "Routing completion requires a routing snapshot." };
  }
  if (
    (toStatus === "analysis_pending" || toStatus === "analysis_running") &&
    !evidence.analysisJobId
  ) {
    return { ok: false as const, reason: "Analysis transition requires an analysis job." };
  }
  if (
    (toStatus === "analysis_complete" || toStatus === "report_ready") &&
    !evidence.reportId
  ) {
    return { ok: false as const, reason: "Completion requires a persisted report." };
  }
  if (toStatus === "briefing_ready" && !evidence.briefingId) {
    return { ok: false as const, reason: "Briefing readiness requires a briefing record." };
  }
  if (toStatus === "delivered" && !evidence.deliveredAt) {
    return { ok: false as const, reason: "Delivery requires a delivery timestamp." };
  }
  if (toStatus === "failed_review_required" && !evidence.failureReason) {
    return { ok: false as const, reason: "Failure transition requires a safe failure reason." };
  }

  return { ok: true as const, idempotent: false as const };
}

export function buildAuditLifecycleTimeline(input: {
  currentStatus: AuditLifecycleStatus;
  timestamps: Partial<Record<AuditLifecycleStatus, Date | null>>;
}): AuditLifecycleTimelineStage[] {
  const currentIndex = statusIndex(input.currentStatus);
  const stages: AuditLifecycleTimelineStage[] = ORDERED_STATUSES.map((status, index) => ({
    status,
    label: STAGE_COPY[status].label,
    description: STAGE_COPY[status].description,
    completed:
      input.currentStatus === "failed_review_required"
        ? Boolean(input.timestamps[status])
        : index < currentIndex || input.currentStatus === "delivered",
    active: status === input.currentStatus,
    failed: false,
    timestamp: input.timestamps[status] ?? null
  }));

  if (input.currentStatus === "failed_review_required") {
    stages.push({
      status: "failed_review_required",
      label: STAGE_COPY.failed_review_required.label,
      description: STAGE_COPY.failed_review_required.description,
      completed: false,
      active: true,
      failed: true,
      timestamp: input.timestamps.failed_review_required ?? null
    });
  }

  return stages;
}

function toDbStatus(status: AuditLifecycleStatus) {
  return STATUS_TO_DB[status];
}

function timestampSql(status: AuditLifecycleStatus, occurredAt: Date) {
  switch (TIMESTAMP_COLUMN[status]) {
    case "intakePendingAt":
      return Prisma.sql`"intakePendingAt" = COALESCE("intakePendingAt", ${occurredAt})`;
    case "intakeCompleteAt":
      return Prisma.sql`"intakeCompleteAt" = COALESCE("intakeCompleteAt", ${occurredAt})`;
    case "routingCompleteAt":
      return Prisma.sql`"routingCompleteAt" = COALESCE("routingCompleteAt", ${occurredAt})`;
    case "analysisPendingAt":
      return Prisma.sql`"analysisPendingAt" = COALESCE("analysisPendingAt", ${occurredAt})`;
    case "analysisRunningAt":
      return Prisma.sql`"analysisRunningAt" = COALESCE("analysisRunningAt", ${occurredAt})`;
    case "analysisCompleteAt":
      return Prisma.sql`"analysisCompleteAt" = COALESCE("analysisCompleteAt", ${occurredAt})`;
    case "reportReadyAt":
      return Prisma.sql`"reportReadyAt" = COALESCE("reportReadyAt", ${occurredAt})`;
    case "briefingReadyAt":
      return Prisma.sql`"briefingReadyAt" = COALESCE("briefingReadyAt", ${occurredAt})`;
    case "deliveredAt":
      return Prisma.sql`"deliveredAt" = COALESCE("deliveredAt", ${occurredAt})`;
    case "failedReviewRequiredAt":
      return Prisma.sql`"failedReviewRequiredAt" = COALESCE("failedReviewRequiredAt", ${occurredAt})`;
  }
}

export async function ensureAuditLifecycle(input: {
  organizationId: string;
  assessmentId: string;
  db?: unknown;
}) {
  const db = input.db ?? prisma;
  if (!supportsAuditLifecyclePersistence(db)) {
    return { id: `mock:${input.assessmentId}`, status: "INTAKE_PENDING" };
  }

  const rows = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
    INSERT INTO "AuditLifecycle" (
      "organizationId",
      "assessmentId",
      "status",
      "intakePendingAt",
      "updatedAt"
    )
    VALUES (
      ${input.organizationId},
      ${input.assessmentId},
      'INTAKE_PENDING'::"AuditLifecycleStatus",
      now(),
      now()
    )
    ON CONFLICT ("assessmentId") DO UPDATE SET
      "updatedAt" = "AuditLifecycle"."updatedAt"
    RETURNING "id", "status"
  `);

  return rows[0]!;
}

export async function recordAuditLifecycleTransition(input: AuditLifecycleTransitionInput & {
  db?: unknown;
}) {
  const db = input.db ?? prisma;
  if (!supportsAuditLifecyclePersistence(db)) {
    return { id: `mock:${input.assessmentId}`, status: input.toStatus, transitioned: false };
  }

  const occurredAt = new Date();
  const lifecycle = await ensureAuditLifecycle({
    db,
    organizationId: input.organizationId,
    assessmentId: input.assessmentId
  });
  const fromStatus = normalizeAuditLifecycleStatus(lifecycle.status);
  const validation = validateAuditLifecycleTransition({
    fromStatus,
    toStatus: input.toStatus,
    evidence: input.evidence
  });

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  if (validation.idempotent) {
    return { id: lifecycle.id, status: input.toStatus, transitioned: false };
  }

  const dbStatus = toDbStatus(input.toStatus);
  const metadata = input.metadata ?? {};
  await db.$executeRaw(Prisma.sql`
    UPDATE "AuditLifecycle"
    SET
      "status" = ${Prisma.raw(`'${dbStatus}'::"AuditLifecycleStatus"`)},
      "statusReason" = ${input.reasonCode ?? null},
      "currentMetadata" = ${JSON.stringify(metadata)}::jsonb,
      "routingSnapshotId" = COALESCE(${input.linkages?.routingSnapshotId ?? null}, "routingSnapshotId"),
      "workflowDispatchId" = COALESCE(${input.linkages?.workflowDispatchId ?? null}, "workflowDispatchId"),
      "reportId" = COALESCE(${input.linkages?.reportId ?? null}, "reportId"),
      "briefingId" = COALESCE(${input.linkages?.briefingId ?? null}, "briefingId"),
      ${timestampSql(input.toStatus, occurredAt)},
      "updatedAt" = ${occurredAt}
    WHERE "id" = ${lifecycle.id}
  `);

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "AuditLifecycleTransition" (
      "auditLifecycleId",
      "organizationId",
      "assessmentId",
      "actorUserId",
      "actorType",
      "actorLabel",
      "fromStatus",
      "toStatus",
      "reasonCode",
      "note",
      "metadata",
      "occurredAt"
    )
    VALUES (
      ${lifecycle.id},
      ${input.organizationId},
      ${input.assessmentId},
      ${input.actorUserId ?? null},
      ${Prisma.raw(`'${input.actorType ?? "SYSTEM"}'::"AuditActorType"`)},
      ${input.actorLabel ?? null},
      ${fromStatus ? Prisma.raw(`'${toDbStatus(fromStatus)}'::"AuditLifecycleStatus"`) : null},
      ${Prisma.raw(`'${dbStatus}'::"AuditLifecycleStatus"`)},
      ${input.reasonCode ?? null},
      ${input.note ?? null},
      ${JSON.stringify(metadata)}::jsonb,
      ${occurredAt}
    )
  `);

  return { id: lifecycle.id, status: input.toStatus, transitioned: true };
}

export async function getLatestAuditLifecycleTimelineForOrganization(
  organizationId: string,
  db: AuditLifecycleDb = prisma
) {
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT *
    FROM "AuditLifecycle"
    WHERE "organizationId" = ${organizationId}
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const currentStatus = normalizeAuditLifecycleStatus(String(row.status));
  if (!currentStatus) {
    return null;
  }

  return {
    currentStatus,
    stages: buildAuditLifecycleTimeline({
      currentStatus,
      timestamps: {
        intake_pending: row.intakePendingAt as Date | null,
        intake_complete: row.intakeCompleteAt as Date | null,
        routing_complete: row.routingCompleteAt as Date | null,
        analysis_pending: row.analysisPendingAt as Date | null,
        analysis_running: row.analysisRunningAt as Date | null,
        analysis_complete: row.analysisCompleteAt as Date | null,
        report_ready: row.reportReadyAt as Date | null,
        briefing_ready: row.briefingReadyAt as Date | null,
        delivered: row.deliveredAt as Date | null,
        failed_review_required: row.failedReviewRequiredAt as Date | null
      }
    })
  };
}
