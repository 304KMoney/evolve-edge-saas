import { Prisma, prisma } from "@evolve-edge/db";
import { cookies } from "next/headers";
import type { AppSession } from "./auth";
import { getOptionalCurrentSession } from "./auth";
import { readLeadAttributionFromCookies } from "./lead-pipeline";
import {
  PRODUCT_ANALYTICS_COOKIE,
  type ProductAnalyticsBillingTransition,
  type ProductAnalyticsEventMap,
  type ProductAnalyticsEventName
} from "./product-analytics-shared";

type AnalyticsDbClient = Prisma.TransactionClient | typeof prisma;

const PRODUCT_ANALYTICS_EVENT_CATEGORY: Record<ProductAnalyticsEventName, string> = {
  "funnel.lead_captured": "funnel",
  "funnel.lead_to_paid": "funnel",
  "funnel.intake_progress_saved": "funnel",
  "funnel.intake_completed": "funnel",
  "funnel.briefing_booked": "funnel",
  "funnel.monitoring_converted": "funnel",
  "marketing.landing_cta_clicked": "marketing",
  "marketing.pricing_viewed": "marketing",
  "marketing.trust_center_viewed": "marketing",
  "marketing.framework_page_viewed": "marketing",
  "marketing.methodology_viewed": "marketing",
  "marketing.security_page_viewed": "marketing",
  "marketing.resources_page_viewed": "marketing",
  "signup.started": "signup",
  "signup.completed": "signup",
  "billing.checkout_started": "billing",
  "billing.checkout_completed": "billing",
  "onboarding.completed": "activation",
  "product.first_assessment_created": "product",
  "product.first_report_generated": "activation",
  "revenue.upgrade_clicked": "revenue",
  "revenue.upgrade_completed": "revenue",
  "usage.limit_reached": "usage",
  "billing.portal_opened": "billing",
  "billing.cancellation_scheduled": "retention",
  "billing.reactivated": "retention"
};

type AnalyticsIdentity = {
  session: AppSession | null;
  anonymousId: string | null;
  sessionId: string | null;
};

function trimOrNull(value: string | null | undefined, maxLength = 500) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

async function getAnalyticsIdentity(): Promise<AnalyticsIdentity> {
  const [session, cookieStore] = await Promise.all([
    getOptionalCurrentSession(),
    cookies()
  ]);
  const rawValue = cookieStore.get(PRODUCT_ANALYTICS_COOKIE)?.value;

  if (!rawValue) {
    return {
      session,
      anonymousId: null,
      sessionId: null
    };
  }

  try {
    const parsed = JSON.parse(rawValue) as {
      anonymousId?: string;
      sessionId?: string;
    };

    return {
      session,
      anonymousId: trimOrNull(parsed.anonymousId, 120),
      sessionId: trimOrNull(parsed.sessionId, 120)
    };
  } catch {
    return {
      session,
      anonymousId: null,
      sessionId: null
    };
  }
}

function resolveAnalyticsIdentity(input: {
  anonymousId?: string | null;
  sessionId?: string | null;
  fallbackIdentity?: AnalyticsIdentity | null;
}) {
  const fallbackIdentity = input.fallbackIdentity ?? null;

  return {
    anonymousId:
      input.anonymousId !== undefined
        ? input.anonymousId
        : fallbackIdentity?.anonymousId ?? null,
    sessionId:
      input.sessionId !== undefined
        ? input.sessionId
        : fallbackIdentity?.sessionId ?? null
  };
}

export async function trackProductAnalyticsEvent<
  TName extends ProductAnalyticsEventName
>(
  input: {
    name: TName;
    payload: ProductAnalyticsEventMap[TName];
    source: string;
    path?: string | null;
    referrer?: string | null;
    organizationId?: string | null;
    userId?: string | null;
    anonymousId?: string | null;
    sessionId?: string | null;
    occurredAt?: Date;
    db?: AnalyticsDbClient;
    session?: AppSession | null;
    attribution?: Prisma.InputJsonValue | null;
    billingPlanCode?: string | null;
  }
) {
  const db = input.db ?? prisma;
  const fallbackIdentity =
    input.session !== undefined ||
    input.anonymousId !== undefined ||
    input.sessionId !== undefined
      ? null
      : await getAnalyticsIdentity();
  const session =
    input.session !== undefined ? input.session : fallbackIdentity?.session ?? null;
  const identity = resolveAnalyticsIdentity({
    anonymousId: input.anonymousId,
    sessionId: input.sessionId,
    fallbackIdentity
  });
  const attribution =
    input.attribution !== undefined
      ? input.attribution
      : await readLeadAttributionFromCookies();

  return (db as typeof prisma).productAnalyticsEvent.create({
    data: {
      name: input.name,
      category: PRODUCT_ANALYTICS_EVENT_CATEGORY[input.name],
      source: input.source,
      organizationId:
        input.organizationId ?? session?.organization?.id ?? null,
      userId: input.userId ?? session?.user.id ?? null,
      anonymousId: input.anonymousId ?? identity.anonymousId,
      sessionId: input.sessionId ?? identity.sessionId,
      path: trimOrNull(input.path, 200),
      referrer: trimOrNull(input.referrer, 500),
      billingPlanCode: trimOrNull(input.billingPlanCode, 120),
      attribution: attribution ?? Prisma.JsonNull,
      payload: input.payload as Prisma.InputJsonValue,
      occurredAt: input.occurredAt ?? new Date()
    }
  });
}

export function isKnownProductAnalyticsEventName(
  value: string
): value is ProductAnalyticsEventName {
  return value in PRODUCT_ANALYTICS_EVENT_CATEGORY;
}
