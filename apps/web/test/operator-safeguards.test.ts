import assert from "node:assert/strict";
import {
  requireOperatorConfirmation,
  validateOperatorReason
} from "../lib/operator-safeguards";

function runOperatorSafeguardsTests() {
  {
    const reason = validateOperatorReason("Retry after confirming HubSpot auth was restored.");
    assert.match(reason, /HubSpot auth/);
  }

  {
    assert.throws(() => validateOperatorReason("short"), /operator reason/i);
  }

  {
    const confirmation = requireOperatorConfirmation("retry", "RETRY");
    assert.equal(confirmation, "RETRY");
  }

  {
    assert.throws(() => requireOperatorConfirmation("GO", "RETRY"), /Type RETRY/i);
  }

  console.log("operator-safeguards tests passed");
}

runOperatorSafeguardsTests();
