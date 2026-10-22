# Orientation and inventory

## Sub-features

Public catalog and JSON help. Read-only doctor. Scoped normalized and native Codex inventory imports. Timestamped briefs preserve gaps, observer, and reported basis.

## How to get to it (user POV)

Run `npm run agent -- doctor`, `help --json`, or `catalog`. Import `examples/snapshot.json` or a combined native result shaped like `examples/native-codex.json` using `snapshot --import <file>`. Read it with `brief --snapshot <id> --as-of <UTC>`.

## Driving it with the CLI driver

Run `npm run verify:behavior`. Scenarios `orientation` and `scoped-inventory` exercise actual JSON parsing, help coverage, current references, private bindings, normalized and native imports, stale briefs, malformed timestamps, and immutable record readback. Evidence includes commands, exit codes, returned scope, gaps, observation age, and the retained record.

## Gotchas

Examples are incomplete on purpose. A recent thread listing excludes older or archived chats. Preserve missing pages and unavailable hosts. An imported report is not authenticated provider output. Doctor cannot prove a machine is online. A brief remains scoped even when it names several projects.
