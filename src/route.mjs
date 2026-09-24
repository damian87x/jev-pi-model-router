// Routing policy, pure. Jev answers three questions about a turn; code turns them into a pi model.
// Unsure or failed paths keep the current model. Ported from the policy the router used to shell out for.

export const TIERS = ["simple", "medium", "hard"];

export const QUESTIONS = {
  difficulty: {
    type: "score",
    instructions: "How demanding is it to complete this turn well?",
    criteria: [
      "Trivial or mechanical: a lookup, reformat, rename, short factual reply, or a single obvious step",
      "Routine: ordinary multi-step work with a clear path and low ambiguity",
      "Substantial: needs planning, several interacting parts, debugging, or careful judgment",
      "Expert: subtle, ambiguous, or high-stakes; architecture, security, concurrency, data migration, legal or money",
    ],
  },
  kind: {
    type: "choice",
    instructions: "What kind of work is this turn mainly?",
    criteria: {
      coding: "Writing, changing, debugging or reviewing software, scripts, configs or shell commands",
      writing: "Drafting or editing prose, marketing, messages, documents or creative text",
      research: "Finding, comparing or synthesizing information, analysis, or current events",
      general: "Conversation, planning, operations, or anything that is none of the others",
    },
  },
  costly_mistake: { type: "noul", instructions: "A wrong or sloppy answer here would be costly or hard to undo" },
};

export const DEFAULTS = {
  min_confidence: 0.6,
  simple_needs_confidence: 0.85,
  simple_needs_probability: 0.7, // P(trivial) before dropping to the cheapest tier
  hard_needs_probability: 0.6, // P(substantial or expert) before paying for the hard tier
  ask_chars: 2500,
  sticky_context_tokens: 32000, // above this, never switch to a cheaper model: the cache rebuild costs more
};

// Short prompts can still be dangerous. These never route to the cheapest tier.
const RISK =
  /\b(prod(uction)?|deploy|migrat\w+|rollback|drop\s+table|delete|rm\s+-rf|force[- ]push|secur\w+|vulnerab\w+|auth(entication|orization)?|encrypt\w*|concurren\w+|race condition|deadlock|payment|refund|invoice|stripe|billing|legal|contract|lawsuit|medical|diagnos\w+|customer data|pii|dns|certificate)\b/i;

export function risky(text) {
  return RISK.test(text || "");
}

const SECRETS = [
  /\b(sk|pk|rk|ghp|gho|github_pat|xox[abprs]|AKIA|AIza)[A-Za-z0-9_-]{8,}/g, // well-known key prefixes
  /\b(api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*\S+/gi, // assignments
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // emails
  /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9+/=_-])/g, // long tokens
  /(?<![\d.-])(?:\d[ -]?){12,18}\d(?![\d.-])/g, // card-like numbers
];

/** What Jev reads: secrets masked, long turns clipped to their opening and (mostly) their end. */
export function prepare(prompt, limit = DEFAULTS.ask_chars) {
  let text = prompt || "";
  for (const re of SECRETS) text = text.replace(re, "[redacted]");
  if (text.length <= limit) return text;
  const head = Math.floor(limit / 4);
  return `${text.slice(0, head)}\n[…]\n${text.slice(text.length - (limit - head))}`;
}

/** Jev's answers -> {tier, specialty} or {keep: reason}. `risk` is checked on the whole turn, not the clip. */
export function classify(answers, { risk = false, config = DEFAULTS } = {}) {
  const c = { ...DEFAULTS, ...config };
  const d = answers?.difficulty;
  const kind = answers?.kind;
  const stakes = Number(answers?.costly_mistake?.noul ?? 0);
  if (!d || typeof d.score !== "number") return { keep: "Jev gave no difficulty" };
  const confidence = Number(d.confidence ?? 0);
  const spread = d.probabilities || {};
  const p = (level) => Number(spread[level] ?? spread[String(level)] ?? 0);
  const hasSpread = Object.keys(spread).length > 0;
  const pSimple = hasSpread ? p(0) : Number(d.score < 0.5);
  const pHard = hasSpread ? p(2) + p(3) : Number(d.score >= 2.25);

  // An unsure answer averages to mid-rubric by arithmetic; it must never buy the hard tier.
  const unsure = confidence < c.min_confidence;
  if (unsure && !(risk || stakes > 0.6)) return { keep: `low confidence ${confidence.toFixed(2)}` };

  let tier = "medium";
  if (!unsure && pHard >= c.hard_needs_probability) tier = "hard";
  else if (!unsure && pSimple >= c.simple_needs_probability && confidence >= c.simple_needs_confidence) tier = "simple";
  if (tier === "simple" && (risk || stakes > 0.4)) tier = "medium";
  if (!unsure && stakes > 0.85 && pHard >= 0.35) tier = "hard";

  const specialty = kind && Number(kind.confidence ?? 0) >= 0.5 && typeof kind.choice === "string" ? kind.choice : "general";
  return { tier, specialty, confidence, stakes };
}

/**
 * First model in the pools that pi can call and that fits the turn. Walks the tier, then higher tiers
 * (never down); in each tier tries vision (when there are images), the specialty, then general.
 * `models` maps "provider:id" -> pi Model, holding only models pi has auth for.
 */
export function pick(pools, models, { tier, specialty, images = false, contextTokens = 0 }) {
  const start = Math.max(0, TIERS.indexOf(tier));
  for (const t of TIERS.slice(start)) {
    const tierPools = pools?.[t];
    if (!tierPools || typeof tierPools !== "object") continue;
    const names = [...(images ? ["vision"] : []), specialty, "general"];
    for (const name of names) {
      for (const ref of Array.isArray(tierPools[name]) ? tierPools[name] : []) {
        const m = models.get(ref);
        if (!m) continue;
        if (images && !(m.input || []).includes("image")) continue;
        if (m.contextWindow && contextTokens * 1.25 > m.contextWindow) continue;
        return ref;
      }
    }
  }
  return null;
}

/** Keep the current model when a big context would be rebuilt on a cheaper one. Unknown prices never block. */
export function stickyKeep(current, picked, contextTokens, config = DEFAULTS) {
  if (!current || !picked || current === picked) return false;
  if (contextTokens <= (config.sticky_context_tokens ?? DEFAULTS.sticky_context_tokens)) return false;
  const a = current.cost?.input;
  const b = picked.cost?.input;
  return a > 0 && b > 0 && b < a;
}
