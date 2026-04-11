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
const HUBSPOT_SYNC_EVENT_TYPES = new Set([
  "lead.captured",
  "lead.converted",
  "org.created",
  "onboarding.completed",
  "assessment.created",
  "report.generated",
  "customer_account.stage_changed",
  "subscription.created",
  "subscription.updated"
]);

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

function getHubSpotApiBaseUrl() {
  return getOptionalEnv("HUBSPOT_API_BASE_URL") ?? "https://api.hubapi.com";
}

export function getHubSpotDestinations(): HubSpotDestination[] {
  if (shouldBlockDemoExternalSideEffects()) {
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

function buildMilestoneProperties(eventType: string, event: DomainEvent) {
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
    evolve_edge_last_event_type: event.type,
    evolve_edge_last_event_at: occurredAt,
    evolve_edge_last_product_milestone: event.type,
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
      ? { evolve_edge_onboarding_started_at: occurredAt }
      : {}),
    ...(eventType === "onboarding.completed"
      ? { evolve_edge_onboarding_completed_at: occurredAt }
      : {}),
    ...(eventType === "assessment.created"
      ? { evolve_edge_first_assessment_created_at: occurredAt }
      : {}),
    ...(eventType === "report.generated"
      ? {
          evolve_edge_report_delivered_at: occurredAt,
          evolve_edge_report_generated: "true",
          evolve_edge_risk_level:
            typeof payload.riskLevel === "string" ? payload.riskLevel : "",
          evolve_edge_top_concerns: topConcerns
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
    ...buildMilestoneProperties(event.type, event)
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
    typeof payload.normalizedEmail === "string"
      ? payload.normalizedEmail
      : typeof payload.email === "string"
        ? payload.email
        : null;
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
      (typeof payload.firstName === "string" ? payload.firstName : ""),
    [HUBSPOT_CONTACT_PROPERTY_MAP.lastName]:
      user?.lastName ??
      (typeof payload.lastName === "string" ? payload.lastName : ""),
    [HUBSPOT_CONTACT_PROPERTY_MAP.jobTitle]:
      typeof payload.jobTitle === "string" ? payload.jobTitle : "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.phone]:
      typeof payload.phone === "string" ? payload.phone : "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.company]:
      typeof payload.companyName === "string" ? payload.companyName : "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.leadStatus]:
      event.type === "lead.converted" ? "OPEN" : "NEW",
    [HUBSPOT_CONTACT_PROPERTY_MAP.userId]: user?.id ?? "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.lastEventType]: event.type,
    [HUBSPOT_CONTACT_PROPERTY_MAP.lastEventAt]: event.occurredAt.toISOString(),
    [HUBSPOT_CONTACT_PROPERTY_MAP.lifecycleStage]: getLifecycleStage(event.type),
    [HUBSPOT_CONTACT_PROPERTY_MAP.leadSource]:
      typeof payload.source === "string" ? payload.source : "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.leadIntent]:
      typeof payload.intent === "string" ? payload.intent : "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.requestedPlanCode]:
      resolveCanonicalPlanCode(
        typeof payload.requestedPlanCode === "string" ? payload.requestedPlanCode : ""
      ) ??
      resolveCanonicalPlanCodeFromRevenuePlanCode(
        typeof payload.requestedPlanCode === "string" ? payload.requestedPlanCode : ""
      ) ??
      (typeof payload.requestedPlanCode === "string" ? payload.requestedPlanCode : ""),
    [HUBSPOT_CONTACT_PROPERTY_MAP.sourcePath]:
      typeof payload.sourcePath === "string" ? payload.sourcePath : "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.companyName]:
      typeof payload.companyName === "string" ? payload.companyName : "",
    [HUBSPOT_CONTACT_PROPERTY_MAP.teamSize]:
      typeof payload.teamSize === "string" ? payload.teamSize : "",
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

export async function syncDomainEventToHubSpot(input: {
  event: DomainEvent;
  timeoutMs?: number;
}) {
  const timeoutMs = clampTimeoutMs(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  try {
    const companyId = await upsertCompanyForEvent(input.event, timeoutMs);
    const contactId = await upsertPrimaryContactForEvent(
      input.event,
      companyId,
      timeoutMs
    );

    return {
      companyId,
      contactId
    };
  } catch (error) {
    const normalized = normalizeExternalError(
      error,
      "HubSpot synchronization failed."
    );
    throw new Error(normalized.message);
  }
}
