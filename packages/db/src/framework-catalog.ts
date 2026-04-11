export type FrameworkCatalogControl = {
  code: string;
  title: string;
  description: string;
  weight: number;
  keywords: string[];
  riskDomains: string[];
};

export type FrameworkCatalogFamily = {
  code: string;
  name: string;
  sortOrder: number;
  controls: FrameworkCatalogControl[];
};

export type FrameworkCatalogDefinition = {
  code: string;
  name: string;
  category: string;
  version: string;
  families: FrameworkCatalogFamily[];
};

export const SUPPORTED_FRAMEWORK_CATALOG: FrameworkCatalogDefinition[] = [
  {
    code: "soc2",
    name: "SOC 2",
    category: "Security",
    version: "2017",
    families: [
      {
        code: "CC1",
        name: "Control Environment",
        sortOrder: 10,
        controls: [
          {
            code: "CC1.1",
            title: "Governance and accountability",
            description: "Leadership establishes accountability for security, availability, and privacy controls.",
            weight: 110,
            keywords: ["governance", "policy", "oversight", "ownership"],
            riskDomains: ["governance", "compliance"]
          },
          {
            code: "CC1.2",
            title: "Policy approval and communication",
            description: "Policies are formally approved, communicated, and periodically reviewed.",
            weight: 100,
            keywords: ["policy", "procedure", "communication", "training"],
            riskDomains: ["governance", "compliance"]
          }
        ]
      },
      {
        code: "CC6",
        name: "Logical and Physical Access",
        sortOrder: 20,
        controls: [
          {
            code: "CC6.1",
            title: "Access provisioning and least privilege",
            description: "Access is provisioned with appropriate approvals and least-privilege principles.",
            weight: 120,
            keywords: ["access", "least privilege", "provisioning", "identity"],
            riskDomains: ["security", "identity"]
          },
          {
            code: "CC6.3",
            title: "Access reviews and privileged activity",
            description: "Privileged access is reviewed and monitored on a recurring basis.",
            weight: 110,
            keywords: ["privileged", "access review", "admin", "entitlement"],
            riskDomains: ["security", "identity"]
          }
        ]
      },
      {
        code: "CC7",
        name: "System Operations",
        sortOrder: 30,
        controls: [
          {
            code: "CC7.2",
            title: "Monitoring and anomaly response",
            description: "Operational monitoring identifies unusual events and drives response actions.",
            weight: 105,
            keywords: ["monitoring", "logging", "alert", "incident"],
            riskDomains: ["security", "operations"]
          },
          {
            code: "CC7.3",
            title: "Change and vulnerability handling",
            description: "Changes and vulnerabilities are tracked, reviewed, and remediated in a controlled way.",
            weight: 110,
            keywords: ["change", "vulnerability", "patch", "remediation"],
            riskDomains: ["security", "operations"]
          }
        ]
      }
    ]
  },
  {
    code: "hipaa",
    name: "HIPAA",
    category: "Privacy",
    version: "45 CFR 164",
    families: [
      {
        code: "164.308",
        name: "Administrative Safeguards",
        sortOrder: 10,
        controls: [
          {
            code: "164.308(a)(1)",
            title: "Security management process",
            description: "Security risks to ePHI are identified, assessed, and managed through formal processes.",
            weight: 120,
            keywords: ["risk analysis", "security management", "phi", "ephi"],
            riskDomains: ["privacy", "governance"]
          },
          {
            code: "164.308(a)(3)",
            title: "Workforce security",
            description: "Workforce access to ePHI is authorized, supervised, and terminated appropriately.",
            weight: 110,
            keywords: ["workforce", "access", "termination", "authorization"],
            riskDomains: ["privacy", "security"]
          }
        ]
      },
      {
        code: "164.312",
        name: "Technical Safeguards",
        sortOrder: 20,
        controls: [
          {
            code: "164.312(a)(1)",
            title: "Access control for ePHI",
            description: "Technical access controls protect systems containing ePHI.",
            weight: 120,
            keywords: ["ephi", "access control", "authentication", "session"],
            riskDomains: ["privacy", "security"]
          },
          {
            code: "164.312(b)",
            title: "Audit controls",
            description: "Audit logs and review capabilities support traceability for ePHI activity.",
            weight: 100,
            keywords: ["audit", "logging", "traceability", "review"],
            riskDomains: ["privacy", "operations"]
          }
        ]
      },
      {
        code: "privacy-rule",
        name: "Privacy Rule Operations",
        sortOrder: 30,
        controls: [
          {
            code: "PR.Uses",
            title: "Permitted uses and disclosures",
            description: "Use of PHI is governed by documented permitted-use expectations and approval rules.",
            weight: 105,
            keywords: ["phi", "disclosure", "permitted use", "copilot"],
            riskDomains: ["privacy", "compliance"]
          },
          {
            code: "PR.Minimum",
            title: "Minimum necessary handling",
            description: "Teams apply minimum-necessary handling and redaction rules to sensitive health data.",
            weight: 115,
            keywords: ["minimum necessary", "redaction", "phi handling", "data minimization"],
            riskDomains: ["privacy", "data handling"]
          }
        ]
      }
    ]
  },
  {
    code: "pci-dss",
    name: "PCI DSS",
    category: "Compliance",
    version: "4.0",
    families: [
      {
        code: "REQ1",
        name: "Network Security Controls",
        sortOrder: 10,
        controls: [
          {
            code: "1.2",
            title: "Network segmentation and restrictions",
            description: "Cardholder data environments are segmented and traffic restrictions are maintained.",
            weight: 115,
            keywords: ["network", "segmentation", "firewall", "cardholder"],
            riskDomains: ["security", "infrastructure"]
          },
          {
            code: "1.4",
            title: "Trusted configurations",
            description: "Network security controls are configured to allow only authorized services and paths.",
            weight: 100,
            keywords: ["configuration", "firewall rule", "trusted", "service"],
            riskDomains: ["security", "operations"]
          }
        ]
      },
      {
        code: "REQ7",
        name: "Access Control",
        sortOrder: 20,
        controls: [
          {
            code: "7.1",
            title: "Need-to-know access",
            description: "Access to system components and data is limited by business need.",
            weight: 110,
            keywords: ["need to know", "least privilege", "access"],
            riskDomains: ["security", "identity"]
          },
          {
            code: "8.2",
            title: "Strong authentication",
            description: "Authentication controls validate user identity before access is granted.",
            weight: 105,
            keywords: ["authentication", "mfa", "identity", "login"],
            riskDomains: ["security", "identity"]
          }
        ]
      },
      {
        code: "REQ10",
        name: "Logging and Monitoring",
        sortOrder: 30,
        controls: [
          {
            code: "10.2",
            title: "Audit trail generation",
            description: "Audit trails capture actions affecting systems and cardholder data handling.",
            weight: 100,
            keywords: ["audit trail", "logging", "events", "traceability"],
            riskDomains: ["operations", "compliance"]
          },
          {
            code: "10.4",
            title: "Log review and alerting",
            description: "Logs are reviewed and alerts surface suspicious or unauthorized activity.",
            weight: 105,
            keywords: ["log review", "alert", "monitoring", "detection"],
            riskDomains: ["operations", "security"]
          }
        ]
      }
    ]
  },
  {
    code: "gdpr",
    name: "GDPR",
    category: "Privacy",
    version: "2016/679",
    families: [
      {
        code: "ART5",
        name: "Principles and Governance",
        sortOrder: 10,
        controls: [
          {
            code: "5.1",
            title: "Lawfulness, fairness, and transparency",
            description: "Personal data processing has a documented lawful basis and transparent notices.",
            weight: 110,
            keywords: ["lawful basis", "notice", "transparency", "processing"],
            riskDomains: ["privacy", "compliance"]
          },
          {
            code: "5.1(c)",
            title: "Data minimization",
            description: "Only the minimum personal data needed for the purpose is collected and processed.",
            weight: 115,
            keywords: ["minimization", "retention", "data handling", "collection"],
            riskDomains: ["privacy", "data handling"]
          }
        ]
      },
      {
        code: "ART25",
        name: "Privacy by Design",
        sortOrder: 20,
        controls: [
          {
            code: "25.1",
            title: "Privacy by design",
            description: "Privacy controls are built into systems and workflow design decisions.",
            weight: 110,
            keywords: ["privacy by design", "architecture", "design review"],
            riskDomains: ["privacy", "architecture"]
          },
          {
            code: "32.1",
            title: "Security of processing",
            description: "Security measures protect personal data confidentiality, integrity, and availability.",
            weight: 120,
            keywords: ["security of processing", "encryption", "confidentiality"],
            riskDomains: ["privacy", "security"]
          }
        ]
      },
      {
        code: "ART12",
        name: "Data Subject Rights",
        sortOrder: 30,
        controls: [
          {
            code: "12.1",
            title: "Rights request handling",
            description: "Requests for access, deletion, or correction are tracked and fulfilled consistently.",
            weight: 105,
            keywords: ["access request", "deletion", "correction", "rights"],
            riskDomains: ["privacy", "operations"]
          },
          {
            code: "30.1",
            title: "Processing records",
            description: "Processing activities and data flows are documented and reviewable.",
            weight: 100,
            keywords: ["records of processing", "inventory", "data map"],
            riskDomains: ["privacy", "governance"]
          }
        ]
      }
    ]
  },
  {
    code: "nist-csf",
    name: "NIST CSF",
    category: "Security",
    version: "2.0",
    families: [
      {
        code: "GV",
        name: "Govern",
        sortOrder: 10,
        controls: [
          {
            code: "GV.OV-01",
            title: "Cybersecurity governance",
            description: "Governance structures define ownership and oversight for cybersecurity risk.",
            weight: 110,
            keywords: ["governance", "oversight", "owner", "policy"],
            riskDomains: ["governance", "security"]
          },
          {
            code: "GV.RM-01",
            title: "Risk management strategy",
            description: "Risk strategy and tolerance are documented and used in decision-making.",
            weight: 105,
            keywords: ["risk management", "strategy", "tolerance"],
            riskDomains: ["governance", "compliance"]
          }
        ]
      },
      {
        code: "PR",
        name: "Protect",
        sortOrder: 20,
        controls: [
          {
            code: "PR.AA-01",
            title: "Identity and access management",
            description: "Identity, authentication, and access controls protect organizational assets.",
            weight: 120,
            keywords: ["identity", "access", "authentication", "mfa"],
            riskDomains: ["security", "identity"]
          },
          {
            code: "PR.DS-01",
            title: "Data security controls",
            description: "Data is protected in accordance with sensitivity and business requirements.",
            weight: 115,
            keywords: ["data security", "encryption", "retention", "classification"],
            riskDomains: ["security", "data handling"]
          }
        ]
      },
      {
        code: "DE",
        name: "Detect and Respond",
        sortOrder: 30,
        controls: [
          {
            code: "DE.CM-01",
            title: "Continuous monitoring",
            description: "The organization continuously monitors systems and environments for anomalies.",
            weight: 105,
            keywords: ["continuous monitoring", "alerting", "observability"],
            riskDomains: ["operations", "security"]
          },
          {
            code: "RS.MA-01",
            title: "Incident response management",
            description: "Response processes exist to contain and recover from cybersecurity incidents.",
            weight: 110,
            keywords: ["incident", "response", "containment", "recovery"],
            riskDomains: ["operations", "security"]
          }
        ]
      }
    ]
  },
  {
    code: "iso-27001",
    name: "ISO 27001",
    category: "Security",
    version: "2022",
    families: [
      {
        code: "A.5",
        name: "Organizational Controls",
        sortOrder: 10,
        controls: [
          {
            code: "A.5.1",
            title: "Information security policies",
            description: "Information security policies are defined, approved, and reviewed regularly.",
            weight: 110,
            keywords: ["security policy", "policy review", "approval"],
            riskDomains: ["governance", "security"]
          },
          {
            code: "A.5.9",
            title: "Asset inventory",
            description: "Information assets are inventoried and ownership is assigned.",
            weight: 100,
            keywords: ["asset inventory", "inventory", "ownership"],
            riskDomains: ["governance", "operations"]
          }
        ]
      },
      {
        code: "A.8",
        name: "Technological Controls",
        sortOrder: 20,
        controls: [
          {
            code: "A.8.2",
            title: "Privileged access rights",
            description: "Privileged access is restricted, justified, and reviewed.",
            weight: 120,
            keywords: ["privileged access", "admin", "least privilege"],
            riskDomains: ["security", "identity"]
          },
          {
            code: "A.8.15",
            title: "Logging",
            description: "Logging supports monitoring, investigation, and accountability.",
            weight: 105,
            keywords: ["logging", "monitoring", "audit trail"],
            riskDomains: ["operations", "security"]
          }
        ]
      },
      {
        code: "A.5/A.8",
        name: "Risk Treatment and Review",
        sortOrder: 30,
        controls: [
          {
            code: "A.5.36",
            title: "Compliance and control reviews",
            description: "Compliance obligations and control effectiveness are reviewed on a recurring basis.",
            weight: 105,
            keywords: ["review", "compliance", "control effectiveness"],
            riskDomains: ["compliance", "governance"]
          },
          {
            code: "A.8.32",
            title: "Change management",
            description: "Changes to information processing facilities are planned, tested, and tracked.",
            weight: 100,
            keywords: ["change management", "release", "deployment"],
            riskDomains: ["operations", "security"]
          }
        ]
      }
    ]
  }
] as const;

export function getFrameworkCatalogDefinitionByCode(code: string) {
  return SUPPORTED_FRAMEWORK_CATALOG.find((framework) => framework.code === code) ?? null;
}

export function getFrameworkCatalogDefinitionByName(name: string) {
  return (
    SUPPORTED_FRAMEWORK_CATALOG.find(
      (framework) => framework.name.toLowerCase() === name.trim().toLowerCase()
    ) ?? null
  );
}

export function flattenFrameworkCatalogControls() {
  return SUPPORTED_FRAMEWORK_CATALOG.flatMap((framework) =>
    framework.families.flatMap((family) =>
      family.controls.map((control, index) => ({
        frameworkCode: framework.code,
        frameworkName: framework.name,
        frameworkCategory: framework.category,
        frameworkVersion: framework.version,
        familyCode: family.code,
        familyName: family.name,
        familySortOrder: family.sortOrder,
        controlCode: control.code,
        controlTitle: control.title,
        controlDescription: control.description,
        controlWeight: control.weight,
        controlSortOrder: family.sortOrder * 100 + index + 1,
        keywords: control.keywords,
        riskDomains: control.riskDomains
      }))
    )
  );
}
