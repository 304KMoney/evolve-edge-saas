export type TrustArtifact = {
  title: string;
  summary: string;
  status: "available" | "planned" | "internal";
  audience: string;
};

export type FrameworkCoverageEntry = {
  slug: string;
  code: string;
  name: string;
  category: string;
  buyerFit: string[];
  overview: string;
  coverageAreas: string[];
  executiveQuestions: string[];
  reportOutputs: string[];
  monitoringSignals: string[];
};

export type MethodologyStage = {
  slug: string;
  name: string;
  summary: string;
  outputs: string[];
  operatorNotes: string[];
};

export type AuthorityCaseStudyScaffold = {
  slug: string;
  segment: string;
  challenge: string;
  outcome: string;
  proofPoints: string[];
  status: "placeholder" | "ready-for-review";
};

export type ResourceScaffold = {
  slug: string;
  title: string;
  format: "brief" | "guide" | "checklist";
  audience: string;
  summary: string;
  status: "outline" | "draft-ready";
};

export const TRUST_CENTER_CONTENT = {
  hero: {
    eyebrow: "Trust Center",
    title: "Structured proof for regulated buyers evaluating Evolve Edge.",
    body:
      "Use one shared authority layer to understand platform controls, framework coverage, delivery rigor, and how the product turns assessments into executive-ready risk visibility."
  },
  trustSignals: [
    {
      title: "App-owned system of record",
      body:
        "Business logic, product state, audit records, and tenant boundaries stay in the Evolve Edge application instead of being hidden inside workflow tools."
    },
    {
      title: "Executive delivery discipline",
      body:
        "Versioned report packages, QA review, founder review flags, and delivery status tracking support premium, board-facing outputs."
    },
    {
      title: "Operational visibility",
      body:
        "Admin, operator, billing, lifecycle, and reliability surfaces are designed so the team can manage customers without inspecting raw database rows."
    }
  ],
  trustArtifacts: [
    {
      title: "Billing and subscription controls",
      summary: "Stripe-verified checkout, lifecycle sync, customer portal, and plan-aware access controls.",
      status: "available",
      audience: "Finance, procurement, operations"
    },
    {
      title: "Audit and event trail",
      summary: "Durable audit logs, domain events, customer run tracking, and operator-visible failure handling.",
      status: "available",
      audience: "Security, compliance, internal audit"
    },
    {
      title: "Security questionnaire pack",
      summary: "Placeholder for a founder-maintained questionnaire response pack and platform architecture summary.",
      status: "planned",
      audience: "Security reviewers"
    },
    {
      title: "Data handling and retention summary",
      summary: "Placeholder for legal and technical documentation covering customer data handling, retention, and deletion workflows.",
      status: "planned",
      audience: "Legal, privacy, procurement"
    }
  ] satisfies TrustArtifact[],
  enterpriseFaq: [
    {
      question: "What makes Evolve Edge credible for regulated buyers?",
      answer:
        "The platform is structured around auditable workflows, explicit billing authority boundaries, multi-tenant isolation, versioned delivery packages, and operator-visible lifecycle control instead of one-off manual handoffs."
    },
    {
      question: "Can the trust center grow into formal legal and security pages later?",
      answer:
        "Yes. This authority layer is intentionally modeled as reusable content sections so formal trust artifacts, legal pages, questionnaires, and downloadable assets can be added without redesigning the site."
    },
    {
      question: "How should a founder update this content now?",
      answer:
        "The first version is file-backed and typed in the app so updates remain explicit and reviewable. A future CMS or admin editor can map onto the same content structures later."
    }
  ]
} as const;

export const FRAMEWORK_COVERAGE_ENTRIES: FrameworkCoverageEntry[] = [
  {
    slug: "soc-2",
    code: "SOC 2",
    name: "SOC 2 Readiness",
    category: "Security assurance",
    buyerFit: ["B2B SaaS", "Fintech", "Legal tech"],
    overview:
      "Translate AI governance and security program evidence into leadership-ready readiness signals across trust service criteria.",
    coverageAreas: [
      "AI governance controls and policy posture",
      "Vendor and model oversight",
      "Access, logging, and operational process discipline",
      "Risk findings aligned to executive remediation planning"
    ],
    executiveQuestions: [
      "Where are governance controls immature or undocumented?",
      "Which findings create delivery or customer trust risk?",
      "What should leadership prioritize in the next quarter?"
    ],
    reportOutputs: [
      "Executive summary with risk framing",
      "Top findings and severity grouping",
      "Roadmap actions by owner role and timeline"
    ],
    monitoringSignals: [
      "Recurring reassessment of open findings",
      "Trend visibility for remediation progress",
      "Framework posture changes over time"
    ]
  },
  {
    slug: "hipaa",
    code: "HIPAA",
    name: "HIPAA Program Visibility",
    category: "Privacy and health data",
    buyerFit: ["Healthtech", "Healthcare services", "AI copilots handling PHI"],
    overview:
      "Help leadership understand AI-related privacy, security, and operational risk where sensitive health information and regulated workflows are involved.",
    coverageAreas: [
      "Use of AI tools in regulated workflows",
      "Handling of sensitive data and vendors",
      "Control gaps that affect privacy and operational trust",
      "Evidence-backed remediation priorities"
    ],
    executiveQuestions: [
      "Where is AI usage creating policy or process drift?",
      "What issues should privacy and operations leaders address first?",
      "What evidence should be prepared for customer and partner review?"
    ],
    reportOutputs: [
      "Leadership overview and risk framing",
      "Findings mapped to operational exposure",
      "Prioritized action roadmap"
    ],
    monitoringSignals: [
      "Open findings and accepted risks",
      "Monitoring of control maturity trend",
      "Recurring review cadence placeholders"
    ]
  },
  {
    slug: "pci-dss",
    code: "PCI DSS",
    name: "PCI DSS Risk Oversight",
    category: "Payments and cardholder data",
    buyerFit: ["Fintech", "Payments", "B2B platforms handling card workflows"],
    overview:
      "Expose AI and process risk that affects payment environments, audit readiness, and executive accountability for remediation.",
    coverageAreas: [
      "Payment-related workflow exposure",
      "Third-party and model risk around regulated data flows",
      "Findings and remediation priorities with operational owners"
    ],
    executiveQuestions: [
      "Which issues raise the most audit or customer trust risk?",
      "What remediation work should be sequenced first?",
      "How should leadership track risk reduction over time?"
    ],
    reportOutputs: [
      "Executive summary and posture signal",
      "Top risks for leadership review",
      "Roadmap with sequencing guidance"
    ],
    monitoringSignals: [
      "Finding trend history",
      "Recurring reassessment markers",
      "Control posture snapshots"
    ]
  },
  {
    slug: "gdpr",
    code: "GDPR",
    name: "GDPR and Data Governance",
    category: "Privacy governance",
    buyerFit: ["International SaaS", "Legal teams", "Privacy-led organizations"],
    overview:
      "Clarify AI governance, data usage, and policy risk in environments where privacy leadership needs structured oversight.",
    coverageAreas: [
      "Use of models and vendors in data-sensitive workflows",
      "Policy, governance, and decision-record gaps",
      "Remediation priorities for legal and executive review"
    ],
    executiveQuestions: [
      "Where does AI usage outpace governance discipline?",
      "What needs legal review or executive sponsorship?",
      "How can the team show progress credibly over time?"
    ],
    reportOutputs: [
      "Leadership narrative on privacy risk posture",
      "Evidence-backed findings summary",
      "Action roadmap and sequencing"
    ],
    monitoringSignals: [
      "Governance trend snapshots",
      "Remediation status over time",
      "Recurring review posture"
    ]
  }
];

export const METHODOLOGY_STAGES: MethodologyStage[] = [
  {
    slug: "intake",
    name: "Structured intake",
    summary:
      "Capture governance context, workflows, vendors, models, and framework alignment in a way that can be reviewed, resumed, and audited.",
    outputs: [
      "Workspace-scoped intake record",
      "Assessment progress state",
      "Framework selection context"
    ],
    operatorNotes: [
      "Designed for partial completion and safe resume behavior",
      "Supports customer and operator visibility into what is still missing"
    ]
  },
  {
    slug: "analysis",
    name: "Validated AI analysis",
    summary:
      "External AI execution stays bounded while the app validates outputs before findings and roadmap items become product state.",
    outputs: [
      "Structured findings",
      "Recommendations and roadmap actions",
      "Risk posture signal"
    ],
    operatorNotes: [
      "AI execution never becomes the hidden source of truth",
      "Failures are durable, reviewable, and recoverable"
    ]
  },
  {
    slug: "delivery",
    name: "Executive delivery packaging",
    summary:
      "Generated reports become versioned, reviewable packages with QA status, founder-review support, and briefing tracking.",
    outputs: [
      "Versioned report package",
      "Executive summary",
      "Roadmap summary and framework metadata"
    ],
    operatorNotes: [
      "Supports premium delivery quality and internal review discipline",
      "Preserves prior versions for trust and traceability"
    ]
  },
  {
    slug: "monitoring",
    name: "Recurring visibility",
    summary:
      "The platform preserves findings, trend snapshots, framework posture, and remediation state so clients have a reason to stay engaged after the initial report.",
    outputs: [
      "Monitoring dashboard foundation",
      "Finding status tracking",
      "Risk trend history"
    ],
    operatorNotes: [
      "Cleanly separated from one-time audit snapshots",
      "Designed for future scheduled checks and vendor integrations"
    ]
  }
];

export const SECURITY_POSTURE_MODULES = [
  {
    title: "Tenant isolation and scoped access",
    body:
      "Product data is modeled as multi-tenant by default, with org-scoped reads and writes, role-aware controls, and internal admin separation."
  },
  {
    title: "Auditability and operational traceability",
    body:
      "Important business actions create audit records or domain events so operators can understand who acted, what changed, and which downstream systems were notified."
  },
  {
    title: "Billing and integration boundaries",
    body:
      "Stripe remains billing authority, HubSpot remains CRM-only, and workflow tools do not own product logic. This reduces hidden side effects and supports enterprise trust."
  },
  {
    title: "Recovery-oriented workflow design",
    body:
      "Customer runs, webhook deliveries, scheduled jobs, and operator controls are modeled so failures are visible and recoverable instead of silent."
  }
] as const;

export const CASE_STUDY_SCAFFOLDS: AuthorityCaseStudyScaffold[] = [
  {
    slug: "fintech-governance-rollout",
    segment: "Fintech",
    challenge: "Leadership needed a credible AI governance and reporting process before scaling customer-facing AI workflows.",
    outcome: "Structured assessments, executive delivery, and ongoing monitoring made governance visible without a services-heavy operating model.",
    proofPoints: [
      "Executive-ready reporting cadence",
      "Centralized risk and remediation view",
      "Clear operator workflow from lead through delivery"
    ],
    status: "placeholder"
  },
  {
    slug: "healthtech-board-reporting",
    segment: "Healthtech",
    challenge: "A regulated buyer needed clearer leadership visibility into AI-related policy, security, and process risk.",
    outcome: "A repeatable assessment-to-briefing workflow reduced ambiguity and made open issues easier to prioritize.",
    proofPoints: [
      "Framework-aligned findings summary",
      "Versioned executive package",
      "Remediation tracking foundation"
    ],
    status: "placeholder"
  }
];

export const RESOURCE_SCAFFOLDS: ResourceScaffold[] = [
  {
    slug: "ai-governance-readiness-guide",
    title: "AI Governance Readiness Guide",
    format: "guide",
    audience: "Founders, COO, CISO",
    summary: "Outline a founder-editable guide explaining how regulated teams should evaluate AI governance readiness before customer or board scrutiny increases.",
    status: "draft-ready"
  },
  {
    slug: "executive-risk-briefing-checklist",
    title: "Executive Risk Briefing Checklist",
    format: "checklist",
    audience: "CTO, GC, board-facing operators",
    summary: "Provide a structured checklist for preparing executive discussions around findings, posture, and remediation sequencing.",
    status: "outline"
  },
  {
    slug: "framework-selection-brief",
    title: "Framework Selection Brief",
    format: "brief",
    audience: "Procurement, compliance leadership",
    summary: "Explain when to anchor on SOC 2, HIPAA, PCI DSS, GDPR, or mixed-framework governance based on buyer context.",
    status: "outline"
  }
];

export const AUTHORITY_FAQ = [
  {
    question: "Does Evolve Edge replace legal, compliance, or audit judgment?",
    answer:
      "No. The authority layer is designed to explain how the product structures evidence, findings, and executive visibility. It does not hardcode exaggerated assurance claims."
  },
  {
    question: "Can we publish formal trust artifacts later?",
    answer:
      "Yes. This first version is intentionally modular so downloadable trust documents, legal pages, questionnaire packs, and customer proof can be added later."
  },
  {
    question: "Is the authority layer tied to a CMS today?",
    answer:
      "Not yet. The first version is typed and file-backed so updates remain easy to review, but the structures are designed so a CMS or admin editor can map onto them later."
  }
] as const;
