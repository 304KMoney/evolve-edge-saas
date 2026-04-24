import { getOptionalEnv } from "./runtime-config";
export {
  normalizeAuditWorkflowResultShape,
  normalizedAuditWorkflowResultSchema,
  type AiFinding as DifyFinding,
  type AiRecommendation as DifyRecommendation,
  type AiWorkflowExecutionInput as DifyAssessmentPayload,
  type NormalizedAuditWorkflowResult as NormalizedDifyContract
} from "./ai-schemas";
export {
  buildTopConcernsFromFindings,
  normalizeDifyContractShape,
  normalizeDifyWorkflowOutputs
} from "./dify-adapter";

export type StripeContextMetadata = {
  organizationId: string | null;
  customerEmail: string | null;
  customerId: string | null;
  planKey: string | null;
  planCode: string | null;
  revenuePlanCode: string | null;
  correlationId: string | null;
  addOns: string[];
  environment: string | null;
  source: string | null;
  workflowType: string | null;
};

type StripeMetadataBuilderInput = {
  organizationId: string;
  customerEmail: string;
  customerId?: string | null;
  planKey: string | null;
  planCode: string;
  revenuePlanCode?: string | null;
  correlationId?: string | null;
  addOns?: string[] | null;
  source: string;
  workflowType: string;
};

export function getIntegrationEnvironmentLabel() {
  return (
    getOptionalEnv("VERCEL_ENV") ??
    getOptionalEnv("NODE_ENV") ??
    "development"
  );
}

export function buildStripeContextMetadata(
  input: StripeMetadataBuilderInput
) {
  const environment = getIntegrationEnvironmentLabel();

  // Keep checkout-session metadata narrow and reconciliation-oriented.
  // These fields are the preferred Stripe-side bridge for webhook-driven
  // payment-to-customer-to-report binding later.
  return {
    org_id: input.organizationId,
    organizationId: input.organizationId,
    customer_email: input.customerEmail,
    customerEmail: input.customerEmail,
    customer_id: input.customerId ?? "",
    customerId: input.customerId ?? "",
    plan_key: input.planKey ?? input.planCode,
    planKey: input.planKey ?? input.planCode,
    plan_code: input.planCode,
    planCode: input.planCode,
    revenue_plan_code: input.revenuePlanCode ?? "",
    revenuePlanCode: input.revenuePlanCode ?? "",
    correlation_id: input.correlationId ?? "",
    correlationId: input.correlationId ?? "",
    add_ons:
      input.addOns && input.addOns.length > 0 ? input.addOns.join(",") : "",
    addOns:
      input.addOns && input.addOns.length > 0 ? input.addOns.join(",") : "",
    environment,
    source: input.source,
    workflow_type: input.workflowType,
    workflowType: input.workflowType
  } satisfies Record<string, string>;
}

export function readStripeContextMetadata(
  metadata: unknown
): StripeContextMetadata {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  const readString = (...keys: string[]) => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  };

  return {
    organizationId: readString("org_id", "organizationId", "organization_id"),
    customerEmail: readString("customer_email", "customerEmail", "email"),
    customerId: readString("customer_id", "customerId"),
    planKey: readString("plan_key", "planKey"),
    planCode: readString("plan_code", "planCode"),
    revenuePlanCode: readString("revenue_plan_code", "revenuePlanCode"),
    correlationId: readString("correlation_id", "correlationId"),
    addOns: readString("add_ons", "addOns")
      ?.split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0) ?? [],
    environment: readString("environment"),
    source: readString("source"),
    workflowType: readString("workflow_type", "workflowType")
  };
}

export function stripEmptyStringProperties(
  properties: Record<string, string | null | undefined>
) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => {
      if (typeof value !== "string") {
        return value !== null && value !== undefined;
      }

      return value.trim().length > 0;
    })
  );
}
