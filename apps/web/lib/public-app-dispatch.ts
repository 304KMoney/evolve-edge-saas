import {
  CommercialPlanCode,
  Prisma,
  SubscriptionStatus
} from "@evolve-edge/db";
import { normalizeCommercialPlanCode } from "./commercial-routing";
import { ValidationError } from "./security-validation";

export function toAppOwnedCommercialPlanCode(value: string | null | undefined) {
  if (!value) {
    throw new ValidationError(
      "Active subscription must resolve to starter, scale, or enterprise."
    );
  }

  switch (normalizeCommercialPlanCode(value as CommercialPlanCode)) {
    case "starter":
      return CommercialPlanCode.STARTER;
    case "enterprise":
      return CommercialPlanCode.ENTERPRISE;
    case "scale":
      return CommercialPlanCode.SCALE;
    default:
      throw new ValidationError(
        "Active subscription must resolve to starter, scale, or enterprise."
      );
  }
}

export async function resolveAppOwnedPaidPlanForDispatch(input: {
  organizationId: string;
  db: Prisma.TransactionClient;
}) {
  const subscription = await input.db.subscription.findFirst({
    where: {
      organizationId: input.organizationId,
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId: { not: null },
      stripeSubscriptionId: { not: null }
    },
    include: {
      plan: true
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!subscription) {
    throw new ValidationError(
      "Active app-owned paid subscription is required before workflow dispatch."
    );
  }

  return {
    subscriptionId: subscription.id,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    planCode: toAppOwnedCommercialPlanCode(
      subscription.plan.code || subscription.planCodeSnapshot
    )
  };
}
