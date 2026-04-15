import { createHash } from "node:crypto";
import {
  AuditActorType,
  LeadSubmissionStatus,
  Prisma,
  prisma
} from "@evolve-edge/db";
import { cookies } from "next/headers";
import { writeAuditLog } from "./audit";
import {
  syncOrganizationCustomerAccount,
  upsertCustomerAccountFromLead
} from "./customer-accounts";
import { publishDomainEvent } from "./domain-events";
import { maskEmail } from "./intake-observability";
import { logServerEvent } from "./monitoring";
import { getOptionalEnv } from "./runtime-config";

type LeadDbClient = Prisma.TransactionClient | typeof prisma;

export const LEAD_SOURCE_VALUES = [
  "contact_sales",
  "demo_request",
  "pricing_plan_selection",
  "signup_entry",
  "onboarding_completion"
] as const;

export type LeadSource = (typeof LEAD_SOURCE_VALUES)[number];

export type LeadAttributionSnapshot = {
  landingPath: string | null;
  lastPath: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  capturedAt: string | null;
};

export type LeadCaptureInput = {
  source: LeadSource;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  teamSize?: string | null;
  intent?: string | null;
  sourcePath?: string | null;
  requestedPlanCode?: string | null;
  pricingContext?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  stage?: LeadSubmissionStatus;
  attribution?: LeadAttributionSnapshot | null;
  payload?: Prisma.InputJsonValue;
  actorLabel?: string | null;
  requestContext?: Prisma.InputJsonValue | null;
};

const ATTRIBUTION_COOKIE = "evolve_edge_attribution";
const DEFAULT_LEAD_DEDUPE_WINDOW_DAYS = 14;

export class LeadSubmissionPipelineError extends Error {
  constructor(
    readonly stage:
      | "lead_capture"
      | "lead_event_publish"
      | "lead_customer_account_sync",
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "LeadSubmissionPipelineError";
  }
}

function trimOrNull(value: string | null | undefined, maxLength = 500) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function sanitizeLeadPayloadForCrm(value: Prisma.InputJsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.InputJsonValue>;
  }

  const record = value as Record<string, Prisma.InputJsonValue>;
  const sanitized: Record<string, Prisma.InputJsonValue> = {};

  const industry =
    typeof record.industry === "string" ? trimOrNull(record.industry, 120) : null;
  if (industry) {
    sanitized.industry = industry;
  }

  const country =
    typeof record.country === "string" ? trimOrNull(record.country, 120) : null;
  if (country) {
    sanitized.country = country;
  }

  const firstAssessmentName =
    typeof record.firstAssessmentName === "string"
      ? trimOrNull(record.firstAssessmentName, 200)
      : null;
  if (firstAssessmentName) {
    sanitized.firstAssessmentName = firstAssessmentName;
  }

  const frameworkCodes = Array.isArray(record.frameworkCodes)
    ? record.frameworkCodes
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, 10)
    : [];
  if (frameworkCodes.length > 0) {
    sanitized.frameworkCodes = frameworkCodes;
  }

  return sanitized;
}

function getLeadDedupeWindowDays() {
  const rawValue = Number(getOptionalEnv("LEAD_DEDUPE_WINDOW_DAYS") ?? "");
  return Number.isFinite(rawValue) && rawValue > 0
    ? rawValue
    : DEFAULT_LEAD_DEDUPE_WINDOW_DAYS;
}

function sanitizeAttribution(value: LeadAttributionSnapshot | null | undefined) {
  if (!value) {
    return null;
  }

  return {
    landingPath: trimOrNull(value.landingPath, 200),
    lastPath: trimOrNull(value.lastPath, 200),
    referrer: trimOrNull(value.referrer, 500),
    utmSource: trimOrNull(value.utmSource, 200),
    utmMedium: trimOrNull(value.utmMedium, 200),
    utmCampaign: trimOrNull(value.utmCampaign, 200),
    utmTerm: trimOrNull(value.utmTerm, 200),
    utmContent: trimOrNull(value.utmContent, 200),
    gclid: trimOrNull(value.gclid, 200),
    fbclid: trimOrNull(value.fbclid, 200),
    msclkid: trimOrNull(value.msclkid, 200),
    capturedAt: trimOrNull(value.capturedAt, 100)
  } satisfies LeadAttributionSnapshot;
}

function buildLeadDedupeKey(input: {
  source: LeadSource;
  normalizedEmail: string;
  intent: string | null;
  requestedPlanCode: string | null;
}) {
  const base = [
    input.source,
    input.normalizedEmail,
    input.intent ?? "none",
    input.requestedPlanCode ?? "none"
  ].join(":");

  return createHash("sha256").update(base).digest("hex");
}

export async function readLeadAttributionFromCookies() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(ATTRIBUTION_COOKIE)?.value;

  if (!rawValue) {
    return null;
  }

  try {
    return sanitizeAttribution(JSON.parse(rawValue) as LeadAttributionSnapshot);
  } catch {
    return null;
  }
}

export async function captureLeadSubmission(
  input: LeadCaptureInput,
  db: LeadDbClient = prisma
) {
  const normalizedEmail = normalizeEmail(input.email);

  if (!normalizedEmail) {
    throw new Error("Lead email is required.");
  }

  const sourcePath = trimOrNull(input.sourcePath, 200);
  const intent = trimOrNull(input.intent, 120);
  const requestedPlanCode = trimOrNull(input.requestedPlanCode, 120);
  const dedupeKey = buildLeadDedupeKey({
    source: input.source,
    normalizedEmail,
    intent,
    requestedPlanCode
  });
  const attribution = sanitizeAttribution(input.attribution);
  const crmSafePayload = sanitizeLeadPayloadForCrm(input.payload);
  const dedupeWindowStart = new Date(
    Date.now() - getLeadDedupeWindowDays() * 24 * 60 * 60 * 1000
  );

  const existingLead = await db.leadSubmission.findFirst({
    where: {
      dedupeKey,
      submittedAt: {
        gte: dedupeWindowStart
      }
    },
    orderBy: {
      submittedAt: "desc"
    }
  });

  const normalizedPayload = {
    email: normalizedEmail,
    firstName: trimOrNull(input.firstName, 120),
    lastName: trimOrNull(input.lastName, 120),
    companyName: trimOrNull(input.companyName, 200),
    jobTitle: trimOrNull(input.jobTitle, 160),
    phone: trimOrNull(input.phone, 60),
    teamSize: trimOrNull(input.teamSize, 80),
    source: input.source,
    intent,
    sourcePath,
    requestedPlanCode,
    pricingContext: trimOrNull(input.pricingContext, 160),
    attribution,
    payload:
      input.payload && typeof input.payload === "object"
        ? input.payload
        : ({ notes: trimOrNull(String(input.payload ?? ""), 2_000) } satisfies Prisma.InputJsonValue)
  } satisfies Prisma.InputJsonValue;

  logServerEvent("info", "lead.capture.persist.begin", {
    traceId:
      typeof (input.requestContext as Record<string, unknown> | null | undefined)?.traceId ===
      "string"
        ? ((input.requestContext as Record<string, unknown>).traceId as string)
        : null,
    route: "contact-sales.action",
    request_id:
      typeof (input.requestContext as Record<string, unknown> | null | undefined)?.requestId ===
      "string"
        ? ((input.requestContext as Record<string, unknown>).requestId as string)
        : null,
    user_id: input.userId ?? null,
    org_id: input.organizationId ?? null,
    status: "begin",
    source: "lead.capture",
    metadata: {
      leadSource: input.source,
      email: maskEmail(normalizedEmail),
      companyName: trimOrNull(input.companyName, 200),
      requestedPlanCode
    }
  });

  const lead = existingLead
    ? await db.leadSubmission.update({
        where: { id: existingLead.id },
        data: {
          organizationId: input.organizationId ?? existingLead.organizationId,
          userId: input.userId ?? existingLead.userId,
          email: normalizedEmail,
          normalizedEmail,
          firstName: trimOrNull(input.firstName, 120) ?? existingLead.firstName,
          lastName: trimOrNull(input.lastName, 120) ?? existingLead.lastName,
          companyName: trimOrNull(input.companyName, 200) ?? existingLead.companyName,
          jobTitle: trimOrNull(input.jobTitle, 160) ?? existingLead.jobTitle,
          phone: trimOrNull(input.phone, 60) ?? existingLead.phone,
          teamSize: trimOrNull(input.teamSize, 80) ?? existingLead.teamSize,
          sourcePath: sourcePath ?? existingLead.sourcePath,
          requestedPlanCode: requestedPlanCode ?? existingLead.requestedPlanCode,
          pricingContext:
            trimOrNull(input.pricingContext, 160) ?? existingLead.pricingContext,
          attribution: attribution ?? existingLead.attribution ?? Prisma.JsonNull,
          payload: normalizedPayload,
          stage: input.stage ?? existingLead.stage,
          submittedAt: new Date(),
          processedAt: new Date(),
          lastError: null
        }
      })
    : await db.leadSubmission.create({
        data: {
          organizationId: input.organizationId ?? null,
          userId: input.userId ?? null,
          email: normalizedEmail,
          normalizedEmail,
          firstName: trimOrNull(input.firstName, 120),
          lastName: trimOrNull(input.lastName, 120),
          companyName: trimOrNull(input.companyName, 200),
          jobTitle: trimOrNull(input.jobTitle, 160),
          phone: trimOrNull(input.phone, 60),
          teamSize: trimOrNull(input.teamSize, 80),
          source: input.source,
          intent,
          sourcePath,
          requestedPlanCode,
          pricingContext: trimOrNull(input.pricingContext, 160),
          attribution: attribution ?? Prisma.JsonNull,
          payload: normalizedPayload,
          dedupeKey,
          stage: input.stage ?? LeadSubmissionStatus.CAPTURED,
          processedAt: new Date()
        }
      });

  let publishedEventId: string | null = null;

  if (!existingLead) {
    try {
      const publishedEvent = await publishDomainEvent(db, {
        type: "lead.captured",
        aggregateType: "leadSubmission",
        aggregateId: lead.id,
        orgId: input.organizationId ?? null,
        userId: input.userId ?? null,
        idempotencyKey: `lead.captured:${lead.id}`,
        payload: {
          leadId: lead.id,
          normalizedEmail,
          firstName: trimOrNull(input.firstName, 120),
          lastName: trimOrNull(input.lastName, 120),
          companyName: trimOrNull(input.companyName, 200),
          jobTitle: trimOrNull(input.jobTitle, 160),
          phone: trimOrNull(input.phone, 60),
          teamSize: trimOrNull(input.teamSize, 80),
          source: input.source,
          intent,
          sourcePath,
          requestedPlanCode,
          trace_id:
            typeof (input.requestContext as Record<string, unknown> | null | undefined)?.traceId ===
            "string"
              ? ((input.requestContext as Record<string, unknown>).traceId as string)
              : null,
          pricingContext: trimOrNull(input.pricingContext, 160),
          attribution,
          ...crmSafePayload
        } satisfies Prisma.InputJsonValue
      });
      publishedEventId = publishedEvent?.id ?? null;
    } catch (error) {
      logServerEvent("error", "lead.capture.event_publish.failed", {
        traceId:
          typeof (input.requestContext as Record<string, unknown> | null | undefined)?.traceId ===
          "string"
            ? ((input.requestContext as Record<string, unknown>).traceId as string)
            : null,
        route: "contact-sales.action",
        request_id:
          typeof (input.requestContext as Record<string, unknown> | null | undefined)?.requestId ===
          "string"
            ? ((input.requestContext as Record<string, unknown>).requestId as string)
            : null,
        resource_id: lead.id,
        status: "failed",
        source: "lead.capture",
        metadata: {
          stage: "lead_event_publish",
          email: maskEmail(normalizedEmail),
          message: error instanceof Error ? error.message : "Unknown error"
        }
      });
      throw new LeadSubmissionPipelineError(
        "lead_event_publish",
        "Lead submission was stored but downstream event handoff could not be created.",
        error
      );
    }

    try {
      await writeAuditLog(db, {
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        actorType: input.userId ? AuditActorType.USER : AuditActorType.SYSTEM,
        actorLabel: input.actorLabel ?? normalizedEmail,
        action: "lead.captured",
        entityType: "leadSubmission",
        entityId: lead.id,
        metadata: {
          source: input.source,
          intent,
          requestedPlanCode,
          normalizedEmail
        },
        requestContext: input.requestContext ?? null
      });
    } catch (error) {
      logServerEvent("warn", "lead.capture.audit_log.failed", {
        traceId:
          typeof (input.requestContext as Record<string, unknown> | null | undefined)?.traceId ===
          "string"
            ? ((input.requestContext as Record<string, unknown>).traceId as string)
            : null,
        route: "contact-sales.action",
        request_id:
          typeof (input.requestContext as Record<string, unknown> | null | undefined)?.requestId ===
          "string"
            ? ((input.requestContext as Record<string, unknown>).requestId as string)
            : null,
        resource_id: lead.id,
        status: "failed",
        source: "lead.capture",
        metadata: {
          stage: "lead_audit_log",
          email: maskEmail(normalizedEmail),
          message: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }
  }

  try {
    await upsertCustomerAccountFromLead({
      leadSubmissionId: lead.id,
      db
    });
  } catch (error) {
    logServerEvent("warn", "lead.capture.customer_account_sync.failed", {
      traceId:
        typeof (input.requestContext as Record<string, unknown> | null | undefined)?.traceId ===
        "string"
          ? ((input.requestContext as Record<string, unknown>).traceId as string)
          : null,
      route: "contact-sales.action",
      request_id:
        typeof (input.requestContext as Record<string, unknown> | null | undefined)?.requestId ===
        "string"
          ? ((input.requestContext as Record<string, unknown>).requestId as string)
          : null,
      resource_id: lead.id,
      status: "failed",
      source: "lead.capture",
      metadata: {
        stage: "lead_customer_account_sync",
        email: maskEmail(normalizedEmail),
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }

  return {
    lead,
    deduped: Boolean(existingLead),
    eventId: existingLead ? null : publishedEventId
  };
}

export async function markLeadConverted(input: {
  email: string;
  organizationId: string;
  userId: string;
  requestedPlanCode?: string | null;
  actorLabel?: string | null;
  requestContext?: Prisma.InputJsonValue | null;
  db?: LeadDbClient;
}) {
  const db = input.db ?? prisma;
  const normalizedEmail = normalizeEmail(input.email);
  const lead = await db.leadSubmission.findFirst({
    where: {
      normalizedEmail
    },
    orderBy: {
      submittedAt: "desc"
    }
  });

  if (!lead) {
    return null;
  }

  const updatedLead = await db.leadSubmission.update({
    where: { id: lead.id },
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      requestedPlanCode:
        trimOrNull(input.requestedPlanCode, 120) ?? lead.requestedPlanCode,
      stage: LeadSubmissionStatus.CONVERTED,
      processedAt: new Date(),
      lastError: null
    }
  });

  await publishDomainEvent(db, {
    type: "lead.converted",
    aggregateType: "leadSubmission",
    aggregateId: updatedLead.id,
    orgId: input.organizationId,
    userId: input.userId,
    idempotencyKey: `lead.converted:${updatedLead.id}:${input.organizationId}`,
    payload: {
      leadId: updatedLead.id,
      organizationId: input.organizationId,
      userId: input.userId,
      requestedPlanCode:
        trimOrNull(input.requestedPlanCode, 120) ?? updatedLead.requestedPlanCode
    } satisfies Prisma.InputJsonValue
  });

  await writeAuditLog(db, {
    organizationId: input.organizationId,
    userId: input.userId,
    actorLabel: input.actorLabel ?? normalizedEmail,
    action: "lead.converted",
    entityType: "leadSubmission",
    entityId: updatedLead.id,
    metadata: {
      requestedPlanCode:
        trimOrNull(input.requestedPlanCode, 120) ?? updatedLead.requestedPlanCode
    },
    requestContext: input.requestContext ?? null
  });

  await syncOrganizationCustomerAccount(input.organizationId, {
    db,
    actorUserId: input.userId,
    actorLabel: input.actorLabel ?? normalizedEmail,
    reason: "Lead conversion linked the account to a live workspace."
  });

  return updatedLead;
}

export async function getLatestLeadSubmissionForConversion(input: {
  organizationId?: string | null;
  userId?: string | null;
  email?: string | null;
  db?: LeadDbClient;
}) {
  const db = input.db ?? prisma;
  const normalizedEmail = input.email ? normalizeEmail(input.email) : null;

  return db.leadSubmission.findFirst({
    where: {
      OR: [
        input.organizationId ? { organizationId: input.organizationId } : undefined,
        input.userId ? { userId: input.userId } : undefined,
        normalizedEmail ? { normalizedEmail } : undefined
      ].filter(Boolean) as Prisma.LeadSubmissionWhereInput[]
    },
    orderBy: {
      submittedAt: "desc"
    }
  });
}
