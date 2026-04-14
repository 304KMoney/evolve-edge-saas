import assert from "node:assert/strict";
import { ReportStatus } from "@evolve-edge/db";
import {
  canUseSignedReportAccess,
  createSignedReportAccessToken,
  verifySignedReportAccessToken,
  shouldRequireAuthenticatedReportAccessWhenSigned
} from "../lib/report-access";

function runReportAccessTests() {
  const originalSecret = process.env.REPORT_DOWNLOAD_SIGNING_SECRET;
  const originalRequireAuth = process.env.REPORT_DOWNLOAD_REQUIRE_AUTH;
  const originalVercelEnv = process.env.VERCEL_ENV;

  process.env.REPORT_DOWNLOAD_SIGNING_SECRET = "test-report-download-secret";
  process.env.REPORT_DOWNLOAD_REQUIRE_AUTH = "true";
  process.env.VERCEL_ENV = "production";

  try {
    const token = createSignedReportAccessToken({
      reportId: "report_123",
      organizationId: "org_123",
      expiresAt: new Date(Date.now() + 60_000)
    });

    assert.deepEqual(verifySignedReportAccessToken(token), {
      reportId: "report_123",
      organizationId: "org_123",
      expiresAt: verifySignedReportAccessToken(token).expiresAt,
      purpose: "download"
    });

    assert.equal(shouldRequireAuthenticatedReportAccessWhenSigned(), true);

    process.env.REPORT_DOWNLOAD_REQUIRE_AUTH = "";
    assert.equal(shouldRequireAuthenticatedReportAccessWhenSigned(), true);
    assert.equal(
      canUseSignedReportAccess({
        status: ReportStatus.DELIVERED,
        deliveredAt: null
      }),
      true
    );
    assert.equal(
      canUseSignedReportAccess({
        status: ReportStatus.READY,
        deliveredAt: new Date("2026-04-12T12:00:00.000Z")
      }),
      true
    );
    assert.equal(
      canUseSignedReportAccess({
        status: ReportStatus.READY,
        deliveredAt: null
      }),
      false
    );

    assert.throws(
      () => verifySignedReportAccessToken(`${token}tampered`),
      /Invalid report access token signature/
    );

    const expiredToken = createSignedReportAccessToken({
      reportId: "report_123",
      organizationId: "org_123",
      expiresAt: new Date(Date.now() - 5_000)
    });

    assert.throws(
      () => verifySignedReportAccessToken(expiredToken),
      /expired/
    );
  } finally {
    process.env.REPORT_DOWNLOAD_SIGNING_SECRET = originalSecret;
    process.env.REPORT_DOWNLOAD_REQUIRE_AUTH = originalRequireAuth;
    process.env.VERCEL_ENV = originalVercelEnv;
  }

  console.log("report access tests passed");
}

runReportAccessTests();
