export const FOUNDING_RISK_AUDIT = {
  eyebrow: "Founding Client Offer",
  title: "Founding Risk Audit",
  priceLabel: "$2,500-$5,000",
  availability: "Limited availability for the next 7 days",
  summary:
    "A fast-turnaround, executive-ready AI risk and compliance assessment for regulated and high-trust teams that need clarity before exposure becomes a client, legal, or operational problem.",
  promise:
    "Identify AI, security, confidentiality, governance, and compliance risks quickly and leave with a prioritized action plan leadership can use immediately.",
  ctas: {
    primary: "Get the Founding Risk Audit",
    secondary: "Book a Call",
    apply: "Apply for Founding Client Access"
  }
} as const;

export const FOUNDING_RISK_AUDIT_AUDIENCE = [
  {
    title: "Law firms and legal teams",
    body: "For firms using AI in research, drafting, client workflows, or sensitive matter handling where confidentiality and trust cannot slip."
  },
  {
    title: "Early fintech teams",
    body: "For teams moving quickly with AI, automation, and vendors while needing clearer governance and compliance posture."
  },
  {
    title: "Small healthtech organizations",
    body: "For teams using AI around regulated workflows, sensitive data, and trust-critical operations that leadership needs to understand quickly."
  }
] as const;

export const FOUNDING_RISK_AUDIT_PROBLEMS = [
  "AI is already in use, but leadership does not have a clear view of where risk is accumulating.",
  "Confidentiality, vendor, and governance concerns often show up before policy and controls catch up.",
  "Teams need outside perspective and fast clarity, not a months-long consulting engagement."
] as const;

export const FOUNDING_RISK_AUDIT_OUTCOMES = [
  "Know your top AI risks in days, not months",
  "See where trust, confidentiality, and compliance can break down",
  "Get leadership-ready findings you can act on",
  "Move from uncertainty to a prioritized action plan"
] as const;

export const FOUNDING_RISK_AUDIT_DELIVERABLES = [
  {
    title: "Structured intake and business context",
    body: "We capture your current AI usage, workflows, tools, sensitive processes, and leadership concerns before analysis begins."
  },
  {
    title: "Focused risk review",
    body: "We assess confidentiality exposure, data handling risk, governance gaps, vendor risk, control weaknesses, and trust or compliance concerns."
  },
  {
    title: "Executive-ready audit report",
    body: "You receive a professional report built for leadership review, decision support, and immediate internal alignment."
  },
  {
    title: "Top risks with business context",
    body: "We prioritize the issues that matter most and explain why they create legal, operational, confidentiality, or reputational exposure."
  },
  {
    title: "30-60 day action roadmap",
    body: "You leave with a practical next-step plan that helps the team move from ambiguity to remediation."
  },
  {
    title: "Live executive briefing",
    body: "We walk leadership through the findings, answer questions, and clarify the next best move if deeper remediation is needed."
  }
] as const;

export const FOUNDING_RISK_AUDIT_PROCESS = [
  {
    step: "1",
    title: "Intake and business context",
    body: "We review your current AI usage, vendors, workflows, sensitive processes, and key business concerns."
  },
  {
    step: "2",
    title: "AI risk analysis",
    body: "We assess where confidentiality, governance, security, and compliance exposure may be building."
  },
  {
    step: "3",
    title: "Executive-ready report",
    body: "We turn the findings into a professional report with clear priorities and business context."
  },
  {
    step: "4",
    title: "Briefing and roadmap",
    body: "We deliver a live walkthrough and a practical action plan for the next 30 to 60 days."
  }
] as const;

export const EXPANSION_PATHS = [
  {
    title: "Full Audit + Implementation Roadmap",
    priceLabel: "$10,000",
    body: "The next step for teams that want deeper validation, broader controls coverage, and a more extensive implementation roadmap."
  },
  {
    title: "Ongoing advisory and monitoring",
    priceLabel: "$50,000+",
    body: "For organizations that need recurring reassessment, operating support, and ongoing executive visibility as AI use expands."
  },
  {
    title: "Enterprise custom engagements",
    priceLabel: "Custom",
    body: "For larger or more complex environments that need tailored rollout, procurement coordination, and broader governance support."
  }
] as const;

export const PRICING_HERO = {
  eyebrow: "Pricing",
  title: "Start with a premium founding offer built to deliver fast executive clarity.",
  body:
    "The Founding Risk Audit is the fastest way to understand where AI use may be creating confidentiality, governance, compliance, and operational exposure, without waiting months for a larger consulting engagement.",
  trustBadges: [
    "Executive-ready audit report",
    "30-60 day action roadmap",
    "Live briefing with leadership",
    "Built for high-trust teams"
  ]
} as const;

export const PRICING_TRUST_SIGNALS = [
  {
    title: "Outside perspective, fast",
    body: "Get an expert-driven readout that helps leadership understand where risk sits now and what needs attention first."
  },
  {
    title: "Built for high-trust organizations",
    body: "Designed for firms and teams where confidentiality, data handling, governance, and client trust matter immediately."
  },
  {
    title: "A pathway to deeper work",
    body: "The founding audit creates a clear starting point for broader audit, remediation, and ongoing advisory work if needed."
  }
] as const;

export const PRICING_FAQ = [
  {
    question: "Is the Founding Risk Audit just a report artifact?",
    answer:
      "No. It is a fast executive-ready assessment with leadership context, prioritized risk findings, a roadmap, and a live walkthrough so the team knows what to do next."
  },
  {
    question: "Who is this best for right now?",
    answer:
      "It is best for law firms, early fintech teams, small healthtech organizations, and other high-trust operators already using AI, automation, or sensitive workflows without full risk clarity."
  },
  {
    question: "What happens after the founding audit?",
    answer:
      "Clients can continue into a broader full audit and implementation roadmap, or into larger advisory and enterprise support if the scope calls for it."
  },
  {
    question: "How quickly can this move?",
    answer:
      "The offer is designed for fast-turnaround delivery so leadership can understand exposure and start acting within days, not months."
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
  primaryCtaAnonymous: "Apply for Founding Client Access",
  primaryCtaOnboarding: "Continue with this plan",
  primaryCtaWorkspace: "Choose plan",
  primaryCtaCurrentPlan: "Current plan",
  secondaryCta: "Book a Call",
  annualSavingsLabel: "Founding client offer",
  recommendationBadge: "Primary offer"
} as const;
