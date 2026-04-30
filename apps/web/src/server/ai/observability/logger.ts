import { logServerEvent } from "../../../../lib/monitoring";

type WorkflowLogStatus = "start" | "success" | "failure";

export function logNodeExecution(input: {
  node: string;
  workflowDispatchId: string;
  dispatchId: string;
  orgId: string;
  status: WorkflowLogStatus;
  durationMs?: number;
  error?: string;
}) {
  logServerEvent(input.status === "failure" ? "warn" : "info", "ai.workflow.node", {
    workflowDispatchId: input.workflowDispatchId,
    dispatchId: input.dispatchId,
    orgId: input.orgId,
    status: input.status,
    source: "openai_langgraph.workflow",
    metadata: {
      node: input.node,
      durationMs: input.durationMs ?? null,
      error: input.error ?? null,
    },
  });
}

export function logWorkflowExecution(input: {
  workflowDispatchId: string;
  dispatchId: string;
  orgId: string;
  status: "start" | "success" | "failure";
  durationMs?: number;
  error?: string;
}) {
  logServerEvent(input.status === "failure" ? "warn" : "info", "ai.workflow.execution", {
    workflowDispatchId: input.workflowDispatchId,
    dispatchId: input.dispatchId,
    orgId: input.orgId,
    status: input.status,
    source: "openai_langgraph.workflow",
    metadata: {
      durationMs: input.durationMs ?? null,
      error: input.error ?? null,
    },
  });
}

