# Task-only runner selection

The dedicated `run-task-agent` caller reads one task-only selection. Consumers keep invoking the same installed path, for example `run-task-agent task-workflow --file <absolute-envelope.json>`. They pass no candidate path. Existing `run-agent`, `run-briefing`, guidance pins, reporting launchers and `installed-runners/current` remain separate.

This is a caller implementation. It does not install itself or establish ordinary installed adoption. Directly invoking a candidate or this repository's script remains explicit candidate execution until the caller is separately installed and its ordinary consumer is observed.

## Fixed caller binding

The immutable caller binding is an ordinary JSON file. `scripts/task-agent.mjs --binding <absolute-binding.json> <command> [options]` consumes it. The supported stable shell launcher is rendered by `taskCallerLauncher({runtime, caller, binding})` from `src/task-runner.mjs`. Its fixed paths name the bootstrap Node executable, this adapter's `scripts/task-agent.mjs`, and the binding. It shell-quotes paths and clears `NODE_OPTIONS` and `NODE_PATH` before starting Node.

The binding has exactly these fields:

```json
{
  "schemaVersion": 1,
  "privateHome": "/absolute/task-only-home",
  "baseline": {
    "sourceRoot": "/absolute/baseline-source",
    "sourceManifest": "/absolute/baseline-source-manifest.json",
    "sourceManifestSha256": "<64 lowercase hex characters>",
    "revision": "<40 lowercase hex characters>",
    "runtime": "/absolute/ordinary-node-executable",
    "runtimeSha256": "<64 lowercase hex characters>"
  }
}
```

`privateHome` must already exist. Paths must be normalized absolute paths with ordinary ancestors. The baseline is explicit and independent of the shared `current` alias. A baseline without `task-workflow` returns its original unknown-command refusal. The caller never upgrades it silently.

## Task-only selection

`<privateHome>/task-runner.json` has exactly `schemaVersion: 1` and `target`. `target` has the same fields as `baseline`. The selected source uses the binding's exact `privateHome`. No home or source override is accepted through ordinary command arguments.

| Selection state | Caller behavior |
| --- | --- |
| Selection file absent | Verify and invoke the explicit baseline. |
| Selection present and valid | Verify and invoke its exact target. |
| Selection malformed, unreadable, symbolic, incomplete or corrupt | Refuse before starting a child. |
| Selected dependency absent | Refuse. Do not fall back. |
| Child refuses, exits, signals or cannot start | Retain that result. Do not fall back or retry. |

Only `doctor`, `dispatch` and `task-workflow` are allowed. Their existing options and `--json` are accepted. Unknown, duplicate, `--home`, `--root`, `--binding`, and `--option=value` forms refuse. The caller adds fixed `--home` and `--root` arguments. Child stdout is unchanged. Child exit codes survive. A signalled child produces an explicit stderr receipt and exit `128 + signal number`. SIGINT and SIGTERM received by the caller are forwarded to its child.

Before spawning, stderr receives one JSON `task-runner-selection` receipt. It records the source revision/root, source manifest digest, runtime digest, binding/selection digest, fixed home, verification clock, and `execution: "not-yet-started"`. This receipt is a successful sequential verification, not evidence that a child consumed the source or that native execution occurred. The original child output, observed exit, and downstream native evidence remain separate. All receipts keep `accepted: false`.

## Source manifest

Each target's hashed manifest has exactly `schemaVersion: 1`, `revision`, `privateHome`, and `files`. Each file has exactly a safe relative `path`, SHA-256 `sha256`, and integer `bytes`. The installer supplies the complete committed source inventory, including the entry point, imports, catalog, docs and package metadata. Files remain the original candidate bytes. The separate manifest does not alter the candidate revision.

The reader verifies every declared file, rejects missing entry points, and requires every on-disk file under `src/`, `scripts/`, `registry/`, `docs/`, `.agents/` and an existing `procedures/` to appear in the manifest. Known catalog, package and doctor guidance/generated-data paths must be present. It rejects symbolic files/directories, duplicate paths, traversal, oversized files, unknown fields and version mismatches. Inventories are bounded at 2,000 files, 8 MiB per file and 64 MiB total. Manifest files are bounded at 2 MiB; bindings and selections at 16 KiB. The runtime is an ordinary executable file bounded at 256 MiB and checked against its exact SHA-256.

The manifest and revision are trusted installer declarations. Hash equality does not prove that the manifest is a complete Git commit, that arbitrary imported code stays within it, that the selected binary is Node 24+, or that the operator has authority. Independent installation review must compare the complete exported inventory to the exact Git tree and review its imports. The current task CLI uses its committed `src/` and `scripts/` modules; the caller does not parse JavaScript or sandbox a selected program. No arbitrary selected revision is safe merely because hashes match.

## Installation and rollback prerequisites

Installation requires a separately authorized owner for the stable caller/binding, selection, baseline/candidate source, bootstrap/selected runtimes and selected private home. Retain exact prior bytes or absence and readbacks for these specific items. Do not obtain a home-wide quiet interval or interrupt independent work merely to install this separate caller.

1. Export the reviewed adapter and each reviewed target from exact full Git revisions to separate immutable ordinary directories. Produce the complete source manifests outside those exports. Compare all file bytes with their original Git trees. Preserve the original candidate revision separately from the adapter's revision.
2. Verify Node 24+ and exact executable hashes, including the bootstrap runtime that starts the selector. Independently verify the adapter's full source, binding and launcher. The selector cannot establish the integrity of code/runtime already executing itself.
3. Prepare an existing task-only private home and its existing supported bindings/evidence. The caller writes no state. Any required canonical import or migration remains a separate proposal. The task home is part of both source manifests; changing it requires new approved manifests/binding.
4. Render `taskCallerLauncher` with the approved fixed bootstrap runtime, adapter script and binding. Install that launcher once at the chosen stable task-only path. Bind only the intended ordinary task workflow to that same path through its supported consumer configuration. Preserve the consumer's prior configuration. Do not change shared launchers or `current`.
5. Rehearse rollback in a separate home. With no selection, invoke the verified baseline through the same stable launcher. Add the candidate selection, verify consumption, remove it and verify baseline consumption. Before a live selection update, coordinate only the exact owners of affected immutable artifacts and in-flight task callers. Preserve an uncertain in-flight result; selection rollback does not undo a child or native effect.
6. Publish or restore the task-only selection using the owner's supported atomic file replacement under that bounded ownership interval. Read back exact bytes. To roll back, restore the retained prior selection bytes or absence, then invoke the same launcher and verify the expected source/runtime/home receipt and original child result. Restore the consumer's prior configuration if removing the new caller. Keep compatible adapter/runtime/source bytes until outstanding consumers finish.

There is no selection writer, lock, lease or administrative authority API here. The reader rereads binding and selection bytes after source verification to catch visible drift. Reads, hashing and spawn are sequential. They are not an atomic snapshot and do not exclude concurrent replacement after verification. Trusted immutable artifacts and accountable owner exclusion are installation prerequisites. Content equality or an idle view is not exclusion.

Actual adoption acceptance stays separate. The parent must rediscover the original objective/attempt before any native creation, retain the exact original envelope, caller invocation clocks/stdout/stderr/exit, source receipt, rendered prompt, byte-equal native request, pre-call marker, native response, saved membership, progress and independent criterion verdict. Existing task-workflow uncertainty and authority gates still apply.

## Verification

Run `node --test test/task-runner.test.mjs` and `node scripts/verify-behavior.mjs --focus task-runner`, then `npm run check`. The mapped drive invokes one stable shell launcher in fresh processes, verifies baseline and selected real task-workflow output, preserves exit 3 and rediscovery-only uncertainty, rejects overrides/invalid selection, and verifies unchanged independent shared configuration. Fixtures use labelled synthetic revision declarations. Original requests, stdout/stderr, exits, launcher, binding and manifests survive temporary-root cleanup.

The existing finite discovery/coordination and publication mappings do not cover this separate process/configuration boundary. No canonical journal writer or formal semantics change. Source/hash records refresh only after covered-diff review. Source/runtime authenticity, hostile filesystem races, installation, native creation, provider access and ordinary installed adoption remain outside these synthetic checks.
