import assert from "node:assert/strict";
import {
  requireWorkflowCallbackSecret,
  requireWorkflowWritebackSecret
} from "../lib/workflow-callback-secrets";

function runWorkflowCallbackSecretsTests() {
  const originalCallbackSecret = process.env.N8N_CALLBACK_SECRET;
  const originalCallbackSharedSecret = process.env.N8N_CALLBACK_SHARED_SECRET;
  const originalWritebackSecret = process.env.N8N_WRITEBACK_SECRET;

  try {
    delete process.env.N8N_CALLBACK_SHARED_SECRET;
    delete process.env.N8N_WRITEBACK_SECRET;
    process.env.N8N_CALLBACK_SECRET = "callback_secret";
    assert.equal(requireWorkflowCallbackSecret(), "callback_secret");
    assert.equal(requireWorkflowWritebackSecret(), "callback_secret");

    process.env.N8N_CALLBACK_SHARED_SECRET = "shared_callback_secret";
    assert.equal(requireWorkflowCallbackSecret(), "shared_callback_secret");
    assert.equal(requireWorkflowWritebackSecret(), "shared_callback_secret");

    process.env.N8N_WRITEBACK_SECRET = "writeback_secret";
    assert.equal(requireWorkflowWritebackSecret(), "writeback_secret");
  } finally {
    if (originalCallbackSecret === undefined) {
      delete process.env.N8N_CALLBACK_SECRET;
    } else {
      process.env.N8N_CALLBACK_SECRET = originalCallbackSecret;
    }

    if (originalCallbackSharedSecret === undefined) {
      delete process.env.N8N_CALLBACK_SHARED_SECRET;
    } else {
      process.env.N8N_CALLBACK_SHARED_SECRET = originalCallbackSharedSecret;
    }

    if (originalWritebackSecret === undefined) {
      delete process.env.N8N_WRITEBACK_SECRET;
    } else {
      process.env.N8N_WRITEBACK_SECRET = originalWritebackSecret;
    }
  }

  console.log("workflow-callback-secrets tests passed");
}

runWorkflowCallbackSecretsTests();
