# Upkeep and public boundaries

## Sub-features

One command metadata table. One verification metadata source. Deterministic CLI reference, catalog, feature index, and machine-readable mapping. Drift checks preserve research dates and formal review records.

## How to get to it (user POV)

Run `npm run agent -- maintain --check` at session start. After an authorized source change, run `maintain --write`, inspect the generated diff, update feature instructions, and run `npm run check`. Apply both installed pstack maintenance workflows after covered changes.

## Driving it with the CLI driver

Run `npm run verify:behavior`. Scenarios `derived-drift`, `public-isolation`, and `review-record-stable` introduce a stale generated reference, check exit 3, regenerate it, and check deterministic replay. Private snapshots and bindings change without altering generated public bytes. Catalog research dates and the formal coverage record must remain byte-identical.

## Gotchas

Maintenance is a generator and drift detector. It cannot replace independent source reading, native driving, or formal assumption review. Never advance `sourceCommit` or covered hashes just to pass. Keep private paths and native identities under ignored `.local/`. Public metadata must be intentionally sanitized. A formal source change needs reviewed mapping and replayed mutants before its sync record moves.
