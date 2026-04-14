import assert from "node:assert/strict";
import {
  getReportGenerationFailureClassification,
  logReportGenerationFailure,
  logReportGenerationValidationFallback
} from "../lib/report-generation-monitoring";

function runReportGenerationMonitoringTests() {
  const originalWarn = console.warn;
  const originalError = console.error;
  const captured: Array<Record<string, unknown>> = [];

  console.warn = (value?: unknown) => {
    captured.push(value as Record<string, unknown>);
  };
  console.error = (value?: unknown) => {
    captured.push(value as Record<string, unknown>);
  };

  process.env.LOG_LEVEL = "debug";

  try {
    assert.equal(
      getReportGenerationFailureClassification("routing"),
      "report_generation.routing_failed"
    );
    assert.equal(
      getReportGenerationFailureClassification("persistence"),
      "report_generation.persistence_failed"
    );
    assert.equal(
      getReportGenerationFailureClassification("downstream_sync"),
      "report_generation.downstream_sync_failed"
    );

    logReportGenerationValidationFallback({
      organizationId: "org_123",
      userId: "user_123",
      assessmentId: "asm_123",
      analysisJobId: "job_123",
      requestContext: {
        requestId: "req_123"
      }
    });

    logReportGenerationFailure({
      organizationId: "org_123",
      userId: "user_123",
      assessmentId: "asm_123",
      routingDecisionId: "route_123",
      workflowCode: "report_pipeline.scale",
      stage: "routing",
      requestContext: {
        requestId: "req_456"
      },
      error: new Error("Routing persistence failed")
    });

    assert.equal(captured.length, 2);
    assert.equal(captured[0].event, "report.generate.validation_fallback");
    assert.equal(captured[0].request_id, "req_123");
    assert.equal(captured[0].resource_id, "asm_123");

    const fallbackMetadata = captured[0].metadata as Record<string, unknown>;
    assert.equal(
      fallbackMetadata.classification,
      "report_generation.validation_fallback"
    );

    assert.equal(captured[1].event, "report.generate.failed");
    assert.equal(captured[1].request_id, "req_456");
    assert.equal(captured[1].resource_id, "asm_123");
    assert.equal(captured[1].routing_snapshot_id, "route_123");
    assert.equal(captured[1].workflow_code, "report_pipeline.scale");

    const failureMetadata = captured[1].metadata as Record<string, unknown>;
    assert.equal(
      failureMetadata.classification,
      "report_generation.routing_failed"
    );
    assert.equal(failureMetadata.stage, "routing");
    assert.equal(failureMetadata.message, "Routing persistence failed");
  } finally {
    delete process.env.LOG_LEVEL;
    console.warn = originalWarn;
    console.error = originalError;
  }

  console.log("report-generation-monitoring tests passed");
}

runReportGenerationMonitoringTests();
