import "server-only";

import {
  CustomerAccountTimelineSeverity,
  OperatorWorkflowEventCode,
  Prisma,
  prisma
} from "@evolve-edge/db";

type OperatorWorkflowEventDbClient = Prisma.TransactionClient | typeof prisma;

export type CreateOperatorWorkflowEventRecordInput = {
  eventKey?: string | null;
  organizationId?: string | null;
  customerAccountId?: string | null;
  reportId?: string | null;
  paymentReconciliationId?: string | null;
  eventCode:
    | "payment_received"
    | "reconciliation_complete"
    | "access_grant_issued"
    | "intake_received"
    | "report_processing"
    | "report_ready"
    | "report_delivered"
    | "delivery_failed";
  severity?: "info" | "warning" | "critical";
  message: string;
  metadata?: Prisma.InputJsonValue;
  db?: OperatorWorkflowEventDbClient;
};

function toEventCode(
  eventCode: CreateOperatorWorkflowEventRecordInput["eventCode"]
): OperatorWorkflowEventCode {
  switch (eventCode) {
    case "payment_received":
      return OperatorWorkflowEventCode.PAYMENT_RECEIVED;
    case "reconciliation_complete":
      return OperatorWorkflowEventCode.RECONCILIATION_COMPLETE;
    case "access_grant_issued":
      return OperatorWorkflowEventCode.ACCESS_GRANT_ISSUED;
    case "intake_received":
      return OperatorWorkflowEventCode.INTAKE_RECEIVED;
    case "report_processing":
      return OperatorWorkflowEventCode.REPORT_PROCESSING;
    case "report_ready":
      return OperatorWorkflowEventCode.REPORT_READY;
    case "report_delivered":
      return OperatorWorkflowEventCode.REPORT_DELIVERED;
    case "delivery_failed":
    default:
      return OperatorWorkflowEventCode.DELIVERY_FAILED;
  }
}

function toSeverity(
  severity: CreateOperatorWorkflowEventRecordInput["severity"]
): CustomerAccountTimelineSeverity {
  switch (severity) {
    case "warning":
      return CustomerAccountTimelineSeverity.WARNING;
    case "critical":
      return CustomerAccountTimelineSeverity.CRITICAL;
    case "info":
    default:
      return CustomerAccountTimelineSeverity.INFO;
  }
}

export async function appendOperatorWorkflowEventRecord(
  input: CreateOperatorWorkflowEventRecordInput
) {
  const db = input.db ?? prisma;
  const data = {
    organizationId: input.organizationId?.trim() || null,
    customerAccountId: input.customerAccountId?.trim() || null,
    reportId: input.reportId?.trim() || null,
    paymentReconciliationId: input.paymentReconciliationId?.trim() || null,
    eventCode: toEventCode(input.eventCode),
    severity: toSeverity(input.severity),
    message: input.message.trim(),
    metadata: input.metadata ?? Prisma.JsonNull
  };

  if (input.eventKey?.trim()) {
    return db.operatorWorkflowEventRecord.upsert({
      where: {
        eventKey: input.eventKey.trim()
      },
      update: data,
      create: {
        eventKey: input.eventKey.trim(),
        ...data
      }
    });
  }

  return db.operatorWorkflowEventRecord.create({
    data
  });
}

export async function listOperatorWorkflowEventRecords(input?: {
  db?: OperatorWorkflowEventDbClient;
  organizationId?: string | null;
  customerAccountId?: string | null;
  reportId?: string | null;
  paymentReconciliationId?: string | null;
  limit?: number;
}) {
  const db = input?.db ?? prisma;

  return db.operatorWorkflowEventRecord.findMany({
    where: {
      organizationId: input?.organizationId?.trim() || undefined,
      customerAccountId: input?.customerAccountId?.trim() || undefined,
      reportId: input?.reportId?.trim() || undefined,
      paymentReconciliationId:
        input?.paymentReconciliationId?.trim() || undefined
    },
    orderBy: [{ createdAt: "desc" }],
    take: input?.limit ?? 30
  });
}
