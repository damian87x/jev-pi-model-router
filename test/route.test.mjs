import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { usableModels } from "../src/pools.mjs";
import { classify, pick, prepare, risky, stickyKeep } from "../src/route.mjs";

const score = (spread, confidence = 0.9) => ({
  type: "score", confidence, probabilities: spread,
  score: Object.entries(spread).reduce((s, [k, v]) => s + Number(k) * v, 0),
});
const kind = (choice, confidence = 0.9) => ({ type: "choice", choice, confidence });
const noul = (v) => ({ type: "noul", noul: v });

test("a confident trivial turn is simple; a likely-hard one is hard", () => {
  assert.equal(classify({ difficulty: score({ 0: 0.9, 1: 0.1 }), kind: kind("coding"), costly_mistake: noul(0.1) }).tier, "simple");
  assert.equal(classify({ difficulty: score({ 1: 0.3, 2: 0.4, 3: 0.3 }), kind: kind("general"), costly_mistake: noul(0.3) }).tier, "hard");
  assert.equal(classify({ difficulty: score({ 1: 0.8, 2: 0.2 }), kind: kind("general"), costly_mistake: noul(0.2) }).tier, "medium");
});

test("risk words and costly mistakes lift simple to medium, never to hard", () => {
  const easy = { difficulty: score({ 0: 0.95, 1: 0.05 }, 0.95), kind: kind("coding"), costly_mistake: noul(0.1) };
  assert.equal(classify(easy, { risk: true }).tier, "medium");
  assert.equal(classify({ ...easy, costly_mistake: noul(0.5) }).tier, "medium");
});

test("an unsure harmless turn keeps the model; an unsure risky one gets medium", () => {
  const unsure = { difficulty: score({ 1: 0.5, 2: 0.5 }, 0.3), kind: kind("general"), costly_mistake: noul(0.1) };
  assert.ok(classify(unsure).keep);
  assert.equal(classify(unsure, { risk: true }).tier, "medium");
});

test("a low-confidence kind falls back to general", () => {
  assert.equal(classify({ difficulty: score({ 1: 1 }), kind: kind("writing", 0.3), costly_mistake: noul(0) }).specialty, "general");
});

test("pick walks specialty, general, then higher tiers, and never down", () => {
  const models = usableModels([
    { provider: "openai-codex", id: "gpt-6-luna", input: ["text", "image"], contextWindow: 272000 },
    { provider: "xai", id: "grok-4.7", input: ["text", "image"], contextWindow: 500000 },
    { provider: "openai-codex", id: "gpt-5.3-codex-spark", input: ["text"], contextWindow: 128000 },
  ]);
  const pools = {
    simple: { general: ["openai-codex:gpt-6-luna"] },
    medium: { general: ["xai:grok-4.7"] },
    hard: { coding: ["openai-codex:gpt-5.3-codex-spark"], general: ["xai:grok-4.7"] },
  };
  assert.equal(pick(pools, models, { tier: "simple", specialty: "coding" }), "openai-codex:gpt-6-luna");
  assert.equal(pick(pools, models, { tier: "hard", specialty: "coding" }), "openai-codex:gpt-5.3-codex-spark");
  // images: spark has none, so hard/coding falls to hard/general
  assert.equal(pick(pools, models, { tier: "hard", specialty: "coding", images: true }), "xai:grok-4.7");
  // context too big for spark (128k) -> next that fits
  assert.equal(pick(pools, models, { tier: "hard", specialty: "coding", contextTokens: 200000 }), "xai:grok-4.7");
  // a model pi lacks is skipped, the tier above is used
  assert.equal(pick({ simple: { general: ["openai:gpt-5.3-codex"] }, medium: pools.medium }, models, { tier: "simple", specialty: "general" }), "xai:grok-4.7");
  assert.equal(pick({ simple: pools.simple }, models, { tier: "hard", specialty: "general" }), null);
});

test("shipped default pools use only pi provider names", () => {
  const pools = JSON.parse(readFileSync(new URL("../pools.default.json", import.meta.url), "utf8")).tiers;
  for (const refs of Object.values(pools).flatMap((p) => Object.values(p))) {
    for (const ref of refs) assert.match(ref, /^(openai-codex|xai|kimi-coding|ollama):/, ref);
  }
});

test("secrets are masked and long turns keep the end", () => {
  const out = prepare("deploy with key sk-abcdefghijklmnop and mail me@x.com");
  assert.ok(!out.includes("sk-abcdefghijklmnop") && !out.includes("me@x.com"), out);
  const long = prepare("some words ".repeat(300) + "THE ASK", 2500);
  assert.ok(long.endsWith("THE ASK") && long.length < 2600);
  assert.ok(risky("drop table users in production") && !risky("rename x to count"));
});

test("a big context never switches to a cheaper model", () => {
  const dear = { cost: { input: 5 } }, cheap = { cost: { input: 0.5 } };
  assert.equal(stickyKeep(dear, cheap, 50000), true);
  assert.equal(stickyKeep(dear, cheap, 1000), false);
  assert.equal(stickyKeep({ cost: { input: 0 } }, cheap, 50000), false);
});
