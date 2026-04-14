import assert from "node:assert/strict";
import {
  ValidationError,
  expectObject,
  readOptionalEnumValue,
  readOptionalStringArray,
  readRequiredString,
  readValidatedNumberFromSearchParams
} from "../lib/security-validation";

function runSecurityValidationTests() {
  assert.deepEqual(expectObject({ ok: true }), { ok: true });

  assert.throws(
    () => expectObject([], "payload"),
    /payload must be a JSON object/
  );

  assert.equal(
    readRequiredString({ name: " Lawson Health " }, "name"),
    "Lawson Health"
  );

  assert.throws(
    () => readRequiredString({ name: "" }, "name"),
    /name is required/
  );

  assert.deepEqual(
    readOptionalStringArray(
      { frameworks: [" HIPAA ", "SOC 2"] },
      "frameworks",
      { maxItems: 5, maxItemLength: 20 }
    ),
    ["HIPAA", "SOC 2"]
  );

  assert.throws(
    () => readOptionalStringArray({ frameworks: ["", 12] }, "frameworks"),
    /frameworks\[0\] must be a non-empty string/
  );

  assert.equal(
    readOptionalEnumValue(
      { role: "admin" },
      "role",
      ["admin", "analyst", "client_viewer"] as const
    ),
    "admin"
  );

  assert.throws(
    () =>
      readOptionalEnumValue(
        { role: "owner" },
        "role",
        ["admin", "analyst", "client_viewer"] as const
      ),
    /role must be one of: admin, analyst, client_viewer/
  );

  assert.equal(
    readValidatedNumberFromSearchParams({
      searchParams: new URLSearchParams("limit=120"),
      field: "limit",
      defaultValue: 10,
      min: 1,
      max: 100
    }),
    100
  );

  assert.throws(
    () =>
      readValidatedNumberFromSearchParams({
        searchParams: new URLSearchParams("limit=abc"),
        field: "limit",
        defaultValue: 10,
        min: 1,
        max: 100
      }),
    ValidationError
  );

  console.log("security validation tests passed");
}

runSecurityValidationTests();
