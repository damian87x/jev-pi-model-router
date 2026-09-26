import assert from "node:assert/strict";
import test from "node:test";
import router from "../extensions/router.js";

test("native subagents retain their launch-pinned model", () => {
  const old = process.env.PI_SUBAGENT_CHILD;
  const hooks = [];
  const pi = {
    registerCommand(name) { hooks.push(name); },
    on(name) { hooks.push(name); },
  };
  try {
    process.env.PI_SUBAGENT_CHILD = "1";
    router(pi);
    assert.deepEqual(hooks, []);
    delete process.env.PI_SUBAGENT_CHILD;
    router(pi);
    assert.ok(hooks.includes("before_agent_start"));
  } finally {
    if (old === undefined) delete process.env.PI_SUBAGENT_CHILD;
    else process.env.PI_SUBAGENT_CHILD = old;
  }
});
