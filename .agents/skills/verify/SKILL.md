---
name: verify
description: Drive Emmy's real local CLI after changes to commands, routing, snapshots, receipts, storage, or generated references. Retain observable behavior evidence.
---

# Verify Emmy

## Launch

Use Node 24 or later. No install, database, server, account, or API key is required. Run `npm run agent -- help --json`. A usable instance returns `ok: true` with ten commands. Each drive starts a separate Node process.

## Doctor

Run `npm run agent -- doctor`. Exit 0 confirms the runtime, public catalog, parseable private bindings, and current generated references. Missing bindings are reported as zero bound projects. They do not prevent catalog or probe use. Doctor does not test Dot access.

## Drive

Read [the feature map](features/README.md). Run `npm run verify:behavior`. The script calls the actual `scripts/agent.mjs` in isolated temporary repositories. It supplies public example-shaped fixtures and private bindings. Every command, exit code, JSON response, immutable packet, and resulting artifact is checked. No external service is contacted. The driver also checks command sentinels, replay, concurrent publication, interruption recovery, and content corruption.

For a focused manual journey, follow `docs/onboarding.md` using `.local/` for all runtime records. Use `node scripts/agent.mjs` to capture one JSON object without npm's banner. A `plan` exit 3 is expected when the designated executor needs observation. Never weaken the required observation to make that journey pass.

## Evidence

The driver retains full command arguments, stdout, stderr, exit codes, scenario results, and cleanup status in `.local/verification/behavior-*/report.json`. Successful runs include every scenario declared in `src/metadata.mjs`. Failed attempts remain there too. Capture action and output together. Inspect the actual `packet.md`, records, and artifact bytes. A passing internal unit check alone is insufficient.

An `assessment` can support declared criteria using observed local bytes or attributed reports. It cannot prove native dispatch, credentials, Dot installation, schedules, merges, deployment, or account permissions. The public generator takes only public catalog and metadata. Runtime snapshots are deliberately absent from it.

## Cleanup

The driver removes only the temporary repository it created, including child-process scratch state. It waits for or terminates its own processes. It preserves `.local/verification/behavior-*/report.json` outside the temporary root and records whether the root was removed. Interrupted publication leaves recognizable `.pending-*` directories, which are never read as final records. Replaying publication recovers the same final content ID. Remove an abandoned test root only after retaining its evidence.

## Helpers

Run `node scripts/verify-behavior.mjs` or `npm run verify:behavior`. Run `npm run check` for behavior, formal verification, and reference drift. Use the installed `pstack:maintain-verification-skill` workflow after feature changes. The generator updates indexes. Independent source readers must maintain the four feature instructions.
