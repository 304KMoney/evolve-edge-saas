import type { EvalFixture } from "./types";

type MockWorkflowResponses = {
  business_context: Record<string, unknown>;
  framework_mapping: Record<string, unknown>;
  risk_analysis: Record<string, unknown>;
  risk_scoring: Record<string, unknown>;
  remediation_roadmap: Record<string, unknown>;
  final_report: Record<string, unknown>;
};

function buildLawFirmResponses(fixture: EvalFixture): MockWorkflowResponses {
  return {
    business_context: {
      companyName: fixture.companyName,
      industry: fixture.industry,
      companySize: fixture.companySize,
      summary:
        "Boutique legal practice with high client confidentiality expectations, light internal AI usage, and limited formal security governance maturity.",
      operatingModel:
        "Partner-led professional services firm relying on cloud document tooling and a small internal operations team.",
      businessPriorities: [
        "Protect privileged client information",
        "Maintain client trust during growth",
        "Improve audit readiness without overburdening attorneys",
      ],
      securityMaturitySignals: [
        "Some baseline controls exist but policy governance is informal",
        "Access reviews are inconsistent",
        "Third-party review practices are not standardized",
      ],
    },
    framework_mapping: {
      selectedFrameworks: fixture.selectedFrameworks,
      prioritizedFrameworks: ["SOC 2", "NIST CSF", "AI governance"],
      coverageSummary:
        "SOC 2 and NIST CSF are the strongest immediate fit, with AI governance controls needed because staff use AI for drafting and summarization.",
      mappings: [
        {
          framework: "SOC 2",
          rationale: "Supports trust-building and control discipline for client-facing legal operations.",
          applicableAreas: ["Access control", "Vendor management", "Policy governance"],
        },
        {
          framework: "NIST CSF",
          rationale: "Provides a pragmatic operating model for a small firm maturing security practices.",
          applicableAreas: ["Governance", "Detection and response", "Risk management"],
        },
        {
          framework: "AI governance",
          rationale: "AI-assisted legal drafting creates model-usage oversight and data handling obligations.",
          applicableAreas: ["AI usage policy", "Prompt handling", "Human review"],
        },
      ],
    },
    risk_analysis: {
      summary:
        "The firm shows moderate-to-high exposure across governance, access discipline, and vendor oversight, with added sensitivity because legal work relies on confidentiality and judgment.",
      findings: [
        {
          title: "Formal security governance is incomplete",
          severity: "High",
          summary: "Security policies are partial and lack consistent approval and annual review.",
          businessImpact: "Weak governance increases client trust risk and slows defensible audit preparation.",
          controlDomain: "governance",
          impactedFrameworks: ["SOC 2", "NIST CSF"],
          evidence: ["Partial policy set", "No annual review cadence"],
          tags: ["policy", "governance"],
        },
        {
          title: "Privileged access review is inconsistent",
          severity: "Moderate",
          summary: "Administrative access is granted ad hoc and not formally reviewed on a defined cadence.",
          businessImpact: "Unreviewed access can expose client matters and increase insider or credential misuse risk.",
          controlDomain: "access_control",
          impactedFrameworks: ["SOC 2", "NIST CSF"],
          evidence: ["Informal admin access practice"],
          tags: ["iam", "least-privilege"],
        },
        {
          title: "Vendor security review is informal",
          severity: "Moderate",
          summary: "Document and AI vendors are not assessed with a standard risk checklist.",
          businessImpact: "Third-party weaknesses may introduce confidentiality and operational continuity risk.",
          controlDomain: "vendor_management",
          impactedFrameworks: ["SOC 2", "NIST CSF"],
          evidence: ["No standard vendor checklist"],
          tags: ["vendors", "third-party"],
        },
        {
          title: "AI usage oversight is not formalized",
          severity: "Moderate",
          summary: "Staff use AI for drafting and summarization without a formal acceptable-use or review standard.",
          businessImpact: "Unstructured AI use increases confidentiality and quality-control risk in legal workflows.",
          controlDomain: "ai_governance",
          impactedFrameworks: ["AI governance", "NIST CSF"],
          evidence: ["Limited AI use noted in operations"],
          tags: ["ai", "oversight"],
        },
      ],
      systemicThemes: [
        "Governance has not kept pace with operational tooling.",
        "High-trust legal workflows need stronger third-party and AI oversight.",
      ],
      notableStrengths: [
        "Leadership is aware of audit-readiness needs.",
        "The firm has a manageable technology footprint for remediation.",
      ],
      riskFlags: {
        noFormalSecurityPolicies: true,
        noAiGovernance: true,
        vendorRiskPresent: true,
        sensitiveDataExposure: true,
      },
    },
    risk_scoring: {
      keyDrivers: [
        "Incomplete governance documentation",
        "Sensitive client data handling without strong formal controls",
        "Informal vendor and AI oversight",
      ],
    },
    remediation_roadmap: {
      roadmapSummary:
        "Start by formalizing governance and acceptable AI usage, then tighten access review and third-party oversight.",
      immediateActions: [
        {
          title: "Approve a baseline security policy suite",
          description: "Finalize and approve core security, privacy, and acceptable AI use policies.",
          priority: "URGENT",
          ownerRole: "Managing Partner",
          targetTimeline: "0-30 days",
        },
        {
          title: "Launch privileged access review",
          description: "Document admin access and complete a first review with ownership sign-off.",
          priority: "HIGH",
          ownerRole: "IT Administrator",
          targetTimeline: "0-30 days",
        },
      ],
      nearTermActions: [
        {
          title: "Standardize vendor risk review",
          description: "Use a lightweight checklist for document, storage, and AI providers before renewal or onboarding.",
          priority: "HIGH",
          ownerRole: "Operations Lead",
          targetTimeline: "31-60 days",
        },
      ],
      strategicActions: [
        {
          title: "Embed AI usage governance in client-service workflows",
          description: "Define review, approval, and training requirements for AI-assisted drafting and summarization.",
          priority: "MEDIUM",
          ownerRole: "Practice Operations",
          targetTimeline: "61-90 days",
        },
      ],
    },
    final_report: {
      reportTitle: `${fixture.companyName} Executive Risk Audit`,
      reportSubtitle: "Starter / Founding Risk Audit",
      executiveSummary:
        "Evergreen Legal Group should prioritize governance formalization, access oversight, and vendor controls to reduce confidentiality risk and strengthen audit readiness.",
      detailedReport:
        "Overall risk posture is Moderate with elevated exposure in governance, access control, vendor management, and AI usage oversight. Immediate action should focus on approving a baseline policy suite, validating privileged access, and standardizing third-party review. These actions materially improve defensibility for a high-trust legal practice while keeping remediation proportionate to team size.",
      conclusion:
        "The firm can improve risk posture quickly by pairing executive ownership with a concise 90-day remediation plan and disciplined review of vendors and AI-assisted workflows.",
    },
  };
}

function buildFintechResponses(fixture: EvalFixture): MockWorkflowResponses {
  return {
    business_context: {
      companyName: fixture.companyName,
      industry: fixture.industry,
      companySize: fixture.companySize,
      summary:
        "Growth-stage fintech operator handling sensitive financial data with increasing control expectations from customers, partners, and regulators.",
      operatingModel:
        "Cloud-native SaaS platform with rapid product iteration, lean security staffing, and payment-adjacent workflows.",
      businessPriorities: [
        "Protect financial data and payment-adjacent systems",
        "Improve enterprise readiness",
        "Reduce operational risk while scaling product velocity",
      ],
      securityMaturitySignals: [
        "Some monitoring exists but ownership is uneven",
        "Incident response is not operationalized",
        "AI usage is outpacing governance",
      ],
    },
    framework_mapping: {
      selectedFrameworks: fixture.selectedFrameworks,
      prioritizedFrameworks: ["SOC 2", "NIST CSF", "PCI DSS", "AI governance"],
      coverageSummary:
        "Fintech risk profile supports immediate SOC 2 and NIST CSF maturity work, with PCI DSS relevance for payment-adjacent handling and AI governance needed for internal model use.",
      mappings: [
        {
          framework: "SOC 2",
          rationale: "Supports customer trust and enterprise deal requirements.",
          applicableAreas: ["Governance", "Monitoring", "Vendor oversight"],
        },
        {
          framework: "NIST CSF",
          rationale: "Provides a mature operating structure for identifying, protecting, detecting, responding, and recovering.",
          applicableAreas: ["Incident response", "Monitoring", "Risk management"],
        },
        {
          framework: "PCI DSS",
          rationale: "Payment-adjacent workflows create card-data and payment control expectations.",
          applicableAreas: ["Data protection", "Access control", "Logging"],
        },
        {
          framework: "AI governance",
          rationale: "AI-assisted product and engineering work introduces model-risk governance needs.",
          applicableAreas: ["AI oversight", "Human review", "Data handling"],
        },
      ],
    },
    risk_analysis: {
      summary:
        "LedgerLane faces elevated operational and compliance exposure driven by incomplete incident response, immature AI governance, inconsistent monitoring ownership, and financial-data sensitivity.",
      findings: [
        {
          title: "Incident response readiness is incomplete",
          severity: "High",
          summary: "A draft plan exists, but no testing or tabletop exercise has validated execution readiness.",
          businessImpact: "Delayed response to security incidents can increase customer harm, regulator attention, and contractual exposure.",
          controlDomain: "incident_response",
          impactedFrameworks: ["SOC 2", "NIST CSF"],
          evidence: ["Draft only", "No tabletop exercise"],
          tags: ["response", "resilience"],
        },
        {
          title: "AI governance is absent",
          severity: "High",
          summary: "Internal AI usage lacks formal policy, ownership, and review controls.",
          businessImpact: "Unmanaged AI usage raises data handling, model risk, and assurance concerns for financial services buyers.",
          controlDomain: "ai_governance",
          impactedFrameworks: ["AI governance", "NIST CSF"],
          evidence: ["No formal policy"],
          tags: ["ai", "model-risk"],
        },
        {
          title: "Monitoring ownership is inconsistent",
          severity: "Moderate",
          summary: "Alerts exist, but coverage and review accountability are incomplete.",
          businessImpact: "Weak monitoring can delay detection and reduce confidence in control effectiveness.",
          controlDomain: "monitoring",
          impactedFrameworks: ["SOC 2", "NIST CSF", "PCI DSS"],
          evidence: ["Partial coverage"],
          tags: ["logging", "detection"],
        },
        {
          title: "Financial data handling requires tighter discipline",
          severity: "High",
          summary: "Sensitive customer financial workflows are growing faster than documented controls.",
          businessImpact: "Data handling gaps can create customer loss, regulatory exposure, and enterprise diligence friction.",
          controlDomain: "data_handling",
          impactedFrameworks: ["PCI DSS", "SOC 2", "NIST CSF"],
          evidence: ["Financial records handled"],
          tags: ["data", "payments"],
        },
      ],
      systemicThemes: [
        "Operational maturity is trailing platform growth.",
        "Financial-data and AI usage risks need stronger executive governance.",
      ],
      notableStrengths: [
        "Monitoring foundations already exist.",
        "The company has identified enterprise readiness as a near-term priority.",
      ],
      riskFlags: {
        noFormalSecurityPolicies: false,
        noAiGovernance: true,
        vendorRiskPresent: false,
        sensitiveDataExposure: true,
      },
    },
    risk_scoring: {
      keyDrivers: [
        "No formal AI governance",
        "Untested incident response",
        "Sensitive financial data exposure",
      ],
    },
    remediation_roadmap: {
      roadmapSummary:
        "LedgerLane should operationalize incident response, formalize AI governance, and tighten monitoring and financial-data controls before additional enterprise expansion.",
      immediateActions: [
        {
          title: "Run an incident response tabletop",
          description: "Validate roles, escalation paths, and communications using a realistic security scenario.",
          priority: "URGENT",
          ownerRole: "Security Lead",
          targetTimeline: "0-30 days",
        },
        {
          title: "Approve AI governance standard",
          description: "Define acceptable use, data boundaries, review requirements, and accountable ownership for AI tooling.",
          priority: "URGENT",
          ownerRole: "CTO",
          targetTimeline: "0-30 days",
        },
      ],
      nearTermActions: [
        {
          title: "Assign monitoring ownership and coverage review",
          description: "Document alert coverage, routing, and weekly review accountability across cloud and application layers.",
          priority: "HIGH",
          ownerRole: "Engineering Manager",
          targetTimeline: "31-60 days",
        },
      ],
      strategicActions: [
        {
          title: "Map payment-adjacent controls to enterprise diligence requirements",
          description: "Align security controls with SOC 2, NIST CSF, and PCI-relevant expectations for customer and partner reviews.",
          priority: "HIGH",
          ownerRole: "Compliance Lead",
          targetTimeline: "61-90 days",
        },
      ],
    },
    final_report: {
      reportTitle: `${fixture.companyName} Executive Risk Audit`,
      reportSubtitle: "Scale / Growth Assessment",
      executiveSummary:
        "LedgerLane needs stronger incident response readiness, AI governance, and financial-data control discipline to support enterprise growth with confidence.",
      detailedReport:
        "The company currently presents a High risk posture for a growth-stage fintech because operational control maturity has not kept pace with platform sensitivity. The most material issues center on untested incident response, absent AI governance, and sensitive financial-data exposure. Remediation should begin with executive-backed governance, clearer monitoring ownership, and a control roadmap aligned to enterprise diligence expectations.",
      conclusion:
        "Rapid improvement is realistic if leadership treats security governance as a core growth enabler rather than a downstream compliance exercise.",
    },
  };
}

function buildHealthtechResponses(fixture: EvalFixture): MockWorkflowResponses {
  return {
    business_context: {
      companyName: fixture.companyName,
      industry: fixture.industry,
      companySize: fixture.companySize,
      summary:
        "Healthtech operator managing PHI-adjacent workflows where privacy, continuity, and third-party discipline are central to trust and growth.",
      operatingModel:
        "Healthcare coordination platform with cross-functional handling of sensitive data, cloud tooling, and a mixed engineering and compliance operating model.",
      businessPriorities: [
        "Protect sensitive health-related information",
        "Improve compliance defensibility",
        "Support enterprise and provider trust",
      ],
      securityMaturitySignals: [
        "Documentation exists but is fragmented",
        "Vendor oversight is uneven",
        "Access controls need stronger review discipline",
      ],
    },
    framework_mapping: {
      selectedFrameworks: fixture.selectedFrameworks,
      prioritizedFrameworks: ["HIPAA", "SOC 2", "NIST CSF", "AI governance"],
      coverageSummary:
        "HIPAA is directly relevant because the platform handles health-related information, while SOC 2 and NIST CSF support broader security and operational maturity. AI governance remains relevant where automation or model-assisted workflows touch sensitive data.",
      mappings: [
        {
          framework: "HIPAA",
          rationale: "Sensitive health information makes privacy, safeguards, and workforce discipline central.",
          applicableAreas: ["Access control", "Data handling", "Training"],
        },
        {
          framework: "SOC 2",
          rationale: "Supports customer trust and common diligence expectations for healthtech buyers.",
          applicableAreas: ["Vendor management", "Monitoring", "Policy governance"],
        },
        {
          framework: "NIST CSF",
          rationale: "Provides an operational maturity model for healthcare-adjacent security programs.",
          applicableAreas: ["Governance", "Response", "Risk management"],
        },
        {
          framework: "AI governance",
          rationale: "Any AI-assisted coordination or summarization should remain within defined privacy and oversight guardrails.",
          applicableAreas: ["AI use review", "Human oversight", "Data boundaries"],
        },
      ],
    },
    risk_analysis: {
      summary:
        "CareMesh Systems has meaningful exposure in data handling, vendor governance, documentation, and privileged access oversight, with sensitivity amplified by health-related information.",
      findings: [
        {
          title: "Sensitive data handling controls need stronger formalization",
          severity: "High",
          summary: "PHI-adjacent workflows are not fully supported by a documented control library and repeatable privacy safeguards.",
          businessImpact: "Weak formalization can increase privacy risk, partner diligence friction, and incident severity.",
          controlDomain: "data_handling",
          impactedFrameworks: ["HIPAA", "SOC 2", "NIST CSF"],
          evidence: ["PHI-adjacent workflow", "Fragmented control library"],
          tags: ["privacy", "data"],
        },
        {
          title: "Vendor risk management is ad hoc",
          severity: "Moderate",
          summary: "Vendor approvals occur, but periodic reassessment and evidence standards are not consistent.",
          businessImpact: "Third-party control drift can introduce privacy and resilience gaps without timely visibility.",
          controlDomain: "vendor_management",
          impactedFrameworks: ["SOC 2", "HIPAA"],
          evidence: ["Ad hoc reassessment"],
          tags: ["vendors", "third-party"],
        },
        {
          title: "Privileged access oversight is incomplete",
          severity: "Moderate",
          summary: "MFA exists in places, but privileged access reviews are not consistently performed.",
          businessImpact: "Uneven privileged-access oversight raises misuse risk for sensitive systems and records.",
          controlDomain: "access_control",
          impactedFrameworks: ["HIPAA", "SOC 2", "NIST CSF"],
          evidence: ["Inconsistent periodic review"],
          tags: ["iam", "privileged-access"],
        },
        {
          title: "Security and privacy documentation is fragmented",
          severity: "Moderate",
          summary: "Training and procedures exist but are not organized into a cohesive control narrative.",
          businessImpact: "Fragmented documentation weakens operator consistency and external assurance credibility.",
          controlDomain: "documentation",
          impactedFrameworks: ["HIPAA", "SOC 2"],
          evidence: ["Fragmented training documents"],
          tags: ["documentation", "training"],
        },
      ],
      systemicThemes: [
        "Sensitive-data operations need stronger documentation and review discipline.",
        "Third-party and access oversight should mature alongside platform scale.",
      ],
      notableStrengths: [
        "Some MFA and training foundations already exist.",
        "The company has enough operating structure to formalize controls quickly.",
      ],
      riskFlags: {
        noFormalSecurityPolicies: false,
        noAiGovernance: false,
        vendorRiskPresent: true,
        sensitiveDataExposure: true,
      },
    },
    risk_scoring: {
      keyDrivers: [
        "Sensitive health-related data handling",
        "Ad hoc vendor reassessment",
        "Fragmented documentation and access review discipline",
      ],
    },
    remediation_roadmap: {
      roadmapSummary:
        "The company should tighten sensitive-data controls, formalize vendor reassessment, and organize documentation into a defensible operating system for growth.",
      immediateActions: [
        {
          title: "Consolidate privacy and security control documentation",
          description: "Create a single control library covering sensitive data handling, workforce procedures, and review ownership.",
          priority: "URGENT",
          ownerRole: "Compliance Lead",
          targetTimeline: "0-30 days",
        },
      ],
      nearTermActions: [
        {
          title: "Implement recurring vendor reassessment",
          description: "Define evidence requirements and a periodic reassessment schedule for critical vendors.",
          priority: "HIGH",
          ownerRole: "Operations Director",
          targetTimeline: "31-60 days",
        },
        {
          title: "Formalize privileged access review",
          description: "Review privileged roles quarterly and record approvals and removals.",
          priority: "HIGH",
          ownerRole: "Infrastructure Lead",
          targetTimeline: "31-60 days",
        },
      ],
      strategicActions: [
        {
          title: "Map the control program to HIPAA and enterprise diligence expectations",
          description: "Use the consolidated control library to support recurring internal review and external assurance conversations.",
          priority: "MEDIUM",
          ownerRole: "Security Program Manager",
          targetTimeline: "61-90 days",
        },
      ],
    },
    final_report: {
      reportTitle: `${fixture.companyName} Executive Risk Audit`,
      reportSubtitle: "Enterprise / Custom Assessment",
      executiveSummary:
        "CareMesh Systems should tighten sensitive-data control documentation, vendor discipline, and privileged-access review to improve trust and compliance defensibility.",
      detailedReport:
        "The current posture is Moderate because core practices exist, but they are not yet organized into a durable control narrative for a healthtech environment. Sensitive-data handling, vendor reassessment, and access oversight deserve immediate leadership attention. The recommended roadmap focuses on consolidating documentation, formalizing review cycles, and aligning the operating model to HIPAA and broader enterprise diligence expectations.",
      conclusion:
        "With clearer ownership and a consolidated control library, the company can materially improve assurance readiness without a disruptive platform rewrite.",
    },
  };
}

export function buildMockWorkflowResponses(fixture: EvalFixture): MockWorkflowResponses {
  switch (fixture.fixtureId) {
    case "small-law-firm":
      return buildLawFirmResponses(fixture);
    case "early-fintech-startup":
      return buildFintechResponses(fixture);
    case "small-healthtech-company":
      return buildHealthtechResponses(fixture);
    default:
      throw new Error(`No mock workflow responses defined for fixture ${fixture.fixtureId}.`);
  }
}
