# Refresh and consume approved skills

Run `npm run skills:check` to validate the selected files without installed sources, network access or execution of copied scripts. The [inventory](../registry/skills.json) identifies four skill entries, two source versions, discovery coverage, exact copied hashes and separate retained notices. The [allowlist](../registry/skill-sources.json) is the review boundary. Read [third-party notices](../THIRD_PARTY_NOTICES.md) before changing it.

## Refresh a local inventory

1. Create an ignored `.local/skill-inventory/bindings.json` object mapping `pstack` and `mattpocock` to their installed package roots. For the scheduled route, use supported installed-plugin discovery described below. Never choose a directory by newest name. Do not commit machine paths.
2. Run `npm run skills:refresh -- .local/skill-inventory/bindings.json`.
3. Inspect the command result and `.local/skill-inventory/last-attempt.json`. Review changes to `registry/skills.json` and `vendor/skills/` before committing.
4. Run `npm run check` and obtain independent review before any separately authorized publication.

Refresh reads metadata and completely enumerates each bound skills tree twice. The approved boundary fixes source identities, four selected skills, file paths, dependencies, and notice hashes. Sources marked `refresh: installed` capture their current version, revision evidence and ordinary selected text automatically. Historical `version`, `revision` and selected-text hashes in the policy are baseline attribution, not routine approval gates. Notice hashes remain gates. Unselected discovery is inventory only. New selected files, dependencies, removed skills, changed notices or unclear rights hold before index publication. Sources without that marker retain legacy exact-version/content checking.

A missing bound source or selected entry is an incomplete update, not an automatic deletion. To remove a selected skill, review a complete source observation and edit the allowlist, including dependencies no longer needed. The next snapshot omits those files. Older snapshots stay available for already pinned tasks. Keep historical snapshots in Git history and prune unselected working-tree snapshots during reviewed upkeep to respect the existing release size limits.

Refresh stages a complete immutable directory before atomically replacing the index. A failure before index replacement leaves the previous selection unchanged. Index replacement is the commit point. A later diagnostic or cleanup failure can leave the new complete snapshot selected; read the selected index to resolve the outcome. The failed-attempt record includes `selectedSnapshot` when replacement completed. The private attempt records pending, failed or complete status. A cooperating writer lock rejects concurrent refreshes. After an interrupted process, inspect the pending attempt and confirm no writer is running before manually removing its private lock and unselected staging directory. The command grants no automatic lock recovery. This mechanism does not promise power-loss durability or protection against hostile concurrent filesystem writers.

The index preserves the successful snapshot's original observation time when bytes are unchanged. The private attempt's `checkedAt` records a later successful local recheck. Reading or checking a committed copy never updates either local source observation. Cloud consumers must report snapshot age explicitly.

## Consume one exact revision

Use a trusted Emmy checkout pinned to a reviewed Git commit. Run `node scripts/skill-inventory.mjs check`, then read `registry/skills.json` once. For each selected entry, read `vendor/skills/<snapshot>/<source-id>/<skill.path>` and its declared dependencies and notices at that same revision. Record the Git commit and snapshot digest in the task evidence. Validate the trusted origin separately from the colocated hashes.

The existing [runtime release](operating-procedure.md) already includes the full tracked repository, so its runtime materialization carries these files. Portable pure, automation and acquisition closures do not. The [fresh-consumer drive](../scripts/verify-skill-consumer.mjs) uses the existing release builder and a new temporary runtime directory to verify every hash and read every selected entry without local installed sources. Run `node scripts/verify-skill-consumer.mjs <full-commit>` after committing. Its retained report is under `.local/verification/skill-consumer/`.

These files are explicit guidance. They do not register a skill with Codex Cloud or ChatGPT Work. No native catalog or cloud retrieval is proven by the local consumer drive. A future cloud task must obtain that exact approved revision, run the check, and retain its own actual reads. Runtime installation or catalog registration needs separate acceptance.

## Refresh from installed plugins

The [private runner](private-skill-refresh.md) uses `codex plugin list --json`, its `installed` rows, exact enabled plugin/marketplace identity and configured Git origin. It requires the row version and the ordinary installed cache manifest to agree. The marketplace source path is not the installed payload. It uses only the exact cache version named by the record, never the largest directory. Unsupported, disabled, duplicate, missing or inconsistent records hold. A marketplace-advertised version without a matching installed cache is insufficient.

Selected Markdown inline links, reference definitions and HTML `src` or `href` targets must stay in the approved closure. Unresolved explicit reference links hold. The content check also holds explicit proprietary, noncommercial, all-rights-reserved, no-redistribution and non-MIT frontmatter or SPDX declarations, plus structured dependencies/tools/hooks declarations. This is a conservative declared-pattern check, not legal interpretation or a universal proof that arbitrary prose has no restrictions. Unclear rights reported by the caller still hold. Updated guidance remains data. No scripts, hooks, imports, new tools or native registrations are loaded from it.

Ordinary version and selected-text updates need no new human approval within this existing scope. Source identity, file/dependency scope or rights changes need separate review. The existing private daily job is configured separately; these source files neither create a job nor prove a natural run or cloud adoption.

## Verification limits

The [restricted private capsule runner](private-skill-refresh.md) stages approved inventory work, verifies immutable candidate uploads, and advances one private exact-ID selector only after complete candidate/history readback. A persistent single-writer claim retains uncertain writes. Old capsules, immutable selection history and prior local bindings remain available. Native schedule readiness and cloud-task adoption require separate acceptance.

The [API fixtures](../test/skill-inventory.test.mjs) test synthetic source identity, complete discovery, version and hash drift, missing and changed licences, dependency changes, deletion, incomplete sources, nonordinary files, corruption, lock refusal and old-snapshot preservation. They do not establish upstream truth or live cloud registration. Existing finite and TLA+ contracts do not cover this independent derived snapshot mechanism; their source mappings and sync pins remain unchanged.
