import { z } from "zod";
import { prisma, AssessmentStatus, JobStatus, Prisma } from "@evolve-edge/db";
import { getAiExecutionProvider, isAiDebugModeEnabled } from "./runtime-config";
import {
  commercialRoutingPolicySchema,
  executeAuditWorkflowInputSchema
} from "../src/server/ai/providers/types";
import {
  buildSafeWorkflowFailure,
} from "../src/server/ai/observability/trace";
import {
  getWorkflowTraceByDispatchId,
} from "../src/server/ai/observability/workflow-tracker";

export const aiExecutionDispatchPayloadSchema = executeAuditWorkflowInputSchema.strict();

export type AiExecutionDispatchPayload = z.infer<
  typeof aiExecutionDispatchPayloadSchema
>;

type AiExecutionDispatchDependencies = {
  db?: Pick<typeof prisma, "assessment" | "analysisJob" | "workflowDispatch">;
};

function toJsonValue(value: AiExecutionDispatchPayload): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractCommercialRoutingFromHints(
  normalizedHints: Prisma.JsonValue | null | undefined,
  planTier: AiExecutionDispatchPayload["planTier"]
) {
  const hints = readJsonObject(normalizedHints);
  const capabilityProfile = readJsonObject(hints?.capability_profile);

  if (!hints || !capabilityProfile) {
    return undefined;
  }

  const parsed = commercialRoutingPolicySchema.safeParse({
    planTier,
    workflowCode:
      typeof hints.workflow_code === "string" ? hints.workflow_code : "audit_starter",
    entitlementSource:
      typeof hints.entitlement_source === "string"
        ? hints.entitlement_source
        : "subscription",
    reportDepth:
      typeof capabilityProfile.report_depth === "string"
        ? capabilityProfile.report_depth
        : "concise",
    maxFindings:
      typeof capabilityProfile.max_findings === "number"
        ? capabilityProfile.max_findings
        : 5,
    roadmapDetail:
      typeof capabilityProfile.roadmap_detail === "string"
        ? capabilityProfile.roadmap_detail
        : "standard",
    executiveBriefingEligible:
      typeof capabilityProfile.executive_briefing_eligible === "boolean"
        ? capabilityProfile.executive_briefing_eligible
        : false,
    monitoringAddOnEligible:
      typeof capabilityProfile.monitoring_add_on_eligible === "boolean"
        ? capabilityProfile.monitoring_add_on_eligible
        : false,
    addOnEligible:
      typeof capabilityProfile.add_on_eligible === "boolean"
        ? capabilityProfile.add_on_eligible
        : false,
    immutable: true
  });

  return parsed.success ? parsed.data : undefined;
}

function mapJobStatusToDispatchStatus(status: JobStatus) {
  switch (status) {
    case JobStatus.RUNNING:
      return "running" as const;
    case JobStatus.SUCCEEDED:
      return "completed" as const;
    case JobStatus.FAILED:
      return "failed" as const;
    case JobStatus.CANCELED:
      return "canceled" as const;
    case JobStatus.QUEUED:
    default:
      return "queued" as const;
  }
}

function expectsCallback(status: ReturnType<typeof mapJobStatusToDispatchStatus>) {
  return status === "queued" || status === "running";
}

export async function handleAiExecutionDispatch(
  payload: AiExecutionDispatchPayload,
  dependencies?: AiExecutionDispatchDependencies
) {
  const validated = aiExecutionDispatchPayloadSchema.parse(payload);
  const db = dependencies?.db ?? prisma;
  const assessment = await db.assessment.findUnique({
    where: { id: validated.assessmentId },
    select: {
      id: true,
      organizationId: true
    }
  });

  if (!assessment) {
    throw new Error("Assessment was not found for AI execution dispatch.");
  }

  if (assessment.organizationId !== validated.orgId) {
    throw new Error("Assessment organization does not match the requested orgId.");
  }

  const provider = getAiExecutionProvider();
  const dispatchRouting = await db.workflowDispatch.findUnique({
    where: { id: validated.workflowDispatchId },
    select: {
      routingSnapshot: {
        select: {
          normalizedHintsJson: true
        }
      }
    }
  });
  const queuedPayload = executeAuditWorkflowInputSchema.parse({
    ...validated,
    commercialRouting:
      validated.commercialRouting ??
      extractCommercialRoutingFromHints(
        dispatchRouting?.routingSnapshot.normalizedHintsJson,
        validated.planTier
      )
  });
  const existingDispatchJob = await db.analysisJob.findFirst({
    where: {
      jobType: "assessment_analysis",
      inputPayload: {
        path: ["workflowDispatchId"],
        equals: queuedPayload.workflowDispatchId
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existingDispatchJob) {
    const status = mapJobStatusToDispatchStatus(existingDispatchJob.status);
    const trace = await getWorkflowTraceByDispatchId(queuedPayload.workflowDispatchId, {
      includeDebug: isAiDebugModeEnabled(),
      db: db as Pick<typeof prisma, "analysisJob">,
    });
    const failure =
      status === "failed" && trace?.status === "failed"
        ? buildSafeWorkflowFailure(trace)
        : null;

    return {
      accepted: true,
      provider,
      workflowDispatchId: queuedPayload.workflowDispatchId,
      dispatchId: queuedPayload.dispatchId,
      status,
      nextCallbackExpected: expectsCallback(status),
      ...(failure ?? {}),
      ...(isAiDebugModeEnabled() && trace ? { trace } : {}),
    } as const;
  }

  const existingJob = await db.analysisJob.findFirst({
    where: {
      assessmentId: validated.assessmentId,
      jobType: "assessment_analysis"
    },
    orderBy: { createdAt: "desc" }
  });

  const jobData = {
    provider,
    status: JobStatus.QUEUED,
    completedAt: null,
    startedAt: null,
    lastAttemptAt: null,
    providerRequestId: null,
    requestHash: null,
    attemptCount: 0,
    errorMessage: null,
    contractVersion: "langgraph-audit.v1",
    workflowVersion: "langgraph-audit.v1",
    inputPayload: toJsonValue(queuedPayload)
  };

  if (existingJob) {
    await db.analysisJob.update({
      where: { id: existingJob.id },
      data: jobData
    });
  } else {
    await db.analysisJob.create({
      data: {
        assessmentId: queuedPayload.assessmentId,
        jobType: "assessment_analysis",
        ...jobData
      }
    });
  }

  await db.assessment.update({
    where: { id: queuedPayload.assessmentId },
    data: {
      status: AssessmentStatus.ANALYSIS_QUEUED
    }
  });

  return {
    accepted: true,
    provider,
    workflowDispatchId: queuedPayload.workflowDispatchId,
    dispatchId: queuedPayload.dispatchId,
    status: "queued",
    nextCallbackExpected: true,
  } as const;
}
