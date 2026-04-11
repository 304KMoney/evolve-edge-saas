import { NextResponse } from "next/server";
import { Prisma, SubscriptionStatus } from "@evolve-edge/db";
import {
  isProvisioningAuthorized,
  provisionOrganizationFromExternalTrigger
} from "../../../../lib/provisioning";
import { sendOperationalAlert } from "../../../../lib/monitoring";

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
    if (!isProvisioningAuthorized(request)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await request.json()) as ProvisionOrgRequestBody;
    const result = await provisionOrganizationFromExternalTrigger({
      sourceSystem: String(body.sourceSystem ?? ""),
      externalReferenceId: String(body.externalReferenceId ?? ""),
      companyName: String(body.companyName ?? ""),
      primaryContactEmail: String(body.primaryContactEmail ?? ""),
      planCode: body.planCode ?? null,
      crmAccountId: body.crmAccountId ?? null,
      crmDealId: body.crmDealId ?? null,
      workspaceMetadata: (body.workspaceMetadata ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      stripeCustomerId: body.stripeCustomerId ?? null,
      stripeSubscriptionId: body.stripeSubscriptionId ?? null,
      stripePriceId: body.stripePriceId ?? null,
      subscriptionStatus: parseSubscriptionStatus(body.subscriptionStatus)
    });

    return NextResponse.json(result);
  } catch (error) {
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
