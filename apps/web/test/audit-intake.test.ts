import assert from "node:assert/strict";
import { DataClassification } from "@evolve-edge/db";
import {
  buildAuditIntakePayload,
  getAuditDataClassification,
  isAuditIntakeCompleteFromRegulatoryProfile,
  mergeAuditIntakeIntoRegulatoryProfile,
  normalizeAuditIntakeFormData
} from "../lib/audit-intake";

function buildValidFormData() {
  const formData = new FormData();
  formData.set("accountName", "Evolve Edge Customer");
  formData.set("industry", "Healthcare");
  formData.set("sizeBand", "51-200");
  formData.set("usesAiTools", "yes");
  formData.set("aiToolsDetails", "Copilots for support triage.");
  formData.set("toolsPlatforms", "OpenAI, Microsoft Copilot");
  formData.append("topConcerns", "ai-governance");
  formData.append("topConcerns", "data-privacy");
  formData.set("dataSensitivity", "regulated");
  formData.set("optionalNotes", "Needs SOC 2 alignment.");
  return formData;
}

function runAuditIntakeTests() {
  const valid = normalizeAuditIntakeFormData(buildValidFormData());
  assert.equal(valid.ok, true);

  if (!valid.ok) {
    throw new Error("Expected valid intake.");
  }

  assert.deepEqual(valid.intake.toolsPlatforms, ["OpenAI", "Microsoft Copilot"]);
  assert.equal(valid.intake.usesAiTools, true);
  assert.equal(
    getAuditDataClassification(valid.intake.dataSensitivity),
    DataClassification.SENSITIVE
  );

  const completedAt = new Date("2026-04-29T12:00:00.000Z");
  const payload = buildAuditIntakePayload({
    intake: valid.intake,
    submittedByUserId: "user_123",
    completedAt
  });
  const profile = mergeAuditIntakeIntoRegulatoryProfile({
    currentProfile: { legacy: true },
    frameworkCodes: ["soc2", "nist-csf"],
    auditIntake: payload
  });

  assert.equal(isAuditIntakeCompleteFromRegulatoryProfile(profile), true);
  assert.deepEqual(profile.frameworks, ["soc2", "nist-csf"]);
  assert.equal(profile.auditIntake.status, "ready_for_audit");

  const missingConcern = buildValidFormData();
  missingConcern.delete("topConcerns");
  const invalid = normalizeAuditIntakeFormData(missingConcern);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.code, "missing-required");
  }

  assert.equal(
    isAuditIntakeCompleteFromRegulatoryProfile({
      auditIntake: {
        intakeCompleted: true,
        status: "ready_for_audit"
      }
    }),
    false
  );

  assert.equal(getAuditDataClassification("low"), DataClassification.NON_SENSITIVE);

  console.log("audit intake tests passed");
}

runAuditIntakeTests();
