import assert from "node:assert/strict";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  classifySecuritySurface,
  isTrustedOriginRequest
} from "../lib/http-security";

function runHttpSecurityTests() {
  const productionCsp = buildContentSecurityPolicy();
  assert.match(productionCsp, /default-src 'self'/);
  assert.match(productionCsp, /object-src 'none'/);
  assert.doesNotMatch(productionCsp, /unsafe-eval/);

  const developmentCsp = buildContentSecurityPolicy({ isDevelopment: true });
  assert.match(developmentCsp, /unsafe-eval/);

  assert.equal(classifySecuritySurface("/dashboard"), "private");
  assert.equal(classifySecuritySurface("/api/billing/checkout"), "api");
  assert.equal(classifySecuritySurface("/pricing"), "public");

  const privateHeaders = buildSecurityHeaders({ pathname: "/dashboard" });
  assert.equal(privateHeaders["Cache-Control"], "no-store, private, max-age=0, must-revalidate");
  assert.equal(privateHeaders["X-Robots-Tag"], "noindex, nofollow, noarchive");

  const previewPublicHeaders = buildSecurityHeaders({
    pathname: "/pricing",
    isPreview: true
  });
  assert.equal(previewPublicHeaders["X-Robots-Tag"], "noindex, nofollow");

  assert.equal(
    isTrustedOriginRequest({
      requestUrl: "https://app.example.com/api/billing/checkout",
      originHeader: "https://app.example.com",
      refererHeader: null
    }),
    true
  );

  assert.equal(
    isTrustedOriginRequest({
      requestUrl: "https://preview.example.com/api/billing/checkout",
      originHeader: "https://www.example.com",
      refererHeader: null,
      allowedOrigins: ["https://www.example.com"]
    }),
    true
  );

  assert.equal(
    isTrustedOriginRequest({
      requestUrl: "https://app.example.com/api/billing/checkout",
      originHeader: "https://evil.example",
      refererHeader: null
    }),
    false
  );

  console.log("http-security tests passed");
}

runHttpSecurityTests();
