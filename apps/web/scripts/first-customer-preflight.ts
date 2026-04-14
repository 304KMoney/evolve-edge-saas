import { runFirstCustomerLaunchPreflight } from "../lib/launch-preflight";

const result = runFirstCustomerLaunchPreflight();

console.log(`First-customer preflight: ${result.status.toUpperCase()}`);
console.log(`Environment: ${result.environment}`);

if (result.findings.length === 0) {
  console.log("No blocking findings detected.");
  process.exit(0);
}

for (const finding of result.findings) {
  console.log(
    `[${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}`
  );
}

process.exit(result.status === "pass" ? 0 : 1);
