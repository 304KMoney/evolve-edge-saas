import { loadScriptEnv } from "./load-script-env";
import { getFirstCustomerLaunchEnvironmentChecklist } from "../lib/launch-preflight";

loadScriptEnv();

const checklist = getFirstCustomerLaunchEnvironmentChecklist();
let requiredConfigured = 0;
let requiredMissing = 0;
let optionalConfigured = 0;
let optionalMissing = 0;

console.log(`First-customer env status`);
console.log(`Environment: ${checklist.environment}`);
console.log(
  "Scope: configuration coverage only. This command does not verify live third-party connectivity, webhook registration, or operator access."
);

for (const group of checklist.groups) {
  console.log(`\n[${group.name}]`);

  for (const entry of group.entries) {
    if (entry.required) {
      if (entry.configured) {
        requiredConfigured += 1;
      } else {
        requiredMissing += 1;
      }
    } else if (entry.configured) {
      optionalConfigured += 1;
    } else {
      optionalMissing += 1;
    }

    const prefix = entry.configured ? "SET" : entry.required ? "MISSING" : "OPTIONAL";
    console.log(`${prefix.padEnd(8)} ${entry.key}`);
    if (entry.notes) {
      console.log(`         ${entry.notes}`);
    }
  }
}

console.log("\nSummary");
console.log(`Required set: ${requiredConfigured}`);
console.log(`Required missing: ${requiredMissing}`);
console.log(`Optional set: ${optionalConfigured}`);
console.log(`Optional missing: ${optionalMissing}`);

if (requiredMissing > 0) {
  console.log(
    "\nGo/No-Go: NO-GO for first-customer launch until every required item above is set."
  );
} else {
  console.log(
    "\nGo/No-Go: Config check passed. Continue with pnpm preflight:first-customer, then complete live verification for Stripe, n8n, signed report access, and operator console access."
  );
}
