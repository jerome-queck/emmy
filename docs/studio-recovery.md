# Recover the Studio journal

Studio remains primary. If Studio is offline, report its information as stale or unavailable and wait. This procedure provides manual recovery preparation. It adds no automatic failover, scheduler, deployment or authority to resume effects.

## Recovery boundary

Reuse the existing `backup` and `restore` commands. Their archive contains the selected canonical journal, referenced evidence, historical records and private bindings. The immutable manifest binds paths and SHA-256 hashes. Restore creates a new home epoch and suspends proposals and local-check execution pending fresh scoped observations.

| State | Source of truth and recovery requirement |
| --- | --- |
| Responsibility definitions, observations, reviews, failures and uncertain effects | Canonical journal and retained evidence in the selected private home. Covered by the archive. Preserve original identities and uncertainty. |
| Private project/host/dispatcher bindings | Archived `bindings.json`, when present. Its paths and identities require fresh destination readbacks. |
| Source and compatible reader | Exact tested Git revision plus runtime, recorded separately. Source checkouts and installed releases are outside the archive. |
| Native Studio projects, chats and settings | Supported native host readbacks. This journal archive cannot recreate the Studio database, conversation history or native configuration. Never edit native databases to reconstruct them. |
| Discovery index | Derived from supported native captures. Rebuild against the actual host/project IDs. An old index is stale evidence and grants no action authority. |
| Briefing artifacts, report slots, Calendar exports and guidance pins | Separate stores outside this archive. Inventory wanted state and preserve it under separately scoped authority. Native providers retain Calendar, Tasks, mail and schedule truth. |
| Authentication, connected hosts and installed tooling | Reestablish through supported setup/sign-in. Never put credentials in a recovery receipt. |

The smallest tested slice is journal recovery on one machine, using synthetic data. It is not full Studio disaster recovery. A Drive copy alone cannot close the excluded dependencies.

## Prepare one snapshot

1. Select the exact private home and separate new archive directory. Inventory its dependencies and unresolved operations. Do not assume the invoking checkout's default home is the installed primary store.
2. Obtain a quiet capture window for that home through its accountable owner. Stop only writers explicitly within the authorised scope. Do not interrupt independently started work. If quiet capture cannot be established, defer the snapshot.
3. Use the tested compatible source and Node 24 or later. Record the full Git commit, runtime version and relevant source hashes separately. The CLI uses standard-library modules plus its source, registry and documentation; backup/restore do not require account credentials. Verification additionally needs locked development dependencies, Java 21 and the pinned TLC jar.
4. Run the following with explicit absolute paths. Keep all output private.

   ```sh
   node scripts/agent.mjs doctor --home <selected-home>
   node scripts/agent.mjs backup --home <selected-home> --to <new-archive>
   ```

   Doctor exit 3 means attention is needed, including suspension or retained fleet findings. Inspect it; do not erase history to get exit 0. Backup exit 2 means refusal. An unresolved cloud claim or incomplete fleet intent must remain unresolved until its exact owned operation is recovered. Do not remove claims to force a snapshot.
5. Independently verify the manifest hash, exact file inventory and every selected file's SHA-256. Require ordinary files, validated journal references and readable bindings/history. Confirm the selected source did not change during the quiet capture. Keep the archive immutable. The implementation does not lock writers or atomically capture claims, bindings and all record listings.
6. Retain a detached private receipt containing the archive manifest hash, original capture time, selected scope/exclusions, full tested code revision, Node version, record/manifest schema versions, integrity results and restore evidence. Keep code identity separate from data schema identity. Manifest schema 1 itself does not select compatible code. Hashes establish byte integrity, not authenticity against malicious replacement of both bytes and manifest.

## Restore and check while suspended

1. Preserve the original archive. Use a stable verified copy and the same tested compatible reader first. Select a new disposable destination outside the archive and any active home.

   ```sh
   node scripts/agent.mjs restore --from <verified-archive> --into <new-home>
   node scripts/agent.mjs doctor --home <new-home>
   ```

2. Retain the new epoch and expected doctor suspension. Independently compare every manifest-listed restored file with its expected SHA-256, including historical evidence and bindings. Restore validates the source before copying and validates copied canonical records, but does not rehash every copied historical/binding file before publication. A changing archive is unsafe. Any failed comparison leaves this candidate unused.
3. Check retained failures, uncertain effects, native identities and stable effect keys. Confirm proposals and local-check execution remain blocked. Existing destinations, corruption, missing files, unsafe paths and symlinks must refuse. An interrupted pending directory is not a usable snapshot. Keep a failed candidate for diagnosis; retry into a different new destination after resolving its cause. Never overwrite an active home.
4. Stop here for a rehearsal. Actual activation is a separate authorised step. It requires fresh exact target, authority, task and schedule observations naming the restored epoch. Cloud/fleet controllers also require their existing explicit resume path and fresh state. Rediscover uncertain native effects before any retry. Old archived authority or a copied task index cannot authorise execution.

No result here proves power-loss durability, native provider truth or exactly-once external effects. The bounded publication model assumes immutable ordinary files and atomic directory rename; it does not prove whole-home snapshot isolation.

## Add Drive only after destination authority

Drive is the preferred external recovery location. Before writing, require the exact authorised account/drive/folder identity and permitted recovery contents. A reports folder or general preference for Drive recovery is insufficient. If this authority is missing, stop only the Drive-write portion and continue the isolated local rehearsal.

For an authorised trial, transfer one immutable verified snapshot and its detached receipt without changing the archive format. Retain the remote file identities. Download the exact saved copy to an isolated new location, verify the complete inventory and hashes, then repeat the suspended restore and byte comparisons above. Retain acquisition/readback times and results. An upload response, sync icon, saved file or local restore alone is not verified Drive recovery. A separate verified code copy and the excluded dependencies are still required for wider recovery.

No Drive upload, remote download/restore or whole-Studio recovery is established by this procedure's local test. No automatic failover is introduced.

## Migrate separately

Keep the original snapshot and compatible code available. First prove the old snapshot restores with its tested reader. If code or a data schema must change, use a second disposable restored copy, record source and destination schema/code revisions, run the relevant behavioral/formal checks, and compare preserved failures, identities and uncertainty. Do not silently rewrite the original archive or switch the primary home during testing. Source publication, installation, native membership and actual activation each need their own acceptance evidence.

The discovery foundation remains a separate change. Its index is rebuildable and outside the canonical journal. This procedure neither merges that slice nor changes its schema.

## Repeat the existing bounded checks

```sh
npm run check
```

The aggregate runs the full behavioral driver, including archive/restore, corrupt/missing/traversal/symlink refusal, restore suspension and publication interruption controls. It also runs the mapped finite properties, copied-source mutations and bounded publication model. The `self-check-repair` focus skips the archive controls; use the full driver for recovery. Inspect retained reports and intended mutation witnesses; a parser error is not a valid mutation counterexample. These checks use isolated fixtures and establish neither a real Drive round trip nor full Studio recovery. See [upkeep coverage](../.agents/skills/verify/features/upkeep.md) and [publication assumptions](../.agents/skills/publication-contract/SKILL.md).
