import assert from "node:assert/strict";
import {
  ControlImplementationStatus,
  FrameworkPostureStatus
} from "@evolve-edge/db";
import {
  calculateControlScore,
  deriveControlStatus,
  deriveFrameworkPostureStatus,
  getCandidateControlsForFinding
} from "../lib/framework-intelligence";

function runFrameworkIntelligenceTests() {
  {
    const candidates = getCandidateControlsForFinding({
      finding: {
        id: "finding_1",
        title: "PHI handling guidance missing for AI copilots",
        summary: "Teams use AI tools without documented minimum necessary controls.",
        riskDomain: "privacy",
        severity: "CRITICAL",
        impactedFrameworks: ["HIPAA"]
      },
      selectedFrameworkCodes: new Set(["hipaa"])
    });

    assert.equal(candidates.length > 0, true);
    assert.equal(candidates[0]?.control.frameworkCode, "hipaa");
    assert.equal(candidates.some((candidate) => candidate.control.controlCode === "PR.Minimum"), true);
  }

  {
    const status = deriveControlStatus({
      approvedEvidenceCount: 0,
      pendingEvidenceCount: 0,
      findingSeverities: ["CRITICAL"]
    });

    assert.equal(status, ControlImplementationStatus.NOT_IMPLEMENTED);
    assert.equal(
      calculateControlScore({
        status,
        approvedEvidenceCount: 0,
        pendingEvidenceCount: 0,
        findingSeverities: ["CRITICAL"]
      }),
      8
    );
  }

  {
    const status = deriveControlStatus({
      approvedEvidenceCount: 2,
      pendingEvidenceCount: 0,
      findingSeverities: []
    });

    assert.equal(status, ControlImplementationStatus.IMPLEMENTED);
    assert.equal(
      calculateControlScore({
        status,
        approvedEvidenceCount: 2,
        pendingEvidenceCount: 0,
        findingSeverities: []
      }),
      96
    );
  }

  {
    assert.equal(
      deriveFrameworkPostureStatus({
        score: 54,
        gapControlsCount: 3,
        criticalGapCount: 1
      }),
      FrameworkPostureStatus.ATTENTION_REQUIRED
    );
    assert.equal(
      deriveFrameworkPostureStatus({
        score: 76,
        gapControlsCount: 1,
        criticalGapCount: 0
      }),
      FrameworkPostureStatus.WATCH
    );
    assert.equal(
      deriveFrameworkPostureStatus({
        score: 89,
        gapControlsCount: 0,
        criticalGapCount: 0
      }),
      FrameworkPostureStatus.STABLE
    );
  }

  console.log("framework-intelligence tests passed");
}

runFrameworkIntelligenceTests();
