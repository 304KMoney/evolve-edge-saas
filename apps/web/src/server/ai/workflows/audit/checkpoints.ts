import {
  AuditWorkflowCheckpointStatus,
  prisma,
  type Prisma,
} from "@evolve-edge/db";
import type { ExecuteAuditWorkflowInput } from "../../providers/types";
import {
  sanitizeWorkflowErrorMessage,
  sanitizeWorkflowValue,
} from "../../observability/trace";
import {
  auditWorkflowStateSchema,
  buildInitialAuditWorkflowState,
  type AuditWorkflowState,
} from "./state";

export const AUDIT_WORKFLOW_NODE_SEQUENCE = [
  "business_context",
  "framework_mapper",
  "risk_analysis",
  "risk_scoring",
  "remediation_roadmap",
  "final_report",
] as const;

export type AuditWorkflowNodeName = (typeof AUDIT_WORKFLOW_NODE_SEQUENCE)[number];

export type PersistedAuditWorkflowCheckpoint = {
  id: string;
  analysisJobId: string | null;
  workflowDispatchId: string;
  dispatchId: string;
  orgId: string;
  assessmentId: string;
  nodeName: AuditWorkflowNodeName;
  nodeOrder: number;
  status:
    | "RUNNING"
    | "COMPLETED"
    | "FAILED"
    | "PAUSED_FOR_REVIEW";
  stateSnapshot: AuditWorkflowState;
  errorMessage: string | null;
  createdAt: string;
};

export type AuditWorkflowResumePlan = {
  state: AuditWorkflowState;
  nextNodeIndex: number;
  mode:
    | "fresh"
    | "resume_failed"
    | "resume_interrupted"
    | "resume_completed"
    | "paused_for_review";
  checkpoints: PersistedAuditWorkflowCheckpoint[];
  latestCheckpoint: PersistedAuditWorkflowCheckpoint | null;
};

type CheckpointDbClient = Pick<typeof prisma, "analysisJob" | "auditWorkflowCheckpoint">;

export interface AuditWorkflowCheckpointStore {
  writeCheckpoint(input: {
    workflowDispatchId: string;
    dispatchId: string;
    orgId: string;
    assessmentId: string;
    nodeName: AuditWorkflowNodeName;
    status: AuditWorkflowCheckpointStatus;
    state: AuditWorkflowState;
    errorMessage?: string | null;
  }): Promise<PersistedAuditWorkflowCheckpoint>;
  listCheckpoints(
    workflowDispatchId: string
  ): Promise<PersistedAuditWorkflowCheckpoint[]>;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nodeOrder(nodeName: AuditWorkflowNodeName) {
  return AUDIT_WORKFLOW_NODE_SEQUENCE.indexOf(nodeName);
}

function sanitizeCheckpointState(state: AuditWorkflowState): AuditWorkflowState {
  const sanitized = sanitizeWorkflowValue(state);

  return auditWorkflowStateSchema.parse({
    ...(sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? sanitized
      : {}),
    customerEmail: null,
  });
}

function restoreCheckpointState(
  workflowInput: ExecuteAuditWorkflowInput,
  snapshot?: AuditWorkflowState | null
) {
  const baseState = buildInitialAuditWorkflowState({
    orgId: workflowInput.orgId,
    assessmentId: workflowInput.assessmentId,
    workflowDispatchId: workflowInput.workflowDispatchId,
    dispatchId: workflowInput.dispatchId,
    customerEmail: workflowInput.customerEmail,
    companyName: workflowInput.companyName,
    industry: workflowInput.industry,
    companySize: workflowInput.companySize,
    planTier: workflowInput.planTier,
    selectedFrameworks: workflowInput.selectedFrameworks,
    assessmentAnswers: Object.fromEntries(
      workflowInput.assessmentAnswers.map((answer, index) => [
        answer.key ?? `answer_${index + 1}`,
        {
          question: answer.question,
          answer: answer.answer,
          notes: answer.notes ?? null,
        },
      ])
    ),
    evidenceSummary: workflowInput.evidenceSummary,
  });

  if (!snapshot) {
    return baseState;
  }

  return auditWorkflowStateSchema.parse({
    ...baseState,
    businessContext: snapshot.businessContext,
    frameworkMapping: snapshot.frameworkMapping,
    riskAnalysis: snapshot.riskAnalysis,
    riskScoring: snapshot.riskScoring,
    remediationRoadmap: snapshot.remediationRoadmap,
    finalReport: snapshot.finalReport,
    status: snapshot.status,
    errors: snapshot.errors ?? [],
    nodeTimingsMs: snapshot.nodeTimingsMs ?? {},
  });
}

function mapCheckpointRecord(
  record: {
    id: string;
    analysisJobId: string | null;
    workflowDispatchId: string;
    dispatchId: string;
    orgId: string;
    assessmentId: string;
    nodeName: string;
    nodeOrder: number;
    status: AuditWorkflowCheckpointStatus;
    stateSnapshot: Prisma.JsonValue;
    errorMessage: string | null;
    createdAt: Date;
  }
): PersistedAuditWorkflowCheckpoint {
  return {
    id: record.id,
    analysisJobId: record.analysisJobId,
    workflowDispatchId: record.workflowDispatchId,
    dispatchId: record.dispatchId,
    orgId: record.orgId,
    assessmentId: record.assessmentId,
    nodeName: record.nodeName as AuditWorkflowNodeName,
    nodeOrder: record.nodeOrder,
    status: record.status,
    stateSnapshot: auditWorkflowStateSchema.parse(record.stateSnapshot),
    errorMessage: record.errorMessage,
    createdAt: record.createdAt.toISOString(),
  };
}

export function createInMemoryAuditWorkflowCheckpointStore() {
  const checkpoints: PersistedAuditWorkflowCheckpoint[] = [];

  return {
    store: {
      async writeCheckpoint(input) {
        const checkpoint: PersistedAuditWorkflowCheckpoint = {
          id: `ckpt_${checkpoints.length + 1}`,
          analysisJobId: null,
          workflowDispatchId: input.workflowDispatchId,
          dispatchId: input.dispatchId,
          orgId: input.orgId,
          assessmentId: input.assessmentId,
          nodeName: input.nodeName,
          nodeOrder: nodeOrder(input.nodeName),
          status: input.status,
          stateSnapshot: sanitizeCheckpointState(input.state),
          errorMessage: input.errorMessage
            ? sanitizeWorkflowErrorMessage(input.errorMessage)
            : null,
          createdAt: new Date().toISOString(),
        };
        checkpoints.push(checkpoint);
        return checkpoint;
      },
      async listCheckpoints(workflowDispatchId) {
        return checkpoints.filter(
          (checkpoint) => checkpoint.workflowDispatchId === workflowDispatchId
        );
      },
    } satisfies AuditWorkflowCheckpointStore,
    checkpoints,
  };
}

export function createPrismaAuditWorkflowCheckpointStore(
  db: CheckpointDbClient = prisma
): AuditWorkflowCheckpointStore {
  const analysisJobIdCache = new Map<string, string | null>();

  async function resolveAnalysisJobId(workflowDispatchId: string) {
    if (analysisJobIdCache.has(workflowDispatchId)) {
      return analysisJobIdCache.get(workflowDispatchId) ?? null;
    }

    const job = await db.analysisJob.findFirst({
      where: {
        jobType: "assessment_analysis",
        inputPayload: {
          path: ["workflowDispatchId"],
          equals: workflowDispatchId,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    analysisJobIdCache.set(workflowDispatchId, job?.id ?? null);
    return job?.id ?? null;
  }

  return {
    async writeCheckpoint(input) {
      const checkpoint = await db.auditWorkflowCheckpoint.create({
        data: {
          analysisJobId: await resolveAnalysisJobId(input.workflowDispatchId),
          workflowDispatchId: input.workflowDispatchId,
          dispatchId: input.dispatchId,
          orgId: input.orgId,
          assessmentId: input.assessmentId,
          nodeName: input.nodeName,
          nodeOrder: nodeOrder(input.nodeName),
          status: input.status,
          stateSnapshot: toJsonValue(sanitizeCheckpointState(input.state)),
          errorMessage: input.errorMessage
            ? sanitizeWorkflowErrorMessage(input.errorMessage)
            : null,
        },
      });

      return mapCheckpointRecord(checkpoint);
    },
    async listCheckpoints(workflowDispatchId) {
      const checkpoints = await db.auditWorkflowCheckpoint.findMany({
        where: { workflowDispatchId },
        orderBy: [{ createdAt: "asc" }, { nodeOrder: "asc" }],
      });

      return checkpoints.map(mapCheckpointRecord);
    },
  };
}

export async function buildAuditWorkflowResumePlan(input: {
  workflowInput: ExecuteAuditWorkflowInput;
  checkpointStore?: AuditWorkflowCheckpointStore | null;
}): Promise<AuditWorkflowResumePlan> {
  const checkpoints = input.checkpointStore
    ? await input.checkpointStore.listCheckpoints(input.workflowInput.workflowDispatchId)
    : [];
  const latestCheckpoint = checkpoints[checkpoints.length - 1] ?? null;
  const latestSafeCheckpoint =
    [...checkpoints]
      .reverse()
      .find(
        (checkpoint) =>
          checkpoint.status === "COMPLETED" ||
          checkpoint.status === "PAUSED_FOR_REVIEW"
      ) ?? null;

  if (!latestCheckpoint) {
    return {
      state: restoreCheckpointState(input.workflowInput, null),
      nextNodeIndex: 0,
      mode: "fresh",
      checkpoints,
      latestCheckpoint: null,
    };
  }

  if (latestCheckpoint.status === "PAUSED_FOR_REVIEW") {
    return {
      state: restoreCheckpointState(
        input.workflowInput,
        latestCheckpoint.stateSnapshot
      ),
      nextNodeIndex: AUDIT_WORKFLOW_NODE_SEQUENCE.length,
      mode: "paused_for_review",
      checkpoints,
      latestCheckpoint,
    };
  }

  if (latestCheckpoint.status === "FAILED") {
    return {
      state: restoreCheckpointState(
        input.workflowInput,
        latestSafeCheckpoint?.stateSnapshot ?? null
      ),
      nextNodeIndex: Math.max(latestCheckpoint.nodeOrder, 0),
      mode: "resume_failed",
      checkpoints,
      latestCheckpoint,
    };
  }

  if (latestCheckpoint.status === "RUNNING") {
    return {
      state: restoreCheckpointState(
        input.workflowInput,
        latestSafeCheckpoint?.stateSnapshot ?? null
      ),
      nextNodeIndex: Math.max(latestCheckpoint.nodeOrder, 0),
      mode: "resume_interrupted",
      checkpoints,
      latestCheckpoint,
    };
  }

  return {
    state: restoreCheckpointState(
      input.workflowInput,
      latestCheckpoint.stateSnapshot
    ),
    nextNodeIndex: latestCheckpoint.nodeOrder + 1,
    mode: "resume_completed",
    checkpoints,
    latestCheckpoint,
  };
}
