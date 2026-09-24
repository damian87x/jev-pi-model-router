export function loadState(raw) {
  try {
    const data = JSON.parse(raw);
    const mode = data.mode === "on" || data.mode === "off" || data.mode === "shadow" ? data.mode : "shadow";
    return { mode, pinned: !!data.pinned };
  } catch {
    return { mode: "shadow", pinned: false };
  }
}

export function applyCommand(state, text) {
  const cmd = (text || "").trim();
  if (cmd === "on" || cmd === "routing on") return { mode: "on", pinned: false };
  if (cmd === "off" || cmd === "routing off") return { mode: "off", pinned: false };
  if (cmd === "shadow" || cmd === "routing shadow") return { mode: "shadow", pinned: false };
  return state;
}

export function pin(state) {
  return { ...state, pinned: true };
}

/** Startup and our own setModel both emit source "set". Only a later user pick pins. */
export function onModelSelect(state, { source, applying, ready }) {
  if (applying || !ready) return state;
  if (source === "set" || source === "cycle") return pin(state);
  return state;
}

export function shouldRoute(state) {
  return state.mode !== "off" && !state.pinned;
}

export function shouldSwitch(state, decision) {
  return state.mode === "on" && !!decision?.routed && !!decision.provider && !!decision.model_id;
}
