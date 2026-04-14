import "server-only";

import type { Prisma } from "@evolve-edge/db";
import {
  expectObject,
  readOptionalEnumValue,
  readOptionalJsonValue,
  readOptionalString,
  readOptionalStringArray,
  readRequiredString,
  type JsonObject,
  ValidationError
} from "./security-validation";

const WRITEBACK_PLAN_CODES = ["starter", "scale", "enterprise"] as const;
const WRITEBACK_REPORT_STATUSES = [
  "received",
  "processing",
  "awaiting_review",
  "ready",
  "delivered",
  "failed"
] as const;
const WRITEBACK_DELIVERY_STATUSES = [
  "generated",
  "reviewed",
  "sent",
  "briefing_booked",
  "briefing_completed",
  "failed"
] as const;
const WRITEBACK_DOWNLOAD_STATUSES = [
  "not_ready",
  "ready",
  "delivered",
  "failed"
] as const;
const WRITEBACK_OPERATOR_EVENT_CODES = [
  "report_processing",
  "report_ready",
  "report_delivered",
  "delivery_failed"
] as const;
const WRITEBACK_OPERATOR_SEVERITIES = ["info", "warning", "critical"] as const;

export type WorkflowWritebackPayload = {
  correlationId: string;
  dispatchId: string;
  reportId: string | null;
  reportReference: string | null;
  organizationId: string | null;
  customerId: string | null;
  customerEmail: string | null;
  selectedPlan: (typeof WRITEBACK_PLAN_CODES)[number] | null;
  reportUpdate: {
    reportStatus: (typeof WRITEBACK_REPORT_STATUSES)[number] | null;
    executiveSummary: string | null;
    overallRiskPosture:
      | {
          score: number | null;
          level: string | null;
          summary: string | null;
        }
      | null;
    findings: string[] | null;
    gaps: string[] | null;
    actions: string[] | null;
    roadmap:
      | {
          days30: string[] | null;
          days60: string[] | null;
          days90: string[] | null;
        }
      | null;
  } | null;
  artifactUpdate: {
    artifactType: string | null;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
    downloadStatus: (typeof WRITEBACK_DOWNLOAD_STATUSES)[number] | null;
    downloadUrl: string | null;
    availableAt: string | null;
  } | null;
  deliveryUpdate: {
    deliveryStatus: (typeof WRITEBACK_DELIVERY_STATUSES)[number] | null;
    deliveredAt: string | null;
    deliveryMessage: string | null;
  } | null;
  operatorEvent: {
    message: string;
    severity: (typeof WRITEBACK_OPERATOR_SEVERITIES)[number];
    eventCode: (typeof WRITEBACK_OPERATOR_EVENT_CODES)[number] | null;
    metadata: Prisma.InputJsonValue | null;
  } | null;
  metadata: Prisma.InputJsonValue | null;
};

function readOptionalNumber(
  input: JsonObject,
  field: string,
  options?: { min?: number; max?: number }
) {
  const value = input[field];
  if (value == null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a number.`);
  }

  if (options?.min != null && value < options.min) {
    throw new ValidationError(`${field} must be ${options.min} or greater.`);
  }

  if (options?.max != null && value > options.max) {
    throw new ValidationError(`${field} must be ${options.max} or less.`);
  }

  return value;
}

function readOptionalObject(input: JsonObject, field: string) {
  const value = input[field];
  if (value == null) {
    return null;
  }

  return expectObject(value, field);
}

export function parseWorkflowWritebackPayload(
  input: unknown
): WorkflowWritebackPayload {
  const payload = expectObject(input);
  const correlationId = readRequiredString(payload, "correlation_id", {
    maxLength: 200
  });
  const dispatchId = readRequiredString(payload, "dispatch_id", {
    maxLength: 200
  });
  const reportId = readOptionalString(payload, "report_id", {
    maxLength: 200
  });
  const reportReference = readOptionalString(payload, "report_reference", {
    maxLength: 200
  });

  if (!reportId && !reportReference) {
    throw new ValidationError(
      "One of report_id or report_reference is required."
    );
  }

  const reportUpdateInput = readOptionalObject(payload, "report_update");
  const artifactUpdateInput = readOptionalObject(payload, "artifact_update");
  const deliveryUpdateInput = readOptionalObject(payload, "delivery_update");
  const operatorEventInput = readOptionalObject(payload, "operator_event");
  const riskPostureInput = reportUpdateInput
    ? readOptionalObject(reportUpdateInput, "overall_risk_posture")
    : null;
  const roadmapInput = reportUpdateInput
    ? readOptionalObject(reportUpdateInput, "roadmap")
    : null;

  return {
    correlationId,
    dispatchId,
    reportId,
    reportReference,
    organizationId: readOptionalString(payload, "organization_id", {
      maxLength: 200
    }),
    customerId: readOptionalString(payload, "customer_id", {
      maxLength: 200
    }),
    customerEmail: readOptionalString(payload, "customer_email", {
      maxLength: 320
    }),
    selectedPlan: readOptionalEnumValue(
      payload,
      "selected_plan",
      WRITEBACK_PLAN_CODES
    ),
    reportUpdate: reportUpdateInput
      ? {
          reportStatus: readOptionalEnumValue(
            reportUpdateInput,
            "report_status",
            WRITEBACK_REPORT_STATUSES
          ),
          executiveSummary: readOptionalString(
            reportUpdateInput,
            "executive_summary",
            {
              maxLength: 20_000,
              allowEmpty: true
            }
          ),
          overallRiskPosture: riskPostureInput
            ? {
                score: readOptionalNumber(riskPostureInput, "score"),
                level: readOptionalString(riskPostureInput, "level", {
                  maxLength: 100
                }),
                summary: readOptionalString(riskPostureInput, "summary", {
                  maxLength: 2_000,
                  allowEmpty: true
                })
              }
            : null,
          findings:
            "findings" in reportUpdateInput
              ? readOptionalStringArray(reportUpdateInput, "findings", {
                  maxItems: 100,
                  maxItemLength: 2_000
                })
              : null,
          gaps:
            "gaps" in reportUpdateInput
              ? readOptionalStringArray(reportUpdateInput, "gaps", {
                  maxItems: 100,
                  maxItemLength: 2_000
                })
              : null,
          actions:
            "actions" in reportUpdateInput
              ? readOptionalStringArray(reportUpdateInput, "actions", {
                  maxItems: 100,
                  maxItemLength: 2_000
                })
              : null,
          roadmap: roadmapInput
            ? {
                days30:
                  "days30" in roadmapInput
                    ? readOptionalStringArray(roadmapInput, "days30", {
                        maxItems: 50,
                        maxItemLength: 2_000
                      })
                    : null,
                days60:
                  "days60" in roadmapInput
                    ? readOptionalStringArray(roadmapInput, "days60", {
                        maxItems: 50,
                        maxItemLength: 2_000
                      })
                    : null,
                days90:
                  "days90" in roadmapInput
                    ? readOptionalStringArray(roadmapInput, "days90", {
                        maxItems: 50,
                        maxItemLength: 2_000
                      })
                    : null
              }
            : null
        }
      : null,
    artifactUpdate: artifactUpdateInput
      ? {
          artifactType: readOptionalString(
            artifactUpdateInput,
            "artifact_type",
            { maxLength: 100 }
          ),
          fileName: readOptionalString(artifactUpdateInput, "file_name", {
            maxLength: 255
          }),
          mimeType: readOptionalString(artifactUpdateInput, "mime_type", {
            maxLength: 255
          }),
          fileSize: readOptionalNumber(artifactUpdateInput, "file_size", {
            min: 0
          }),
          downloadStatus: readOptionalEnumValue(
            artifactUpdateInput,
            "download_status",
            WRITEBACK_DOWNLOAD_STATUSES
          ),
          downloadUrl: readOptionalString(artifactUpdateInput, "download_url", {
            maxLength: 2_000
          }),
          availableAt: readOptionalString(artifactUpdateInput, "available_at", {
            maxLength: 100
          })
        }
      : null,
    deliveryUpdate: deliveryUpdateInput
      ? {
          deliveryStatus: readOptionalEnumValue(
            deliveryUpdateInput,
            "delivery_status",
            WRITEBACK_DELIVERY_STATUSES
          ),
          deliveredAt: readOptionalString(deliveryUpdateInput, "delivered_at", {
            maxLength: 100
          }),
          deliveryMessage: readOptionalString(
            deliveryUpdateInput,
            "delivery_message",
            {
              maxLength: 2_000,
              allowEmpty: true
            }
          )
        }
      : null,
    operatorEvent: operatorEventInput
      ? {
          message: readRequiredString(operatorEventInput, "message", {
            maxLength: 2_000
          }),
          severity:
            readOptionalEnumValue(
              operatorEventInput,
              "severity",
              WRITEBACK_OPERATOR_SEVERITIES
            ) ?? "info",
          eventCode: readOptionalEnumValue(
            operatorEventInput,
            "event_code",
            WRITEBACK_OPERATOR_EVENT_CODES
          ),
          metadata: readOptionalJsonValue(operatorEventInput, "metadata")
        }
      : null,
    metadata: readOptionalJsonValue(payload, "metadata")
  };
}
