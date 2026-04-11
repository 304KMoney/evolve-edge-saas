import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  AuditActorType,
  EvidenceAnnotationVisibility,
  EvidenceCategory,
  EvidenceProcessingStatus,
  EvidenceReviewStatus,
  EvidenceSource,
  Prisma,
  prisma
} from "@evolve-edge/db";
import { getOptionalEnv } from "./runtime-config";
import { publishDomainEvent } from "./domain-events";
import { writeAuditLog } from "./audit";
import {
  recordUsageEvent,
  requireQuota
} from "./usage-quotas";

type EvidenceDbClient = Prisma.TransactionClient | typeof prisma;

async function runEvidenceTransaction<T>(
  db: EvidenceDbClient,
  handler: (tx: Prisma.TransactionClient) => Promise<T>
) {
  if ("$transaction" in db) {
    return db.$transaction(handler);
  }

  return handler(db);
}

export const EVIDENCE_ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "md",
  "json",
  "png",
  "jpg",
  "jpeg",
  "webp"
] as const;

export const EVIDENCE_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "text/markdown",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp"
] as const;

export const DEFAULT_EVIDENCE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type EvidenceUploadInput = {
  organizationId: string;
  actorUserId: string;
  actorEmail: string;
  file: File;
  source?: EvidenceSource;
  category: EvidenceCategory;
  title?: string | null;
  visibleSummary?: string | null;
  tags?: string[];
  metadataJson?: Prisma.InputJsonValue | null;
  engagementProgramId?: string | null;
  assessmentId?: string | null;
  reportId?: string | null;
  findingId?: string | null;
  monitoringFindingId?: string | null;
  frameworkId?: string | null;
  frameworkControlId?: string | null;
  analystNote?: string | null;
  replaceEvidenceId?: string | null;
  requestContext?: Prisma.InputJsonValue | null;
};

export type EvidenceLibraryFilters = {
  q?: string;
  category?: string;
  reviewStatus?: string;
  processingStatus?: string;
  engagementProgramId?: string;
  frameworkId?: string;
  from?: string;
  to?: string;
};

function getEvidenceStorageRoot() {
  return path.resolve(
    getOptionalEnv("EVIDENCE_STORAGE_ROOT") ?? path.join(process.cwd(), ".data", "evidence")
  );
}

export function getEvidenceMaxUploadBytes() {
  const value = Number(getOptionalEnv("EVIDENCE_MAX_UPLOAD_BYTES") ?? "");
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_EVIDENCE_MAX_UPLOAD_BYTES;
}

export function sanitizeEvidenceFileName(input: string) {
  const baseName = path.basename(input || "evidence-upload");
  const normalized = baseName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  const trimmed = normalized.replace(/^-+|-+$/g, "");
  return trimmed || "evidence-upload";
}

export function getEvidenceFileExtension(fileName: string) {
  const normalized = sanitizeEvidenceFileName(fileName);
  const extension = normalized.includes(".")
    ? normalized.split(".").pop()?.toLowerCase() ?? ""
    : "";
  return extension;
}

export function isSupportedEvidenceUpload(input: {
  fileName: string;
  mimeType?: string | null;
}) {
  const extension = getEvidenceFileExtension(input.fileName);
  const mimeType = input.mimeType?.toLowerCase() ?? "";

  return (
    EVIDENCE_ALLOWED_EXTENSIONS.includes(
      extension as (typeof EVIDENCE_ALLOWED_EXTENSIONS)[number]
    ) ||
    EVIDENCE_ALLOWED_MIME_TYPES.includes(
      mimeType as (typeof EVIDENCE_ALLOWED_MIME_TYPES)[number]
    )
  );
}

export function computeEvidenceSha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function parseEvidenceTags(input: string | null | undefined) {
  if (!input) {
    return [];
  }

  return Array.from(
    new Set(
      input
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

export function canTransitionEvidenceProcessingStatus(
  current: EvidenceProcessingStatus,
  next: EvidenceProcessingStatus
) {
  if (current === next) {
    return true;
  }

  switch (current) {
    case EvidenceProcessingStatus.UPLOADED:
      return (
        next === EvidenceProcessingStatus.PROCESSING ||
        next === EvidenceProcessingStatus.PARSED ||
        next === EvidenceProcessingStatus.FAILED
      );
    case EvidenceProcessingStatus.PROCESSING:
      return (
        next === EvidenceProcessingStatus.PARSED ||
        next === EvidenceProcessingStatus.FAILED
      );
    case EvidenceProcessingStatus.PARSED:
      return next === EvidenceProcessingStatus.PROCESSING;
    case EvidenceProcessingStatus.FAILED:
      return next === EvidenceProcessingStatus.PROCESSING;
    default:
      return false;
  }
}

export function canTransitionEvidenceReviewStatus(
  current: EvidenceReviewStatus,
  next: EvidenceReviewStatus
) {
  if (current === next) {
    return true;
  }

  switch (current) {
    case EvidenceReviewStatus.NEEDS_REVIEW:
      return true;
    case EvidenceReviewStatus.APPROVED:
      return (
        next === EvidenceReviewStatus.SUPERSEDED ||
        next === EvidenceReviewStatus.REJECTED
      );
    case EvidenceReviewStatus.REJECTED:
      return next === EvidenceReviewStatus.NEEDS_REVIEW;
    case EvidenceReviewStatus.SUPERSEDED:
      return false;
    default:
      return false;
  }
}

async function ensureStorageDirectory(storageKey: string) {
  const absolutePath = resolveEvidenceStorageAbsolutePath(storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export function resolveEvidenceStorageAbsolutePath(storageKey: string) {
  const root = getEvidenceStorageRoot();
  const absolutePath = path.resolve(root, storageKey);

  if (!absolutePath.startsWith(root)) {
    throw new Error("Invalid evidence storage path.");
  }

  return absolutePath;
}

function buildEvidenceStorageKey(input: {
  organizationId: string;
  sha256Hash: string;
  fileName: string;
}) {
  const safeName = sanitizeEvidenceFileName(input.fileName);
  return path.join(
    input.organizationId,
    input.sha256Hash.slice(0, 2),
    `${input.sha256Hash.slice(0, 16)}-${safeName}`
  );
}

async function persistEvidenceBlob(input: {
  organizationId: string;
  sha256Hash: string;
  fileName: string;
  buffer: Buffer;
}) {
  const storageKey = buildEvidenceStorageKey({
    organizationId: input.organizationId,
    sha256Hash: input.sha256Hash,
    fileName: input.fileName
  });

  const absolutePath = await ensureStorageDirectory(storageKey);

  try {
    await stat(absolutePath);
  } catch {
    await writeFile(absolutePath, input.buffer);
  }

  return {
    storageProvider: "local",
    storageKey
  };
}

async function findDuplicateEvidence(
  db: EvidenceDbClient,
  input: {
    organizationId: string;
    sha256Hash: string;
    sizeBytes: number;
    replaceEvidenceId?: string | null;
  }
) {
  return db.evidenceFile.findFirst({
    where: {
      organizationId: input.organizationId,
      sha256Hash: input.sha256Hash,
      sizeBytes: input.sizeBytes,
      ...(input.replaceEvidenceId
        ? {
            id: {
              not: input.replaceEvidenceId
            }
          }
        : {})
    },
    orderBy: { uploadedAt: "asc" }
  });
}

async function assertEvidenceLinksBelongToOrganization(
  db: EvidenceDbClient,
  input: {
    organizationId: string;
    engagementProgramId?: string | null;
    assessmentId?: string | null;
    reportId?: string | null;
    findingId?: string | null;
    monitoringFindingId?: string | null;
    frameworkId?: string | null;
    frameworkControlId?: string | null;
  }
) {
  const [
    engagementProgram,
    assessment,
    report,
    finding,
    monitoringFinding,
    framework,
    frameworkControl
  ] = await Promise.all([
    input.engagementProgramId
      ? db.engagementProgram.findFirst({
          where: {
            id: input.engagementProgramId,
            organizationId: input.organizationId
          }
        })
      : null,
    input.assessmentId
      ? db.assessment.findFirst({
          where: {
            id: input.assessmentId,
            organizationId: input.organizationId
          }
        })
      : null,
    input.reportId
      ? db.report.findFirst({
          where: {
            id: input.reportId,
            organizationId: input.organizationId
          }
        })
      : null,
    input.findingId
      ? db.finding.findFirst({
          where: {
            id: input.findingId,
            assessment: {
              organizationId: input.organizationId
            }
          }
        })
      : null,
    input.monitoringFindingId
      ? db.monitoringFinding.findFirst({
          where: {
            id: input.monitoringFindingId,
            organizationId: input.organizationId
          }
        })
      : null,
    input.frameworkId
      ? db.framework.findUnique({
          where: { id: input.frameworkId }
        })
      : null,
    input.frameworkControlId
      ? db.frameworkControl.findUnique({
          where: { id: input.frameworkControlId },
          include: { framework: true }
        })
      : null
  ]);

  if (input.engagementProgramId && !engagementProgram) {
    throw new Error("The selected engagement could not be found in this workspace.");
  }

  if (input.assessmentId && !assessment) {
    throw new Error("The selected assessment could not be found in this workspace.");
  }

  if (input.reportId && !report) {
    throw new Error("The selected report could not be found in this workspace.");
  }

  if (input.findingId && !finding) {
    throw new Error("The selected finding could not be found in this workspace.");
  }

  if (input.monitoringFindingId && !monitoringFinding) {
    throw new Error("The selected monitoring finding could not be found in this workspace.");
  }

  if (input.frameworkId && !framework) {
    throw new Error("The selected framework could not be found.");
  }

  if (input.frameworkControlId && !frameworkControl) {
    throw new Error("The selected framework control could not be found.");
  }

  if (
    frameworkControl &&
    input.frameworkId &&
    frameworkControl.frameworkId !== input.frameworkId
  ) {
    throw new Error("The selected control does not belong to the selected framework.");
  }
}

export async function createEvidenceUpload(
  input: EvidenceUploadInput,
  db: EvidenceDbClient = prisma
) {
  const safeName = sanitizeEvidenceFileName(input.file.name);
  const mimeType = input.file.type || null;

  if (!safeName) {
    throw new Error("Select a valid file to upload.");
  }

  if (!isSupportedEvidenceUpload({ fileName: safeName, mimeType })) {
    throw new Error("Unsupported evidence file type.");
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const sizeBytes = buffer.byteLength;

  if (sizeBytes <= 0) {
    throw new Error("Uploaded files must not be empty.");
  }

  if (sizeBytes > getEvidenceMaxUploadBytes()) {
    throw new Error("Uploaded files must stay within the configured evidence upload limit.");
  }

  await assertEvidenceLinksBelongToOrganization(db, input);
  await requireQuota(input.organizationId, "evidence_uploads", {
    db,
    failureMessage:
      "Monthly evidence upload quota reached. Upgrade required to add more evidence this month."
  });

  const sha256Hash = computeEvidenceSha256(buffer);
  const extension = getEvidenceFileExtension(safeName) || null;
  const duplicateEvidence = await findDuplicateEvidence(db, {
    organizationId: input.organizationId,
    sha256Hash,
    sizeBytes,
    replaceEvidenceId: input.replaceEvidenceId
  });

  const storage =
    duplicateEvidence && duplicateEvidence.storageProvider === "local"
      ? {
          storageProvider: duplicateEvidence.storageProvider,
          storageKey: duplicateEvidence.storageKey
        }
      : await persistEvidenceBlob({
          organizationId: input.organizationId,
          sha256Hash,
          fileName: safeName,
          buffer
        });

  const normalizedTags = input.tags?.length ? input.tags : null;

  if (input.replaceEvidenceId) {
    const replaceEvidenceId = input.replaceEvidenceId;
    return runEvidenceTransaction(db, async (tx) => {
      const evidence = await tx.evidenceFile.findFirst({
        where: {
          id: replaceEvidenceId,
          organizationId: input.organizationId
        }
      });

      if (!evidence) {
        throw new Error("The evidence item you are replacing no longer exists.");
      }

      const latestVersion = await tx.evidenceFileVersion.findFirst({
        where: {
          evidenceFileId: evidence.id
        },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true }
      });

      const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

      const updatedEvidence = await tx.evidenceFile.update({
        where: { id: evidence.id },
        data: {
          engagementProgramId: input.engagementProgramId ?? evidence.engagementProgramId,
          assessmentId: input.assessmentId ?? evidence.assessmentId,
          reportId: input.reportId ?? evidence.reportId,
          findingId: input.findingId ?? evidence.findingId,
          monitoringFindingId: input.monitoringFindingId ?? evidence.monitoringFindingId,
          frameworkId: input.frameworkId ?? evidence.frameworkId,
          frameworkControlId: input.frameworkControlId ?? evidence.frameworkControlId,
          reviewedByUserId: null,
          title: input.title ?? evidence.title,
          fileName: safeName,
          storageProvider: storage.storageProvider,
          storageKey: storage.storageKey,
          mimeType,
          extension,
          sizeBytes,
          sha256Hash,
          source: input.source ?? evidence.source,
          category: input.category,
          processingStatus: EvidenceProcessingStatus.UPLOADED,
          reviewStatus: EvidenceReviewStatus.NEEDS_REVIEW,
          tags: normalizedTags ?? evidence.tags ?? undefined,
          metadataJson: input.metadataJson ?? evidence.metadataJson ?? undefined,
          visibleSummary: input.visibleSummary ?? evidence.visibleSummary,
          processingStartedAt: null,
          parsedAt: null,
          reviewedAt: null,
          uploadedByUserId: input.actorUserId,
          uploadedAt: new Date()
        }
      });

      await tx.evidenceFileVersion.create({
        data: {
          evidenceFileId: evidence.id,
          organizationId: input.organizationId,
          createdByUserId: input.actorUserId,
          versionNumber: nextVersionNumber,
          fileName: safeName,
          storageProvider: storage.storageProvider,
          storageKey: storage.storageKey,
          mimeType,
          extension,
          sizeBytes,
          sha256Hash,
          source: input.source ?? EvidenceSource.CUSTOMER_UPLOAD,
          metadataJson: input.metadataJson ?? undefined
        }
      });

      if (input.analystNote?.trim()) {
        await tx.evidenceAnnotation.create({
          data: {
            evidenceFileId: evidence.id,
            organizationId: input.organizationId,
            authorUserId: input.actorUserId,
            visibility: EvidenceAnnotationVisibility.INTERNAL,
            body: input.analystNote.trim()
          }
        });
      }

      await publishDomainEvent(tx, {
        type: "evidence.version_uploaded",
        aggregateType: "evidenceFile",
        aggregateId: evidence.id,
        orgId: input.organizationId,
        userId: input.actorUserId,
        idempotencyKey: `evidence.version_uploaded:${evidence.id}:${nextVersionNumber}`,
        payload: {
          evidenceFileId: evidence.id,
          versionNumber: nextVersionNumber,
          fileName: safeName,
          sha256Hash,
          duplicateOfEvidenceId: duplicateEvidence?.id ?? null
        } satisfies Prisma.InputJsonValue
      });

      await writeAuditLog(tx, {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        actorType: AuditActorType.USER,
        actorLabel: input.actorEmail,
        action: "evidence.version_uploaded",
        entityType: "evidenceFile",
        entityId: evidence.id,
        metadata: {
          versionNumber: nextVersionNumber,
          fileName: safeName,
          category: input.category,
          source: input.source ?? EvidenceSource.CUSTOMER_UPLOAD
        },
        requestContext: input.requestContext ?? undefined
      });

      await recordUsageEvent(
        {
          organizationId: input.organizationId,
          meterKey: "evidence_uploads",
          idempotencyKey: `usage:evidence_uploads:${evidence.id}:v${nextVersionNumber}`,
          source: "evidence.version_uploaded",
          sourceRecordType: "evidenceFile",
          sourceRecordId: evidence.id,
          metadata: {
            evidenceFileId: evidence.id,
            versionNumber: nextVersionNumber,
            category: input.category
          }
        },
        tx
      );

      return updatedEvidence;
    });
  }

  return runEvidenceTransaction(db, async (tx) => {
    const evidence = await tx.evidenceFile.create({
      data: {
        organizationId: input.organizationId,
        engagementProgramId: input.engagementProgramId ?? null,
        assessmentId: input.assessmentId ?? null,
        reportId: input.reportId ?? null,
        findingId: input.findingId ?? null,
        monitoringFindingId: input.monitoringFindingId ?? null,
        frameworkId: input.frameworkId ?? null,
        frameworkControlId: input.frameworkControlId ?? null,
        uploadedByUserId: input.actorUserId,
        duplicateOfEvidenceId: duplicateEvidence?.id ?? null,
        title: input.title ?? null,
        fileName: safeName,
        storageProvider: storage.storageProvider,
        storageKey: storage.storageKey,
        mimeType,
        extension,
        sizeBytes,
        sha256Hash,
        source: input.source ?? EvidenceSource.CUSTOMER_UPLOAD,
        category: input.category,
        processingStatus: EvidenceProcessingStatus.UPLOADED,
        reviewStatus: EvidenceReviewStatus.NEEDS_REVIEW,
        tags: normalizedTags ?? undefined,
        metadataJson: input.metadataJson ?? undefined,
        visibleSummary: input.visibleSummary ?? null
      }
    });

    await tx.evidenceFileVersion.create({
      data: {
        evidenceFileId: evidence.id,
        organizationId: input.organizationId,
        createdByUserId: input.actorUserId,
        versionNumber: 1,
        fileName: safeName,
        storageProvider: storage.storageProvider,
        storageKey: storage.storageKey,
        mimeType,
        extension,
        sizeBytes,
        sha256Hash,
        source: input.source ?? EvidenceSource.CUSTOMER_UPLOAD,
        metadataJson: input.metadataJson ?? undefined
      }
    });

    if (input.analystNote?.trim()) {
      await tx.evidenceAnnotation.create({
        data: {
          evidenceFileId: evidence.id,
          organizationId: input.organizationId,
          authorUserId: input.actorUserId,
          visibility: EvidenceAnnotationVisibility.INTERNAL,
          body: input.analystNote.trim()
        }
      });
    }

    await publishDomainEvent(tx, {
      type: "evidence.uploaded",
      aggregateType: "evidenceFile",
      aggregateId: evidence.id,
      orgId: input.organizationId,
      userId: input.actorUserId,
      idempotencyKey: `evidence.uploaded:${evidence.id}`,
      payload: {
        evidenceFileId: evidence.id,
        fileName: safeName,
        category: input.category,
        source: input.source ?? EvidenceSource.CUSTOMER_UPLOAD,
        duplicateOfEvidenceId: duplicateEvidence?.id ?? null
      } satisfies Prisma.InputJsonValue
    });

    await writeAuditLog(tx, {
      organizationId: input.organizationId,
      userId: input.actorUserId,
      actorType: AuditActorType.USER,
      actorLabel: input.actorEmail,
      action: "evidence.uploaded",
      entityType: "evidenceFile",
      entityId: evidence.id,
      metadata: {
        fileName: safeName,
        category: input.category,
        source: input.source ?? EvidenceSource.CUSTOMER_UPLOAD,
        duplicateOfEvidenceId: duplicateEvidence?.id ?? null
      },
      requestContext: input.requestContext ?? undefined
    });

    await recordUsageEvent(
      {
        organizationId: input.organizationId,
        meterKey: "evidence_uploads",
        idempotencyKey: `usage:evidence_uploads:${evidence.id}:v1`,
        source: "evidence.uploaded",
        sourceRecordType: "evidenceFile",
        sourceRecordId: evidence.id,
        metadata: {
          evidenceFileId: evidence.id,
          category: input.category,
          source: input.source ?? EvidenceSource.CUSTOMER_UPLOAD
        }
      },
      tx
    );

    return evidence;
  });
}

export async function getEvidenceLibrarySnapshot(
  organizationId: string,
  filters: EvidenceLibraryFilters,
  db: EvidenceDbClient = prisma
) {
  const q = filters.q?.trim();
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;

  const where: Prisma.EvidenceFileWhereInput = {
    organizationId,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { fileName: { contains: q, mode: "insensitive" } },
            { visibleSummary: { contains: q, mode: "insensitive" } }
          ]
        }
      : {}),
    ...(filters.category ? { category: filters.category as EvidenceCategory } : {}),
    ...(filters.reviewStatus
      ? { reviewStatus: filters.reviewStatus as EvidenceReviewStatus }
      : {}),
    ...(filters.processingStatus
      ? { processingStatus: filters.processingStatus as EvidenceProcessingStatus }
      : {}),
    ...(filters.engagementProgramId
      ? { engagementProgramId: filters.engagementProgramId }
      : {}),
    ...(filters.frameworkId ? { frameworkId: filters.frameworkId } : {}),
    ...((from || to)
      ? {
          uploadedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {})
          }
        }
      : {})
  };

  const [
    items,
    totalCount,
    statusCounts,
    engagements,
    frameworks,
    assessments,
    findings,
    reports
  ] =
    await Promise.all([
      db.evidenceFile.findMany({
        where,
        include: {
          uploadedBy: true,
          engagementProgram: true,
          assessment: true,
          framework: true,
          finding: true
        },
        orderBy: { uploadedAt: "desc" },
        take: 50
      }),
      db.evidenceFile.count({ where }),
      db.evidenceFile.groupBy({
        by: ["reviewStatus"],
        where: { organizationId },
        _count: { _all: true }
      }),
      db.engagementProgram.findMany({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, type: true }
      }),
      db.framework.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true }
      }),
      db.assessment.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, name: true }
      }),
      db.finding.findMany({
        where: {
          assessment: {
            organizationId
          }
        },
        orderBy: { assessment: { createdAt: "desc" } },
        take: 25,
        select: { id: true, title: true, assessmentId: true }
      }),
      db.report.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, title: true }
      })
    ]);

  return {
    filters,
    items,
    totalCount,
    statusCounts,
    engagements,
    frameworks,
    assessments,
    findings,
    reports
  };
}

export async function getEvidenceDetailSnapshot(
  organizationId: string,
  evidenceFileId: string,
  db: EvidenceDbClient = prisma
) {
  return db.evidenceFile.findFirst({
    where: {
      id: evidenceFileId,
      organizationId
    },
    include: {
      uploadedBy: true,
      reviewedBy: true,
      engagementProgram: true,
      assessment: true,
      report: true,
      finding: true,
      monitoringFinding: true,
      framework: true,
      frameworkControl: {
        include: { framework: true }
      },
      duplicateOfEvidence: true,
      versions: {
        include: {
          createdBy: true
        },
        orderBy: { versionNumber: "desc" }
      },
      annotations: {
        include: {
          author: true
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });
}

export async function updateEvidenceReviewState(input: {
  organizationId: string;
  evidenceFileId: string;
  actorUserId: string;
  actorEmail: string;
  reviewStatus: EvidenceReviewStatus;
  note?: string | null;
  requestContext?: Prisma.InputJsonValue | null;
}, db: EvidenceDbClient = prisma) {
  return runEvidenceTransaction(db, async (tx) => {
    const evidence = await tx.evidenceFile.findFirst({
      where: {
        id: input.evidenceFileId,
        organizationId: input.organizationId
      }
    });

    if (!evidence) {
      throw new Error("Evidence item not found.");
    }

    if (!canTransitionEvidenceReviewStatus(evidence.reviewStatus, input.reviewStatus)) {
      throw new Error("Evidence review status transition is not allowed.");
    }

    const updated = await tx.evidenceFile.update({
      where: { id: evidence.id },
      data: {
        reviewStatus: input.reviewStatus,
        reviewedByUserId: input.actorUserId,
        reviewedAt: new Date()
      }
    });

    if (input.note?.trim()) {
      await tx.evidenceAnnotation.create({
        data: {
          evidenceFileId: evidence.id,
          organizationId: input.organizationId,
          authorUserId: input.actorUserId,
          visibility: EvidenceAnnotationVisibility.INTERNAL,
          body: input.note.trim()
        }
      });
    }

    await publishDomainEvent(tx, {
      type: "evidence.review_status_updated",
      aggregateType: "evidenceFile",
      aggregateId: evidence.id,
      orgId: input.organizationId,
      userId: input.actorUserId,
      idempotencyKey: `evidence.review_status_updated:${evidence.id}:${input.reviewStatus}:${updated.reviewedAt?.toISOString() ?? "now"}`,
      payload: {
        evidenceFileId: evidence.id,
        previousStatus: evidence.reviewStatus,
        nextStatus: input.reviewStatus
      } satisfies Prisma.InputJsonValue
    });

    await writeAuditLog(tx, {
      organizationId: input.organizationId,
      userId: input.actorUserId,
      actorLabel: input.actorEmail,
      action: "evidence.review_status_updated",
      entityType: "evidenceFile",
      entityId: evidence.id,
      metadata: {
        previousStatus: evidence.reviewStatus,
        nextStatus: input.reviewStatus
      },
      requestContext: input.requestContext ?? undefined
    });

    return updated;
  });
}

export async function updateEvidenceProcessingState(input: {
  organizationId: string;
  evidenceFileId: string;
  actorUserId: string;
  actorEmail: string;
  processingStatus: EvidenceProcessingStatus;
  parserVersion?: string | null;
  extractionJson?: Prisma.InputJsonValue | null;
  note?: string | null;
  requestContext?: Prisma.InputJsonValue | null;
}, db: EvidenceDbClient = prisma) {
  return runEvidenceTransaction(db, async (tx) => {
    const evidence = await tx.evidenceFile.findFirst({
      where: {
        id: input.evidenceFileId,
        organizationId: input.organizationId
      }
    });

    if (!evidence) {
      throw new Error("Evidence item not found.");
    }

    if (
      !canTransitionEvidenceProcessingStatus(
        evidence.processingStatus,
        input.processingStatus
      )
    ) {
      throw new Error("Evidence processing status transition is not allowed.");
    }

    const now = new Date();
    const updated = await tx.evidenceFile.update({
      where: { id: evidence.id },
      data: {
        processingStatus: input.processingStatus,
        processingStartedAt:
          input.processingStatus === EvidenceProcessingStatus.PROCESSING
            ? now
            : evidence.processingStartedAt,
        parsedAt:
          input.processingStatus === EvidenceProcessingStatus.PARSED ? now : null,
        parserVersion: input.parserVersion ?? evidence.parserVersion,
        extractionJson: input.extractionJson ?? evidence.extractionJson ?? undefined
      }
    });

    if (input.note?.trim()) {
      await tx.evidenceAnnotation.create({
        data: {
          evidenceFileId: evidence.id,
          organizationId: input.organizationId,
          authorUserId: input.actorUserId,
          visibility: EvidenceAnnotationVisibility.INTERNAL,
          body: input.note.trim()
        }
      });
    }

    await publishDomainEvent(tx, {
      type: "evidence.processing_status_updated",
      aggregateType: "evidenceFile",
      aggregateId: evidence.id,
      orgId: input.organizationId,
      userId: input.actorUserId,
      idempotencyKey: `evidence.processing_status_updated:${evidence.id}:${input.processingStatus}:${now.toISOString()}`,
      payload: {
        evidenceFileId: evidence.id,
        previousStatus: evidence.processingStatus,
        nextStatus: input.processingStatus
      } satisfies Prisma.InputJsonValue
    });

    await writeAuditLog(tx, {
      organizationId: input.organizationId,
      userId: input.actorUserId,
      actorLabel: input.actorEmail,
      action: "evidence.processing_status_updated",
      entityType: "evidenceFile",
      entityId: evidence.id,
      metadata: {
        previousStatus: evidence.processingStatus,
        nextStatus: input.processingStatus
      },
      requestContext: input.requestContext ?? undefined
    });

    if (
      input.processingStatus === EvidenceProcessingStatus.PARSED &&
      evidence.processingStatus !== EvidenceProcessingStatus.PARSED
    ) {
      await recordUsageEvent(
        {
          organizationId: input.organizationId,
          meterKey: "documents_processed",
          idempotencyKey: `usage:documents_processed:${evidence.id}:${updated.parsedAt?.toISOString() ?? now.toISOString()}`,
          source: "evidence.processing.parsed",
          sourceRecordType: "evidenceFile",
          sourceRecordId: evidence.id,
          metadata: {
            evidenceFileId: evidence.id,
            parserVersion: updated.parserVersion ?? null
          }
        },
        tx
      );
    }

    return updated;
  });
}

export async function addEvidenceAnnotation(input: {
  organizationId: string;
  evidenceFileId: string;
  actorUserId: string;
  actorEmail: string;
  body: string;
  visibility?: EvidenceAnnotationVisibility;
  requestContext?: Prisma.InputJsonValue | null;
}, db: EvidenceDbClient = prisma) {
  return runEvidenceTransaction(db, async (tx) => {
    const evidence = await tx.evidenceFile.findFirst({
      where: {
        id: input.evidenceFileId,
        organizationId: input.organizationId
      }
    });

    if (!evidence) {
      throw new Error("Evidence item not found.");
    }

    const annotation = await tx.evidenceAnnotation.create({
      data: {
        evidenceFileId: evidence.id,
        organizationId: input.organizationId,
        authorUserId: input.actorUserId,
        visibility: input.visibility ?? EvidenceAnnotationVisibility.INTERNAL,
        body: input.body.trim()
      }
    });

    await writeAuditLog(tx, {
      organizationId: input.organizationId,
      userId: input.actorUserId,
      actorLabel: input.actorEmail,
      action: "evidence.annotation_added",
      entityType: "evidenceFile",
      entityId: evidence.id,
      metadata: {
        annotationId: annotation.id,
        visibility: annotation.visibility
      },
      requestContext: input.requestContext ?? undefined
    });

    return annotation;
  });
}

export async function getEvidenceDownloadPayload(input: {
  organizationId: string;
  evidenceFileId: string;
  versionId?: string | null;
}, db: EvidenceDbClient = prisma) {
  const evidence = await db.evidenceFile.findFirst({
    where: {
      id: input.evidenceFileId,
      organizationId: input.organizationId
    },
    include: {
      versions: input.versionId
        ? {
            where: { id: input.versionId },
            take: 1
          }
        : false
    }
  });

  if (!evidence) {
    return null;
  }

  const version =
    input.versionId && Array.isArray(evidence.versions) ? evidence.versions[0] ?? null : null;

  const storageKey = version?.storageKey ?? evidence.storageKey;
  const fileName = version?.fileName ?? evidence.fileName;
  const mimeType = version?.mimeType ?? evidence.mimeType ?? "application/octet-stream";

  return {
    evidence,
    fileName,
    mimeType,
    absolutePath: resolveEvidenceStorageAbsolutePath(storageKey),
    stream: Readable.toWeb(createReadStream(resolveEvidenceStorageAbsolutePath(storageKey))) as ReadableStream
  };
}
