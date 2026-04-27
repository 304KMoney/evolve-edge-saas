import assert from "node:assert/strict";
import { queueEmailNotification } from "../lib/email";
import {
  buildPricingAccessOnboardingPath,
  buildPricingAccessSignInPath,
  buildPricingAccessStartPath,
  shouldIssuePricingAccessCredentials
} from "../lib/pricing-access";

async function runPricingAccessTests() {
  assert.equal(buildPricingAccessStartPath("starter"), "/start?plan=starter");
  assert.equal(
    buildPricingAccessStartPath("starter", "monthly"),
    "/start?plan=starter&billingCadence=monthly"
  );
  assert.equal(
    buildPricingAccessOnboardingPath("scale"),
    "/onboarding?plan=scale&leadSource=pricing_plan_selection&leadIntent=launch-pricing&leadPlanCode=scale"
  );
  assert.equal(
    buildPricingAccessOnboardingPath("scale", "annual"),
    "/onboarding?plan=scale&leadSource=pricing_plan_selection&leadIntent=launch-pricing&leadPlanCode=scale&billingCadence=annual"
  );
  assert.equal(
    buildPricingAccessSignInPath({
      planCode: "starter",
      billingCadence: "monthly",
      hasWorkspaceAccess: false
    }),
    "/sign-in?redirectTo=%2Fonboarding%3Fplan%3Dstarter%26leadSource%3Dpricing_plan_selection%26leadIntent%3Dlaunch-pricing%26leadPlanCode%3Dstarter%26billingCadence%3Dmonthly"
  );
  assert.equal(
    buildPricingAccessSignInPath({
      planCode: "starter",
      hasWorkspaceAccess: true
    }),
    "/sign-in?redirectTo=%2Fdashboard"
  );

  assert.equal(
    shouldIssuePricingAccessCredentials({
      hasWorkspaceAccess: false,
      hasPasswordCredential: false
    }),
    true
  );
  assert.equal(
    shouldIssuePricingAccessCredentials({
      hasWorkspaceAccess: false,
      hasPasswordCredential: true
    }),
    true
  );
  assert.equal(
    shouldIssuePricingAccessCredentials({
      hasWorkspaceAccess: true,
      hasPasswordCredential: false
    }),
    true
  );
  assert.equal(
    shouldIssuePricingAccessCredentials({
      hasWorkspaceAccess: true,
      hasPasswordCredential: true
    }),
    false
  );

  const notifications: Array<Record<string, unknown>> = [];
  const db = {
    emailNotification: {
      async upsert(input: Record<string, unknown>) {
        notifications.push(input);
        return input;
      }
    }
  };

  await queueEmailNotification(db as never, {
    templateKey: "pricing-access-guide",
    recipientEmail: "owner@example.com",
    recipientName: "Owner",
    idempotencyKey: "pricing-access-guide:test",
    payload: {
      companyName: "Acme AI",
      planName: "Starter",
      signInUrl: "https://example.com/sign-in",
      credentialsIssued: true,
      nextStep: "Sign in and continue onboarding."
    }
  });

  await queueEmailNotification(db as never, {
    templateKey: "pricing-access-credentials",
    recipientEmail: "owner@example.com",
    recipientName: "Owner",
    idempotencyKey: "pricing-access-credentials:test",
    payload: {
      loginEmail: "owner@example.com",
      temporaryPassword: "TempPass123!A",
      signInUrl: "https://example.com/sign-in"
    }
  });

  const guideCreate = notifications[0]?.["create"] as Record<string, unknown>;
  const credentialsCreate = notifications[1]?.["create"] as Record<string, unknown>;

  assert.match(String(guideCreate.subject), /How to log in/i);
  assert.match(String(guideCreate.textBody), /Acme AI/);
  assert.match(String(guideCreate.textBody), /https:\/\/example\.com\/sign-in/);

  assert.match(String(credentialsCreate.subject), /login credentials/i);
  assert.match(String(credentialsCreate.textBody), /owner@example.com/);
  assert.match(String(credentialsCreate.textBody), /TempPass123!A/);

  console.log("pricing access tests passed");
}

void runPricingAccessTests();
