export const PRICING_HERO = {
  eyebrow: "Pricing",
  title: "Choose the operating model for AI governance that executives will actually trust.",
  body:
    "Evolve Edge helps regulated teams reduce AI risk, produce decision-ready reporting, and keep compliance programs moving with one canonical commercial model across the app, billing, routing, and delivery stack.",
  trustBadges: [
    "Stripe-backed billing",
    "Multi-tenant access controls",
    "Executive-ready reporting",
    "Audit-friendly workflow history"
  ]
} as const;

export const PRICING_TRUST_SIGNALS = [
  {
    title: "Compliance-focused by design",
    body: "Built around governance posture, risk visibility, framework alignment, and evidence-backed decision support."
  },
  {
    title: "Executive reporting included",
    body: "Each workspace is structured to turn live assessments into board-ready summaries and remediation roadmaps."
  },
  {
    title: "Ongoing monitoring posture",
    body: "Designed for recurring reassessment, plan-aware limits, and durable customer lifecycle visibility instead of one-off consulting workflows."
  }
] as const;

export const PRICING_FAQ = [
  {
    question: "Does every plan include a trial?",
    answer:
      "No. The public commercial model is now Starter, Scale, and Enterprise. Starter and Scale are direct checkout paths, while Enterprise remains a sales-led motion."
  },
  {
    question: "What happens if billing is canceled or goes past due?",
    answer:
      "Evolve Edge preserves read-only access for historical visibility where possible, while new write actions stay gated until billing returns to an active state."
  },
  {
    question: "Why do Starter and Scale use a direct checkout path while Enterprise does not?",
    answer:
      "Starter and Scale follow standardized backend-owned commercial routing. Enterprise stays sales-led so rollout scope, approvals, and support expectations can be aligned explicitly."
  },
  {
    question: "When should a team talk to sales?",
    answer:
      "Enterprise buyers, multi-entity programs, or teams that want a guided rollout should use the contact path so plan fit, procurement timing, and rollout scope can be aligned early."
  }
] as const;

export const PRICING_COMPARISON_ROWS = [
  {
    label: "Executive report center",
    key: "reportCenter"
  },
  {
    label: "Remediation roadmap",
    key: "roadmap"
  },
  {
    label: "Team management",
    key: "teamManagement"
  },
  {
    label: "Executive review workflows",
    key: "executiveReviews"
  },
  {
    label: "Custom frameworks",
    key: "customFrameworks"
  },
  {
    label: "Priority support",
    key: "prioritySupport"
  },
  {
    label: "API access",
    key: "apiAccess"
  }
] as const;

export const PRICING_COPY_BLOCKS = {
  primaryCtaAnonymous: "Choose plan",
  primaryCtaOnboarding: "Continue with this plan",
  primaryCtaWorkspace: "Choose plan",
  primaryCtaCurrentPlan: "Current plan",
  secondaryCta: "Book an executive walkthrough",
  annualSavingsLabel: "Canonical public pricing",
  recommendationBadge: "Primary offer"
} as const;
