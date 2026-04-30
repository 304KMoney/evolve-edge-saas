import { NextResponse } from "next/server";
import { Prisma, SubscriptionStatus } from "@evolve-edge/db";
import {
  isProvisioningAuthorized,
  provisionOrganizationFromExternalTrigger
} from "../../../../lib/provisioning";
import { sendOperationalAlert } from "../../../../lib/monitoring";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import {
  expectObject,
  parseJsonRequestBody,
  readOptionalJsonObject,
  readOptionalString,
  readRequiredString,
  ValidationError
} from "../../../../lib/security-validation";

type ProvisionOrgRequestBody = {
  sourceSystem?: string;
  externalReferenceId?: string;
  companyName?: string;
  primaryContactEmail?: string;
  planCode?: string | null;
  crmAccountId?: string | null;
  crmDealId?: string | null;
  workspaceMetadata?: Record<string, unknown> | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  subscriptionStatus?: string | null;
};

function parseSubscriptionStatus(value: string | null | undefined) {
  switch (value) {
    case "TRIALING":
      return SubscriptionStatus.TRIALING;
    case "ACTIVE":
      return SubscriptionStatus.ACTIVE;
    case "PAST_DUE":
      return SubscriptionStatus.PAST_DUE;
    case "CANCELED":
      return SubscriptionStatus.CANCELED;
    case "INCOMPLETE":
      return SubscriptionStatus.INCOMPLETE;
    case "PAUSED":
      return SubscriptionStatus.PAUSED;
    default:
      return undefined;
  }
}

// Intended callers: n8n, HubSpot handoff workflows, or approved internal ops tooling.
// Safety constraints:
// - bearer token required
// - idempotent by sourceSystem + externalReferenceId
// - creates one durable ProvisioningRequest audit record before returning success
export async function POST(request: Request) {
  try {
    const rateLimited = await applyRouteRateLimit(request, {
      key: "internal-provision-org",
      category: "webhook"
    });
    if (rateLimited) {
      return rateLimited;
    }

    if (!isProvisioningAuthorized(request)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = expectObject(
      await parseJsonRequestBody(request)
    ) as ProvisionOrgRequestBody & Record<string, unknown>;
    const result = await provisionOrganizationFromExternalTrigger({
      sourceSystem: readRequiredString(body, "sourceSystem", { maxLength: 100 }),
      externalReferenceId: readRequiredString(body, "externalReferenceId", {
        maxLength: 200
      }),
      companyName: readRequiredString(body, "companyName", { maxLength: 200 }),
      primaryContactEmail: readRequiredString(body, "primaryContactEmail", {
        maxLength: 320
      }),
      planCode: readOptionalString(body, "planCode", { maxLength: 100 }),
      crmAccountId: readOptionalString(body, "crmAccountId", { maxLength: 200 }),
      crmDealId: readOptionalString(body, "crmDealId", { maxLength: 200 }),
      workspaceMetadata: readOptionalJsonObject(body, "workspaceMetadata") as
        | Prisma.InputJsonValue
        | undefined,
      stripeCustomerId: readOptionalString(body, "stripeCustomerId", {
        maxLength: 200
      }),
      stripeSubscriptionId: readOptionalString(body, "stripeSubscriptionId", {
        maxLength: 200
      }),
      stripePriceId: readOptionalString(body, "stripePriceId", {
        maxLength: 200
      }),
      subscriptionStatus: parseSubscriptionStatus(
        readOptionalString(body, "subscriptionStatus", { maxLength: 100 })
      )
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await sendOperationalAlert({
      source: "api.internal.provision-org",
      title: "Org provisioning API failed",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
