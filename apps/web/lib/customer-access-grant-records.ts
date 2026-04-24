import "server-only";

import {
  CommercialPlanCode,
  CustomerAccessGrantRecord,
  CustomerAccessGrantScopeType,
  CustomerAccessGrantStatus,
  Prisma,
  prisma
} from "@evolve-edge/db";
import {
  createCustomerAccessGrant,
  type CustomerAccessGrant,
  type CustomerAccessGrantStatus as CanonicalCustomerAccessGrantStatus
} from "./customer-access-grants";
import {
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";

type CustomerAccessGrantDbClient = Prisma.TransactionClient | typeof prisma;

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function toCommercialPlanCode(
  value: string | null | undefined
): CommercialPlanCode | null {
  switch (
    resolveCanonicalPlanCode(value) ?? resolveCanonicalPlanCodeFromRevenuePlanCode(value)
  ) {
    case "starter":
      return CommercialPlanCode.STARTER;
    case "enterprise":
      return CommercialPlanCode.ENTERPRISE;
    case "scale":
      return CommercialPlanCode.SCALE;
    default:
      return null;
  }
}

function toGrantStatus(
  status: CanonicalCustomerAccessGrantStatus
): CustomerAccessGrantStatus {
  switch (status) {
    case "binding_pending":
      return CustomerAccessGrantStatus.BINDING_PENDING;
    case "expired":
      return CustomerAccessGrantStatus.EXPIRED;
    case "revoked":
      return CustomerAccessGrantStatus.REVOKED;
    case "issued":
    default:
      return CustomerAccessGrantStatus.ISSUED;
  }
}

function fromGrantStatus(
  status: CustomerAccessGrantStatus
): CanonicalCustomerAccessGrantStatus {
  switch (status) {
    case CustomerAccessGrantStatus.BINDING_PENDING:
      return "binding_pending";
    case CustomerAccessGrantStatus.EXPIRED:
      return "expired";
    case CustomerAccessGrantStatus.REVOKED:
      return "revoked";
    case CustomerAccessGrantStatus.ISSUED:
    default:
      return "issued";
  }
}

function toScopeType(scope: CustomerAccessGrant["reportScope"]["scopeType"]) {
  return scope === "report_placeholder"
    ? CustomerAccessGrantScopeType.REPORT_PLACEHOLDER
    : CustomerAccessGrantScopeType.ORGANIZATION_REPORTS;
}

function fromScopeType(
  scopeType: CustomerAccessGrantScopeType
): CustomerAccessGrant["reportScope"]["scopeType"] {
  return scopeType === CustomerAccessGrantScopeType.REPORT_PLACEHOLDER
    ? "report_placeholder"
    : "organization_reports";
}

function fromCommercialPlanCode(
  value: CommercialPlanCode | null
): CustomerAccessGrant["selectedPlan"] {
  switch (value) {
    case CommercialPlanCode.STARTER:
      return "starter";
    case CommercialPlanCode.ENTERPRISE:
      return "enterprise";
    case CommercialPlanCode.SCALE:
      return "scale";
    default:
      return null;
  }
}

export type CreateCustomerAccessGrantRecordInput = {
  customerId?: string | null;
  customerEmail?: string | null;
  organizationId?: string | null;
  customerAccountId?: string | null;
  reportId?: string | null;
  selectedPlan?: string | null;
  grantStatus: CanonicalCustomerAccessGrantStatus;
  issuedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  revokedAt?: Date | null;
  paymentReconciliationId?: string | null;
  metadata?: Prisma.InputJsonValue;
  db?: CustomerAccessGrantDbClient;
};

export function buildCustomerAccessGrantRecordData(
  input: CreateCustomerAccessGrantRecordInput
) {
  const normalized = createCustomerAccessGrant(input);

  return {
    normalized,
    create: {
      paymentReconciliationId: input.paymentReconciliationId?.trim() || null,
      userId: normalized.customerId,
      customerEmail: normalizeEmail(input.customerEmail),
      organizationId: normalized.organizationId,
      customerAccountId: input.customerAccountId?.trim() || null,
      selectedPlan: toCommercialPlanCode(normalized.selectedPlan),
      scopeType: toScopeType(normalized.reportScope.scopeType),
      reportId: normalized.reportScope.reportId,
      grantStatus: toGrantStatus(normalized.grantStatus),
      issuedAt: new Date(normalized.issuedAt),
      expiresAt: normalized.expiresAt ? new Date(normalized.expiresAt) : null,
      revokedAt: input.revokedAt ?? null,
      metadata: input.metadata ?? Prisma.JsonNull
    }
  };
}

export async function createCustomerAccessGrantRecord(
  input: CreateCustomerAccessGrantRecordInput
) {
  const db = input.db ?? prisma;
  const prepared = buildCustomerAccessGrantRecordData(input);

  return db.customerAccessGrantRecord.create({
    data: prepared.create
  });
}

export async function upsertCustomerAccessGrantRecord(
  input: CreateCustomerAccessGrantRecordInput
) {
  const db = input.db ?? prisma;
  const prepared = buildCustomerAccessGrantRecordData(input);
  const paymentReconciliationId = input.paymentReconciliationId?.trim() || null;

  if (!paymentReconciliationId) {
    return db.customerAccessGrantRecord.create({
      data: prepared.create
    });
  }

  try {
    return await db.customerAccessGrantRecord.create({
      data: prepared.create
    });
  } catch (error) {
    // The database unique constraint on paymentReconciliationId is the durable
    // idempotency boundary. While generated Prisma types may lag behind a new
    // migration locally, we can still recover safely by updating the existing
    // linked grant when a duplicate reconciliation write races or replays.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.customerAccessGrantRecord.findFirst({
        where: {
          paymentReconciliationId
        },
        orderBy: [{ createdAt: "desc" }]
      });

      if (existing) {
        return db.customerAccessGrantRecord.update({
          where: {
            id: existing.id
          },
          data: prepared.create
        });
      }
    }

    throw error;
  }
}

export function mapCustomerAccessGrantRecordToGrant(
  record: Pick<
    CustomerAccessGrantRecord,
    | "userId"
    | "organizationId"
    | "reportId"
    | "selectedPlan"
    | "scopeType"
    | "grantStatus"
    | "issuedAt"
    | "expiresAt"
  >
): CustomerAccessGrant {
  return {
    customerId: record.userId,
    organizationId: record.organizationId,
    reportScope: {
      scopeType: fromScopeType(record.scopeType),
      reportId: record.reportId
    },
    selectedPlan: fromCommercialPlanCode(record.selectedPlan),
    grantStatus: fromGrantStatus(record.grantStatus),
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null
  };
}

export async function findLatestCustomerAccessGrant(input: {
  db?: CustomerAccessGrantDbClient;
  organizationId?: string | null;
  userId?: string | null;
  customerEmail?: string | null;
  reportId?: string | null;
}) {
  const record = await findLatestActiveCustomerAccessGrantRecord(input);
  return record ? mapCustomerAccessGrantRecordToGrant(record) : null;
}

export async function findLatestActiveCustomerAccessGrantRecord(input: {
  db?: CustomerAccessGrantDbClient;
  organizationId?: string | null;
  userId?: string | null;
  customerEmail?: string | null;
  reportId?: string | null;
}) {
  const db = input.db ?? prisma;
  const now = new Date();
  const reportId = input.reportId?.trim() || null;
  const organizationId = input.organizationId?.trim() || null;
  const userId = input.userId?.trim() || null;
  const customerEmail = normalizeEmail(input.customerEmail);

  return db.customerAccessGrantRecord.findFirst({
    where: {
      organizationId: organizationId ?? undefined,
      userId: userId ?? undefined,
      customerEmail: customerEmail ?? undefined,
      grantStatus: CustomerAccessGrantStatus.ISSUED,
      AND: [
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        },
        ...(reportId
          ? [
              {
                OR: [
                  {
                    reportId
                  },
                  {
                    reportId: null,
                    scopeType: CustomerAccessGrantScopeType.ORGANIZATION_REPORTS
                  }
                ]
              }
            ]
          : [])
      ]
    },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }]
  });
}

export async function listActiveCustomerAccessGrantRecords(input: {
  db?: CustomerAccessGrantDbClient;
  organizationId?: string | null;
  userId?: string | null;
  customerEmail?: string | null;
  limit?: number;
}) {
  const db = input.db ?? prisma;
  const now = new Date();
  const organizationId = input.organizationId?.trim() || null;
  const userId = input.userId?.trim() || null;
  const customerEmail = normalizeEmail(input.customerEmail);

  return db.customerAccessGrantRecord.findMany({
    where: {
      organizationId: organizationId ?? undefined,
      userId: userId ?? undefined,
      customerEmail: customerEmail ?? undefined,
      grantStatus: CustomerAccessGrantStatus.ISSUED,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    take: input.limit ?? 50
  });
}

export async function listCustomerAccessGrantRecords(input?: {
  db?: CustomerAccessGrantDbClient;
  organizationId?: string | null;
  paymentReconciliationId?: string | null;
  limit?: number;
}) {
  const db = input?.db ?? prisma;

  return db.customerAccessGrantRecord.findMany({
    where: {
      organizationId: input?.organizationId?.trim() || undefined,
      paymentReconciliationId:
        input?.paymentReconciliationId?.trim() || undefined
    },
    orderBy: [{ createdAt: "desc" }],
    take: input?.limit ?? 20
  });
}
