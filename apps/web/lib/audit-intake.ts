import "server-only";

import { DataClassification, Prisma, prisma } from "@evolve-edge/db";

export const AUDIT_INTAKE_VERSION = 1;
export const READY_FOR_AUDIT_STATUS = "ready_for_audit";

export const AUDIT_TOP_CONCERNS = [
  "ai-governance",
  "data-privacy",
  "vendor-risk",
  "access-controls",
  "policy-readiness",
  "regulatory-pressure"
] as const;

export const AUDIT_DATA_SENSITIVITY = [
  "low",
  "moderate",
  "high",
  "regulated"
] as const;

export type AuditTopConcern = (typeof AUDIT_TOP_CONCERNS)[number];
export type AuditDataSensitivity = (typeof AUDIT_DATA_SENSITIVITY)[number];

export type AuditIntakeInput = {
  companyName: string;
  industry: string;
  companySize: string;
  usesAiTools: boolean;
  aiToolsDetails: string | null;
  toolsPlatforms: string[];
  topConcerns: string[];
  dataSensitivity: AuditDataSensitivity;
  optionalNotes: string | null;
};

export type AuditIntakePayload = AuditIntakeInput & {
  version: number;
  intakeCompleted: true;
  intakeCompletedAt: string;
  readyForAudit: true;
  readyForAuditAt: string;
  status: typeof READY_FOR_AUDIT_STATUS;
  submittedByUserId: string;
};

export type AuditIntakeValidationResult =
  | {
      ok: true;
      intake: AuditIntakeInput;
    }
  | {
      ok: false;
      code: "missing-required" | "invalid-field";
      message: string;
    };

function readFormString(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function readCsvList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function readStringList(formData: FormData, field: string) {
  return formData
    .getAll(field)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function isAuditDataSensitivity(value: string): value is AuditDataSensitivity {
  return AUDIT_DATA_SENSITIVITY.includes(value as AuditDataSensitivity);
}

export function getAuditDataClassification(value: AuditDataSensitivity) {
  return value === "low" ? DataClassification.NON_SENSITIVE : DataClassification.SENSITIVE;
}

export function normalizeAuditIntakeFormData(
  formData: FormData
): AuditIntakeValidationResult {
  const companyName = readFormString(formData, "accountName");
  const industry = readFormString(formData, "industry");
  const companySize = readFormString(formData, "sizeBand");
  const usesAiToolsValue = readFormString(formData, "usesAiTools");
  const aiToolsDetails = readFormString(formData, "aiToolsDetails");
  const toolsPlatforms = readCsvList(readFormString(formData, "toolsPlatforms"));
  const selectedConcerns = readStringList(formData, "topConcerns");
  const otherConcern = readFormString(formData, "topConcernOther");
  const dataSensitivity = readFormString(formData, "dataSensitivity");
  const optionalNotes = readFormString(formData, "optionalNotes");

  if (!companyName || !industry || !companySize || !usesAiToolsValue || !dataSensitivity) {
    return {
      ok: false,
      code: "missing-required",
      message:
        "Company name, industry, company size, AI usage, and data sensitivity are required."
    };
  }

  if (usesAiToolsValue !== "yes" && usesAiToolsValue !== "no") {
    return {
      ok: false,
      code: "invalid-field",
      message: "AI usage must be yes or no."
    };
  }

  if (!isAuditDataSensitivity(dataSensitivity)) {
    return {
      ok: false,
      code: "invalid-field",
      message: "Choose a valid data sensitivity level."
    };
  }

  const topConcerns = Array.from(
    new Set([...selectedConcerns, ...readCsvList(otherConcern)].slice(0, 25))
  );

  if (topConcerns.length === 0) {
    return {
      ok: false,
      code: "missing-required",
      message: "Select at least one top concern or describe one in the text field."
    };
  }

  return {
    ok: true,
    intake: {
      companyName,
      industry,
      companySize,
      usesAiTools: usesAiToolsValue === "yes",
      aiToolsDetails: aiToolsDetails || null,
      toolsPlatforms,
      topConcerns,
      dataSensitivity,
      optionalNotes: optionalNotes || null
    }
  };
}

export function buildAuditIntakePayload(input: {
  intake: AuditIntakeInput;
  submittedByUserId: string;
  completedAt: Date;
}): AuditIntakePayload {
  const completedAtIso = input.completedAt.toISOString();

  return {
    ...input.intake,
    version: AUDIT_INTAKE_VERSION,
    intakeCompleted: true,
    intakeCompletedAt: completedAtIso,
    readyForAudit: true,
    readyForAuditAt: completedAtIso,
    status: READY_FOR_AUDIT_STATUS,
    submittedByUserId: input.submittedByUserId
  };
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readAuditIntakeFromRegulatoryProfile(
  regulatoryProfile: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined
) {
  const profile = readJsonObject(regulatoryProfile);
  const auditIntake = readJsonObject(profile?.auditIntake);
  return auditIntake;
}

export function isAuditIntakeCompleteFromRegulatoryProfile(
  regulatoryProfile: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined
) {
  const intake = readAuditIntakeFromRegulatoryProfile(regulatoryProfile);

  return (
    intake?.intakeCompleted === true &&
    intake?.readyForAudit === true &&
    intake?.status === READY_FOR_AUDIT_STATUS &&
    typeof intake.intakeCompletedAt === "string" &&
    typeof intake.readyForAuditAt === "string"
  );
}

export function mergeAuditIntakeIntoRegulatoryProfile(input: {
  currentProfile: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined;
  frameworkCodes: string[];
  auditIntake: AuditIntakePayload;
}) {
  const currentProfile = readJsonObject(input.currentProfile) ?? {};

  return {
    ...currentProfile,
    frameworks: input.frameworkCodes,
    auditIntake: input.auditIntake
  } satisfies Prisma.InputJsonValue;
}

export async function getOrganizationAuditReadiness(input: {
  organizationId: string;
  db?: Pick<typeof prisma, "organization">;
}) {
  const db = input.db ?? prisma;
  const organization = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      onboardingCompletedAt: true,
      regulatoryProfile: true
    }
  });

  return {
    organizationId: input.organizationId,
    readyForAudit: Boolean(
      organization?.onboardingCompletedAt &&
        isAuditIntakeCompleteFromRegulatoryProfile(organization.regulatoryProfile)
    )
  };
}
