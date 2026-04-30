import assert from "node:assert/strict";
import { shouldUsePreviewGuestSession } from "../lib/auth";

function runAuthPreviewPolicyTests() {
  assert.equal(
    shouldUsePreviewGuestSession({
      requestPath: "/dashboard",
      previewGuestAccessEnabled: true
    }),
    true
  );

  assert.equal(
    shouldUsePreviewGuestSession({
      requestPath: "/dashboard/reports?view=latest",
      previewGuestAccessEnabled: true
    }),
    true
  );

  assert.equal(
    shouldUsePreviewGuestSession({
      requestPath: "/pricing",
      previewGuestAccessEnabled: true
    }),
    false
  );

  assert.equal(
    shouldUsePreviewGuestSession({
      requestPath: "/dashboard",
      previewGuestAccessEnabled: false
    }),
    false
  );

  console.log("auth-preview-policy tests passed");
}

runAuthPreviewPolicyTests();
