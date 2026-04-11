import assert from "node:assert/strict";
import {
  clampTimeoutMs,
  isProcessingClaimStale,
  isRetryableHttpStatus,
  normalizeExternalError
} from "../lib/reliability";

function runReliabilityTests() {
  {
    assert.equal(clampTimeoutMs(500), 1_000);
    assert.equal(clampTimeoutMs(120_000), 60_000);
    assert.equal(clampTimeoutMs(12_500), 12_500);
  }

  {
    assert.equal(isRetryableHttpStatus(429), true);
    assert.equal(isRetryableHttpStatus(503), true);
    assert.equal(isRetryableHttpStatus(400), false);
  }

  {
    const normalized = normalizeExternalError(
      new Error("Destination returned 429")
    );

    assert.equal(normalized.retryable, true);
    assert.equal(normalized.category, "rate_limit");
    assert.equal(normalized.statusCode, 429);
  }

  {
    const normalized = normalizeExternalError(
      new Error("AbortError: The operation timed out")
    );

    assert.equal(normalized.retryable, true);
    assert.equal(normalized.category, "timeout");
    assert.equal(normalized.isTimeout, true);
  }

  {
    const normalized = normalizeExternalError(
      new Error("HubSpot API error (401): unauthorized")
    );

    assert.equal(normalized.retryable, false);
    assert.equal(normalized.category, "auth");
    assert.equal(normalized.statusCode, 401);
  }

  {
    const stale = isProcessingClaimStale({
      processingStartedAt: new Date("2026-04-10T12:00:00.000Z"),
      now: new Date("2026-04-10T12:20:00.000Z"),
      staleAfterMs: 15 * 60 * 1000
    });
    const fresh = isProcessingClaimStale({
      processingStartedAt: new Date("2026-04-10T12:10:00.000Z"),
      now: new Date("2026-04-10T12:20:00.000Z"),
      staleAfterMs: 15 * 60 * 1000
    });

    assert.equal(stale, true);
    assert.equal(fresh, false);
  }

  console.log("reliability tests passed");
}

runReliabilityTests();
