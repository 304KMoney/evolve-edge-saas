import assert from "node:assert/strict";
import {
  EvidenceProcessingStatus,
  EvidenceReviewStatus
} from "@evolve-edge/db";
import {
  canTransitionEvidenceProcessingStatus,
  canTransitionEvidenceReviewStatus,
  computeEvidenceSha256,
  getEvidenceFileExtension,
  isSupportedEvidenceUpload,
  parseEvidenceTags,
  sanitizeEvidenceFileName
} from "../lib/evidence";

function runEvidenceTests() {
  assert.equal(
    sanitizeEvidenceFileName("Q2 Access Review Final!.xlsx"),
    "Q2-Access-Review-Final-.xlsx"
  );
  assert.equal(getEvidenceFileExtension("controls.export.csv"), "csv");

  assert.equal(
    isSupportedEvidenceUpload({
      fileName: "evidence.pdf",
      mimeType: "application/pdf"
    }),
    true
  );
  assert.equal(
    isSupportedEvidenceUpload({
      fileName: "malware.exe",
      mimeType: "application/octet-stream"
    }),
    false
  );

  assert.deepEqual(parseEvidenceTags("policy, quarterly, policy , access"), [
    "policy",
    "quarterly",
    "access"
  ]);

  assert.equal(
    computeEvidenceSha256(Buffer.from("hello-world")),
    computeEvidenceSha256(Buffer.from("hello-world"))
  );

  assert.equal(
    canTransitionEvidenceProcessingStatus(
      EvidenceProcessingStatus.UPLOADED,
      EvidenceProcessingStatus.PROCESSING
    ),
    true
  );
  assert.equal(
    canTransitionEvidenceProcessingStatus(
      EvidenceProcessingStatus.PARSED,
      EvidenceProcessingStatus.FAILED
    ),
    false
  );

  assert.equal(
    canTransitionEvidenceReviewStatus(
      EvidenceReviewStatus.NEEDS_REVIEW,
      EvidenceReviewStatus.APPROVED
    ),
    true
  );
  assert.equal(
    canTransitionEvidenceReviewStatus(
      EvidenceReviewStatus.SUPERSEDED,
      EvidenceReviewStatus.APPROVED
    ),
    false
  );

  console.log("evidence tests passed");
}

runEvidenceTests();
