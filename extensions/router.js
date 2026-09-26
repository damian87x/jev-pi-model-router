import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apiKey, ask } from "../src/jev.mjs";
import { missing, usableModels } from "../src/pools.mjs";
import { classify, pick, prepare, QUESTIONS, risky, stickyKeep } from "../src/route.mjs";
import { applyCommand, loadState, onModelSelect, shouldRoute, shouldSwitch } from "../src/state.mjs";

const DIR = join(homedir(), ".pi", "agent", "jev-model-router");
const STATE = join(DIR, "state.json");
const POOLS = join(DIR, "pools.json"); // your pools; otherwise the package defaults
const DEFAULT_POOLS = join(dirname(fileURLToPath(import.meta.url)), "..", "pools.default.json");
const OLD_STATE = join(homedir(), ".config", "jev", "pi-router.json"); // 0.1/0.2 location

function readJson(path) {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function read() {
  const path = existsSync(STATE) ? STATE : OLD_STATE;
  try {
    return loadState(readFileSync(path, "utf8"));
  } catch {
    return loadState("");
  }
}

function write(state) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state)}\n`);
}

/** {config, source}: your pools file if it parses, else the shipped defaults. */
function loadPools() {
  const own = readJson(POOLS);
  if (own?.tiers) return { config: own, source: POOLS };
  return { config: readJson(DEFAULT_POOLS) || { tiers: {} }, source: "defaults" };
}

// A repeated instruction (a queued or scheduled turn) is judged once.
const answersCache = new Map();

async function judge(text, cwd) {
  if (answersCache.has(text)) return answersCache.get(text);
  const answers = await ask({ user_turn: text }, QUESTIONS, { key: apiKey(cwd) });
  answersCache.set(text, answers);
  if (answersCache.size > 256) answersCache.delete(answersCache.keys().next().value);
  return answers;
}

export default function (pi) {
  // Native subagents pin their model at launch; rerouting breaks model attestation.
  if (process.env.PI_SUBAGENT_CHILD === "1") return;

  let warned = false;
  let missingWarned = false;
  let ready = false;
  let applying = false;

  pi.registerCommand("jev", {
    description: "Jev model router: status, routing on|shadow|off",
    handler: async (args, ctx) => {
      const before = read();
      const next = applyCommand(before, args);
      if (next !== before) write(next);
      const model = ctx.model ? `${ctx.model.provider}:${ctx.model.id}` : "none";
      const { source } = loadPools();
      ctx.ui.notify(`Jev ${next.mode}${next.pinned ? " pinned" : ""} · ${model} · pools: ${source}`, "info");
    },
  });

  pi.on("session_start", async () => {
    ready = false;
  });

  pi.on("model_select", async (event) => {
    const state = read();
    const next = onModelSelect(state, { source: event.source, applying, ready });
    if (next !== state && next.pinned) write(next);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    ready = true;
    const state = read();
    const prompt = event.prompt || "";
    if (!shouldRoute(state) || !prompt.trim()) return;

    const { config } = loadPools();
    const models = usableModels(ctx.modelRegistry.getAvailable());
    const absent = missing(config.tiers, models);
    if (absent.length && !missingWarned) {
      missingWarned = true;
      ctx.ui.notify(`Jev router: pi cannot use ${absent.join(", ")}; skipped`, "info");
    }

    const current = ctx.model ? `${ctx.model.provider}:${ctx.model.id}` : "";
    let answers;
    try {
      answers = await judge(prepare(prompt, config.ask_chars), ctx.cwd || process.cwd());
    } catch (e) {
      if (!warned) {
        warned = true;
        ctx.ui.notify(`Jev router: no decision (${e.message}), kept current model`, "warning");
      }
      return;
    }

    const verdict = classify(answers, { risk: risky(prompt), config });
    if (verdict.keep) {
      if (state.mode === "shadow") ctx.ui.notify(`[Jev] kept ${current} · ${verdict.keep}`, "info");
      return;
    }
    const contextTokens = ctx.getContextUsage()?.tokens ?? 0;
    const picked = pick(config.tiers, models, {
      tier: verdict.tier,
      specialty: verdict.specialty,
      images: !!event.images?.length,
      contextTokens,
    });
    const label = `[Jev] ${verdict.tier} · ${verdict.specialty}`;
    if (!picked) {
      ctx.ui.notify(`${label} · no pi model fits, kept ${current}`, "info");
      return;
    }
    if (stickyKeep(ctx.model, models.get(picked), contextTokens, config)) {
      ctx.ui.notify(`${label} · large context, kept ${current}`, "info");
      return;
    }
    const [provider, modelId] = [picked.slice(0, picked.indexOf(":")), picked.slice(picked.indexOf(":") + 1)];
    const notice = `${label} → ${modelId} · confidence ${verdict.confidence.toFixed(2)}`;
    const decision = { routed: picked !== current, provider, model_id: modelId };
    if (!shouldSwitch(state, decision)) {
      if (state.mode === "shadow") ctx.ui.notify(notice, "info");
      return;
    }
    applying = true;
    let ok = false;
    try {
      ok = await pi.setModel(models.get(picked));
    } finally {
      applying = false;
    }
    ctx.ui.notify(ok ? notice : `${notice} · no auth, kept ${current}`, ok ? "info" : "warning");
  });
}
