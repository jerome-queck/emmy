# Orientation and private integrity

## User route

Run `help --json`, `catalog`, and `doctor`. Global `--root` selects public source; `--home` selects private state. Default home is the root's ignored `.local/`. Help lists the metadata-defined commands and actual option/exit contracts. Only `catalog`, `doctor`, `maintain`, `reconcile`, `dispatch` and `probe` load public inventory. Other commands retain their own file, private-state and authority checks without requiring that unrelated catalog. `node --test test/agent-local.test.mjs` drives help and pinned automation plans with absent and corrupt catalogs, unchanged input bytes and no new register; a wrong input hash still refuses. All six catalog consumers still refuse missing inventory.

Doctor validates bindings, immutable hashes, referenced records/evidence, retained historical records, generated references, and per-responsibility restore suspension. Missing bindings remain an empty local inventory. Native access and global inventory completeness remain unverified.

## Source and drive

`scripts/agent.mjs`, `src/catalog.mjs`, `src/maintenance.mjs`, `src/metadata.mjs`, `src/records.mjs`, `src/responsibilities.mjs`, and `src/work.mjs` own this route. Full scenario `orientation` drives actual help, doctor in an isolated repository, catalog, removed command rejection, and unknown options. Other scenarios test corruption and restored doctor state.

## Boundaries

A public catalog entry does not bind a host/path or establish access. Own private project and host keys matter; inherited object keys are not registration. Historical old records retain reported assurance and never become live state automatically. Public generation reads catalog, metadata and the approved guidance documents, including the sign-in skill. `--root` does not change the briefing command's canonical public origin.

Doctor exposes cooperative queue summaries, restored suspension and unresolved turn health. Pending escalation remains undelivered. It never interprets a sleeping process as suspended.

Doctor also exposes fleet source/coverage age, pending/uncertain alerts and unfinished pure publication intents. `needsAssessment` requires a fleet assessment to persist newly stale sources; a read-only doctor does not claim it created or sent an alert.

Pure canonical/hash helpers now live in `src/content.mjs`; strict JSON parsing lives in `src/strict-json.mjs`. Existing record and bounded-file modules retain compatibility re-exports. Ownership changed; declared parsing and reconciliation semantics remain unchanged.
