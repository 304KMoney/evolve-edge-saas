import OpenAI from "openai";
import {
  type AuditWorkflowOutput,
  type ExecuteAuditWorkflowOptions,
  type AuditWorkflowProvider,
  type ExecuteAuditWorkflowInput,
  executeAuditWorkflowInputSchema
} from "./types";
import { executeAuditWorkflowGraph } from "../workflows/audit/graph";
import {
  createPrismaAuditWorkflowCheckpointStore,
  type AuditWorkflowCheckpointStore,
} from "../workflows/audit/checkpoints";
import {
  logNodeExecution,
  logWorkflowExecution,
} from "../observability/logger";
import { logServerEvent } from "../../../../lib/monitoring";

type OpenAiLangGraphProviderOptions = {
  apiKey: string;
  model: string;
  cheapModel: string;
  strongModel: string;
  reasoningModel: string | null;
  timeoutMs: number;
  maxInputChars: number;
  planInputCharLimits: Record<"starter" | "scale" | "enterprise", number>;
  pricing: {
    cheapInputPer1M: number;
    cheapOutputPer1M: number;
    strongInputPer1M: number;
    strongOutputPer1M: number;
  };
  checkpointStore?: AuditWorkflowCheckpointStore | null;
};

export class OpenAiLangGraphProvider implements AuditWorkflowProvider {
  readonly provider = "openai_langgraph" as const;

  private readonly client: OpenAI;
  private readonly model: string;
  private readonly cheapModel: string;
  private readonly strongModel: string;
  private readonly reasoningModel: string | null;
  private readonly timeoutMs: number;
  private readonly maxInputChars: number;
  private readonly planInputCharLimits: Record<"starter" | "scale" | "enterprise", number>;
  private readonly pricing: OpenAiLangGraphProviderOptions["pricing"];
  private readonly checkpointStore: AuditWorkflowCheckpointStore | null;

  constructor(options: OpenAiLangGraphProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs
    });
    this.model = options.model;
    this.cheapModel = options.cheapModel;
    this.strongModel = options.strongModel;
    this.reasoningModel = options.reasoningModel;
    this.timeoutMs = options.timeoutMs;
    this.maxInputChars = options.maxInputChars;
    this.planInputCharLimits = options.planInputCharLimits;
    this.pricing = options.pricing;
    this.checkpointStore =
      options.checkpointStore === undefined
        ? createPrismaAuditWorkflowCheckpointStore()
        : options.checkpointStore;
  }

  async executeAuditWorkflow(
    input: ExecuteAuditWorkflowInput,
    options?: ExecuteAuditWorkflowOptions
  ): Promise<AuditWorkflowOutput> {
    const validatedInput = executeAuditWorkflowInputSchema.parse(input);
    const inputBudget = this.measureInputSize(validatedInput);
    const allowedChars = this.getAllowedInputChars(validatedInput.planTier);

    if (inputBudget.totalChars > allowedChars) {
      throw new Error(
        `AI workflow input exceeds the allowed size for the ${validatedInput.planTier} plan tier.`
      );
    }

    const result = await executeAuditWorkflowGraph({
      workflowInput: validatedInput,
      dependencies: {
        callModel: (callInput) => this.callModel(callInput),
        defaultModel: this.model,
        cheapModel: this.cheapModel,
        strongModel: this.strongModel,
        reasoningModel: this.reasoningModel,
        timeoutMs: this.timeoutMs,
        checkpointStore: this.checkpointStore,
        updateProgress: options?.updateProgress,
        logger: (event, payload) => {
          const node = typeof payload.node === "string" ? payload.node : undefined;
          const durationMs =
            typeof payload.durationMs === "number" ? payload.durationMs : undefined;
          const workflowDispatchId =
            typeof payload.workflowDispatchId === "string"
              ? payload.workflowDispatchId
              : validatedInput.workflowDispatchId;
          const dispatchId =
            typeof payload.dispatchId === "string" ? payload.dispatchId : validatedInput.dispatchId;
          const orgId = typeof payload.orgId === "string" ? payload.orgId : validatedInput.orgId;

          if (event === "audit_graph.node.started" && node) {
            logNodeExecution({
              node,
              workflowDispatchId,
              dispatchId,
              orgId,
              status: "start",
            });
            return;
          }

          if (event === "audit_graph.node.completed" && node) {
            logNodeExecution({
              node,
              workflowDispatchId,
              dispatchId,
              orgId,
              status: "success",
              durationMs,
            });
            return;
          }

          if (event === "audit_graph.node.failed" && node) {
            logNodeExecution({
              node,
              workflowDispatchId,
              dispatchId,
              orgId,
              status: "failure",
              durationMs,
              error: typeof payload.error === "string" ? payload.error : undefined,
            });
            return;
          }

          if (event === "audit_graph.started") {
            logWorkflowExecution({
              workflowDispatchId,
              dispatchId,
              orgId,
              status: "start",
            });
            return;
          }

          if (event === "audit_graph.completed") {
            logWorkflowExecution({
              workflowDispatchId,
              dispatchId,
              orgId,
              status: "success",
            });
            return;
          }

          if (event === "audit_graph.failed") {
            logWorkflowExecution({
              workflowDispatchId,
              dispatchId,
              orgId,
              status: "failure",
              error:
                Array.isArray(payload.errors) && payload.errors.length > 0
                  ? String(payload.errors[0])
                  : undefined,
            });
          }
        },
      },
    });

    logServerEvent("info", "ai.workflow.cost_estimate", {
      workflowDispatchId: validatedInput.workflowDispatchId,
      dispatchId: validatedInput.dispatchId,
      orgId: validatedInput.orgId,
      source: "openai_langgraph.workflow",
      metadata: this.estimateWorkflowCost({
        input: validatedInput,
        result,
        inputChars: inputBudget.totalChars
      }),
    });

    return result;
  }

  private async callModel<T>(input: {
    schemaName: string;
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    timeoutMs?: number;
  }): Promise<unknown> {
    const combinedChars = input.systemPrompt.length + input.userPrompt.length;
    if (combinedChars > this.maxInputChars) {
      throw new Error(`Prompt payload for ${input.schemaName} exceeds the allowed size limit.`);
    }

    const timeoutMs = input.timeoutMs ?? this.timeoutMs;
    const response = await Promise.race([
      this.client.responses.create({
        model: input.model ?? this.model,
        input: [
          {
            role: "system",
            content: input.systemPrompt
          },
          {
            role: "user",
            content: input.userPrompt
          }
        ],
        text: {
          format: {
            type: "json_object"
          }
        }
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`OpenAI request timed out for ${input.schemaName}.`)),
          timeoutMs
        )
      )
    ]);

    if (!response.output_text?.trim()) {
      throw new Error(`OpenAI response for ${input.schemaName} did not include structured JSON.`);
    }

    return {
      text: response.output_text
    };
  }

  private getAllowedInputChars(planTier: ExecuteAuditWorkflowInput["planTier"]) {
    return Math.min(
      this.maxInputChars,
      this.planInputCharLimits[planTier]
    );
  }

  private measureInputSize(input: ExecuteAuditWorkflowInput) {
    const serialized = JSON.stringify({
      companyName: input.companyName,
      industry: input.industry,
      companySize: input.companySize,
      selectedFrameworks: input.selectedFrameworks,
      assessmentAnswers: input.assessmentAnswers,
      evidenceSummary: input.evidenceSummary,
      planTier: input.planTier
    });

    return {
      totalChars: serialized.length,
      estimatedInputTokens: Math.ceil(serialized.length / 4)
    };
  }

  private estimateWorkflowCost(input: {
    input: ExecuteAuditWorkflowInput;
    result: AuditWorkflowOutput;
    inputChars: number;
  }) {
    const estimatedInputTokens = Math.ceil(input.inputChars / 4);
    const estimatedOutputTokens = Math.ceil(
      JSON.stringify({
        finalReport: input.result.finalReport,
        findings: input.result.findings,
        roadmap: input.result.roadmap
      }).length / 4
    );
    const cheapInputTokens = Math.ceil(estimatedInputTokens * 0.35);
    const strongInputTokens = estimatedInputTokens - cheapInputTokens;
    const cheapOutputTokens = Math.ceil(estimatedOutputTokens * 0.25);
    const strongOutputTokens = estimatedOutputTokens - cheapOutputTokens;
    const estimatedCostUsd =
      (cheapInputTokens / 1_000_000) * this.pricing.cheapInputPer1M +
      (cheapOutputTokens / 1_000_000) * this.pricing.cheapOutputPer1M +
      (strongInputTokens / 1_000_000) * this.pricing.strongInputPer1M +
      (strongOutputTokens / 1_000_000) * this.pricing.strongOutputPer1M;

    return {
      planTier: input.input.planTier,
      cheapModel: this.cheapModel,
      strongModel: this.strongModel,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      allowedInputChars: this.getAllowedInputChars(input.input.planTier),
      observedInputChars: input.inputChars
    };
  }
}
