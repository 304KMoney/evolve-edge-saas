import type { EvalFixture } from "../types";

export const earlyFintechStartupFixture: EvalFixture = {
  fixtureId: "early-fintech-startup",
  label: "Early Fintech Startup",
  orgId: "org_eval_fintech_001",
  assessmentId: "asm_eval_fintech_001",
  workflowDispatchId: "wd_eval_fintech_001",
  dispatchId: "disp_eval_fintech_001",
  customerEmail: "security@ledgerlane.example",
  companyName: "LedgerLane",
  industry: "Fintech",
  companySize: "26-75",
  selectedFrameworks: ["SOC 2", "NIST CSF", "PCI DSS"],
  assessmentAnswers: [
    {
      key: "customer_data",
      question: "What regulated or sensitive data does the company handle?",
      answer: "Customer financial records, bank account metadata, and limited payment workflow data."
    },
    {
      key: "incident_response",
      question: "Do you have a tested incident response plan?",
      answer: "A draft exists, but no tabletop exercise has been completed."
    },
    {
      key: "ai_governance",
      question: "Is AI model governance formally defined?",
      answer: "No. Product and engineering use AI copilots and internal models without a formal policy."
    },
    {
      key: "monitoring",
      question: "Is security monitoring centralized and reviewed?",
      answer: "Partially. Cloud alerts exist, but coverage and review ownership are inconsistent."
    }
  ],
  evidenceSummary:
    "Synthetic evidence indicates rapid growth, payment-adjacent operations, incomplete incident response readiness, and material AI governance gaps.",
  planTier: "scale"
};
