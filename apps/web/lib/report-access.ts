import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { ReportStatus } from "@evolve-edge/db";
import { getReportDownloadSigningSecret, isSignedReportAuthEnforced } from "./runtime-config";

type SignedReportTokenPayload = {
  reportId: string;
  organizationId: string;
  expiresAt: string;
  purpose: "download";
};

function encodeTokenSegment(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeTokenSegment(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", getReportDownloadSigningSecret())
    .update(payload)
    .digest("base64url");
}

export function createSignedReportAccessToken(input: {
  reportId: string;
  organizationId: string;
  expiresAt: Date;
}) {
  const payload = JSON.stringify({
    reportId: input.reportId,
    organizationId: input.organizationId,
    expiresAt: input.expiresAt.toISOString(),
    purpose: "download"
  } satisfies SignedReportTokenPayload);
  const encodedPayload = encodeTokenSegment(payload);
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySignedReportAccessToken(token: string): SignedReportTokenPayload {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    throw new Error("Invalid report access token.");
  }

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(providedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new Error("Invalid report access token signature.");
  }

  const payload = JSON.parse(
    decodeTokenSegment(encodedPayload)
  ) as Partial<SignedReportTokenPayload>;

  if (
    !payload.reportId ||
    !payload.organizationId ||
    !payload.expiresAt ||
    payload.purpose !== "download"
  ) {
    throw new Error("Invalid report access token payload.");
  }

  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    throw new Error("Report access token has expired.");
  }

  return payload as SignedReportTokenPayload;
}

export function shouldRequireAuthenticatedReportAccessWhenSigned() {
  return isSignedReportAuthEnforced();
}

export function canUseSignedReportAccess(input: {
  status: ReportStatus;
  deliveredAt?: Date | null;
}) {
  return (
    input.status === ReportStatus.DELIVERED ||
    input.deliveredAt instanceof Date
  );
}
