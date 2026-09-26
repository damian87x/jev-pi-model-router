import assert from "node:assert/strict";
import test from "node:test";
import { flushNotice, queueNotice, takeNotice } from "../src/notice.mjs";

test("notices from several extensions print as one line, once", () => {
  takeNotice();
  queueNotice("[Jev] hard · general → gpt-6-sol · confidence 0.90");
  queueNotice("[Jev] skills: lavish 0.97");
  const shown = [];
  const ctx = { ui: { notify: (text, level) => shown.push([text, level]) } };
  flushNotice(ctx);
  flushNotice(ctx); // the second extension's agent_start finds nothing left
  assert.deepEqual(shown, [["[Jev] hard · general → gpt-6-sol · confidence 0.90  ·  [Jev] skills: lavish 0.97", "info"]]);
});

test("the worst level wins and empty text is ignored", () => {
  takeNotice();
  queueNotice("");
  assert.equal(takeNotice(), null);
  queueNotice("a");
  queueNotice("b", "warning");
  assert.deepEqual(takeNotice(), { text: "a  ·  b", level: "warning" });
});
