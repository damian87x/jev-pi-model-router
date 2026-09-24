import assert from "node:assert/strict";
import test from "node:test";
import { piConfig, toPi } from "../src/pools.mjs";

// What pi 0.85 lists on this machine, and the Hermes pools that sent it to models it lacks.
const available = new Set(["openai-codex:gpt-6-luna", "openai-codex:gpt-6-sol", "openai-codex:gpt-5.3-codex-spark", "xai:grok-4.7"]);
const hermes = {
  min_confidence: 0.6,
  tiers: {
    simple: { general: ["openai:gpt-6-luna"] },
    medium: { coding: ["xai:grok-4.7"] },
    hard: { coding: ["openai:gpt-5.3-codex", "openai:gpt-5.3-codex-spark", "openai:gpt-6-sol"], vision: ["openai:gpt-5.3-codex"] },
  },
};

test("Hermes provider names map to pi's, but only to models pi has", () => {
  assert.equal(toPi("openai:gpt-6-luna", available), "openai-codex:gpt-6-luna");
  assert.equal(toPi("xai:grok-4.7", available), "xai:grok-4.7");
  assert.equal(toPi("openai:gpt-5.3-codex", available), null);
  assert.equal(toPi("no-colon", available), null);
});

test("pools keep order, drop what pi lacks, and keep the other settings", () => {
  const { config, dropped } = piConfig(hermes, available);
  assert.deepEqual(config.tiers.simple.general, ["openai-codex:gpt-6-luna"]);
  assert.deepEqual(config.tiers.hard.coding, ["openai-codex:gpt-5.3-codex-spark", "openai-codex:gpt-6-sol"]);
  assert.equal(config.tiers.hard.vision, undefined, "an emptied pool is removed so jev falls through to general");
  assert.deepEqual(dropped, ["openai:gpt-5.3-codex"]);
  assert.equal(config.min_confidence, 0.6);
});

test("nothing is ever routed outside what pi can call", () => {
  const { config } = piConfig(hermes, available);
  for (const pools of Object.values(config.tiers)) {
    for (const refs of Object.values(pools)) for (const ref of refs) assert.ok(available.has(ref), ref);
  }
});
