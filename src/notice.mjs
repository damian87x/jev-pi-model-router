// One line per turn for every Jev extension. Notices raised while pi prepares a turn are queued in a
// process-wide list; the first agent_start handler to run prints them together. Shared by
// jev-pi-model-router and jev-pi-skills (each keeps its own copy of this file).
const KEY = Symbol.for("jev.pi.notices");

function queue() {
  globalThis[KEY] ??= [];
  return globalThis[KEY];
}

export function queueNotice(text, level = "info") {
  if (text) queue().push({ text, level });
}

/** Everything queued, joined into one line; the worst level wins. Empties the queue. */
export function takeNotice() {
  const items = queue().splice(0);
  if (!items.length) return null;
  const level = items.some((i) => i.level === "error") ? "error" : items.some((i) => i.level === "warning") ? "warning" : "info";
  return { text: items.map((i) => i.text).join("  ·  "), level };
}

export function flushNotice(ctx) {
  const n = takeNotice();
  if (n) ctx.ui.notify(n.text, n.level);
}
