import { Prisma, prisma } from "@evolve-edge/db";
import { cookies } from "next/headers";
import type { AppSession } from "./auth";
import { getOptionalCurrentSession } from "./auth";
import { readLeadAttributionFromCookies } from "./lead-pipeline";

type AnalyticsDbClient = Prisma.TransactionClient | typeof prisma;

export const PRODUCT_ANALYTICS_COOKIE = "evolve_edge_analytics";

export type ProductAnalyticsEventMap = {
  "funnel.lead_captured": {
    source: string;
    intent: string | null;
    requestedPlanCode: string | null;
    companyName: string | null;
    deduped: boolean;
  };
  "funnel.lead_to_paid": {
    planCode: string;
    leadSource: string | null;
    requestedPlanCode: string | null;
  };
  "funnel.intake_progress_saved": {
    assessmentId: string;
    completedSections: number;
    totalSections: number;
    progressPercent: number;
  };
  "funnel.intake_completed": {
    assessmentId: string;
    completedSections: number;
    totalSections: number;
  };
  "funnel.briefing_booked": {
    reportId: string;
    assessmentId: string;
    reportPackageId: string;
  };
  "funnel.monitoring_converted": {
    reportId: string;
    assessmentId: string;
    reportPackageId: string;
  };
  "marketing.landing_cta_clicked": {
    ctaKey: "view-pricing" | "open-workspace" | "book-demo";
    location: string;
    href: string;
  };
  "marketing.pricing_viewed": {
    location: "pricing-page";
    authenticated: boolean;
  };
  "marketing.trust_center_viewed": {
    location: "trust-center";
  };
  "marketing.framework_page_viewed": {
    slug: string;
    location: "frameworks-index" | "framework-detail";
  };
  "marketing.methodology_viewed": {
    location: "methodology-page";
  };
  "marketing.security_page_viewed": {
    location: "security-page";
  };
  "marketing.resources_page_viewed": {
    location: "resources-page";
  };
  "signup.started": {
    source: string | null;
    intent: string | null;
    requestedPlanCode: string | null;
  };
  "signup.completed": {
    organizationId: string;
    requestedPlanCode: string | null;
  };
  "billing.checkout_started": {
    planCode: string;
    transition: "upgrade" | "downgrade" | "change" | "current";
  };
  "billing.checkout_completed": {
    planCode: string;
    transition: "upgrade" | "downgrade" | "change" | "current";
  };
  "onboarding.completed": {
    organizationId: string;
    frameworkCount: number;
    requestedPlanCode: string | null;
  };
  "product.first_assessment_created": {
    assessmentId: string;
    assessmentName: string;
  };
  "product.first_report_generated": {
    reportId: string;
    assessmentId: string;
  };
  "revenue.upgrade_clicked": {
    fromPlanCode: string | null;
    toPlanCode: string;
    source: string;
  };
  "revenue.upgrade_completed": {
    fromPlanCode: string | null;
    toPlanCode: string;
  };
  "usage.limit_reached": {
    metric: string;
    thresholdPercent: number;
    limit: number | null;
    used: number;
  };
  "billing.portal_opened": {
    source: string;
  };
  "billing.cancellation_scheduled": {
    planCode: string | null;
    accessEndsAt: string | null;
  };
  "billing.reactivated": {
    planCode: string | null;
  };
};

export type ProductAnalyticsEventName = keyof ProductAnalyticsEventMap;
export type ProductAnalyticsBillingTransition =
  | "upgrade"
  | "downgrade"
  | "change"
  | "current";

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
