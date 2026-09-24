# jev-pi-model-router

A [pi](https://pi.dev) extension. On every fresh user turn, [TypeSafe Jev](https://docs.typesafe.ai) judges
how hard the turn is, what kind of work it is and whether a mistake would be costly. The router then
switches pi to the cheapest model that is good enough, and **only ever picks from models pi can use**.

```text
you type ─► jev route ─► Jev: difficulty · kind · costly? ─► tier + specialty ─► first pi model in that pool ─► pi.setModel
```

Anything unsure, slow or broken keeps your current model. Routing never blocks a turn.

Companion to [jev-pi-orchestrator](https://github.com/damian87x/jev-pi-orchestrator), which uses Jev
to supervise conductor workers. The two are independent; install either or both.

## Install

```bash
# 1. the jev CLI (Python 3.9+, no dependencies), which asks Jev
git clone https://github.com/kerpopule/hermes-jev-skills ~/hermes-jev-skills && python3 ~/hermes-jev-skills/install.py
jev --help            # must be on PATH

# 2. this extension
pi install npm:jev-pi-model-router
# or: pi install git:github.com/damian87x/jev-pi-model-router
```

Jev key from the [console](https://console.typesafe.ai/settings/keys): `export TYPESAFE_API_KEY=...`
(or see hermes-jev-skills for its key store). Restart pi.

## Pools

Pools list models per tier (`simple`, `medium`, `hard`) and specialty (`general`, `coding`, `writing`,
`research`, `vision`). The router reads, first match wins:

1. `~/.config/jev/pi-routing.json`: your pi pools, in pi's `provider:model` names. Start from
   [`examples/pi-routing.json`](examples/pi-routing.json) and check names with `pi --list-models`.
2. The Hermes pools (`~/.config/jev/routing.json`, `~/.hermes/jev/routing.json`), as written by
   `jev models suggest --write`.

Before every routed turn it rewrites them into `~/.config/jev/pi-routing.effective.json`:

- Hermes provider names map to pi's: `openai` → `openai-codex`, `anthropic` → `claude-bridge`,
  `moonshot` → `kimi-coding`.
- Any model pi does not list as available is dropped (pi shows a one-time notice naming them), and an
  emptied pool falls through to `general`.

## Use

```text
/jev                  status
/jev routing shadow   decide and notify, do not switch (default)
/jev routing on       switch models
/jev routing off
```

Picking a model yourself with `/model` pins it: routing pauses until `/jev routing on`.
State lives in `~/.config/jev/pi-router.json`.

## What was fixed in 0.2

Pools written for Hermes named `openai:gpt-6-luna`, but pi calls that provider `openai-codex`, and
some pooled models (`gpt-5.3-codex`) do not exist in pi. Two of three tiers routed to models pi could
not find, so every such turn ended in "not available". The current model was also sent as
`provider/model` while pools use `provider:model`, so "already on this model" never matched.

## Privacy

`jev route` sends a redacted, clipped copy of the turn (or only coarse features for sensitive text) to
TypeSafe's API. See hermes-jev-skills for exactly what leaves the machine.

## Develop

```bash
npm test
```

MIT licensed.
