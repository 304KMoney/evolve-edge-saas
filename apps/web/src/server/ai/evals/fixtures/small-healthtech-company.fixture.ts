import type { EvalFixture } from "../types";

export const smallHealthtechCompanyFixture: EvalFixture = {
  fixtureId: "small-healthtech-company",
  label: "Small Healthtech Company",
  orgId: "org_eval_health_001",
  assessmentId: "asm_eval_health_001",
  workflowDispatchId: "wd_eval_health_001",
  dispatchId: "disp_eval_health_001",
  customerEmail: "compliance@caremesh.example",
  companyName: "CareMesh Systems",
  industry: "Healthtech",
  companySize: "40-120",
  selectedFrameworks: ["SOC 2", "HIPAA", "NIST CSF"],
  assessmentAnswers: [
    {
      key: "phi_handling",
      question: "Does the platform process protected health information?",
      answer: "Yes. The product stores appointment context and limited clinical coordination notes."
    },
    {
      key: "vendor_management",
      question: "Is vendor risk management formalized?",
      answer: "Not fully. Vendors are approved by engineering and legal, but reassessment is ad hoc."
    },
    {
      key: "documentation",
      question: "Are security and privacy procedures documented for workforce training?",
      answer: "Training exists, but documentation is fragmented and not mapped to a formal control library."
    },
    {
      key: "access_control",
      question: "Are privileged access controls enforced and reviewed?",
      answer: "Some MFA is in place, but periodic privileged access review is inconsistent."
    }
  ],
  evidenceSummary:
    "Synthetic evidence reflects PHI-adjacent workflows, fragmented documentation, informal vendor management, and uneven privileged access oversight.",
  planTier: "enterprise"
};
