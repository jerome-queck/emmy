# Routing and proposals

## Sub-features

Local Codex default for coding. Exact designated host and project binding. Explicit Codex Cloud environment and authority. Immutable task packets. Proposed onboarding with eight Dot probes.

## How to get to it (user POV)

Fill `.local/bindings.json` from `examples/bindings.json`. Prepare a current request and snapshot. Run `npm run agent -- plan --request <file> --snapshot <id> --as-of <UTC>`. Read the returned `packet.md`. Run `probe --nonce <fresh-value>` for onboarding or add `--id <probe>` for one prompt.

## Driving it with the CLI driver

Run `npm run verify:behavior`. Scenarios `local-proposal`, `unavailable-host`, `explicit-cloud`, `immutable-publication`, and `probe-packet` verify exact identity, ready and unavailable routes, long-tail private projects, own-key project and host registration, cloud authority, proposal headings, idempotent replay, concurrent publication, interruption recovery, altered packet-byte and record corruption rejection, and probe content. Read actual files alongside JSON output. Sentinels must show no executor commands ran.

## Gotchas

Missing bindings or partial, foreign, future, or stale observations cannot make a route ready. A missing Mac never silently selects another Mac or cloud. Ready means ready to propose native dispatch. Every packet is `proposal-only`. Cloud coding needs a reason and explicit cloud authority. Probe packets do not install instructions or run probes.

Inherited object keys do not register projects or hosts. Explicitly registered `constructor` project and host IDs remain valid. The driver reads and replays their retained task records.
