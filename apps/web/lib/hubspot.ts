import { DomainEvent, Prisma, prisma } from "@evolve-edge/db";
import {
  HUBSPOT_COMPANY_PROPERTY_MAP,
  HUBSPOT_CONTACT_PROPERTY_MAP,
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";
import {
  buildCorrelationId,
  clampTimeoutMs,
  normalizeExternalError
} from "./reliability";
import { shouldBlockDemoExternalSideEffects } from "./demo-mode";
import { stripEmptyStringProperties } from "./integration-contracts";
import { maskEmail } from "./intake-observability";
import { logServerEvent } from "./monitoring";
import { getOptionalEnv } from "./runtime-config";

type HubSpotDestination = {
  name: string;
  url: string;
  provider: "hubspot";
  timeoutMs: number;
};

type HubSpotCompanySearchResponse = {
  results: Array<{ id: string }>;
};

type HubSpotUpsertResponse = {
  id: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;
// HubSpot is currently a projection surface for contacts and companies only.
// CRM deal identifiers may be stored on app records for operator reference,
// but this service does not read HubSpot deal state back into product truth or
// let HubSpot define plans, routing, delivery, or audit lifecycle decisions.
const HUBSPOT_SYNC_EVENT_TYPES = new Set([
  "lead.captured",
  "lead.converted",
  "org.created",
  "onboarding.completed",
  "assessment.created",
  "report.generated",
  "report.delivered",
  "customer_account.stage_changed",
  "subscription.created",
  "subscription.updated"
]);

export function assertHubSpotProjectionEvent(eventType: string) {
  if (!shouldSyncHubSpotEvent(eventType)) {
    throw new Error(
      `HubSpot projection is not enabled for event type "${eventType}".`
    );
  }
}

function coerceTimeoutMs(value: string | null) {
  const parsed = Number(value ?? "");
  return clampTimeoutMs(
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
}

function getHubSpotAccessToken() {
  const token = getOptionalEnv("HUBSPOT_ACCESS_TOKEN");
  return token && token.length > 0 ? token : null;
}

function isHubSpotSyncEnabled() {
  const configured = getOptionalEnv("HUBSPOT_SYNC_ENABLED")?.toLowerCase();

  if (configured === "false") {
    return false;
  }

  if (configured === "true") {
    return true;
  }

  return Boolean(getHubSpotAccessToken());
}

function getHubSpotApiBaseUrl() {
  return getOptionalEnv("HUBSPOT_API_BASE_URL") ?? "https://api.hubapi.com";
}

export function getHubSpotDestinations(): HubSpotDestination[] {
  if (shouldBlockDemoExternalSideEffects()) {
    return [];
  }

  if (!isHubSpotSyncEnabled()) {
    return [];
  }

  if (!getHubSpotAccessToken()) {
    return [];
  }

  return [
    {
      name: "hubspot-crm",
      url: "hubspot://crm-sync",
      provider: "hubspot",
      timeoutMs: coerceTimeoutMs(getOptionalEnv("HUBSPOT_TIMEOUT_MS"))
    }
  ];
}

export function shouldSyncHubSpotEvent(eventType: string) {
  return HUBSPOT_SYNC_EVENT_TYPES.has(eventType);
}

function getLifecycleStage(eventType: string) {
  switch (eventType) {
    case "lead.captured":
      return "marketing_qualified_lead";
    case "lead.converted":
      return "opportunity";
    case "org.created":
      return "customer";
    case "onboarding.completed":
      return "onboarding_complete";
    case "assessment.created":
      return "assessment_started";
    case "report.generated":
    case "report.delivered":
      return "value_realized";
    case "customer_account.stage_changed":
      return "customer_lifecycle_updated";
    case "subscription.created":
    case "subscription.updated":
      return "active_customer";
    default:
      return "customer";
  }
}

export function buildHubSpotMilestoneProperties(eventType: string, event: DomainEvent) {
  const occurredAt = event.occurredAt.toISOString();
  const payload = readPayloadRecord(event.payload);
  const rawTopConcerns = Array.isArray(payload.topConcerns)
    ? payload.topConcerns
    : Array.isArray(payload.top_concerns)
      ? payload.top_concerns
      : [];
  const topConcerns = rawTopConcerns
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .slice(0, 3)
    .join(" | ");

  return {
    [HUBSPOT_COMPANY_PROPERTY_MAP.lastEventType]: event.type,
    [HUBSPOT_COMPANY_PROPERTY_MAP.lastEventAt]: occurredAt,
    [HUBSPOT_COMPANY_PROPERTY_MAP.lastMilestone]: event.type,
    ...(eventType === "customer_account.stage_changed"
      ? {
          evolve_edge_customer_stage:
            typeof payload.stageLabel === "string"
              ? payload.stageLabel
              : typeof payload.stage === "string"
                ? payload.stage
                : "",
          evolve_edge_next_action_label:
            typeof payload.nextActionLabel === "string" ? payload.nextActionLabel : ""
        }
      : {}),
    ...(eventType === "org.created"
      ? { [HUBSPOT_COMPANY_PROPERTY_MAP.onboardingStartedAt]: occurredAt }
      : {}),
    ...(eventType === "onboarding.completed"
      ? { [HUBSPOT_COMPANY_PROPERTY_MAP.onboardingCompletedAt]: occurredAt }
      : {}),
    ...(eventType === "assessment.created"
      ? { [HUBSPOT_COMPANY_PROPERTY_MAP.firstAssessmentCreatedAt]: occurredAt }
      : {}),
    ...(eventType === "report.generated"
      ? {
          [HUBSPOT_COMPANY_PROPERTY_MAP.reportGenerated]: "true",
          [HUBSPOT_COMPANY_PROPERTY_MAP.riskLevel]:
            typeof payload.riskLevel === "string" ? payload.riskLevel : "",
          [HUBSPOT_COMPANY_PROPERTY_MAP.topConcerns]: topConcerns
        }
      : {}),
    ...(eventType === "report.delivered"
      ? {
          [HUBSPOT_COMPANY_PROPERTY_MAP.reportDeliveredAt]: occurredAt,
          [HUBSPOT_COMPANY_PROPERTY_MAP.reportGenerated]: "true",
          [HUBSPOT_COMPANY_PROPERTY_MAP.riskLevel]:
            typeof payload.riskLevel === "string" ? payload.riskLevel : "",
          [HUBSPOT_COMPANY_PROPERTY_MAP.topConcerns]: topConcerns
        }
      : {}),
    ...(eventType === "lead.captured"
      ? { evolve_edge_latest_lead_captured_at: occurredAt }
      : {})
  };
}

function readPayloadRecord(payload: Prisma.JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {} as Record<string, Prisma.JsonValue>;
  }

  return payload as Record<string, Prisma.JsonValue>;
}

function readPayloadString(
  payload: Record<string, Prisma.JsonValue>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

async function hubspotRequest<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const accessToken = getHubSpotAccessToken();
  if (!accessToken) {
    throw new Error("Missing HUBSPOT_ACCESS_TOKEN");
  }

  const correlationId = buildCorrelationId("hubspot");
  const response = await fetch(`${getHubSpotApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-evolve-edge-correlation-id": correlationId,
      ...(init?.headers ?? {})
    },
    signal: AbortSignal.timeout(clampTimeoutMs(timeoutMs, DEFAULT_TIMEOUT_MS))
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `[${correlationId}] HubSpot API error (${response.status}): ${text}`.slice(
        0,
        1_000
      )
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

async function searchCompanyByOrgId(orgId: string, timeoutMs: number) {
  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "evolve_edge_org_id",
            operator: "EQ",
            value: orgId
          }
        ]
      }
    ],
    limit: 1
  };

  const response = await hubspotRequest<HubSpotCompanySearchResponse>(
    "/crm/v3/objects/companies/search",
    {
      method: "POST",
      body: JSON.stringify(body)
    },
    timeoutMs
  );

  return response.results[0]?.id ?? null;
}

async function searchContactByUserIdOrEmail(
  userId: string,
  email: string,
  timeoutMs: number
) {
  const byUserId = await hubspotRequest<{ results: Array<{ id: string }> }>(
    "/crm/v3/objects/contacts/search",
    {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "evolve_edge_user_id",
                operator: "EQ",
                value: userId
              }
            ]
          }
        ],
        limit: 1
      })
    },
    timeoutMs
  );

  if (byUserId.results[0]?.id) {
    return byUserId.results[0].id;
  }

  const byEmail = await hubspotRequest<{ results: Array<{ id: string }> }>(
    "/crm/v3/objects/contacts/search",
    {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: email
              }
            ]
          }
        ],
        limit: 1
      })
    },
    timeoutMs
  );

  return byEmail.results[0]?.id ?? null;
}

async function upsertCompanyForEvent(event: DomainEvent, timeoutMs: number) {
  if (!event.orgId) {
    return null;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: event.orgId },
    include: {
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!organization) {
    return null;
  }

  const latestSubscription = organization.subscriptions[0];
  const canonicalPlanCode = resolveCanonicalPlanCodeFromRevenuePlanCode(
    latestSubscription?.plan.code ?? null
  );
  const existingCompanyId =
    organization.hubspotCompanyId ??
    (await searchCompanyByOrgId(organization.id, timeoutMs));

  const properties = stripEmptyStringProperties({
    name: organization.name,
    [HUBSPOT_COMPANY_PROPERTY_MAP.orgId]: organization.id,
    [HUBSPOT_COMPANY_PROPERTY_MAP.orgSlug]: organization.slug,
    [HUBSPOT_COMPANY_PROPERTY_MAP.planCode]: canonicalPlanCode ?? "",
    [HUBSPOT_COMPANY_PROPERTY_MAP.subscriptionStatus]:
      latestSubscription?.status ?? "NONE",
    [HUBSPOT_COMPANY_PROPERTY_MAP.onboardingStatus]: organization.onboardingCompletedAt
      ? "completed"
      : "in_progress",
    [HUBSPOT_COMPANY_PROPERTY_MAP.postureScore]:
      organization.currentPostureScore?.toString() ?? "",
    [HUBSPOT_COMPANY_PROPERTY_MAP.lifecycleStage]: getLifecycleStage(event.type),
    ...buildHubSpotMilestoneProperties(event.type, event)
  });

  const company = existingCompanyId
    ? await hubspotRequest<HubSpotUpsertResponse>(
        `/crm/v3/objects/companies/${existingCompanyId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ properties })
        },
        timeoutMs
      )
    : await hubspotRequest<HubSpotUpsertResponse>(
        "/crm/v3/objects/companies",
        {
          method: "POST",
          body: JSON.stringify({ properties })
        },
        timeoutMs
      );

  if (organization.hubspotCompanyId !== company.id) {
    await prisma.organization.update({
      where: { id: organization.id },
      data: { hubspotCompanyId: company.id }
    });
  }

  return company.id;
}

async function upsertPrimaryContactForEvent(
  event: DomainEvent,
  companyId: string | null,
  timeoutMs: number
) {
  const userId = event.userId;
  const payload = readPayloadRecord(event.payload);
  const payloadEmail =
    readPayloadString(payload, "normalizedEmail", "email", "customer_email") || null;
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId }
      })
    : null;
  const email = user?.email ?? payloadEmail;

  if (!email) {
    return null;
  }

  const existingContactId =
    user?.hubspotContactId ??
    (await searchContactByUserIdOrEmail(user?.id ?? "lead", email, timeoutMs));

  const properties = stripEmptyStringProperties({
    [HUBSPOT_CONTACT_PROPERTY_MAP.email]: email,
    [HUBSPOT_CONTACT_PROPERTY_MAP.firstName]:
      user?.firstName ??
      readPayloadString(payload, "firstName"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.lastName]:
      user?.lastName ??
      readPayloadString(payload, "lastName"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.jobTitle]:
      readPayloadString(payload, "jobTitle"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.phone]:
      readPayloadString(payload, "phone"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.company]:
      readPayloadString(payload, "companyName", "company_name", "company"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.leadStatus]:
      event.type === "lead.converted" ? "OPEN" : "NEW",
    [HUBSPOT_CONTACT_PROPERTY_MAP.userId]: user?.id ?? "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.lastEventType]: event.type,
    [HUBSPOT_CONTACT_PROPERTY_MAP.lastEventAt]: event.occurredAt.toISOString(),
    [HUBSPOT_CONTACT_PROPERTY_MAP.lifecycleStage]: getLifecycleStage(event.type),
    [HUBSPOT_CONTACT_PROPERTY_MAP.leadSource]:
      readPayloadString(payload, "lead_source_detail", "source"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.leadIntent]:
      readPayloadString(payload, "intent"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.requestedPlanCode]:
      resolveCanonicalPlanCode(
        readPayloadString(payload, "requestedPlanCode", "purchased_plan_code")
      ) ??
      resolveCanonicalPlanCodeFromRevenuePlanCode(
        readPayloadString(payload, "requestedPlanCode", "purchased_plan_code")
      ) ??
      readPayloadString(payload, "requestedPlanCode", "purchased_plan_code"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.sourcePath]:
      readPayloadString(payload, "sourcePath"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.companyName]:
      readPayloadString(payload, "companyName", "company_name", "company"),
    [HUBSPOT_CONTACT_PROPERTY_MAP.teamSize]:
      readPayloadString(payload, "teamSize", "company_size"),
      [HUBSPOT_CONTACT_PROPERTY_MAP.utmSource]:
        payload.attribution &&
      typeof payload.attribution === "object" &&
      !Array.isArray(payload.attribution) &&
      typeof (payload.attribution as Record<string, Prisma.JsonValue>).utmSource === "string"
        ? ((payload.attribution as Record<string, Prisma.JsonValue>).utmSource as string)
        : "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.utmMedium]:
      payload.attribution &&
      typeof payload.attribution === "object" &&
      !Array.isArray(payload.attribution) &&
      typeof (payload.attribution as Record<string, Prisma.JsonValue>).utmMedium === "string"
        ? ((payload.attribution as Record<string, Prisma.JsonValue>).utmMedium as string)
        : "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.utmCampaign]:
      payload.attribution &&
      typeof payload.attribution === "object" &&
      !Array.isArray(payload.attribution) &&
      typeof (payload.attribution as Record<string, Prisma.JsonValue>).utmCampaign === "string"
        ? ((payload.attribution as Record<string, Prisma.JsonValue>).utmCampaign as string)
        : ""
  });

  const contact = existingContactId
    ? await hubspotRequest<HubSpotUpsertResponse>(
        `/crm/v3/objects/contacts/${existingContactId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ properties })
        },
        timeoutMs
      )
    : await hubspotRequest<HubSpotUpsertResponse>(
        "/crm/v3/objects/contacts",
        {
          method: "POST",
          body: JSON.stringify({ properties })
        },
        timeoutMs
      );

  if (user && user.hubspotContactId !== contact.id) {
    await prisma.user.update({
      where: { id: user.id },
      data: { hubspotContactId: contact.id }
    });
  }

  if (event.aggregateType === "leadSubmission") {
    await prisma.leadSubmission.updateMany({
      where: { id: event.aggregateId },
      data: {
        hubspotContactId: contact.id,
        processedAt: new Date(),
        lastError: null
      }
    });
  }

  if (companyId) {
    await hubspotRequest(
      `/crm/v3/objects/contacts/${contact.id}/associations/companies/${companyId}/contact_to_company`,
      {
        method: "PUT"
      },
      timeoutMs
    );
  }

  return contact.id;
}

async function resolveDealIdForEvent(event: DomainEvent) {
  const payload = readPayloadRecord(event.payload);
  const payloadDealId = readPayloadString(payload, "crmDealId", "hubspotDealId");
  if (payloadDealId) {
    return payloadDealId;
  }

  const customerAccountId = readPayloadString(payload, "customerAccountId");
  if (customerAccountId) {
    const customerAccount = await prisma.customerAccount.findUnique({
      where: { id: customerAccountId },
      select: { crmDealId: true }
    });
    if (customerAccount?.crmDealId) {
      return customerAccount.crmDealId;
    }
  }

  if (!event.orgId) {
    return null;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: event.orgId },
    include: {
      customerAccount: {
        select: { crmDealId: true }
      }
    }
  });

  return organization?.customerAccount?.crmDealId ?? null;
}

function getDealStageForEvent(event: DomainEvent) {
  if (event.type === "report.delivered") {
    const configured = getOptionalEnv("HUBSPOT_REPORT_DELIVERED_DEAL_STAGE_ID");
    return configured && configured.trim().length > 0 ? configured.trim() : null;
  }

  return null;
}

async function syncDealForEvent(event: DomainEvent, timeoutMs: number) {
  const dealStage = getDealStageForEvent(event);
  if (!dealStage) {
    return null;
  }

  const dealId = await resolveDealIdForEvent(event);
  if (!dealId) {
    return null;
  }

  await hubspotRequest<HubSpotUpsertResponse>(
    `/crm/v3/objects/deals/${dealId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        properties: {
          dealstage: dealStage,
          evolve_edge_last_event_type: event.type,
          evolve_edge_last_event_at: event.occurredAt.toISOString()
        }
      })
    },
    timeoutMs
  );

  return dealId;
}

export async function syncDomainEventToHubSpot(input: {
  event: DomainEvent;
  timeoutMs?: number;
  traceId?: string | null;
}) {
  const timeoutMs = clampTimeoutMs(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  assertHubSpotProjectionEvent(input.event.type);
  const payload = readPayloadRecord(input.event.payload);
  const customerEmail = readPayloadString(
    payload,
    "normalizedEmail",
    "email",
    "customer_email"
  );
  const requestId = readPayloadString(payload, "request_id", "dispatchId", "dispatch_id");

  try {
    const companyId = await upsertCompanyForEvent(input.event, timeoutMs);
    const contactId = await upsertPrimaryContactForEvent(
      input.event,
      companyId,
      timeoutMs
    );
    const dealId = await syncDealForEvent(input.event, timeoutMs);

    logServerEvent("info", "hubspot.sync.completed", {
      traceId: input.traceId ?? (requestId || null),
      route: "hubspot.sync",
      customer_email: maskEmail(customerEmail) || null,
      hubspot_contact_id: contactId,
      hubspot_deal_id: dealId,
      request_id: requestId || null,
      status: "synced",
      source: "hubspot.sync",
      metadata: {
        eventType: input.event.type,
        companyId
      }
    });

    return {
      companyId,
      contactId,
      dealId,
      customerEmail: customerEmail || null
    };
  } catch (error) {
    const normalized = normalizeExternalError(
      error,
      "HubSpot synchronization failed."
    );
    logServerEvent("error", "hubspot.sync.failed", {
      traceId: input.traceId ?? (requestId || null),
      route: "hubspot.sync",
      customer_email: maskEmail(customerEmail) || null,
      hubspot_contact_id: null,
      hubspot_deal_id: null,
      request_id: requestId || null,
      status: "failed",
      source: "hubspot.sync",
      metadata: {
        eventType: input.event.type,
        message: normalized.message
      }
    });
    throw new Error(normalized.message);
  }
}
