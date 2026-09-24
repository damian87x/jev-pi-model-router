import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { piConfig } from "../src/pools.mjs";
import { applyCommand, loadState, onModelSelect, shouldRoute, shouldSwitch } from "../src/state.mjs";

const JEV_DIR = join(homedir(), ".config", "jev");
const STATE = join(JEV_DIR, "pi-router.json");
// Your own pi pools, if you want them. Otherwise the Hermes pools, rewritten to what pi has.
const PI_POOLS = join(JEV_DIR, "pi-routing.json");
const EFFECTIVE = join(JEV_DIR, "pi-routing.effective.json");

function read() {
  try {
    return loadState(readFileSync(STATE, "utf8"));
  } catch {
    return loadState("");
  }
}

function write(state) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state)}\n`);
}

function readJson(path) {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** Same layering as jevkit's load_config: shared file first, a Hermes profile's own file last. */
function sourceConfig() {
  const own = readJson(PI_POOLS);
  if (own) return own;
  const home = process.env.HERMES_HOME || join(homedir(), ".hermes");
  const root = basename(dirname(home)) === "profiles" ? dirname(dirname(home)) : home;
  const paths = [join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "jev", "routing.json"), join(root, "jev", "routing.json")];
  if (home !== root) paths.push(join(home, "jev", "routing.json"));
  let config = null;
  for (const path of paths) {
    const layer = readJson(path);
    if (!layer) continue;
    const tiers = { ...(config?.tiers || {}), ...(layer.tiers && typeof layer.tiers === "object" ? layer.tiers : {}) };
    config = { ...(config || {}), ...layer, tiers };
  }
  return config;
}

/** Writes the pi-only pools for `jev route`; returns what pi could not use. */
function writePiPools(modelRegistry) {
  const source = sourceConfig();
  if (!source) return null;
  const available = new Set(modelRegistry.getAvailable().map((m) => `${m.provider}:${m.id}`));
  const { config, dropped } = piConfig(source, available);
  const text = `${JSON.stringify(config, null, 2)}\n`;
  let old = "";
  try {
    old = readFileSync(EFFECTIVE, "utf8");
  } catch {}
  if (old !== text) {
    mkdirSync(JEV_DIR, { recursive: true });
    writeFileSync(EFFECTIVE, text);
  }
  return dropped;
}

function ask(payload, poolsReady) {
  return new Promise((resolve) => {
    const env = poolsReady ? { ...process.env, JEV_ROUTING_CONFIG: EFFECTIVE } : process.env;
    const child = spawn("jev", ["route", "--timeout", "2.5"], { stdio: ["pipe", "pipe", "ignore"], env });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 3500);
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve(null);
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export default function (pi) {
  let warned = false;
  let droppedWarned = false;
  let ready = false;
  let applying = false;

  pi.registerCommand("jev", {
    description: "Jev model router: status, routing on|shadow|off",
    handler: async (args, ctx) => {
      const before = read();
      const next = applyCommand(before, args);
      if (next !== before) write(next);
      const state = next;
      const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none";
      ctx.ui.notify(`Jev ${state.mode}${state.pinned ? " pinned" : ""} · ${model}`, "info");
    },
  });

  pi.on("session_start", async () => {
    ready = false;
  });

  pi.on("model_select", async (event) => {
    const next = onModelSelect(read(), { source: event.source, applying, ready });
    if (next !== read() && next.pinned) write(next);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    ready = true;
    const state = read();
    if (!shouldRoute(state) || !event.prompt?.trim()) return;
    const current = ctx.model ? `${ctx.model.provider}:${ctx.model.id}` : "";
    let dropped = null;
    try {
      dropped = writePiPools(ctx.modelRegistry);
    } catch {}
    if (dropped?.length && !droppedWarned) {
      droppedWarned = true;
      ctx.ui.notify(`Jev router: pi has no ${dropped.join(", ")}; left out of routing`, "info");
    }
    const decision = await ask({
      prompt: event.prompt,
      current,
      context_tokens: ctx.getContextUsage()?.tokens ?? 0,
      has_images: !!event.images?.length,
    }, dropped !== null);
    if (!decision) {
      if (!warned) {
        warned = true;
        ctx.ui.notify("Jev router: no decision, kept current model", "warning");
      }
      return;
    }
    if (!shouldSwitch(state, decision)) {
      if (state.mode === "shadow") ctx.ui.notify(decision.notice || decision.reason, "info");
      return;
    }
    const model = ctx.modelRegistry.find(decision.provider, decision.model_id);
    if (!model) {
      ctx.ui.notify(`${decision.notice} · not available`, "warning");
      return;
    }
    applying = true;
    let ok = false;
    try {
      ok = await pi.setModel(model);
    } finally {
      applying = false;
    }
    ctx.ui.notify(ok ? decision.notice : `${decision.notice} · no auth, kept ${current}`, ok ? "info" : "warning");
  });
}
