import { Prisma, prisma } from "@evolve-edge/db";

type WorkflowWritebackTargetDbClient = Prisma.TransactionClient | typeof prisma;

type WorkflowWritebackTargetReport = {
  id: string;
  organizationId: string;
  reportJson: Prisma.JsonValue;
};

type WorkflowWritebackTargetDeliveryState = {
  organizationId: string;
  reportId: string | null;
  externalResultReference: string | null;
};

export type WorkflowWritebackTargetBindingReason =
  | "dispatch_not_found"
  | "missing_dispatch_organization"
  | "report_organization_mismatch"
  | "payload_organization_mismatch"
  | "report_dispatch_mismatch"
  | "delivery_state_organization_mismatch"
  | "delivery_state_report_mismatch"
  | "delivery_state_reference_mismatch"
  | "missing_binding_proof";

export type WorkflowWritebackTargetBindingResult =
  | {
      valid: true;
      reason: null;
    }
  | {
      valid: false;
      reason: WorkflowWritebackTargetBindingReason;
    };

function normalizeOptionalIdentifier(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function extractWorkflowDispatchIdFromReportJson(reportJson: Prisma.JsonValue) {
  if (!reportJson || typeof reportJson !== "object" || Array.isArray(reportJson)) {
    return null;
  }

  const workflowMetadata = (reportJson as Record<string, unknown>).workflowMetadata;
  if (!workflowMetadata || typeof workflowMetadata !== "object" || Array.isArray(workflowMetadata)) {
    return null;
  }

  const workflowDispatchId = (workflowMetadata as Record<string, unknown>).workflowDispatchId;
  return normalizeOptionalIdentifier(
    typeof workflowDispatchId === "string" ? workflowDispatchId : null
  );
}

export function evaluateWorkflowWritebackTargetBinding(input: {
  dispatchId: string;
  dispatchOrganizationId: string | null;
  payloadOrganizationId?: string | null;
  payloadReportReference?: string | null;
  reportCandidate: WorkflowWritebackTargetReport;
  deliveryState?: WorkflowWritebackTargetDeliveryState | null;
}): WorkflowWritebackTargetBindingResult {
  const dispatchId = normalizeOptionalIdentifier(input.dispatchId);
  if (!dispatchId) {
    return {
      valid: false,
      reason: "dispatch_not_found"
    };
  }

  const dispatchOrganizationId = normalizeOptionalIdentifier(
    input.dispatchOrganizationId
  );
  if (!dispatchOrganizationId) {
    return {
      valid: false,
      reason: "missing_dispatch_organization"
    };
  }

  const reportOrganizationId = normalizeOptionalIdentifier(
    input.reportCandidate.organizationId
  );
  if (reportOrganizationId !== dispatchOrganizationId) {
    return {
      valid: false,
      reason: "report_organization_mismatch"
    };
  }

  const payloadOrganizationId = normalizeOptionalIdentifier(
    input.payloadOrganizationId
  );
  if (payloadOrganizationId && payloadOrganizationId !== dispatchOrganizationId) {
    return {
      valid: false,
      reason: "payload_organization_mismatch"
    };
  }

  const reportWorkflowDispatchId = extractWorkflowDispatchIdFromReportJson(
    input.reportCandidate.reportJson
  );
  if (reportWorkflowDispatchId && reportWorkflowDispatchId !== dispatchId) {
    return {
      valid: false,
      reason: "report_dispatch_mismatch"
    };
  }

  const payloadReportReference = normalizeOptionalIdentifier(
    input.payloadReportReference
  );
  const deliveryStateOrganizationId = normalizeOptionalIdentifier(
    input.deliveryState?.organizationId
  );
  if (
    deliveryStateOrganizationId &&
    deliveryStateOrganizationId !== dispatchOrganizationId
  ) {
    return {
      valid: false,
      reason: "delivery_state_organization_mismatch"
    };
  }

  const deliveryStateReportId = normalizeOptionalIdentifier(
    input.deliveryState?.reportId
  );
  if (deliveryStateReportId && deliveryStateReportId !== input.reportCandidate.id) {
    return {
      valid: false,
      reason: "delivery_state_report_mismatch"
    };
  }

  const deliveryStateExternalResultReference = normalizeOptionalIdentifier(
    input.deliveryState?.externalResultReference
  );
  if (
    payloadReportReference &&
    payloadReportReference !== input.reportCandidate.id &&
    deliveryStateExternalResultReference &&
    deliveryStateExternalResultReference !== payloadReportReference
  ) {
    return {
      valid: false,
      reason: "delivery_state_reference_mismatch"
    };
  }

  const hasReportDispatchBinding = reportWorkflowDispatchId === dispatchId;
  const hasDeliveryStateReportBinding =
    deliveryStateReportId === input.reportCandidate.id;
  const hasDeliveryStateReferenceBinding =
    payloadReportReference !== null &&
    payloadReportReference !== input.reportCandidate.id &&
    deliveryStateExternalResultReference === payloadReportReference;

  if (
    !hasReportDispatchBinding &&
    !hasDeliveryStateReportBinding &&
    !hasDeliveryStateReferenceBinding
  ) {
    return {
      valid: false,
      reason: "missing_binding_proof"
    };
  }

  return {
    valid: true,
    reason: null
  };
}

export async function validateWorkflowWritebackTargetBinding(input: {
  db?: WorkflowWritebackTargetDbClient;
  dispatchId: string;
  payloadOrganizationId?: string | null;
  payloadReportReference?: string | null;
  reportCandidate: WorkflowWritebackTargetReport;
}): Promise<WorkflowWritebackTargetBindingResult> {
  const db = input.db ?? prisma;
  const dispatch = await db.workflowDispatch.findUnique({
    where: {
      id: input.dispatchId
    },
    select: {
      routingSnapshot: {
        select: {
          organizationId: true
        }
      }
    }
  });

  if (!dispatch?.routingSnapshot) {
    return {
      valid: false,
      reason: "dispatch_not_found"
    };
  }

  const deliveryState = await db.deliveryStateRecord.findUnique({
    where: {
      workflowDispatchId: input.dispatchId
    },
    select: {
      organizationId: true,
      reportId: true,
      externalResultReference: true
    }
  });

  return evaluateWorkflowWritebackTargetBinding({
    dispatchId: input.dispatchId,
    dispatchOrganizationId: dispatch.routingSnapshot.organizationId,
    payloadOrganizationId: input.payloadOrganizationId,
    payloadReportReference: input.payloadReportReference,
    reportCandidate: input.reportCandidate,
    deliveryState
  });
}
