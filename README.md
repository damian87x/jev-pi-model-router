# jev-pi-model-router

A [pi](https://pi.dev) extension. On every fresh user turn, [TypeSafe Jev](https://docs.typesafe.ai) judges
how hard the turn is, what kind of work it is and whether a mistake would be costly. The router then
switches pi to the first model in that tier's pool that **pi can actually use** and that fits the turn
(images, context size).

```text
you type ─► Jev (one call, ~$0.0001): difficulty · kind · costly? ─► tier + specialty ─► pool ─► pi.setModel
```

Pure pi: it calls Jev's API directly and reads pi's own model registry. No other CLI or agent needed.
Anything unsure, slow or broken keeps your current model. Routing never blocks a turn.

Companion to [jev-pi-orchestrator](https://github.com/damian87x/jev-pi-orchestrator), which uses Jev
to supervise conductor workers. The two are independent.

## Install

```bash
pi install npm:jev-pi-model-router
```

Jev key from the [console](https://console.typesafe.ai/settings/keys), first match wins:
`TYPESAFE_API_KEY` env, then `TYPESAFE_API_KEY=` in the nearest `.env`, then
`~/.pi/agent/secrets/typesafe_api_key` (`chmod 600`). Restart pi, then `/jev routing on`.

## Use

```text
/jev                  status and which pools are in use
/jev routing shadow   decide and notify, do not switch (default)
/jev routing on       switch models
/jev routing off
```

`/jev routing on` stays on. Only the model-cycle key pins your pick; runtime switches do not.
State: `~/.pi/agent/jev-model-router/state.json`.

## Pools

Tiers are `simple`, `medium`, `hard`; specialties are `general`, `coding`, `writing`, `research`,
`vision`. Names are pi's `provider:model` (see `pi --list-models`). The shipped
[`pools.default.json`](pools.default.json):

| tier | models, in order |
|---|---|
| simple | `openai-codex:gpt-6-luna`, `openai-codex:gpt-5.6-luna` |
| medium | `xai:grok-4.7`, `xai:grok-4.6` |
| hard | `openai-codex:gpt-6-sol`, then `gpt-6-astra` (general) or `xai:grok-4.6` (coding) |

To use your own, copy it to `~/.pi/agent/jev-model-router/pools.json` and edit. The same file can
override the thresholds (`min_confidence`, `hard_needs_probability`, `simple_needs_probability`,
`simple_needs_confidence`, `sticky_context_tokens`, `ask_chars`).

On each turn the router walks the tier's specialty pool, then `general`, then higher tiers (never lower).
It skips any model pi does not list as available, and names skipped entries once. It never picks
`claude-bridge`, `anthropic` or `github-copilot`. A context above 32k tokens never switches to a
cheaper model, because rebuilding the cache costs more than it saves.

## Privacy

Jev reads a copy of the turn with keys, tokens, emails and card-like numbers masked, clipped to 2,500
characters (the opening and, mostly, the end). Nothing else from the session is sent. Risk words
(production, migration, billing, auth…) are checked locally on the whole turn and keep it off the
cheapest tier.

## History

- 0.3: talks to Jev directly and reads pi's registry. Earlier versions shelled out to a `jev` CLI that
  read pools written for a different agent host, with provider names pi does not use
  (`openai:*` instead of `openai-codex:*`) and models pi does not have. Two of three tiers ended in
  "not available".

## Develop

```bash
npm test
```

MIT licensed.
