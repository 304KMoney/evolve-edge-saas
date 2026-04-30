import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
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
  getEvidenceDownloadPayload,
  getEvidenceFileExtension,
  getEvidenceStorageRoot,
  isSupportedEvidenceUpload,
  parseEvidenceTags,
  resolveEvidenceStorageAbsolutePath,
  sanitizeEvidenceFileName
} from "../lib/evidence";

async function runEvidenceTests() {
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

  const originalStorageRoot = process.env.EVIDENCE_STORAGE_ROOT;
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "evidence-download-"));
  process.env.EVIDENCE_STORAGE_ROOT = tempRoot;
  const storageKey = path.join("org_123", "ab", "download-test.txt");
  const absolutePath = resolveEvidenceStorageAbsolutePath(storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, "download me", { encoding: "utf8" });

  const payload = await getEvidenceDownloadPayload(
    {
      organizationId: "org_123",
      evidenceFileId: "evd_123"
    },
    {
      evidenceFile: {
        findFirst: async ({ where }: { where: { organizationId: string } }) => {
          assert.equal(where.organizationId, "org_123");
          return {
            id: "evd_123",
            organizationId: "org_123",
            fileName: "download-test.txt",
            mimeType: "text/plain",
            storageKey,
            versions: []
          };
        }
      }
    } as any
  );

  assert.ok(payload);
  assert.equal(payload?.fileName, "download-test.txt");
  assert.equal(payload?.mimeType, "text/plain");
  assert.equal(payload?.absolutePath, absolutePath);

  if (originalStorageRoot === undefined) {
    delete process.env.EVIDENCE_STORAGE_ROOT;
  } else {
    process.env.EVIDENCE_STORAGE_ROOT = originalStorageRoot;
  }

  console.log("evidence tests passed");
}

void runEvidenceTests();
