import assert from "node:assert/strict";
import { OpenAiLangGraphProvider } from "../src/server/ai/providers/openai-langgraph";
import { createInMemoryAuditWorkflowCheckpointStore } from "../src/server/ai/workflows/audit/checkpoints";

function createMockedProvider(overrides?: { timeoutMs?: number }) {
  const { store } = createInMemoryAuditWorkflowCheckpointStore();
  const provider = new OpenAiLangGraphProvider({
    apiKey: "test-key",
    cheapModel: "gpt-4o-mini",
    model: "gpt-4o-2024-08-06",
    strongModel: "o4-mini",
    reasoningModel: "o4-mini",
    timeoutMs: overrides?.timeoutMs ?? 20000,
    maxInputChars: 24000,
    planInputCharLimits: {
      starter: 12000,
      scale: 24000,
      enterprise: 40000
    },
    pricing: {
      cheapInputPer1M: 0,
      cheapOutputPer1M: 0,
      strongInputPer1M: 0,
      strongOutputPer1M: 0
    },
    checkpointStore: store,
  });

  const responses = [
    {
      companyName: "Acme Health",
      industry: "Healthcare",
      companySize: "51-200",
      summary: "Healthcare SaaS company",
      operatingModel: "B2B SaaS",
      businessPriorities: ["Governance"],
      securityMaturitySignals: ["Some ownership exists"]
    },
    {
      selectedFrameworks: ["SOC 2"],
      prioritizedFrameworks: ["SOC 2"],
      coverageSummary: "SOC 2 maps cleanly.",
      mappings: [
        {
          framework: "SOC 2",
          rationale: "Core trust requirement.",
          applicableAreas: ["Access control"]
        }
      ]
    },
    {
      summary: "Security policies and vendor reviews are incomplete.",
      findings: [
        {
          title: "Policy gap",
          severity: "High",
          summary: "Formal security policies are incomplete.",
          businessImpact: "Audit readiness is reduced.",
          controlDomain: "governance",
          impactedFrameworks: ["SOC 2"],
          evidence: ["No policy package"],
          tags: ["policy"]
        }
      ],
      systemicThemes: ["Governance"],
      notableStrengths: ["Leadership buy-in"],
      riskFlags: {
        noFormalSecurityPolicies: true,
        noAiGovernance: false,
        vendorRiskPresent: true,
        sensitiveDataExposure: false
      }
    },
    {
      keyDrivers: ["Policy gap", "Vendor review risk"]
    },
    {
      roadmapSummary: "Start with policy remediation.",
      immediateActions: [
        {
          title: "Approve policies",
          description: "Publish baseline policies.",
          priority: "HIGH",
          ownerRole: "Security Lead",
          targetTimeline: "30 days"
        }
      ],
      nearTermActions: [],
      strategicActions: []
    },
    {
      reportTitle: "Acme Health Audit",
      reportSubtitle: "Scale plan",
      executiveSummary: "The audit found governance gaps.",
      detailedReport: "Detailed report body",
      conclusion: "Resolve policy gaps first."
    }
  ];

  (provider as any).client = {
    responses: {
      create: async () => ({
        output_text: JSON.stringify(responses.shift())
      })
    }
  };

  return provider;
}

async function runOpenAiLangGraphProviderTests() {
  const provider = createMockedProvider();
  const progressUpdates: string[] = [];
  const usedModels: string[] = [];
  const routedResponses = [
    {
      companyName: "Acme Health",
      industry: "Healthcare",
      companySize: "51-200",
      summary: "Healthcare SaaS company",
      operatingModel: "B2B SaaS",
      businessPriorities: ["Governance"],
      securityMaturitySignals: ["Some ownership exists"]
    },
    {
      selectedFrameworks: ["SOC 2"],
      prioritizedFrameworks: ["SOC 2"],
      coverageSummary: "SOC 2 maps cleanly.",
      mappings: [
        {
          framework: "SOC 2",
          rationale: "Core trust requirement.",
          applicableAreas: ["Access control"]
        }
      ]
    },
    {
      summary: "Security policies and vendor reviews are incomplete.",
      findings: [
        {
          title: "Policy gap",
          severity: "High",
          summary: "Formal security policies are incomplete.",
          businessImpact: "Audit readiness is reduced.",
          controlDomain: "governance",
          impactedFrameworks: ["SOC 2"],
          evidence: ["No policy package"],
          tags: ["policy"]
        }
      ],
      systemicThemes: ["Governance"],
      notableStrengths: ["Leadership buy-in"],
      riskFlags: {
        noFormalSecurityPolicies: true,
        noAiGovernance: false,
        vendorRiskPresent: true,
        sensitiveDataExposure: false
      }
    },
    {
      keyDrivers: ["Policy gap", "Vendor review risk"]
    },
    {
      roadmapSummary: "Start with policy remediation.",
      immediateActions: [
        {
          title: "Approve policies",
          description: "Publish baseline policies.",
          priority: "HIGH",
          ownerRole: "Security Lead",
          targetTimeline: "30 days"
        }
      ],
      nearTermActions: [],
      strategicActions: []
    },
    {
      reportTitle: "Acme Health Audit",
      reportSubtitle: "Scale plan",
      executiveSummary: "The audit found governance gaps.",
      detailedReport: "Detailed report body",
      conclusion: "Resolve policy gaps first."
    }
  ];
  (provider as any).client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        usedModels.push(String(input.model));
        return {
          output_text: JSON.stringify(routedResponses.shift() ?? {})
        };
      }
    }
  };
  const result = await provider.executeAuditWorkflow({
    orgId: "org_123",
    assessmentId: "asm_123",
    workflowDispatchId: "wd_123",
    dispatchId: "disp_123",
    customerEmail: "buyer@example.com",
    companyName: "Acme Health",
    industry: "Healthcare",
    companySize: "51-200",
    selectedFrameworks: ["SOC 2"],
    assessmentAnswers: [
      {
        question: "Do you have formal security policies?",
        answer: "No"
      }
    ],
    evidenceSummary: "No policy packet was supplied.",
    planTier: "scale"
  }, {
    updateProgress: async (input) => {
      progressUpdates.push(input.status);
    }
  });

  assert.equal(result.provider, "openai_langgraph");
  assert.equal(result.status, "completed");
  assert.equal(result.postureScore, 70);
  assert.equal(result.findings.length, 1);
  assert.deepEqual(progressUpdates, [
    "preparing_context",
    "mapping_frameworks",
    "analyzing_risks",
    "scoring_risk",
    "building_roadmap",
    "generating_report"
  ]);
  assert.deepEqual(usedModels, [
    "gpt-4o-mini",
    "gpt-4o-mini",
    "o4-mini",
    "gpt-4o-mini",
    "o4-mini",
    "o4-mini"
  ]);

  const invalidProvider = createMockedProvider();
  (invalidProvider as any).client = {
    responses: {
      create: async () => ({
        output_text: JSON.stringify({
          invalid: true
        })
      })
    }
  };

  await assert.rejects(
    () =>
      invalidProvider.executeAuditWorkflow({
        orgId: "org_123",
        assessmentId: "asm_123",
        workflowDispatchId: "wd_123",
        dispatchId: "disp_123",
        customerEmail: "buyer@example.com",
        companyName: "Acme Health",
        industry: "Healthcare",
        companySize: "51-200",
        selectedFrameworks: ["SOC 2"],
        assessmentAnswers: [
          {
            question: "Do you have formal security policies?",
            answer: "No"
          }
        ],
        evidenceSummary: "No policy packet was supplied.",
        planTier: "scale"
      }),
    /required|invalid/i
  );

  const unsafeProvider = createMockedProvider();
  const unsafeResponses = [
    {
      companyName: "Acme Health",
      industry: "Healthcare",
      companySize: "51-200",
      summary: "Healthcare SaaS company",
      operatingModel: "B2B SaaS",
      businessPriorities: ["Governance"],
      securityMaturitySignals: ["Some ownership exists"]
    },
    {
      selectedFrameworks: ["SOC 2"],
      prioritizedFrameworks: ["SOC 2"],
      coverageSummary: "SOC 2 maps cleanly.",
      mappings: [
        {
          framework: "SOC 2",
          rationale: "Core trust requirement.",
          applicableAreas: ["Access control"]
        }
      ]
    },
    {
      summary: "Security policies and vendor reviews are incomplete.",
      findings: [
        {
          title: "Policy gap",
          severity: "High",
          summary: "Formal security policies are incomplete.",
          businessImpact: "Audit readiness is reduced.",
          controlDomain: "governance",
          impactedFrameworks: ["SOC 2"],
          evidence: ["No policy package"],
          tags: ["policy"]
        }
      ],
      systemicThemes: ["Governance"],
      notableStrengths: ["Leadership buy-in"],
      riskFlags: {
        noFormalSecurityPolicies: true,
        noAiGovernance: false,
        vendorRiskPresent: true,
        sensitiveDataExposure: false
      }
    },
    {
      keyDrivers: ["Policy gap", "Vendor review risk"]
    },
    {
      roadmapSummary: "Start with policy remediation.",
      immediateActions: [
        {
          title: "Approve policies",
          description: "Publish baseline policies.",
          priority: "HIGH",
          ownerRole: "Security Lead",
          targetTimeline: "30 days"
        }
      ],
      nearTermActions: [],
      strategicActions: []
    },
    {
      reportTitle: "Acme Health Audit",
      reportSubtitle: "Scale plan",
      executiveSummary: "The client is fully compliant and guaranteed certification.",
      detailedReport: "Detailed report body",
      conclusion: "No risk remains."
    }
  ];
  (unsafeProvider as any).client = {
    responses: {
      create: async () => ({
        output_text: JSON.stringify(unsafeResponses.shift())
      })
    }
  };
  await assert.rejects(
    () =>
      unsafeProvider.executeAuditWorkflow({
        orgId: "org_123",
        assessmentId: "asm_123",
        workflowDispatchId: "wd_unsafe",
        dispatchId: "disp_unsafe",
        customerEmail: "buyer@example.com",
        companyName: "Acme Health",
        industry: "Healthcare",
        companySize: "51-200",
        selectedFrameworks: ["SOC 2"],
        assessmentAnswers: [
          {
            question: "Do you have formal security policies?",
            answer: "No"
          }
        ],
        evidenceSummary: "No policy packet was supplied.",
        planTier: "scale"
      }),
    /unsafe content|absolute compliance claims|guaranteed outcomes/i
  );

  const piiLeakProvider = createMockedProvider();
  const piiResponses = [
    {
      companyName: "Acme Health",
      industry: "Healthcare",
      companySize: "51-200",
      summary: "Healthcare SaaS company",
      operatingModel: "B2B SaaS",
      businessPriorities: ["Governance"],
      securityMaturitySignals: ["Some ownership exists"]
    },
    {
      selectedFrameworks: ["SOC 2"],
      prioritizedFrameworks: ["SOC 2"],
      coverageSummary: "SOC 2 maps cleanly.",
      mappings: [
        {
          framework: "SOC 2",
          rationale: "Core trust requirement.",
          applicableAreas: ["Access control"]
        }
      ]
    },
    {
      summary: "Security policies and vendor reviews are incomplete.",
      findings: [
        {
          title: "Policy gap",
          severity: "High",
          summary: "Formal security policies are incomplete.",
          businessImpact: "Audit readiness is reduced.",
          controlDomain: "governance",
          impactedFrameworks: ["SOC 2"],
          evidence: ["No policy package"],
          tags: ["policy"]
        }
      ],
      systemicThemes: ["Governance"],
      notableStrengths: ["Leadership buy-in"],
      riskFlags: {
        noFormalSecurityPolicies: true,
        noAiGovernance: false,
        vendorRiskPresent: true,
        sensitiveDataExposure: false
      }
    },
    {
      keyDrivers: ["Policy gap", "Vendor review risk"]
    },
    {
      roadmapSummary: "Start with policy remediation.",
      immediateActions: [
        {
          title: "Approve policies",
          description: "Publish baseline policies.",
          priority: "HIGH",
          ownerRole: "Security Lead",
          targetTimeline: "30 days"
        }
      ],
      nearTermActions: [],
      strategicActions: []
    },
    {
      reportTitle: "Acme Health Audit",
      reportSubtitle: "Scale plan",
      executiveSummary: "Contact buyer@example.com for the final legal advice.",
      detailedReport: "Detailed report body",
      conclusion: "Reach out to buyer@example.com."
    }
  ];
  (piiLeakProvider as any).client = {
    responses: {
      create: async () => ({
        output_text: JSON.stringify(piiResponses.shift())
      })
    }
  };
  await assert.rejects(
    () =>
      piiLeakProvider.executeAuditWorkflow({
        orgId: "org_123",
        assessmentId: "asm_123",
        workflowDispatchId: "wd_pii",
        dispatchId: "disp_pii",
        customerEmail: "buyer@example.com",
        companyName: "Acme Health",
        industry: "Healthcare",
        companySize: "51-200",
        selectedFrameworks: ["SOC 2"],
        assessmentAnswers: [
          {
            question: "Do you have formal security policies?",
            answer: "No"
          }
        ],
        evidenceSummary: "No policy packet was supplied.",
        planTier: "scale"
      }),
    /email-like pii|legal-advice framing/i
  );

  const oversizedProvider = createMockedProvider();
  await assert.rejects(
    () =>
      oversizedProvider.executeAuditWorkflow({
        orgId: "org_123",
        assessmentId: "asm_123",
        workflowDispatchId: "wd_oversized",
        dispatchId: "disp_oversized",
        customerEmail: "buyer@example.com",
        companyName: "Acme Health",
        industry: "Healthcare",
        companySize: "51-200",
        selectedFrameworks: ["SOC 2"],
        assessmentAnswers: [
          {
            question: "Describe your control environment",
            answer: "A".repeat(20_000)
          }
        ],
        evidenceSummary: "B".repeat(8_000),
        planTier: "starter"
      }),
    /exceeds the allowed size/i
  );

  const timeoutProvider = createMockedProvider({ timeoutMs: 10 });
  (timeoutProvider as any).client = {
    responses: {
      create: async () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                output_text: JSON.stringify({
                  companyName: "Acme Health"
                })
              }),
            50
          )
        )
    }
  };
  await assert.rejects(
    () =>
      timeoutProvider.executeAuditWorkflow({
        orgId: "org_123",
        assessmentId: "asm_123",
        workflowDispatchId: "wd_timeout",
        dispatchId: "disp_timeout",
        customerEmail: "buyer@example.com",
        companyName: "Acme Health",
        industry: "Healthcare",
        companySize: "51-200",
        selectedFrameworks: ["SOC 2"],
        assessmentAnswers: [
          {
            question: "Do you have formal security policies?",
            answer: "No"
          }
        ],
        evidenceSummary: "No policy packet was supplied.",
        planTier: "scale"
      }),
    /timed out/i
  );

  console.log("openai-langgraph-provider tests passed");
}

void runOpenAiLangGraphProviderTests();
