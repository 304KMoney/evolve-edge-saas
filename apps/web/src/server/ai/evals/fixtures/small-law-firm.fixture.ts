import type { EvalFixture } from "../types";

export const smallLawFirmFixture: EvalFixture = {
  fixtureId: "small-law-firm",
  label: "Small Law Firm",
  orgId: "org_eval_law_001",
  assessmentId: "asm_eval_law_001",
  workflowDispatchId: "wd_eval_law_001",
  dispatchId: "disp_eval_law_001",
  customerEmail: "ops@evergreen-legal.example",
  companyName: "Evergreen Legal Group",
  industry: "Law Firm",
  companySize: "11-25",
  selectedFrameworks: ["SOC 2", "NIST CSF"],
  assessmentAnswers: [
    {
      key: "security_policies",
      question: "Do you maintain formal security policies?",
      answer: "Partially. A few policies exist but they are not fully approved or reviewed annually."
    },
    {
      key: "access_reviews",
      question: "Are user access reviews performed on a regular cadence?",
      answer: "Not consistently. Administrative access is granted by IT and reviewed only when issues arise."
    },
    {
      key: "vendor_reviews",
      question: "Do you perform vendor security reviews for document storage or AI tools?",
      answer: "Informally. Contracts are reviewed, but there is no standard vendor risk checklist."
    },
    {
      key: "ai_usage",
      question: "Do attorneys or operations staff use AI tools with client materials?",
      answer: "Yes, limited use for drafting and internal summarization."
    }
  ],
  evidenceSummary:
    "Synthetic evidence shows a small legal practice with limited policy governance, inconsistent access reviews, and light AI usage in internal workflows.",
  planTier: "starter"
};
