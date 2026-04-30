import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const serverOnlyShim = path.join(process.cwd(), "scripts", "shims", "server-only.js");

const tests = [
  "test/customer-runs.test.ts",
  "test/customer-accounts.test.ts",
  "test/operator-safeguards.test.ts",
  "test/authority-content.test.ts",
  "test/executive-delivery.test.ts",
  "test/report-review.test.ts",
  "test/continuous-monitoring.test.ts",
  "test/conversion-funnel.test.ts",
  "test/reliability.test.ts",
  "test/engagement-programs.test.ts",
  "test/evidence.test.ts",
  "test/framework-intelligence.test.ts",
  "test/roles.test.ts",
  "test/authorization.test.ts",
  "test/billing-admin.test.ts",
  "test/runtime-config.test.ts",
  "test/monitoring.test.ts",
  "test/jobs.test.ts",
  "test/report-generation-monitoring.test.ts",
  "test/audit-lifecycle.test.ts",
  "test/report-builder.test.ts",
  "test/executive-briefing.test.ts",
  "test/report-access.test.ts",
  "test/report-view-model.test.ts",
  "test/security-validation.test.ts",
  "test/demo-mode.test.ts",
  "test/audit-intake.test.ts",
  "test/signup.test.ts",
  "test/checkout-handoff.test.ts",
  "test/kpi-dashboard.test.ts",
  "test/account-timeline.test.ts",
  "test/event-replay.test.ts",
  "test/operations-queues.test.ts",
  "test/operations-findings.test.ts",
  "test/subscription-domain.test.ts",
  "test/entitlements.test.ts",
  "test/plan-enforcement.test.ts",
  "test/usage-quotas.test.ts",
  "test/stripe-lifecycle.test.ts",
  "test/product-surface.test.ts",
  "test/integration-contracts.test.ts",
  "test/dify-adapter.test.ts",
  "test/ai-execution-provider.test.ts",
  "test/openai-langgraph-provider.test.ts",
  "test/ai-execution-contracts.test.ts",
  "test/risk-scoring.test.ts",
  "test/ai-execute-route.test.ts",
  "test/ai-execute-route-auth.test.ts",
  "test/ai-execution-worker.test.ts",
  "test/audit-execution.test.ts",
  "test/ai-load-scaling.test.ts",
  "test/data-retention.test.ts",
  "test/workflow-observability.test.ts",
  "test/audit-workflow-checkpoints.test.ts",
  "test/workflow-trace-route.test.ts",
  "test/workflow-routing.test.ts",
  "test/commercial-catalog.test.ts",
  "test/commercial-routing.test.ts",
  "test/workflow-dispatch.test.ts",
  "test/site-sync-reference.test.ts",
  "test/delivery-state.test.ts",
  "test/delivery-reconciliation.test.ts",
  "test/delivery-mismatch-detection.test.ts",
  "test/ai-feedback.test.ts"
];

for (const test of tests) {
  const result = spawnSync(
    process.execPath,
    [tsxCli, "--require", serverOnlyShim, test],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: false
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
