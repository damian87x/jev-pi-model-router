// The one Jev call, straight to TypeSafe. The key is never logged or shown.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const BASE = (process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai").replace(/\/+$/, "");
const MODEL = process.env.JEV_MODEL || "jev-1.13.0";
export const PI_KEY_FILE = join(homedir(), ".pi", "agent", "secrets", "typesafe_api_key");

function dotenvKey(start) {
  let dir = start;
  for (;;) {
    const path = join(dir, ".env");
    if (existsSync(path)) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        const m = /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
        if (m) return m[1].replace(/^['"]|['"]$/g, "");
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return "";
    dir = parent;
  }
}

/** TYPESAFE_API_KEY env, then the nearest .env, then pi's secrets file. Same order as jev-pi-orchestrator. */
export function apiKey(cwd = process.cwd()) {
  const key = (process.env.TYPESAFE_API_KEY || "").trim() || dotenvKey(cwd);
  if (key) return key;
  try {
    return readFileSync(PI_KEY_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

/** Ask Jev; returns the answers object or throws an Error whose message is a short code. */
export async function ask(state, questions, { key, timeoutMs = 3000, fetchImpl = fetch } = {}) {
  if (!key) throw new Error("no_key");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${BASE}/v1/systemone`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "jev-pi-model-router",
      },
      body: JSON.stringify({ state, questions, model: MODEL }),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const body = await res.json();
    if (!body || typeof body.answers !== "object") throw new Error("malformed");
    return body.answers;
  } catch (e) {
    throw new Error(e?.name === "AbortError" ? "timeout" : e?.message || "transport");
  } finally {
    clearTimeout(timer);
  }
}
