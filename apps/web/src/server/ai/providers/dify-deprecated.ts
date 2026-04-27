import type {
  AuditWorkflowOutput,
  AuditWorkflowProvider,
  ExecuteAuditWorkflowOptions,
  ExecuteAuditWorkflowInput
} from "./types";

export class DifyDeprecatedProvider implements AuditWorkflowProvider {
  readonly provider = "dify" as const;

  async executeAuditWorkflow(
    _input: ExecuteAuditWorkflowInput,
    _options?: ExecuteAuditWorkflowOptions
  ): Promise<AuditWorkflowOutput> {
    throw new Error(
      "Dify is deprecated as a production AI execution provider. Set AI_EXECUTION_PROVIDER=openai_langgraph."
    );
  }
}
