import assert from "node:assert/strict";
import test from "node:test";
import { missing, usableModels } from "../src/pools.mjs";

const m = (provider, id) => ({ provider, id, input: ["text"], contextWindow: 272000 });

test("only models pi reports, minus forbidden providers", () => {
  const models = usableModels([m("openai-codex", "gpt-6-luna"), m("claude-bridge", "claude-opus-5"), m("github-copilot", "gpt-6-sol")]);
  assert.deepEqual([...models.keys()], ["openai-codex:gpt-6-luna"]);
});

test("pool entries pi cannot use are named once", () => {
  const models = usableModels([m("xai", "grok-4.7")]);
  const pools = { medium: { general: ["xai:grok-4.7", "openai:gpt-5.3-codex"], coding: ["openai:gpt-5.3-codex"] } };
  assert.deepEqual(missing(pools, models), ["openai:gpt-5.3-codex"]);
});
