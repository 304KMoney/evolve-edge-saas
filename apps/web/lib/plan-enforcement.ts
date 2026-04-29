import {
  BillingAccessState,
  CanonicalPlanKey,
  CommercialPlanCode,
  Prisma,
  prisma
} from "@evolve-edge/db";
import {
  getOrganizationEntitlements,
  type EntitlementSnapshot
} from "./entitlements";
import {
  mapCanonicalPlanKeyToCanonicalPlanCode,
  type CanonicalPlanCode
} from "./commercial-catalog";

type PlanEnforcementDbClient = Prisma.TransactionClient | typeof prisma;

export type PlanControlledCapability =
  | "routing"
  | "ai_execution"
  | "report_generation"
  | "executive_briefing";

export type StrictPlanAccess = {
  plan: CanonicalPlanCode;
  planKey: CanonicalPlanKey;
  maxAudits: number | null;
  reportDepth: "limited" | "expanded" | "full";
  analysisDepth: "limited" | "deeper" | "full";
  briefingAllowed: boolean;
  priorityAllowed: boolean;
};

export class PlanAccessError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PLAN_MISSING"
      | "ACCESS_EXPIRED"
      | "FEATURE_NOT_ALLOWED"
      | "QUOTA_EXCEEDED"
      | "WORKFLOW_PLAN_MISMATCH",
    public readonly organizationId: string
  ) {
    super(message);
    this.name = "PlanAccessError";
  }
}

const PLAN_ORDER: Record<CanonicalPlanCode, number> = {
  starter: 1,
  scale: 2,
  enterprise: 3
};

function normalizeCommercialPlanCode(value: CommercialPlanCode | CanonicalPlanCode) {
  switch (value) {
    case CommercialPlanCode.STARTER:
    case "starter":
      return "starter";
    case CommercialPlanCode.ENTERPRISE:
    case "enterprise":
      return "enterprise";
    case CommercialPlanCode.SCALE:
    case "scale":
    default:
      return "scale";
  }
}

export function planForWorkflowCode(workflowCode: string | null | undefined) {
  switch ((workflowCode ?? "").trim().toLowerCase()) {
    case "audit_starter":
      return "starter" as const;
    case "audit_scale":
      return "scale" as const;
    case "audit_enterprise":
      return "enterprise" as const;
    default:
      return null;
  }
}

export function resolveStrictPlanAccess(
  entitlements: Pick<
    EntitlementSnapshot,
    | "canonicalPlanKey"
    | "limits"
    | "featureAccess"
  >
): StrictPlanAccess | null {
  if (!entitlements.canonicalPlanKey) {
    return null;
  }

  const plan = mapCanonicalPlanKeyToCanonicalPlanCode(entitlements.canonicalPlanKey);

  switch (plan) {
    case "enterprise":
      return {
        plan,
        planKey: entitlements.canonicalPlanKey,
        maxAudits: entitlements.limits.audits,
        reportDepth: "full",
        analysisDepth: "full",
        briefingAllowed: entitlements.featureAccess["executive.delivery"],
        priorityAllowed: entitlements.featureAccess["priority.support"]
      };
    case "scale":
      return {
        plan,
        planKey: entitlements.canonicalPlanKey,
        maxAudits: entitlements.limits.audits,
        reportDepth: "expanded",
        analysisDepth: "deeper",
        briefingAllowed: false,
        priorityAllowed: false
      };
    case "starter":
    default:
      return {
        plan,
        planKey: entitlements.canonicalPlanKey,
        maxAudits: 1,
        reportDepth: "limited",
        analysisDepth: "limited",
        briefingAllowed: false,
        priorityAllowed: false
      };
  }
}

function assertWritableAccess(input: {
  organizationId: string;
  entitlements: Pick<
    EntitlementSnapshot,
    "workspaceMode" | "billingAccessState" | "canAccessWorkspace"
  >;
}) {
  if (!input.entitlements.canAccessWorkspace) {
    throw new PlanAccessError(
      "An active plan is required before this action can run.",
      "ACCESS_EXPIRED",
      input.organizationId
    );
  }

  if (
    input.entitlements.workspaceMode === "READ_ONLY" ||
    input.entitlements.workspaceMode === "INACTIVE" ||
    input.entitlements.billingAccessState === BillingAccessState.PAST_DUE ||
    input.entitlements.billingAccessState === BillingAccessState.PAUSED ||
    input.entitlements.billingAccessState === BillingAccessState.CANCELED ||
    input.entitlements.billingAccessState === BillingAccessState.INACTIVE ||
    input.entitlements.billingAccessState === BillingAccessState.INCOMPLETE
  ) {
    throw new PlanAccessError(
      "Plan access is not active for write actions.",
      "ACCESS_EXPIRED",
      input.organizationId
    );
  }
}

export function assertPlanCapability(input: {
  organizationId: string;
  entitlements: EntitlementSnapshot;
  capability: PlanControlledCapability;
  workflowCode?: string | null;
  requestedPlan?: CommercialPlanCode | CanonicalPlanCode | null;
}) {
  const strictPlan = resolveStrictPlanAccess(input.entitlements);

  if (!strictPlan) {
    throw new PlanAccessError(
      "A backend-mapped plan is required before this action can run.",
      "PLAN_MISSING",
      input.organizationId
    );
  }

  assertWritableAccess({
    organizationId: input.organizationId,
    entitlements: input.entitlements
  });

  if (
    input.capability === "routing" &&
    input.entitlements.limits.audits !== null &&
    input.entitlements.activeAssessments > input.entitlements.limits.audits
  ) {
    throw new PlanAccessError(
      "This plan has reached its audit limit.",
      "QUOTA_EXCEEDED",
      input.organizationId
    );
  }

  if (input.requestedPlan) {
    const requestedPlan = normalizeCommercialPlanCode(input.requestedPlan);
    if (PLAN_ORDER[requestedPlan] > PLAN_ORDER[strictPlan.plan]) {
      throw new PlanAccessError(
        "The requested plan tier exceeds the organization's active plan.",
        "WORKFLOW_PLAN_MISMATCH",
        input.organizationId
      );
    }
  }

  const workflowPlan = planForWorkflowCode(input.workflowCode);
  if (workflowPlan && PLAN_ORDER[workflowPlan] > PLAN_ORDER[strictPlan.plan]) {
    throw new PlanAccessError(
      "The requested workflow exceeds the organization's active plan.",
      "WORKFLOW_PLAN_MISMATCH",
      input.organizationId
    );
  }

  if (input.capability === "executive_briefing" && !strictPlan.briefingAllowed) {
    throw new PlanAccessError(
      "Executive briefings require the Enterprise plan.",
      "FEATURE_NOT_ALLOWED",
      input.organizationId
    );
  }

  if (
    input.capability === "report_generation" &&
    !input.entitlements.featureAccess["reports.generate"]
  ) {
    throw new PlanAccessError(
      "Report generation is not enabled for this plan.",
      "FEATURE_NOT_ALLOWED",
      input.organizationId
    );
  }

  if (
    (input.capability === "routing" || input.capability === "ai_execution") &&
    !input.entitlements.featureAccess["assessments.create"]
  ) {
    throw new PlanAccessError(
      "Audit creation is not enabled for this plan.",
      "FEATURE_NOT_ALLOWED",
      input.organizationId
    );
  }

  return strictPlan;
}

export async function requirePlanCapability(input: {
  organizationId: string;
  capability: PlanControlledCapability;
  workflowCode?: string | null;
  requestedPlan?: CommercialPlanCode | CanonicalPlanCode | null;
  db?: PlanEnforcementDbClient;
}) {
  const db = input.db ?? prisma;
  const entitlements = await getOrganizationEntitlements(input.organizationId, db);
  const strictPlan = assertPlanCapability({
    organizationId: input.organizationId,
    entitlements,
    capability: input.capability,
    workflowCode: input.workflowCode,
    requestedPlan: input.requestedPlan
  });

  return {
    entitlements,
    strictPlan
  };
}
