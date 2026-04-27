import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {
  EvidenceProcessingStatus,
  EvidenceReviewStatus
} from "@evolve-edge/db";
import {
  canTransitionEvidenceProcessingStatus,
  canTransitionEvidenceReviewStatus,
  computeEvidenceSha256,
  getEvidenceFileExtension,
  getEvidenceStorageRoot,
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

  const originalVercel = process.env.VERCEL;
  const originalVercelEnv = process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  assert.equal(
    getEvidenceStorageRoot(),
    path.resolve(path.join(process.cwd(), ".data", "evidence"))
  );

  process.env.VERCEL = "1";
  assert.equal(
    getEvidenceStorageRoot(),
    path.resolve(path.join(os.tmpdir(), "evolve-edge", "evidence"))
  );

  if (originalVercel === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = originalVercel;
  }

  if (originalVercelEnv === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = originalVercelEnv;
  }

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
