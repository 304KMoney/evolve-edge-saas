import assert from "node:assert/strict";
import { CommercialPlanCode, SubscriptionStatus } from "@evolve-edge/db";
import { resolveAppOwnedPaidPlanForDispatch } from "../lib/public-app-dispatch";

async function runIntakeToAppDispatchTests() {
  const paidPlan = await resolveAppOwnedPaidPlanForDispatch({
    organizationId: "org_123",
    db: {
      subscription: {
        findFirst: async (input: Record<string, unknown>) => {
          assert.deepEqual(
            (input.where as Record<string, unknown>).status,
            SubscriptionStatus.ACTIVE
          );
          assert.deepEqual(
            (input.where as Record<string, unknown>).stripeCustomerId,
            { not: null }
          );
          assert.deepEqual(
            (input.where as Record<string, unknown>).stripeSubscriptionId,
            { not: null }
          );

          return {
            id: "sub_123",
            stripeSubscriptionId: "stripe_sub_123",
            planCodeSnapshot: "starter",
            plan: {
              code: "scale"
            }
          };
        }
      }
    } as never
  });

  assert.equal(paidPlan.subscriptionId, "sub_123");
  assert.equal(paidPlan.stripeSubscriptionId, "stripe_sub_123");
  assert.equal(paidPlan.planCode, CommercialPlanCode.SCALE);

  await assert.rejects(
    () =>
      resolveAppOwnedPaidPlanForDispatch({
        organizationId: "org_unpaid",
        db: {
          subscription: {
            findFirst: async () => null
          }
        } as never
      }),
    /Active app-owned paid subscription is required/
  );

  console.log("intake-to-app-dispatch tests passed");
}

void runIntakeToAppDispatchTests();
