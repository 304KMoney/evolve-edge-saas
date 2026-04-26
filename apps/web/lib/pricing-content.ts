import {
  EXECUTIVE_PROOF_POINTS,
  MARKETING_SERVICE_OFFERS,
  MARKETING_SERVICE_SUMMARY
} from "./marketing-services";

export const PRICING_HERO = {
  eyebrow: "AI Security Advisory",
  title: "AI Security & Compliance Readiness for High-Trust Teams",
  body:
    "Evolve Edge helps law firms, fintech teams, healthtech startups, and SaaS companies identify AI security, confidentiality, and compliance gaps before they become business risk.",
  trustBadges: [
    "AI-powered assessment",
    "Executive-ready reporting",
    "Security and compliance advisory",
    "Built for high-trust organizations"
  ]
} as const;

export const SERVICE_OFFERS = MARKETING_SERVICE_OFFERS;

export const PRICING_SUMMARY = MARKETING_SERVICE_SUMMARY;
export const EXECUTIVE_PROOF = EXECUTIVE_PROOF_POINTS;

export const WHO_ITS_FOR = [
  "Law firms handling confidential client data",
  "Fintech teams preparing for investor or vendor due diligence",
  "Healthtech companies managing sensitive data",
  "SaaS companies preparing for SOC 2 or enterprise sales",
  "AI-enabled businesses needing governance before scaling"
] as const;

export const ROI_POINTS = [
  "Avoid failed vendor reviews and late-stage security surprises",
  "Reduce compliance preparation gaps before they slow growth",
  "Strengthen enterprise sales readiness with clearer controls visibility",
  "Improve executive visibility into AI and security risk posture",
  "Reduce costly remediation surprises by finding gaps earlier"
] as const;

export const PRICING_TRUST_SIGNALS = [
  {
    title: "Executive-ready visibility",
    body:
      "Built for organizations that need clear, executive-ready visibility into AI, security, and compliance risk."
  },
  {
    title: "Readiness-focused delivery",
    body:
      "Evolve Edge is positioned around readiness, risk visibility, gap analysis, and executive roadmaps rather than checkbox claims or compliance guarantees."
  },
  {
    title: "Advisory plus platform",
    body:
      "The platform combines AI-powered assessment, executive reporting, and security and compliance advisory in a single premium service motion."
  }
] as const;

export const PRICING_FAQ = [
  {
    question: "Does Evolve Edge guarantee compliance?",
    answer:
      "No. Evolve Edge helps organizations improve readiness, identify gaps, and build executive roadmaps, but it does not guarantee certification, audit outcomes, or regulatory approval."
  },
  {
    question: "Who is this best for?",
    answer:
      "It is best for high-trust teams that handle sensitive data, face customer diligence, or need a clearer executive view of AI, security, and compliance risk."
  },
  {
    question: "Why is pricing shown as starting at or custom?",
    answer:
      "Scope varies meaningfully by workflow complexity, data sensitivity, stakeholder needs, and framework depth, so Evolve Edge positions pricing around premium packaging rather than a low-ticket checklist motion."
  },
  {
    question: "What happens after the initial engagement?",
    answer:
      "Clients can continue into implementation, recurring advisory, or a broader governance program depending on their readiness goals, remediation needs, and stakeholder demands."
  }
] as const;
