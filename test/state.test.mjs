import assert from "node:assert/strict";
import test from "node:test";
import { applyCommand, loadState, onModelSelect, pin, shouldRoute, shouldSwitch } from "../src/state.mjs";

test("missing state is shadow and unpinned", () => {
  assert.deepEqual(loadState(""), { mode: "shadow", pinned: false });
});

test("routing on clears a pin and switches only then", () => {
  const on = applyCommand(pin(loadState("")), "routing on");
  assert.equal(shouldRoute(on), true);
  assert.equal(shouldSwitch(on, { routed: true, provider: "xai", model_id: "grok" }), true);
  assert.equal(shouldSwitch(on, { routed: false, provider: "xai", model_id: "grok" }), false);
});

test("a manual model pick pauses routing", () => {
  const pinned = pin(applyCommand(loadState(""), "on"));
  assert.equal(shouldRoute(pinned), false);
});

test("off never routes", () => {
  assert.equal(shouldRoute(applyCommand(loadState(""), "off")), false);
});

test("startup model select does not pin", () => {
  const state = applyCommand(loadState(""), "on");
  assert.equal(onModelSelect(state, { source: "set", applying: false, ready: false }).pinned, false);
});

test("our own switch does not pin", () => {
  const state = applyCommand(loadState(""), "on");
  assert.equal(onModelSelect(state, { source: "set", applying: true, ready: true }).pinned, false);
});

test("runtime setModel after routing on does not pin", () => {
  const state = applyCommand(loadState(""), "on");
  assert.equal(onModelSelect(state, { source: "set", applying: false, ready: true }).pinned, false);
});

test("a later manual pick pins", () => {
  const state = applyCommand(loadState(""), "on");
  assert.equal(onModelSelect(state, { source: "cycle", applying: false, ready: true }).pinned, true);
});
