import {
  ControlImplementationStatus,
  ControlScoreSource,
  FrameworkPostureStatus,
  MonitoringFrameworkStatus,
  Prisma,
  prisma,
  SUPPORTED_FRAMEWORK_CATALOG,
  type FrameworkCatalogDefinition
} from "@evolve-edge/db";

type FrameworkIntelligenceDbClient = Prisma.TransactionClient | typeof prisma;

type FrameworkCandidateControl = ReturnType<typeof getFlattenedFrameworkControls>[number];

const SEVERITY_PENALTIES = {
  CRITICAL: 18,
  HIGH: 12,
  MEDIUM: 7,
  LOW: 3
} as const;

const STATUS_BASE_SCORES: Record<ControlImplementationStatus, number | null> = {
  NOT_ASSESSED: 28,
  NOT_IMPLEMENTED: 18,
  PARTIALLY_IMPLEMENTED: 54,
  IMPLEMENTED: 88,
  NEEDS_REVIEW: 42,
  COMPENSATING_CONTROL: 72,
  NOT_APPLICABLE: null
};

function hasControlStatus(
  value: ControlImplementationStatus,
  allowed: readonly ControlImplementationStatus[]
) {
  return allowed.includes(value);
}

function getFlattenedFrameworkControls() {
  return SUPPORTED_FRAMEWORK_CATALOG.flatMap((framework) =>
    framework.families.flatMap((family) =>
      family.controls.map((control, index) => ({
        frameworkCode: framework.code,
        frameworkName: framework.name,
        familyCode: family.code,
        familyName: family.name,
        familySortOrder: family.sortOrder,
        controlCode: control.code,
        title: control.title,
        description: control.description,
        weight: control.weight,
        sortOrder: family.sortOrder * 100 + index + 1,
        keywords: control.keywords.map((keyword) => keyword.toLowerCase()),
        riskDomains: control.riskDomains.map((riskDomain) => riskDomain.toLowerCase())
      }))
    )
  );
}

const FLATTENED_FRAMEWORK_CONTROLS = getFlattenedFrameworkControls();

type FindingLike = {
  id: string;
  title: string;
  summary: string;
  riskDomain: string;
  severity: keyof typeof SEVERITY_PENALTIES;
  impactedFrameworks: unknown;
};

type RecommendationLike = {
  id: string;
  title: string;
  description: string;
  relatedFindingIds: unknown;
};

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function scoreMappingCandidate(input: {
  text: string;
  riskDomain: string;
  control: FrameworkCandidateControl;
}) {
  const text = normalizeText(input.text);
  const keywordHits = input.control.keywords.filter((keyword) => text.includes(keyword)).length;
  const riskMatch = input.control.riskDomains.includes(normalizeText(input.riskDomain)) ? 1 : 0;

  return keywordHits * 10 + riskMatch * 8 + input.control.weight / 20;
}

function getFrameworkDefinitionForLabel(label: string) {
  const normalized = normalizeToken(label);

  return (
    SUPPORTED_FRAMEWORK_CATALOG.find((framework) => normalizeToken(framework.code) === normalized) ??
    SUPPORTED_FRAMEWORK_CATALOG.find((framework) => normalizeToken(framework.name) === normalized) ??
    null
  );
}

export function getCandidateControlsForFinding(input: {
  finding: FindingLike;
  selectedFrameworkCodes: Set<string>;
}) {
  const impactedFrameworkDefinitions = asStringArray(input.finding.impactedFrameworks)
    .map((value) => getFrameworkDefinitionForLabel(value))
    .filter((framework): framework is FrameworkCatalogDefinition => Boolean(framework))
    .filter((framework) => input.selectedFrameworkCodes.has(framework.code));

  const frameworksToEvaluate =
    impactedFrameworkDefinitions.length > 0
      ? impactedFrameworkDefinitions.map((framework) => framework.code)
      : Array.from(input.selectedFrameworkCodes);

  const text = `${input.finding.title} ${input.finding.summary}`;
  const candidates = FLATTENED_FRAMEWORK_CONTROLS
    .filter((control) => frameworksToEvaluate.includes(control.frameworkCode))
    .map((control) => ({
      control,
      score: scoreMappingCandidate({
        text,
        riskDomain: input.finding.riskDomain,
        control
      })
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return candidates.slice(0, 2);
}

function getCandidateControlsForRecommendation(input: {
  recommendation: RecommendationLike;
  selectedFrameworkCodes: Set<string>;
  findingMappingsByFindingId: Map<string, string[]>;
}) {
  const inheritedControlIds = asStringArray(input.recommendation.relatedFindingIds)
    .flatMap((findingId) => input.findingMappingsByFindingId.get(findingId) ?? []);

  if (inheritedControlIds.length > 0) {
    return Array.from(new Set(inheritedControlIds));
  }

  const text = `${input.recommendation.title} ${input.recommendation.description}`;
  return FLATTENED_FRAMEWORK_CONTROLS
    .filter((control) => input.selectedFrameworkCodes.has(control.frameworkCode))
    .map((control) => ({
      control,
      score: scoreMappingCandidate({
        text,
        riskDomain: "governance",
        control
      })
    }))
    .filter((candidate) => candidate.score >= 10)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((candidate) => `${candidate.control.frameworkCode}:${candidate.control.controlCode}`);
}

export function deriveControlStatus(input: {
  approvedEvidenceCount: number;
  pendingEvidenceCount: number;
  findingSeverities: Array<keyof typeof SEVERITY_PENALTIES>;
}) {
  if (input.findingSeverities.includes("CRITICAL") || input.findingSeverities.includes("HIGH")) {
    return ControlImplementationStatus.NOT_IMPLEMENTED;
  }

  if (input.findingSeverities.includes("MEDIUM") || input.findingSeverities.includes("LOW")) {
    return ControlImplementationStatus.PARTIALLY_IMPLEMENTED;
  }

  if (input.approvedEvidenceCount > 0) {
    return ControlImplementationStatus.IMPLEMENTED;
  }

  if (input.pendingEvidenceCount > 0) {
    return ControlImplementationStatus.NEEDS_REVIEW;
  }

  return ControlImplementationStatus.NOT_ASSESSED;
}

export function calculateControlScore(input: {
  status: ControlImplementationStatus;
  approvedEvidenceCount: number;
  pendingEvidenceCount: number;
  findingSeverities: Array<keyof typeof SEVERITY_PENALTIES>;
}) {
  const base = STATUS_BASE_SCORES[input.status];
  if (base === null) {
    return null;
  }

  const evidenceBoost = input.approvedEvidenceCount * 6 + input.pendingEvidenceCount * 2;
  const findingPenalty = input.findingSeverities.reduce(
    (total, severity) => total + SEVERITY_PENALTIES[severity],
    0
  );

  return Math.max(8, Math.min(96, base + evidenceBoost - findingPenalty));
}

export function deriveFrameworkPostureStatus(input: {
  score: number | null;
  gapControlsCount: number;
  criticalGapCount: number;
}) {
  if (input.criticalGapCount > 0 || (input.score !== null && input.score < 60)) {
    return FrameworkPostureStatus.ATTENTION_REQUIRED;
  }

  if (input.gapControlsCount > 0 || (input.score !== null && input.score < 80)) {
    return FrameworkPostureStatus.WATCH;
  }

  return FrameworkPostureStatus.STABLE;
}

function mapFrameworkPostureToMonitoringStatus(status: FrameworkPostureStatus) {
  switch (status) {
    case FrameworkPostureStatus.ATTENTION_REQUIRED:
      return MonitoringFrameworkStatus.ATTENTION_REQUIRED;
    case FrameworkPostureStatus.WATCH:
      return MonitoringFrameworkStatus.WATCH;
    default:
      return MonitoringFrameworkStatus.STABLE;
  }
}

async function ensureFrameworkCatalog(db: FrameworkIntelligenceDbClient) {
  for (const framework of SUPPORTED_FRAMEWORK_CATALOG) {
    const frameworkRecord = await db.framework.upsert({
      where: { code: framework.code },
      update: {
        name: framework.name,
        category: framework.category,
        version: framework.version
      },
      create: {
        code: framework.code,
        name: framework.name,
        category: framework.category,
        version: framework.version
      }
    });

    for (const family of framework.families) {
      for (const [index, control] of family.controls.entries()) {
        await db.frameworkControl.upsert({
          where: {
            frameworkId_code: {
              frameworkId: frameworkRecord.id,
              code: control.code
            }
          },
          update: {
            familyCode: family.code,
            familyName: family.name,
            title: control.title,
            description: control.description,
            weight: control.weight,
            sortOrder: family.sortOrder * 100 + index + 1
          },
          create: {
            frameworkId: frameworkRecord.id,
            code: control.code,
            familyCode: family.code,
            familyName: family.name,
            title: control.title,
            description: control.description,
            weight: control.weight,
            sortOrder: family.sortOrder * 100 + index + 1
          }
        });
      }
    }
  }
}

export async function syncFrameworkControlScoringFromAssessment(input: {
  organizationId: string;
  assessmentId: string;
  reportId?: string | null;
  actorUserId?: string | null;
  db?: FrameworkIntelligenceDbClient;
}) {
  const db = input.db ?? prisma;
  await ensureFrameworkCatalog(db);

  const assessment = await db.assessment.findFirst({
    where: {
      id: input.assessmentId,
      organizationId: input.organizationId
    },
    include: {
      findings: true,
      recommendations: true,
      organization: {
        include: {
          frameworkSelections: {
            include: {
              framework: {
                include: {
                  controls: {
                    orderBy: [{ familyCode: "asc" }, { sortOrder: "asc" }]
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!assessment) {
    throw new Error("Assessment not found for framework intelligence sync.");
  }

  const evidenceFiles = await db.evidenceFile.findMany({
    where: {
      organizationId: input.organizationId
    },
    select: {
      id: true,
      frameworkId: true,
      frameworkControlId: true,
      reviewStatus: true,
      uploadedAt: true
    }
  });

  const selectedFrameworks = assessment.organization.frameworkSelections;
  const selectedFrameworkCodes = new Set(
    selectedFrameworks.map((selection) => selection.framework.code)
  );
  const frameworkIdByCode = new Map(
    selectedFrameworks.map((selection) => [selection.framework.code, selection.framework.id])
  );
  const frameworkControlByKey = new Map<string, (typeof selectedFrameworks)[number]["framework"]["controls"][number]>(
    selectedFrameworks.flatMap((selection) =>
      selection.framework.controls.map((control) => [
        `${selection.framework.code}:${control.code}`,
        control
      ] as const)
    )
  );

  const findingControlMappings = assessment.findings.flatMap((finding) => {
    const candidates = getCandidateControlsForFinding({
      finding,
      selectedFrameworkCodes
    });

    return candidates
      .map((candidate) => {
        const frameworkId = frameworkIdByCode.get(candidate.control.frameworkCode);
        const frameworkControl = frameworkControlByKey.get(
          `${candidate.control.frameworkCode}:${candidate.control.controlCode}`
        );

        if (!frameworkId || !frameworkControl) {
          return null;
        }

        return {
          organizationId: input.organizationId,
          findingId: finding.id,
          frameworkId,
          frameworkControlId: frameworkControl.id,
          mappingSource: "inferred",
          confidence: Math.max(35, Math.min(100, Math.round(candidate.score * 3))),
          rationale: `Inferred from finding severity ${finding.severity.toLowerCase()}, risk domain ${finding.riskDomain}, and matching control keywords.`
        };
      })
      .filter((mapping): mapping is NonNullable<typeof mapping> => Boolean(mapping));
  });

  if (assessment.findings.length > 0) {
    await db.findingControlMapping.deleteMany({
      where: {
        findingId: {
          in: assessment.findings.map((finding) => finding.id)
        }
      }
    });
  }

  if (findingControlMappings.length > 0) {
    await db.findingControlMapping.createMany({
      data: findingControlMappings,
      skipDuplicates: true
    });
  }

  const findingMappingsByFindingId = new Map<string, string[]>();
  for (const mapping of findingControlMappings) {
    const frameworkCode = selectedFrameworks.find(
      (framework) => framework.framework.id === mapping.frameworkId
    )?.framework.code;
    const frameworkControl = selectedFrameworks
      .flatMap((selection) => selection.framework.controls)
      .find((control) => control.id === mapping.frameworkControlId);

    if (!frameworkCode || !frameworkControl) {
      continue;
    }

    const entry = findingMappingsByFindingId.get(mapping.findingId) ?? [];
    entry.push(`${frameworkCode}:${frameworkControl.code}`);
    findingMappingsByFindingId.set(mapping.findingId, entry);
  }

  if (assessment.recommendations.length > 0) {
    await db.recommendationControlMapping.deleteMany({
      where: {
        recommendationId: {
          in: assessment.recommendations.map((recommendation) => recommendation.id)
        }
      }
    });
  }

  const recommendationMappings = assessment.recommendations.flatMap((recommendation) =>
    getCandidateControlsForRecommendation({
      recommendation,
      selectedFrameworkCodes,
      findingMappingsByFindingId
    })
      .map((controlKey) => {
        const [frameworkCode] = controlKey.split(":");
        const frameworkId = frameworkIdByCode.get(frameworkCode);
        const frameworkControl = frameworkControlByKey.get(controlKey);

        if (!frameworkId || !frameworkControl) {
          return null;
        }

        return {
          organizationId: input.organizationId,
          recommendationId: recommendation.id,
          frameworkId,
          frameworkControlId: frameworkControl.id,
          mappingSource: "inferred",
          rationale: "Inherited from related findings or recommendation keyword matches."
        };
      })
      .filter((mapping): mapping is NonNullable<typeof mapping> => Boolean(mapping))
  );

  if (recommendationMappings.length > 0) {
    await db.recommendationControlMapping.createMany({
      data: recommendationMappings,
      skipDuplicates: true
    });
  }

  if (evidenceFiles.length > 0) {
    await db.evidenceControlMapping.deleteMany({
      where: {
        evidenceFileId: {
          in: evidenceFiles.map((evidence) => evidence.id)
        }
      }
    });
  }

  const evidenceMappings = evidenceFiles
    .filter((evidence) => evidence.frameworkId && evidence.frameworkControlId)
    .map((evidence) => ({
      organizationId: input.organizationId,
      evidenceFileId: evidence.id,
      frameworkId: evidence.frameworkId!,
      frameworkControlId: evidence.frameworkControlId!,
      mappingSource: "manual",
      confidence: 100,
      rationale: "Direct framework control linkage supplied during evidence review."
    }));

  if (evidenceMappings.length > 0) {
    await db.evidenceControlMapping.createMany({
      data: evidenceMappings,
      skipDuplicates: true
    });
  }

  const findingMappingsByControlId = new Map<string, FindingLike[]>();
  for (const mapping of findingControlMappings) {
    const finding = assessment.findings.find((item) => item.id === mapping.findingId);
    if (!finding) {
      continue;
    }

    const matches = findingMappingsByControlId.get(mapping.frameworkControlId) ?? [];
    matches.push(finding);
    findingMappingsByControlId.set(mapping.frameworkControlId, matches);
  }

  const evidenceMappingsByControlId = new Map<
    string,
    Array<{ id: string; reviewStatus: string; uploadedAt: Date }>
  >();
  for (const evidence of evidenceFiles.filter((item) => item.frameworkControlId)) {
    const matches = evidenceMappingsByControlId.get(evidence.frameworkControlId!) ?? [];
    matches.push({
      id: evidence.id,
      reviewStatus: evidence.reviewStatus,
      uploadedAt: evidence.uploadedAt
    });
    evidenceMappingsByControlId.set(evidence.frameworkControlId!, matches);
  }

  const currentAssessments = await db.controlAssessment.findMany({
    where: {
      organizationId: input.organizationId,
      frameworkId: {
        in: Array.from(frameworkIdByCode.values())
      }
    }
  });
  const currentAssessmentByControlId = new Map(
    currentAssessments.map((assessmentRow) => [assessmentRow.frameworkControlId, assessmentRow])
  );

  const nextControlAssessmentRows: Array<Prisma.ControlAssessmentUncheckedCreateInput> = [];
  const updatePayloads: Array<{
    id: string;
    data: Prisma.ControlAssessmentUncheckedUpdateInput;
  }> = [];

  for (const selection of selectedFrameworks) {
    for (const control of selection.framework.controls) {
      const linkedFindings = findingMappingsByControlId.get(control.id) ?? [];
      const linkedEvidence = evidenceMappingsByControlId.get(control.id) ?? [];
      const approvedEvidenceCount = linkedEvidence.filter(
        (evidence) => evidence.reviewStatus === "APPROVED"
      ).length;
      const pendingEvidenceCount = linkedEvidence.filter(
        (evidence) => evidence.reviewStatus !== "APPROVED"
      ).length;
      const status = deriveControlStatus({
        approvedEvidenceCount,
        pendingEvidenceCount,
        findingSeverities: linkedFindings.map((finding) => finding.severity)
      });
      const inferredScore = calculateControlScore({
        status,
        approvedEvidenceCount,
        pendingEvidenceCount,
        findingSeverities: linkedFindings.map((finding) => finding.severity)
      });
      const existing = currentAssessmentByControlId.get(control.id);
      const isManualAssessment =
        existing?.scoreSource === ControlScoreSource.REVIEWED ||
        existing?.scoreSource === ControlScoreSource.OVERRIDDEN;
      const nextScore =
        existing?.scoreSource === ControlScoreSource.OVERRIDDEN && existing.overriddenScore !== null
          ? existing.overriddenScore
          : inferredScore;
      const nextStatus = isManualAssessment && existing ? existing.status : status;
      const nextScoreSource =
        isManualAssessment && existing ? existing.scoreSource : ControlScoreSource.INFERRED;
      const rationale =
        nextStatus === ControlImplementationStatus.IMPLEMENTED
          ? "Evidence-backed control coverage is present with no current linked finding gaps."
          : nextStatus === ControlImplementationStatus.NOT_IMPLEMENTED
            ? "Open high-severity findings indicate the control is not operating effectively."
            : nextStatus === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
              ? "Some control evidence exists, but linked findings indicate partial or inconsistent operation."
              : nextStatus === ControlImplementationStatus.NEEDS_REVIEW
                ? "Artifacts are linked, but they still require reviewer confirmation."
                : "The control has not been sufficiently assessed yet.";

      const summaryJson: Prisma.InputJsonValue = {
        findingCount: linkedFindings.length,
        findingIds: linkedFindings.map((finding) => finding.id),
        evidenceCount: linkedEvidence.length,
        evidenceIds: linkedEvidence.map((evidence) => evidence.id),
        approvedEvidenceCount,
        pendingEvidenceCount,
        inferredStatus: status,
        inferredScore
      };

      const commonData: Prisma.ControlAssessmentUncheckedCreateInput = {
        organizationId: input.organizationId,
        frameworkId: selection.frameworkId,
        frameworkControlId: control.id,
        engagementProgramId: assessment.engagementProgramId ?? null,
        assessmentId: assessment.id,
        reportId: input.reportId ?? null,
        reviewedByUserId: existing?.reviewedByUserId ?? null,
        status: nextStatus,
        score: nextScore,
        overriddenScore: existing?.overriddenScore ?? null,
        scoreSource: nextScoreSource,
        weighting: control.weight,
        rationale,
        summaryJson,
        lastEvidenceLinkedAt:
          linkedEvidence.length > 0
            ? new Date(
                Math.max(...linkedEvidence.map((evidence) => evidence.uploadedAt.getTime()))
              )
            : existing?.lastEvidenceLinkedAt ?? null,
        lastFindingLinkedAt:
          linkedFindings.length > 0 ? new Date() : existing?.lastFindingLinkedAt ?? null,
        lastScoredAt: new Date(),
        lastReviewedAt: existing?.lastReviewedAt ?? null
      };

      if (existing) {
        updatePayloads.push({
          id: existing.id,
          data: {
            engagementProgramId: commonData.engagementProgramId,
            assessmentId: commonData.assessmentId,
            reportId: commonData.reportId,
            status: commonData.status,
            score: commonData.score,
            overriddenScore: commonData.overriddenScore,
            scoreSource: commonData.scoreSource,
            weighting: commonData.weighting,
            rationale: commonData.rationale,
            summaryJson: commonData.summaryJson,
            lastEvidenceLinkedAt: commonData.lastEvidenceLinkedAt,
            lastFindingLinkedAt: commonData.lastFindingLinkedAt,
            lastScoredAt: commonData.lastScoredAt,
            reviewedByUserId: commonData.reviewedByUserId,
            lastReviewedAt: commonData.lastReviewedAt
          }
        });
      } else {
        nextControlAssessmentRows.push(commonData);
      }
    }
  }

  if (nextControlAssessmentRows.length > 0) {
    await db.controlAssessment.createMany({
      data: nextControlAssessmentRows,
      skipDuplicates: true
    });
  }

  for (const update of updatePayloads) {
    await db.controlAssessment.update({
      where: { id: update.id },
      data: update.data
    });
  }

  const controlAssessments = await db.controlAssessment.findMany({
    where: {
      organizationId: input.organizationId,
      frameworkId: {
        in: Array.from(frameworkIdByCode.values())
      }
    },
    include: {
      frameworkControl: true
    }
  });

  const postureSnapshots: Prisma.FrameworkPostureSnapshotUncheckedCreateInput[] = [];
  const controlSnapshots: Prisma.ControlAssessmentSnapshotUncheckedCreateInput[] = [];

  for (const controlAssessment of controlAssessments) {
    controlSnapshots.push({
      organizationId: input.organizationId,
      controlAssessmentId: controlAssessment.id,
      frameworkId: controlAssessment.frameworkId,
      frameworkControlId: controlAssessment.frameworkControlId,
      assessmentId: assessment.id,
      reportId: input.reportId ?? null,
      status: controlAssessment.status,
      score: controlAssessment.score,
      scoreSource: controlAssessment.scoreSource,
      rationale: controlAssessment.rationale ?? null,
      summaryJson:
        (controlAssessment.summaryJson as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
      recordedAt: new Date()
    });
  }

  if (controlSnapshots.length > 0) {
    await db.controlAssessmentSnapshot.createMany({
      data: controlSnapshots
    });
  }

  for (const selection of selectedFrameworks) {
    const assessmentsForFramework = controlAssessments.filter(
      (controlAssessment) => controlAssessment.frameworkId === selection.frameworkId
    );
    const activeAssessments = assessmentsForFramework.filter(
      (controlAssessment) =>
        controlAssessment.status !== ControlImplementationStatus.NOT_APPLICABLE
    );
    const assessedControlsCount = activeAssessments.filter(
      (controlAssessment) =>
        controlAssessment.status !== ControlImplementationStatus.NOT_ASSESSED
    ).length;
    const implementedControlsCount = activeAssessments.filter((controlAssessment) =>
      hasControlStatus(controlAssessment.status, [
        ControlImplementationStatus.IMPLEMENTED,
        ControlImplementationStatus.COMPENSATING_CONTROL
      ])
    ).length;
    const gapControlsCount = activeAssessments.filter((controlAssessment) =>
      hasControlStatus(controlAssessment.status, [
        ControlImplementationStatus.NOT_IMPLEMENTED,
        ControlImplementationStatus.PARTIALLY_IMPLEMENTED
      ])
    ).length;
    const needsReviewControlsCount = activeAssessments.filter((controlAssessment) =>
      hasControlStatus(controlAssessment.status, [
        ControlImplementationStatus.NEEDS_REVIEW,
        ControlImplementationStatus.NOT_ASSESSED
      ])
    ).length;
    const weightedControls = activeAssessments.filter(
      (controlAssessment) => typeof controlAssessment.score === "number"
    );
    const totalWeight = weightedControls.reduce(
      (total, controlAssessment) => total + controlAssessment.weighting,
      0
    );
    const weightedScore =
      totalWeight > 0
        ? Math.round(
            weightedControls.reduce(
              (total, controlAssessment) =>
                total + (controlAssessment.score ?? 0) * controlAssessment.weighting,
              0
            ) / totalWeight
          )
        : null;
    const criticalGapCount = activeAssessments.filter((controlAssessment) => {
      const summary = controlAssessment.summaryJson;
      if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
        return false;
      }

      const inferredStatus = (summary as Record<string, unknown>).inferredStatus;
      const findingIds = asStringArray((summary as Record<string, unknown>).findingIds);
      return (
        inferredStatus === ControlImplementationStatus.NOT_IMPLEMENTED &&
        findingIds.some((findingId) =>
          assessment.findings.some(
            (finding) =>
              finding.id === findingId &&
              (finding.severity === "CRITICAL" || finding.severity === "HIGH")
          )
        )
      );
    }).length;
    const postureStatus = deriveFrameworkPostureStatus({
      score: weightedScore,
      gapControlsCount,
      criticalGapCount
    });

    postureSnapshots.push({
      organizationId: input.organizationId,
      frameworkId: selection.frameworkId,
      engagementProgramId: assessment.engagementProgramId ?? null,
      assessmentId: assessment.id,
      reportId: input.reportId ?? null,
      status: postureStatus,
      score: weightedScore,
      assessedControlsCount,
      implementedControlsCount,
      gapControlsCount,
      needsReviewControlsCount,
      weightedCoveragePercent: weightedScore,
      sourceLabel: input.reportId ? "report_sync" : "assessment_sync",
      scoringSummaryJson: {
        frameworkCode: selection.framework.code,
        controlCount: activeAssessments.length,
        assessedControlsCount,
        implementedControlsCount,
        gapControlsCount,
        needsReviewControlsCount,
        weightedScore
      } satisfies Prisma.InputJsonValue
    });

    const previousSnapshot = await db.frameworkPostureSnapshot.findFirst({
      where: {
        organizationId: input.organizationId,
        frameworkId: selection.frameworkId
      },
      orderBy: { recordedAt: "desc" }
    });

    await db.monitoringFramework.upsert({
      where: {
        organizationId_frameworkId: {
          organizationId: input.organizationId,
          frameworkId: selection.frameworkId
        }
      },
      update: {
        lastAssessmentId: assessment.id,
        score: weightedScore,
        status: mapFrameworkPostureToMonitoringStatus(postureStatus),
        openFindingsCount: gapControlsCount,
        inRemediationCount: activeAssessments.filter(
          (controlAssessment) =>
            controlAssessment.status === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
        ).length,
        resolvedFindingsCount: implementedControlsCount,
        trendDelta:
          weightedScore !== null &&
          previousSnapshot !== null &&
          previousSnapshot.score !== null
            ? weightedScore - previousSnapshot.score
            : 0,
        lastReviewedAt: new Date()
      },
      create: {
        organizationId: input.organizationId,
        monitoringSubscriptionId: null,
        frameworkId: selection.frameworkId,
        lastAssessmentId: assessment.id,
        score: weightedScore,
        status: mapFrameworkPostureToMonitoringStatus(postureStatus),
        openFindingsCount: gapControlsCount,
        inRemediationCount: activeAssessments.filter(
          (controlAssessment) =>
            controlAssessment.status === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
        ).length,
        resolvedFindingsCount: implementedControlsCount,
        trendDelta: 0,
        lastReviewedAt: new Date()
      }
    });
  }

  if (postureSnapshots.length > 0) {
    await db.frameworkPostureSnapshot.createMany({
      data: postureSnapshots
    });
  }
}

export async function getFrameworkOverviewSnapshot(organizationId: string) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId },
    include: {
      frameworkSelections: {
        include: {
          framework: true
        },
        orderBy: {
          framework: {
            name: "asc"
          }
        }
      }
    }
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  const frameworkIds = organization.frameworkSelections.map((selection) => selection.frameworkId);
  const [controlAssessments, postureSnapshots] = await Promise.all([
    prisma.controlAssessment.findMany({
      where: {
        organizationId,
        frameworkId: { in: frameworkIds }
      },
      include: {
        frameworkControl: true,
        framework: true
      },
      orderBy: [{ framework: { name: "asc" } }, { frameworkControl: { sortOrder: "asc" } }]
    }),
    prisma.frameworkPostureSnapshot.findMany({
      where: {
        organizationId,
        frameworkId: { in: frameworkIds }
      },
      orderBy: { recordedAt: "desc" }
    })
  ]);

  const latestSnapshotByFrameworkId = new Map<string, (typeof postureSnapshots)[number]>();
  for (const snapshot of postureSnapshots) {
    if (!latestSnapshotByFrameworkId.has(snapshot.frameworkId)) {
      latestSnapshotByFrameworkId.set(snapshot.frameworkId, snapshot);
    }
  }

  const frameworks = organization.frameworkSelections.map((selection) => {
    const latestSnapshot = latestSnapshotByFrameworkId.get(selection.frameworkId) ?? null;
    const frameworkControls = controlAssessments.filter(
      (controlAssessment) => controlAssessment.frameworkId === selection.frameworkId
    );
    const topGap =
      frameworkControls
        .filter((controlAssessment) =>
          hasControlStatus(controlAssessment.status, [
            ControlImplementationStatus.NOT_IMPLEMENTED,
            ControlImplementationStatus.PARTIALLY_IMPLEMENTED,
            ControlImplementationStatus.NEEDS_REVIEW
          ])
        )
        .sort((left, right) => (left.score ?? 100) - (right.score ?? 100))[0] ?? null;
    const trend = postureSnapshots
      .filter((snapshot) => snapshot.frameworkId === selection.frameworkId)
      .slice(0, 8)
      .reverse()
      .map((snapshot) => ({
        id: snapshot.id,
        score: snapshot.score,
        status: snapshot.status,
        recordedAt: snapshot.recordedAt
      }));

    return {
      id: selection.frameworkId,
      code: selection.framework.code,
      name: selection.framework.name,
      category: selection.framework.category,
      version: selection.framework.version,
      score: latestSnapshot?.score ?? null,
      status: latestSnapshot?.status ?? FrameworkPostureStatus.WATCH,
      assessedControlsCount: latestSnapshot?.assessedControlsCount ?? 0,
      implementedControlsCount: latestSnapshot?.implementedControlsCount ?? 0,
      gapControlsCount: latestSnapshot?.gapControlsCount ?? 0,
      needsReviewControlsCount: latestSnapshot?.needsReviewControlsCount ?? 0,
      topGap: topGap
        ? {
            code: topGap.frameworkControl.code,
            title: topGap.frameworkControl.title,
            status: topGap.status
          }
        : null,
      trend
    };
  });

  const allControls = controlAssessments.filter(
    (controlAssessment) =>
      controlAssessment.status === ControlImplementationStatus.NOT_IMPLEMENTED ||
      controlAssessment.status === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
  );

  return {
    organization: {
      id: organization.id,
      name: organization.name
    },
    summary: {
      frameworkCount: frameworks.length,
      assessedControlsCount: controlAssessments.filter(
        (controlAssessment) =>
          controlAssessment.status !== ControlImplementationStatus.NOT_ASSESSED &&
          controlAssessment.status !== ControlImplementationStatus.NOT_APPLICABLE
      ).length,
      implementedControlsCount: controlAssessments.filter((controlAssessment) =>
        hasControlStatus(controlAssessment.status, [
          ControlImplementationStatus.IMPLEMENTED,
          ControlImplementationStatus.COMPENSATING_CONTROL
        ])
      ).length,
      gapControlsCount: allControls.length,
      averageScore:
        frameworks.length > 0
          ? Math.round(
              frameworks.reduce((total, framework) => total + (framework.score ?? 0), 0) /
                frameworks.length
            )
          : null
    },
    frameworks,
    topGaps: allControls
      .sort((left, right) => (left.score ?? 100) - (right.score ?? 100))
      .slice(0, 8)
      .map((controlAssessment) => ({
        id: controlAssessment.id,
        frameworkName: controlAssessment.framework.name,
        controlCode: controlAssessment.frameworkControl.code,
        controlTitle: controlAssessment.frameworkControl.title,
        status: controlAssessment.status,
        score: controlAssessment.score
      }))
  };
}

export async function getFrameworkDetailSnapshot(input: {
  organizationId: string;
  frameworkCode: string;
}) {
  const framework = await prisma.framework.findFirst({
    where: {
      code: input.frameworkCode
    },
    include: {
      controls: {
        orderBy: [{ familyCode: "asc" }, { sortOrder: "asc" }]
      }
    }
  });

  if (!framework) {
    return null;
  }

  const [controlAssessments, findingMappings, evidenceMappings, recommendationMappings, postureSnapshots] =
    await Promise.all([
      prisma.controlAssessment.findMany({
        where: {
          organizationId: input.organizationId,
          frameworkId: framework.id
        },
        include: {
          frameworkControl: true,
          reviewedBy: true,
          snapshots: {
            orderBy: { recordedAt: "desc" },
            take: 5
          }
        },
        orderBy: [{ frameworkControl: { familyCode: "asc" } }, { frameworkControl: { sortOrder: "asc" } }]
      }),
      prisma.findingControlMapping.findMany({
        where: {
          organizationId: input.organizationId,
          frameworkId: framework.id
        },
        include: {
          finding: true,
          frameworkControl: true
        }
      }),
      prisma.evidenceControlMapping.findMany({
        where: {
          organizationId: input.organizationId,
          frameworkId: framework.id
        },
        include: {
          evidenceFile: true,
          frameworkControl: true
        }
      }),
      prisma.recommendationControlMapping.findMany({
        where: {
          organizationId: input.organizationId,
          frameworkId: framework.id
        },
        include: {
          recommendation: true,
          frameworkControl: true
        }
      }),
      prisma.frameworkPostureSnapshot.findMany({
        where: {
          organizationId: input.organizationId,
          frameworkId: framework.id
        },
        orderBy: { recordedAt: "desc" },
        take: 12
      })
    ]);

  const controls = framework.controls.map((control) => {
    const assessment = controlAssessments.find(
      (controlAssessment) => controlAssessment.frameworkControlId === control.id
    );

    return {
      id: control.id,
      code: control.code,
      familyCode: control.familyCode,
      familyName: control.familyName,
      title: control.title,
      description: control.description,
      weight: control.weight,
      assessment,
      findings: findingMappings
        .filter((mapping) => mapping.frameworkControlId === control.id)
        .map((mapping) => mapping.finding),
      evidence: evidenceMappings
        .filter((mapping) => mapping.frameworkControlId === control.id)
        .map((mapping) => mapping.evidenceFile),
      recommendations: recommendationMappings
        .filter((mapping) => mapping.frameworkControlId === control.id)
        .map((mapping) => mapping.recommendation)
    };
  });

  return {
    framework,
    summary: postureSnapshots[0] ?? null,
    controls,
    trend: postureSnapshots.reverse().map((snapshot) => ({
      id: snapshot.id,
      score: snapshot.score,
      status: snapshot.status,
      recordedAt: snapshot.recordedAt,
      gapControlsCount: snapshot.gapControlsCount
    }))
  };
}

export async function updateControlAssessmentReview(input: {
  organizationId: string;
  controlAssessmentId: string;
  actorUserId: string;
  status: ControlImplementationStatus;
  score?: number | null;
  rationale?: string | null;
  db?: FrameworkIntelligenceDbClient;
}) {
  const db = input.db ?? prisma;
  const current = await db.controlAssessment.findFirst({
    where: {
      id: input.controlAssessmentId,
      organizationId: input.organizationId
    }
  });

  if (!current) {
    throw new Error("Control assessment not found.");
  }

  const nextScore =
    input.status === ControlImplementationStatus.NOT_APPLICABLE
      ? null
      : input.score ?? current.score ?? STATUS_BASE_SCORES[input.status];

  const updated = await db.controlAssessment.update({
    where: {
      id: current.id
    },
    data: {
      status: input.status,
      score: nextScore,
      overriddenScore: nextScore,
      scoreSource: ControlScoreSource.OVERRIDDEN,
      reviewedByUserId: input.actorUserId,
      lastReviewedAt: new Date(),
      rationale: input.rationale ?? current.rationale,
      lastScoredAt: new Date()
    }
  });

  await db.controlAssessmentSnapshot.create({
    data: {
      organizationId: input.organizationId,
      controlAssessmentId: updated.id,
      frameworkId: updated.frameworkId,
      frameworkControlId: updated.frameworkControlId,
      assessmentId: updated.assessmentId,
      reportId: updated.reportId,
      status: updated.status,
      score: updated.score,
      scoreSource: updated.scoreSource,
      rationale: updated.rationale,
      summaryJson: (updated.summaryJson as Prisma.InputJsonValue | null) ?? Prisma.JsonNull
    }
  });

  const frameworkAssessments = await db.controlAssessment.findMany({
    where: {
      organizationId: input.organizationId,
      frameworkId: updated.frameworkId
    }
  });
  const activeAssessments = frameworkAssessments.filter(
    (controlAssessment) =>
      controlAssessment.status !== ControlImplementationStatus.NOT_APPLICABLE
  );
  const weightedControls = activeAssessments.filter(
    (controlAssessment) => typeof controlAssessment.score === "number"
  );
  const totalWeight = weightedControls.reduce(
    (total, controlAssessment) => total + controlAssessment.weighting,
    0
  );
  const weightedScore =
    totalWeight > 0
      ? Math.round(
          weightedControls.reduce(
            (total, controlAssessment) =>
              total + (controlAssessment.score ?? 0) * controlAssessment.weighting,
            0
          ) / totalWeight
        )
      : null;
  const gapControlsCount = activeAssessments.filter((controlAssessment) =>
    hasControlStatus(controlAssessment.status, [
      ControlImplementationStatus.NOT_IMPLEMENTED,
      ControlImplementationStatus.PARTIALLY_IMPLEMENTED
    ])
  ).length;
  const postureStatus = deriveFrameworkPostureStatus({
    score: weightedScore,
    gapControlsCount,
    criticalGapCount:
      updated.status === ControlImplementationStatus.NOT_IMPLEMENTED ? 1 : 0
  });
  const previousSnapshot = await db.frameworkPostureSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      frameworkId: updated.frameworkId
    },
    orderBy: { recordedAt: "desc" }
  });

  await db.frameworkPostureSnapshot.create({
    data: {
      organizationId: input.organizationId,
      frameworkId: updated.frameworkId,
      engagementProgramId: updated.engagementProgramId,
      assessmentId: updated.assessmentId,
      reportId: updated.reportId,
      status: postureStatus,
      score: weightedScore,
      assessedControlsCount: activeAssessments.filter(
        (controlAssessment) =>
          controlAssessment.status !== ControlImplementationStatus.NOT_ASSESSED
      ).length,
      implementedControlsCount: activeAssessments.filter((controlAssessment) =>
        hasControlStatus(controlAssessment.status, [
          ControlImplementationStatus.IMPLEMENTED,
          ControlImplementationStatus.COMPENSATING_CONTROL
        ])
      ).length,
      gapControlsCount,
      needsReviewControlsCount: activeAssessments.filter((controlAssessment) =>
        hasControlStatus(controlAssessment.status, [
          ControlImplementationStatus.NEEDS_REVIEW,
          ControlImplementationStatus.NOT_ASSESSED
        ])
      ).length,
      weightedCoveragePercent: weightedScore,
      sourceLabel: "manual_review",
      scoringSummaryJson: {
        updatedControlAssessmentId: updated.id,
        controlAssessmentCount: activeAssessments.length,
        weightedScore
      } satisfies Prisma.InputJsonValue
    }
  });

  await db.monitoringFramework.upsert({
    where: {
      organizationId_frameworkId: {
        organizationId: input.organizationId,
        frameworkId: updated.frameworkId
      }
    },
    update: {
      score: weightedScore,
      status: mapFrameworkPostureToMonitoringStatus(postureStatus),
      openFindingsCount: gapControlsCount,
      inRemediationCount: activeAssessments.filter(
        (controlAssessment) =>
          controlAssessment.status === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
      ).length,
      resolvedFindingsCount: activeAssessments.filter((controlAssessment) =>
        hasControlStatus(controlAssessment.status, [
          ControlImplementationStatus.IMPLEMENTED,
          ControlImplementationStatus.COMPENSATING_CONTROL
        ])
      ).length,
      trendDelta:
        weightedScore !== null &&
        previousSnapshot !== null &&
        previousSnapshot.score !== null
          ? weightedScore - previousSnapshot.score
          : 0,
      lastReviewedAt: new Date(),
      lastAssessmentId: updated.assessmentId
    },
    create: {
      organizationId: input.organizationId,
      frameworkId: updated.frameworkId,
      score: weightedScore,
      status: mapFrameworkPostureToMonitoringStatus(postureStatus),
      openFindingsCount: gapControlsCount,
      inRemediationCount: activeAssessments.filter(
        (controlAssessment) =>
          controlAssessment.status === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
      ).length,
      resolvedFindingsCount: activeAssessments.filter((controlAssessment) =>
        hasControlStatus(controlAssessment.status, [
          ControlImplementationStatus.IMPLEMENTED,
          ControlImplementationStatus.COMPENSATING_CONTROL
        ])
      ).length,
      trendDelta: 0,
      lastReviewedAt: new Date(),
      lastAssessmentId: updated.assessmentId
    }
  });

  return updated;
}

export async function findFrameworkControlIdByCode(input: {
  frameworkId: string;
  controlCode: string;
}) {
  const controls = await prisma.frameworkControl.findMany({
    where: {
      frameworkId: input.frameworkId
    }
  });

  return (
    controls.find((item) => normalizeToken(item.code) === normalizeToken(input.controlCode))?.id ??
    null
  );
}
