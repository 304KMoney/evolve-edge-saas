export type DemoSampleOrganization = {
  key: string;
  name: string;
  slug: string;
  industry: string;
  sizeBand: string;
  country: string;
  summary: string;
  demoNarrative: string;
};

export type DemoLeadScenario = {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  source: string;
  intent: string;
  requestedPlanCode: string;
  lifecycleStage:
    | "LEAD"
    | "QUALIFIED"
    | "PROPOSAL_SENT"
    | "WON"
    | "REPORT_READY"
    | "MONITORING_ACTIVE";
  stageSummary: string;
};

export const DEMO_SAMPLE_ORGANIZATIONS: DemoSampleOrganization[] = [
  {
    key: "helix-health",
    name: "Helix Health Group",
    slug: "helix-health-group",
    industry: "Healthtech",
    sizeBand: "51-200",
    country: "US",
    summary:
      "Primary premium demo workspace showing intake, evidence, reporting, framework scoring, monitoring, and executive delivery.",
    demoNarrative:
      "Use this workspace for the end-to-end customer journey from onboarding through executive briefing."
  },
  {
    key: "northbridge-payments",
    name: "Northbridge Payments",
    slug: "northbridge-payments",
    industry: "Fintech",
    sizeBand: "201-500",
    country: "US",
    summary:
      "Secondary customer workspace for admin, KPI, and operator-console views with a different engagement posture.",
    demoNarrative:
      "Use this workspace to show multi-tenant ops visibility, active delivery management, and recurring program expansion."
  }
];

export const DEMO_LEAD_SCENARIOS: DemoLeadScenario[] = [
  {
    key: "captured-law-firm",
    email: "prospect@stone-vale-legal.example",
    firstName: "Maya",
    lastName: "Stone",
    companyName: "Stone Vale Legal",
    source: "demo-trust-center",
    intent: "demo-request",
    requestedPlanCode: "growth-annual",
    lifecycleStage: "LEAD",
    stageSummary: "New inbound lead from a trust-center evaluation session."
  },
  {
    key: "qualified-fintech",
    email: "security@ridgebank.example",
    firstName: "Andre",
    lastName: "Cole",
    companyName: "RidgeBank Labs",
    source: "demo-pricing",
    intent: "contact-sales",
    requestedPlanCode: "enterprise-annual",
    lifecycleStage: "QUALIFIED",
    stageSummary: "Qualified buyer evaluating enterprise AI governance scope."
  },
  {
    key: "proposal-healthtech",
    email: "gc@meridian-clinic.example",
    firstName: "Elena",
    lastName: "Brooks",
    companyName: "Meridian Clinic Network",
    source: "demo-homepage",
    intent: "proposal-request",
    requestedPlanCode: "enterprise-annual",
    lifecycleStage: "PROPOSAL_SENT",
    stageSummary: "Proposal delivered for a premium assessment and recurring monitoring package."
  }
];

export const DEMO_PRESENTATION_STEPS = [
  {
    key: "buyer-entry",
    title: "1. Buyer entry and trust layer",
    description:
      "Start on the homepage, trust center, pricing, and framework coverage pages to show premium buyer positioning before the app experience."
  },
  {
    key: "workspace-onboarding",
    title: "2. Workspace onboarding and intake",
    description:
      "Move into the seeded workspace to show onboarding, intake progress, evidence upload, and structured audit preparation."
  },
  {
    key: "delivery-and-monitoring",
    title: "3. Delivery, monitoring, and expansion",
    description:
      "Show report generation, executive delivery, recurring monitoring, framework posture, and expansion-ready program history."
  },
  {
    key: "ops-and-kpis",
    title: "4. Operator controls and leadership visibility",
    description:
      "Finish in the operator console and KPI dashboard to show the business can support real customers at scale."
  }
] as const;
