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
