// Pools for pi. Hermes pools use Hermes provider names and list models pi may not have,
// so `jev route` picked models pi could never switch to. Keep only what pi can call.

/** Hermes provider name -> pi provider name, tried only when the Hermes ref itself is not in pi. */
export const ALIASES = { openai: "openai-codex", anthropic: "claude-bridge", moonshot: "kimi-coding" };

/** One pool entry in pi terms, or null when pi has no such model. */
export function toPi(ref, available) {
  if (typeof ref !== "string" || !ref.includes(":")) return null;
  if (available.has(ref)) return ref;
  const [provider, model] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  const alias = ALIASES[provider] && `${ALIASES[provider]}:${model}`;
  return alias && available.has(alias) ? alias : null;
}

/** The routing config with every pool rewritten to pi refs; entries pi lacks are dropped. */
export function piConfig(config, available) {
  const tiers = {};
  const dropped = [];
  for (const [tier, pools] of Object.entries(config?.tiers || {})) {
    if (!pools || typeof pools !== "object") continue;
    tiers[tier] = {};
    for (const [name, listed] of Object.entries(pools)) {
      const kept = [];
      for (const ref of Array.isArray(listed) ? listed : []) {
        const mapped = toPi(ref, available);
        if (mapped) {
          if (!kept.includes(mapped)) kept.push(mapped);
        } else if (!dropped.includes(ref)) {
          dropped.push(ref);
        }
      }
      if (kept.length) tiers[tier][name] = kept;
    }
  }
  return { config: { ...config, tiers }, dropped };
}
