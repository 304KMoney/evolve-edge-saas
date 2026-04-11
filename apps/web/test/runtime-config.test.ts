import assert from "node:assert/strict";
import { getOptionalJsonEnv } from "../lib/runtime-config";

function runRuntimeConfigTests() {
  delete process.env.TEST_JSON_ENV;

  assert.equal(getOptionalJsonEnv("TEST_JSON_ENV"), null);

  process.env.TEST_JSON_ENV = '{"enabled":true}';
  assert.deepEqual(getOptionalJsonEnv<{ enabled: boolean }>("TEST_JSON_ENV"), {
    enabled: true
  });

  process.env.TEST_JSON_ENV = "{bad json";

  assert.throws(
    () => getOptionalJsonEnv("TEST_JSON_ENV"),
    /Environment variable TEST_JSON_ENV contains invalid JSON/
  );

  delete process.env.TEST_JSON_ENV;

  console.log("runtime-config tests passed");
}

runRuntimeConfigTests();
