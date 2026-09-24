import assert from "node:assert/strict";
import test from "node:test";
import { ask } from "../src/jev.mjs";

test("posts state and questions to System One and returns answers", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return { ok: true, json: async () => ({ answers: { x: { type: "noul", noul: 0.9 } } }) };
  };
  const answers = await ask({ user_turn: "hi" }, { x: { type: "noul", instructions: "?" } }, { key: "k", fetchImpl });
  assert.equal(answers.x.noul, 0.9);
  assert.match(seen.url, /\/v1\/systemone$/);
  assert.equal(seen.auth, "Bearer k");
  assert.deepEqual(seen.body.state, { user_turn: "hi" });
});

test("failures become short codes, never a switch", async () => {
  await assert.rejects(ask({}, {}, { key: "" }), /no_key/);
  await assert.rejects(ask({}, {}, { key: "k", fetchImpl: async () => ({ ok: false, status: 401 }) }), /http_401/);
  await assert.rejects(ask({}, {}, { key: "k", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /malformed/);
});
