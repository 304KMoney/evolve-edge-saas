import { getEnvironmentParityStatus } from "../lib/env-validation";
import { getRuntimeEnvironment } from "../lib/runtime-config";

const status = getEnvironmentParityStatus();
const grouped = new Map<string, typeof status>();

for (const entry of status) {
  const list = grouped.get(entry.category) ?? [];
  list.push(entry);
  grouped.set(entry.category, list);
}

console.log(`Environment parity audit`);
console.log(`Runtime: ${getRuntimeEnvironment()}`);
console.log(`Output: presence only (no secret values)`);

let requiredMissing = 0;
let requiredConfigured = 0;

for (const [category, entries] of grouped.entries()) {
  console.log(`\n[${category}]`);
  for (const entry of entries) {
    const prefix = entry.configured ? "SET" : entry.required ? "MISSING" : "OPTIONAL";
    if (entry.required) {
      if (entry.configured) {
        requiredConfigured += 1;
      } else {
        requiredMissing += 1;
      }
    }

    console.log(`${prefix.padEnd(8)} ${entry.key}`);
    if (entry.notes) {
      console.log(`         ${entry.notes}`);
    }
  }
}

console.log(`\nSummary`);
console.log(`Required set: ${requiredConfigured}`);
console.log(`Required missing: ${requiredMissing}`);
console.log(requiredMissing === 0 ? "Go/No-Go: GO" : "Go/No-Go: NO-GO");
