import assert from "node:assert/strict";
import { DEMO_SAMPLE_ORGANIZATIONS } from "@evolve-edge/db";
import {
  getDemoModeConfig,
  getDemoPresentationGuide,
  shouldBlockDemoExternalSideEffects
} from "../lib/demo-mode";

function runDemoModeTests() {
  delete process.env.AUTH_MODE;
  delete process.env.DEMO_MODE_ENABLED;
  delete process.env.DEMO_EXTERNAL_SIDE_EFFECTS;
  delete process.env.DEMO_RESET_COMMAND;

  let config = getDemoModeConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.source, "auth");
  assert.equal(shouldBlockDemoExternalSideEffects(), true);

  process.env.AUTH_MODE = "password";
  process.env.DEMO_MODE_ENABLED = "false";

  config = getDemoModeConfig();
  assert.equal(config.enabled, false);
  assert.equal(config.source, "none");

  process.env.DEMO_MODE_ENABLED = "true";
  process.env.DEMO_EXTERNAL_SIDE_EFFECTS = "true";
  process.env.DEMO_RESET_COMMAND = "pnpm custom-demo-reset";

  config = getDemoModeConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.source, "flag");
  assert.equal(config.allowExternalSideEffects, true);
  assert.equal(config.resetCommand, "pnpm custom-demo-reset");

  const guide = getDemoPresentationGuide();
  assert.equal(guide.workspaces.length, DEMO_SAMPLE_ORGANIZATIONS.length);
  assert.ok(guide.steps.length >= 4);
  assert.equal(
    new Set(DEMO_SAMPLE_ORGANIZATIONS.map((workspace) => workspace.slug)).size,
    DEMO_SAMPLE_ORGANIZATIONS.length
  );

  delete process.env.AUTH_MODE;
  delete process.env.DEMO_MODE_ENABLED;
  delete process.env.DEMO_EXTERNAL_SIDE_EFFECTS;
  delete process.env.DEMO_RESET_COMMAND;

  console.log("demo-mode tests passed");
}

runDemoModeTests();
