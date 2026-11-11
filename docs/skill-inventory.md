# Refresh and consume approved skills

Run `npm run skills:check` to validate the selected files without installed sources, network access or execution of copied scripts. The [inventory](../registry/skills.json) identifies four skill entries, two source versions, discovery coverage, exact copied hashes and separate retained notices. The [allowlist](../registry/skill-sources.json) is the review boundary. Read [third-party notices](../THIRD_PARTY_NOTICES.md) before changing it.

## Refresh a local inventory

1. Create an ignored `.local/skill-inventory/bindings.json` object mapping `pstack` and `mattpocock` to their installed package roots. Supply explicit versions, never a directory chosen by newest name. Do not commit machine paths.
2. Run `npm run skills:refresh -- .local/skill-inventory/bindings.json`.
3. Inspect the command result and `.local/skill-inventory/last-attempt.json`. Review changes to `registry/skills.json` and `vendor/skills/` before committing.
4. Run `npm run check` and obtain independent review before any separately authorized publication.

Refresh reads metadata and completely enumerates the bound skills trees. It copies only exact reviewed ordinary files. New files within selected skill directories and changed licence inventories require review. It reads twice to detect changes during acquisition. SHA-256 pins hold changed content, versions, notices and missing dependencies for review. To accept a change, inspect the original source and rights, update the allowlist explicitly, then rerun. A new directory or discovered skill is inventory only. It never inherits approval.

A missing bound source or selected entry is an incomplete update, not an automatic deletion. To remove a selected skill, review a complete source observation and edit the allowlist, including dependencies no longer needed. The next snapshot omits those files. Older snapshots stay available for already pinned tasks. Keep historical snapshots in Git history and prune unselected working-tree snapshots during reviewed upkeep to respect the existing release size limits.

Refresh stages a complete immutable directory before atomically replacing the index. A failure before index replacement leaves the previous selection unchanged. Index replacement is the commit point. A later diagnostic or cleanup failure can leave the new complete snapshot selected; read the selected index to resolve the outcome. The failed-attempt record includes `selectedSnapshot` when replacement completed. The private attempt records pending, failed or complete status. A cooperating writer lock rejects concurrent refreshes. After an interrupted process, inspect the pending attempt and confirm no writer is running before manually removing its private lock and unselected staging directory. The command grants no automatic lock recovery. This mechanism does not promise power-loss durability or protection against hostile concurrent filesystem writers.

The index preserves the successful snapshot's original observation time when bytes are unchanged. The private attempt's `checkedAt` records a later successful local recheck. Reading or checking a committed copy never updates either local source observation. Cloud consumers must report snapshot age explicitly.

## Consume one exact revision

Use a trusted Emmy checkout pinned to a reviewed Git commit. Run `node scripts/skill-inventory.mjs check`, then read `registry/skills.json` once. For each selected entry, read `vendor/skills/<snapshot>/<source-id>/<skill.path>` and its declared dependencies and notices at that same revision. Record the Git commit and snapshot digest in the task evidence. Validate the trusted origin separately from the colocated hashes.

The existing [runtime release](operating-procedure.md) already includes the full tracked repository, so its runtime materialization carries these files. Portable pure, automation and acquisition closures do not. The [fresh-consumer drive](../scripts/verify-skill-consumer.mjs) uses the existing release builder and a new temporary runtime directory to verify every hash and read every selected entry without local installed sources. Run `node scripts/verify-skill-consumer.mjs <full-commit>` after committing. Its retained report is under `.local/verification/skill-consumer/`.

These files are explicit guidance. They do not register a skill with Codex Cloud or ChatGPT Work. No native catalog or cloud retrieval is proven by the local consumer drive. A future cloud task must obtain that exact approved revision, run the check, and retain its own actual reads. Runtime installation or catalog registration needs separate acceptance.

## Proposed automatic refresh

No schedule is enabled by this change. Add a read-only local refresh check to the existing daily improvement routine after separate adoption, and after intentional plugin updates. A 24-hour check cadence and visible stale warning after 48 hours are sufficient for this inventory. Keep changed content or rights held for human source review and ordinary Git delivery. Review source notices weekly during existing upkeep.

Existing Sunday 01:17 UTC GitHub checks already run `npm run check`, which now validates committed skill files. Hosted checks cannot inspect Studio's installed packages. They need no write token and must not publish local sources. No daemon, new credential, new platform or new recurring task is proposed.

## Verification limits

The [restricted private capsule runner](private-skill-refresh.md) stages approved inventory work, verifies immutable candidate uploads, and advances one private exact-ID selector only after complete candidate/history readback. A persistent single-writer claim retains uncertain writes. Old capsules, immutable selection history and prior local bindings remain available. Native schedule readiness and cloud-task adoption require separate acceptance.

The [API fixtures](../test/skill-inventory.test.mjs) test synthetic source identity, complete discovery, version and hash drift, missing and changed licences, dependency changes, deletion, incomplete sources, nonordinary files, corruption, lock refusal and old-snapshot preservation. They do not establish upstream truth or live cloud registration. Existing finite and TLA+ contracts do not cover this independent derived snapshot mechanism; their source mappings and sync pins remain unchanged.
