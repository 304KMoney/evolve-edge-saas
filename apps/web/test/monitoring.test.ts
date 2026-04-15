import assert from "node:assert/strict";
import { logServerEvent } from "../lib/monitoring";

function runMonitoringTests() {
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;
  const captured: Array<Record<string, unknown>> = [];

  console.info = (value?: unknown) => {
    captured.push(value as Record<string, unknown>);
  };
  console.warn = (value?: unknown) => {
    captured.push(value as Record<string, unknown>);
  };
  console.error = (value?: unknown) => {
    captured.push(value as Record<string, unknown>);
  };
  console.debug = (value?: unknown) => {
    captured.push(value as Record<string, unknown>);
  };

  process.env.LOG_LEVEL = "debug";

  try {
    logServerEvent("info", "monitoring.test", {
      requestId: "req_123",
      routingSnapshotId: "rs_123",
      organizationId: "org_123",
      userId: "user_123",
      workflowCode: "audit_scale",
      sourceSystem: "stripe",
      eventId: "evt_123",
      requestContext: {
        requestId: "req_123"
      },
      password: "super-secret",
      nested: {
        apiKey: "secret-key"
      }
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].event, "monitoring.test");
    assert.equal(captured[0].request_id, "req_123");
    assert.equal(captured[0].routing_snapshot_id, "rs_123");
    assert.equal(captured[0].org_id, "org_123");
    assert.equal(captured[0].user_id, "user_123");
    assert.equal(captured[0].workflow_code, "audit_scale");
    assert.equal(captured[0].source, "stripe");
    assert.equal(captured[0].route, null);
    assert.equal(captured[0].trace_id, null);
    assert.equal(captured[0].event_id, "evt_123");

    const metadata = captured[0].metadata as Record<string, unknown>;
    assert.equal(metadata.password, "[REDACTED]");
    assert.deepEqual(metadata.nested, {
      apiKey: "[REDACTED]"
    });
  } finally {
    delete process.env.LOG_LEVEL;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
  }

  console.log("monitoring tests passed");
}

runMonitoringTests();
