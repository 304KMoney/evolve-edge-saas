import { loadScriptEnv } from "./load-script-env";
import { getIntegrationStatusSnapshot } from "../lib/integration-status";

loadScriptEnv();

const snapshot = getIntegrationStatusSnapshot();

console.log("Integration status");
console.log(`Environment: ${snapshot.environment}`);
console.log(
  "Scope: wiring snapshot only. This command does not verify live credentials, webhook registration, endpoint reachability, or third-party dashboard state."
);

for (const integration of snapshot.integrations) {
  console.log(`\n[${integration.label}]`);
  console.log(
    `${integration.configured ? "CONFIGURED" : integration.required ? "MISSING" : "OPTIONAL"} ${integration.key}`
  );

  for (const note of integration.notes) {
    console.log(`  ${note}`);
  }
}

const requiredMissing = snapshot.integrations.filter(
  (integration) => integration.required && !integration.configured
).length;

console.log("\nSummary");
console.log(
  `Required integrations configured: ${snapshot.integrations.filter((integration) => integration.required && integration.configured).length}`
);
console.log(`Required integrations missing: ${requiredMissing}`);
console.log(
  requiredMissing === 0
    ? "Go/No-Go: Wiring snapshot passed. Continue with preflight and live verification."
    : "Go/No-Go: Wiring snapshot incomplete. Fix required integrations before launch."
);
