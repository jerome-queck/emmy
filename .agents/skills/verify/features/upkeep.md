# Upkeep and recovery

## User route

Run `maintain --check` at session start. After public metadata changes, run `maintain --write`, inspect derived files, and run the aggregate check. Metadata owns commands, feature map, scenario names, and property IDs. Maintenance preserves research dates and formal sync records.

Use `backup --to <archive>` to pin and validate immutable records, referenced evidence bytes, historical records, and private bindings. Use `restore --from <archive> --into <new-home>`. Existing destinations, unsafe paths, symlinks, missing files, corrupt bytes, and invalid references are refused.

A restored home has a new epoch. Fresh target, authority, task, and schedule observations must name it. Byte inspection is available during suspension; local-check execution and work proposals wait. Original failures and stable effect keys survive. Unrelated inbox files, verification output, and repository checkouts are outside the archive.

## Source and drive

`records.mjs` owns immutable publication, dependency-first import order, archive manifests, and restore. `maintenance.mjs` derives public references. Scenarios `archive-recovery`, `publication-interruption`, and `derived-boundaries` exercise actual bytes, corruption/traversal/symlink controls, fresh restore, ten observed publication checkpoints, forward-reference retry, drift repair, and public/private separation.

## Boundaries

Only complete content-addressed directories are final records. Pending directories remain visible and ignored by replay. A multi-record import is planned before publication so every prefix has its references. A published restored destination is refused on replay rather than overwritten. Atomic visibility at named checkpoints does not establish power-loss durability or external hardware recovery.

Run both installed pstack maintenance workflows after covered changes. Source readers and the coordinator's live pass remain independent requirements. Review the covered diff and intended counterexamples before moving formal hashes; a generator cannot approve that move.
