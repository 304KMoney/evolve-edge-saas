import { StateGraph } from "@langchain/langgraph";
import type { AuditWorkflowOutput, ExecuteAuditWorkflowInput } from "../../providers/types";
import { auditWorkflowOutputSchema } from "../../providers/types";
import { isAiDebugModeEnabled } from "../../../../../lib/runtime-config";
import type { AuditWorkflowProgressState } from "../../../../../lib/customer-runs";
import {
  AuditWorkflowStateAnnotation,
  buildInitialAuditWorkflowState,
  auditWorkflowStateSchema,
  validateAuditWorkflowStateForPersistence,
  type AuditWorkflowState,
} from "./state";
import {
  AUDIT_WORKFLOW_NODE_SEQUENCE,
  buildAuditWorkflowResumePlan,
  type AuditWorkflowCheckpointStore,
  type AuditWorkflowNodeName,
} from "./checkpoints";
import {
  completeWorkflowTrace,
  failWorkflowTrace,
  recordNodeCompleted,
  recordNodeFailed,
  recordNodeStarted,
  startWorkflowTrace,
} from "../../observability/workflow-tracker";
import {
  businessContextNode,
  finalReportNode,
  frameworkMapperNode,
  remediationRoadmapNode,
  riskAnalysisNode,
  riskScoringNode,
  type AuditNodeDependencies,
} from "./nodes";

const CONTRACT_VERSION = "langgraph-audit.v1";

export type AuditWorkflowLogger = (
  event: string,
  payload: Record<string, unknown>
) => void;

export type AuditGraphDependencies = AuditNodeDependencies & {
  logger?: AuditWorkflowLogger;
  checkpointStore?: AuditWorkflowCheckpointStore | null;
  updateProgress?: (input: {
    assessmentId: string;
    workflowDispatchId: string;
    dispatchId: string;
    status: AuditWorkflowProgressState;
  }) => Promise<void>;
};

type AuditWorkflowStateType = typeof AuditWorkflowStateAnnotation.State;

export async function executeAuditWorkflowGraph(input: {
  workflowInput: ExecuteAuditWorkflowInput;
  dependencies: AuditGraphDependencies;
}): Promise<AuditWorkflowOutput> {
  const startedAt = Date.now();
  const resumePlan = await buildAuditWorkflowResumePlan({
    workflowInput: input.workflowInput,
    checkpointStore: input.dependencies.checkpointStore,
  });
  const initialState =
    resumePlan.state ??
    buildInitialAuditWorkflowState({
      orgId: input.workflowInput.orgId,
      assessmentId: input.workflowInput.assessmentId,
      workflowDispatchId: input.workflowInput.workflowDispatchId,
      dispatchId: input.workflowInput.dispatchId,
      customerEmail: input.workflowInput.customerEmail,
      companyName: input.workflowInput.companyName,
      industry: input.workflowInput.industry,
      companySize: input.workflowInput.companySize,
      planTier: input.workflowInput.planTier,
      selectedFrameworks: input.workflowInput.selectedFrameworks,
      assessmentAnswers: mapAssessmentAnswersToRecord(input.workflowInput),
      evidenceSummary: input.workflowInput.evidenceSummary,
    });

  input.dependencies.logger?.("audit_graph.started", {
    workflowDispatchId: initialState.workflowDispatchId,
    dispatchId: initialState.dispatchId,
    assessmentId: initialState.assessmentId,
    orgId: initialState.orgId,
    status: initialState.status,
    resumeMode: resumePlan.mode,
  });
  startWorkflowTrace({
    workflowDispatchId: initialState.workflowDispatchId,
    dispatchId: initialState.dispatchId,
    assessmentId: initialState.assessmentId,
    orgId: initialState.orgId,
  });

  const nodes = buildAuditWorkflowNodeExecutors(input.dependencies);
  let result = initialState;

  if (resumePlan.mode !== "paused_for_review") {
    for (
      let nodeIndex = Math.max(resumePlan.nextNodeIndex, 0);
      nodeIndex < AUDIT_WORKFLOW_NODE_SEQUENCE.length;
      nodeIndex += 1
    ) {
      const nodeName = AUDIT_WORKFLOW_NODE_SEQUENCE[nodeIndex];
      result = await runNode({
        nodeName,
        state: result,
        logger: input.dependencies.logger,
        checkpointStore: input.dependencies.checkpointStore,
        updateProgress: input.dependencies.updateProgress,
        executor: nodes[nodeName],
      });

      if (result.status === "failed") {
        break;
      }
    }
  } else {
    completeWorkflowTrace({
      workflowDispatchId: initialState.workflowDispatchId,
    });
  }

  if (result.status === "failed") {
    failWorkflowTrace({
      workflowDispatchId: result.workflowDispatchId,
      node:
        result.errors?.[result.errors.length - 1]?.split(":")[0]?.trim() || undefined,
      error: result.errors?.join("; ") || "Audit workflow execution failed.",
    });
    input.dependencies.logger?.("audit_graph.failed", {
      workflowDispatchId: result.workflowDispatchId,
      dispatchId: result.dispatchId,
      assessmentId: result.assessmentId,
      orgId: result.orgId,
      status: result.status,
      errors: result.errors ?? [],
      nodeTimingsMs: result.nodeTimingsMs,
    });

    throw new Error(
      result.errors?.join("; ") || "Audit workflow execution failed."
    );
  }

  const validatedState = validateAuditWorkflowStateForPersistence({
    ...result,
    status: "completed",
  });
  completeWorkflowTrace({
    workflowDispatchId: validatedState.workflowDispatchId,
  });

  input.dependencies.logger?.("audit_graph.completed", {
    workflowDispatchId: validatedState.workflowDispatchId,
    dispatchId: validatedState.dispatchId,
    assessmentId: validatedState.assessmentId,
    orgId: validatedState.orgId,
    status: validatedState.status,
    nodeTimingsMs: validatedState.nodeTimingsMs,
  });

  return buildAuditWorkflowOutput({
    state: validatedState,
    model: input.dependencies.defaultModel,
    reasoningModel: input.dependencies.reasoningModel,
    timeoutMs: input.dependencies.timeoutMs,
    executionMs: Date.now() - startedAt,
  });
}

export function buildAuditWorkflowGraph(dependencies: AuditGraphDependencies) {
  return new StateGraph(AuditWorkflowStateAnnotation)
    .addNode("business_context", async (state: AuditWorkflowStateType) =>
      buildStateUpdateDiff(
        state,
        await runNode({
        nodeName: "business_context",
        state,
        logger: dependencies.logger,
        checkpointStore: dependencies.checkpointStore,
        updateProgress: dependencies.updateProgress,
        executor: (currentState) => businessContextNode(currentState, dependencies),
      })
      )
    )
    .addNode("framework_mapper", async (state: AuditWorkflowStateType) =>
      buildStateUpdateDiff(
        state,
        await runNode({
        nodeName: "framework_mapper",
        state,
        logger: dependencies.logger,
        checkpointStore: dependencies.checkpointStore,
        updateProgress: dependencies.updateProgress,
        executor: (currentState) => frameworkMapperNode(currentState, dependencies),
      })
      )
    )
    .addNode("risk_analysis", async (state: AuditWorkflowStateType) =>
      buildStateUpdateDiff(
        state,
        await runNode({
        nodeName: "risk_analysis",
        state,
        logger: dependencies.logger,
        checkpointStore: dependencies.checkpointStore,
        updateProgress: dependencies.updateProgress,
        executor: (currentState) => riskAnalysisNode(currentState, dependencies),
      })
      )
    )
    .addNode("risk_scoring", async (state: AuditWorkflowStateType) =>
      buildStateUpdateDiff(
        state,
        await runNode({
        nodeName: "risk_scoring",
        state,
        logger: dependencies.logger,
        checkpointStore: dependencies.checkpointStore,
        updateProgress: dependencies.updateProgress,
        executor: (currentState) => riskScoringNode(currentState, dependencies),
      })
      )
    )
    .addNode("remediation_roadmap", async (state: AuditWorkflowStateType) =>
      buildStateUpdateDiff(
        state,
        await runNode({
        nodeName: "remediation_roadmap",
        state,
        logger: dependencies.logger,
        checkpointStore: dependencies.checkpointStore,
        updateProgress: dependencies.updateProgress,
        executor: (currentState) => remediationRoadmapNode(currentState, dependencies),
      })
      )
    )
    .addNode("final_report", async (state: AuditWorkflowStateType) =>
      buildStateUpdateDiff(
        state,
        await runNode({
        nodeName: "final_report",
        state,
        logger: dependencies.logger,
        checkpointStore: dependencies.checkpointStore,
        updateProgress: dependencies.updateProgress,
        executor: (currentState) => finalReportNode(currentState, dependencies),
      })
      )
    )
    .addEdge("__start__", "business_context")
    .addEdge("business_context", "framework_mapper")
    .addEdge("framework_mapper", "risk_analysis")
    .addEdge("risk_analysis", "risk_scoring")
    .addEdge("risk_scoring", "remediation_roadmap")
    .addEdge("remediation_roadmap", "final_report")
    .addEdge("final_report", "__end__")
    .compile({
      name: "evolve-edge-audit-workflow",
    });
}

async function runNode(input: {
  nodeName: AuditWorkflowNodeName;
  state: AuditWorkflowState;
  logger?: AuditWorkflowLogger;
  checkpointStore?: AuditWorkflowCheckpointStore | null;
  updateProgress?: AuditGraphDependencies["updateProgress"];
  executor: (state: AuditWorkflowState) => Promise<Partial<AuditWorkflowState>>;
}) {
  const startedAt = Date.now();
  await input.updateProgress?.({
    assessmentId: input.state.assessmentId,
    workflowDispatchId: input.state.workflowDispatchId,
    dispatchId: input.state.dispatchId,
    status: getProgressStatusForNode(input.nodeName),
  });
  input.logger?.("audit_graph.node.started", {
    node: input.nodeName,
    workflowDispatchId: input.state.workflowDispatchId,
    dispatchId: input.state.dispatchId,
    orgId: input.state.orgId,
    status: input.state.status,
  });
  recordNodeStarted({
    workflowDispatchId: input.state.workflowDispatchId,
    nodeName: input.nodeName,
  });
  await input.checkpointStore?.writeCheckpoint({
    workflowDispatchId: input.state.workflowDispatchId,
    dispatchId: input.state.dispatchId,
    orgId: input.state.orgId,
    assessmentId: input.state.assessmentId,
    nodeName: input.nodeName,
    status: "RUNNING",
    state: auditWorkflowStateSchema.parse({
      ...input.state,
      status: "running",
    }),
  });

  if (input.state.status === "failed") {
    return auditWorkflowStateSchema.parse({
      ...input.state,
      status: "failed" as const,
      nodeTimingsMs: {
        ...input.state.nodeTimingsMs,
        [input.nodeName]: 0,
      },
    });
  }

  try {
    const update = await input.executor(input.state);
    const durationMs = Date.now() - startedAt;
    const nextState = auditWorkflowStateSchema.parse({
      ...input.state,
      ...update,
      nodeTimingsMs: {
        ...input.state.nodeTimingsMs,
        [input.nodeName]: durationMs,
      },
    });
    recordNodeCompleted({
      workflowDispatchId: input.state.workflowDispatchId,
      nodeName: input.nodeName,
      durationMs,
      output: update,
      includeDebug: isAiDebugModeEnabled(),
    });
    input.logger?.("audit_graph.node.completed", {
      node: input.nodeName,
      workflowDispatchId: input.state.workflowDispatchId,
      dispatchId: input.state.dispatchId,
      orgId: input.state.orgId,
      durationMs,
      updatedKeys: Object.keys(update),
    });
    await input.checkpointStore?.writeCheckpoint({
      workflowDispatchId: nextState.workflowDispatchId,
      dispatchId: nextState.dispatchId,
      orgId: nextState.orgId,
      assessmentId: nextState.assessmentId,
      nodeName: input.nodeName,
      status:
        input.nodeName === "final_report" ? "PAUSED_FOR_REVIEW" : "COMPLETED",
      state: nextState,
    });

    return nextState;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `${input.nodeName} failed unexpectedly.`;
    const durationMs = Date.now() - startedAt;
    const failedState = auditWorkflowStateSchema.parse({
      ...input.state,
      status: "failed",
      errors: [...(input.state.errors ?? []), `${input.nodeName}: ${message}`],
      nodeTimingsMs: {
        ...input.state.nodeTimingsMs,
        [input.nodeName]: durationMs,
      },
    });
    recordNodeFailed({
      workflowDispatchId: input.state.workflowDispatchId,
      nodeName: input.nodeName,
      durationMs,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    input.logger?.("audit_graph.node.failed", {
      node: input.nodeName,
      workflowDispatchId: input.state.workflowDispatchId,
      dispatchId: input.state.dispatchId,
      orgId: input.state.orgId,
      durationMs,
      error: message,
    });
    await input.checkpointStore?.writeCheckpoint({
      workflowDispatchId: failedState.workflowDispatchId,
      dispatchId: failedState.dispatchId,
      orgId: failedState.orgId,
      assessmentId: failedState.assessmentId,
      nodeName: input.nodeName,
      status: "FAILED",
      state: failedState,
      errorMessage: message,
    });

    return failedState;
  }
}

function getProgressStatusForNode(
  nodeName: AuditWorkflowNodeName
): AuditWorkflowProgressState {
  switch (nodeName) {
    case "business_context":
      return "preparing_context";
    case "framework_mapper":
      return "mapping_frameworks";
    case "risk_analysis":
      return "analyzing_risks";
    case "risk_scoring":
      return "scoring_risk";
    case "remediation_roadmap":
      return "building_roadmap";
    case "final_report":
      return "generating_report";
    default:
      return "queued";
  }
}

function buildAuditWorkflowNodeExecutors(dependencies: AuditGraphDependencies) {
  return {
    business_context: (currentState: AuditWorkflowState) =>
      businessContextNode(currentState, dependencies),
    framework_mapper: (currentState: AuditWorkflowState) =>
      frameworkMapperNode(currentState, dependencies),
    risk_analysis: (currentState: AuditWorkflowState) =>
      riskAnalysisNode(currentState, dependencies),
    risk_scoring: (currentState: AuditWorkflowState) =>
      riskScoringNode(currentState, dependencies),
    remediation_roadmap: (currentState: AuditWorkflowState) =>
      remediationRoadmapNode(currentState, dependencies),
    final_report: (currentState: AuditWorkflowState) =>
      finalReportNode(currentState, dependencies),
  } satisfies Record<
    AuditWorkflowNodeName,
    (state: AuditWorkflowState) => Promise<Partial<AuditWorkflowState>>
  >;
}

function buildStateUpdateDiff(
  previous: AuditWorkflowStateType,
  next: AuditWorkflowState
) {
  const updates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify((previous as Record<string, unknown>)[key]) !== JSON.stringify(value)) {
      updates[key] = value;
    }
  }

  return updates;
}

function buildAuditWorkflowOutput(input: {
  state: ReturnType<typeof validateAuditWorkflowStateForPersistence>;
  model: string;
  reasoningModel: string | null;
  timeoutMs: number;
  executionMs: number;
}): AuditWorkflowOutput {
  const roadmap = [
    ...input.state.remediationRoadmap.immediateActions,
    ...input.state.remediationRoadmap.nearTermActions,
    ...input.state.remediationRoadmap.strategicActions,
  ];
  const findings = input.state.riskAnalysis.findings.map((finding) => ({
    title: finding.title,
    summary: `${finding.summary} Impact: ${finding.businessImpact}`,
    severity: mapSeverity(finding.severity),
    riskDomain: finding.controlDomain,
    impactedFrameworks: finding.impactedFrameworks,
    score: mapFindingScore(finding.severity),
  }));
  const recommendations = roadmap.map((action) => ({
    title: action.title,
    description: action.description,
    priority: action.priority,
    ownerRole: action.ownerRole,
    effort: mapPriorityToEffort(action.priority),
    targetTimeline: action.targetTimeline,
  }));

  return auditWorkflowOutputSchema.parse({
    provider: "openai_langgraph",
    workflowDispatchId: input.state.workflowDispatchId,
    status: "completed",
    businessContext: input.state.businessContext,
    frameworkMapping: input.state.frameworkMapping,
    riskAnalysis: input.state.riskAnalysis,
    riskScoring: input.state.riskScoring,
    remediationRoadmap: input.state.remediationRoadmap,
    finalReport: input.state.finalReport,
    metadata: {
      model: input.model,
      reasoningModel: input.reasoningModel,
      timeoutMs: input.timeoutMs,
      executionMs: input.executionMs,
      nodeTimingsMs: input.state.nodeTimingsMs,
      contractVersion: CONTRACT_VERSION,
    },
    executiveSummary: input.state.finalReport.executiveSummary,
    postureScore: input.state.riskScoring.complianceScore,
    riskLevel: input.state.riskScoring.riskLevel,
    topConcerns: input.state.riskScoring.keyDrivers,
    findings,
    recommendations,
    roadmap: recommendations,
    finalReportText: input.state.finalReport.detailedReport,
  });
}

function mapAssessmentAnswersToRecord(
  input: ExecuteAuditWorkflowInput
): Record<string, unknown> {
  return Object.fromEntries(
    input.assessmentAnswers.map((answer, index) => [
      answer.key ?? `answer_${index + 1}`,
      {
        question: answer.question,
        answer: answer.answer,
        notes: answer.notes ?? null,
      },
    ])
  );
}

function mapSeverity(severity: "Low" | "Moderate" | "High") {
  switch (severity) {
    case "High":
      return "HIGH" as const;
    case "Moderate":
      return "MEDIUM" as const;
    case "Low":
    default:
      return "LOW" as const;
  }
}

function mapFindingScore(severity: "Low" | "Moderate" | "High") {
  switch (severity) {
    case "High":
      return 35;
    case "Moderate":
      return 60;
    case "Low":
    default:
      return 82;
  }
}

function mapPriorityToEffort(priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT") {
  switch (priority) {
    case "URGENT":
    case "HIGH":
      return "Medium";
    case "MEDIUM":
      return "Low";
    case "LOW":
    default:
      return "Low";
  }
}
