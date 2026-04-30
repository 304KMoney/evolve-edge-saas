export type MarketingServiceOffer = {
  title: string;
  priceLabel: string;
  audience: string;
  body: string;
  deliverables: string[];
};

export const MARKETING_SERVICE_OFFERS: readonly MarketingServiceOffer[] = [
  {
    title: "Starter Governance Retainer",
    priceLabel: "From $5,000 / month",
    audience:
      "Best for small law firms, small fintech teams, healthtech startups, and founders already using AI tools.",
    body:
      "A premium recurring engagement that gives leadership a structured operating rhythm for immediate AI, security, and compliance exposure.",
    deliverables: [
      "Recurring intake reviews",
      "AI, security, and compliance gap scans",
      "Executive summary updates",
      "Top risk findings refresh",
      "30-day action planning",
      "Advisory briefing cadence"
    ]
  },
  {
    title: "Scale Governance Program",
    priceLabel: "From $18,500 / month",
    audience:
      "Best for regulated small businesses, law firms, fintech, healthtech, and SaaS companies.",
    body:
      "The core recurring program for teams that need fuller assessment coverage, stronger reporting, and a prioritized remediation roadmap.",
    deliverables: [
      "Recurring AI and security risk assessments",
      "Compliance mapping",
      "Vendor and tool risk reviews",
      "Data exposure reviews",
      "Executive-ready reporting",
      "Prioritized remediation roadmap",
      "Executive briefing cadence"
    ]
  },
  {
    title: "Compliance Readiness Sprint",
    priceLabel: "Custom sprint scope",
    audience:
      "Best for companies preparing for SOC 2, HIPAA, ISO 27001, vendor due diligence, or enterprise sales.",
    body:
      "A higher-ROI implementation engagement that translates readiness gaps into an operator-friendly sprint plan.",
    deliverables: [
      "Readiness assessment",
      "Control gap analysis",
      "Policy and control roadmap",
      "Remediation sprint plan",
      "Evidence readiness guidance",
      "Leadership briefing"
    ]
  },
  {
    title: "Executive AI Security Program",
    priceLabel: "Custom recurring advisory",
    audience:
      "Best for companies that need ongoing AI governance, security oversight, and customer or board readiness.",
    body:
      "A recurring advisory retainer that keeps executive stakeholders informed while risk posture, governance, and remediation work mature over time.",
    deliverables: [
      "Monthly security posture review",
      "AI governance updates",
      "Vendor and security questionnaire support",
      "Risk register maintenance",
      "Executive reporting",
      "Ongoing remediation guidance"
    ]
  },
  {
    title: "Enterprise AI Governance & Risk Program",
    priceLabel: "Custom enterprise scope",
    audience:
      "Best for regulated or investor-backed companies with complex environments and broader stakeholder coordination needs.",
    body:
      "A high-touch enterprise program for organizations that need custom governance design, executive visibility, and tailored delivery workflows.",
    deliverables: [
      "Custom AI governance program",
      "Multi-framework compliance alignment",
      "Executive risk dashboard",
      "Workflow and report customization",
      "Security roadmap",
      "Stakeholder briefings"
    ]
  }
] as const;

export const MARKETING_SERVICE_SUMMARY = MARKETING_SERVICE_OFFERS.map((offer) => ({
  title: offer.title,
  priceLabel: offer.priceLabel
}));

export const EXECUTIVE_PROOF_POINTS = [
  {
    title: "Executive-ready outputs",
    body:
      "Leadership gets a clear risk narrative, prioritized findings, and a roadmap that supports budgeting, diligence, and stakeholder conversations."
  },
  {
    title: "Readiness before delay",
    body:
      "The work is designed to surface gaps before SOC 2 preparation, vendor review, enterprise sales, or customer diligence becomes more expensive."
  },
  {
    title: "Advisory plus platform discipline",
    body:
      "Evolve Edge pairs AI-powered assessment with backend-owned validation, reporting, and advisory guidance instead of positioning itself like a checklist app."
  }
] as const;
