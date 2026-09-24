// Pools come from pi only: your pools file, or the defaults shipped with this package,
// always filtered to models pi reports as available.

/** Never route here: Copilot is not a pi provider; the Claude bridge is a flag risk. */
export const FORBIDDEN = new Set(["github-copilot", "claude-bridge", "anthropic"]);

/** pi's available models keyed "provider:id", minus forbidden providers. */
export function usableModels(available) {
  const out = new Map();
  for (const m of available || []) {
    if (m && !FORBIDDEN.has(m.provider)) out.set(`${m.provider}:${m.id}`, m);
  }
  return out;
}

/** Pool entries pi cannot use, so they can be named once instead of silently skipped. */
export function missing(pools, models) {
  const out = [];
  for (const tierPools of Object.values(pools || {})) {
    for (const refs of Object.values(tierPools || {})) {
      for (const ref of Array.isArray(refs) ? refs : []) {
        if (!models.has(ref) && !out.includes(ref)) out.push(ref);
      }
    }
  }
  return out;
}
