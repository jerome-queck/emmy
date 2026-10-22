# Orientation and private integrity

## User route

Run `help --json`, `catalog`, and `doctor`. Global `--root` selects public source; `--home` selects private state. Default home is the root's ignored `.local/`. Help lists exactly nine commands and actual option/exit contracts.

Doctor validates bindings, immutable hashes, referenced records/evidence, retained historical records, generated references, and per-responsibility restore suspension. Missing bindings remain an empty local inventory. Native access and global inventory completeness remain unverified.

## Source and drive

`scripts/agent.mjs`, `src/records.mjs`, `src/responsibilities.mjs`, and `src/metadata.mjs` own this route. Full scenario `orientation` drives actual help, doctor in an isolated repository, catalog, removed command rejection, and unknown options. Other scenarios test corruption and restored doctor state.

## Boundaries

A public catalog entry does not bind a host/path or establish access. Own private project and host keys matter; inherited object keys are not registration. Historical old records retain reported assurance and never become live state automatically. Public generation reads catalog and metadata only.
