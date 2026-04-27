import {
  getAiExecutionEnterpriseMaxInputChars,
  getAiExecutionMaxInputChars,
  getAiExecutionProvider,
  getAiExecutionScaleMaxInputChars,
  getAiExecutionStarterMaxInputChars,
  getAiExecutionTimeoutMs,
  getOpenAIApiKey,
  getOpenAICheapModel,
  getOpenAICheapModelInputCostPer1M,
  getOpenAICheapModelOutputCostPer1M,
  getOpenAIModel,
  getOpenAIReasoningModel,
  getOpenAIStrongModel,
  getOpenAIStrongModelInputCostPer1M,
  getOpenAIStrongModelOutputCostPer1M
} from "../../../../lib/runtime-config";
import { DifyDeprecatedProvider } from "./dify-deprecated";
import { OpenAiLangGraphProvider } from "./openai-langgraph";
import type { AuditWorkflowProvider } from "./types";

export function getAuditWorkflowProvider(): AuditWorkflowProvider {
  const provider = getAiExecutionProvider();

  if (provider === "dify") {
    return new DifyDeprecatedProvider();
  }

  return new OpenAiLangGraphProvider({
    apiKey: getOpenAIApiKey(),
    cheapModel: getOpenAICheapModel(),
    model: getOpenAIModel(),
    strongModel: getOpenAIStrongModel(),
    reasoningModel: getOpenAIReasoningModel(),
    timeoutMs: getAiExecutionTimeoutMs(),
    maxInputChars: getAiExecutionMaxInputChars(),
    planInputCharLimits: {
      starter: getAiExecutionStarterMaxInputChars(),
      scale: getAiExecutionScaleMaxInputChars(),
      enterprise: getAiExecutionEnterpriseMaxInputChars()
    },
    pricing: {
      cheapInputPer1M: getOpenAICheapModelInputCostPer1M(),
      cheapOutputPer1M: getOpenAICheapModelOutputCostPer1M(),
      strongInputPer1M: getOpenAIStrongModelInputCostPer1M(),
      strongOutputPer1M: getOpenAIStrongModelOutputCostPer1M()
    }
  });
}
