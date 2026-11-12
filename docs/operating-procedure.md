# Run an accepted Emmy procedure

The staged foundation uses one source release for the local runner, guidance, report helpers, and portable briefing core. `src/operating-contract.mjs` identifies version 2. Its check occurrence rules describe expected reports; they do not schedule or activate work. Existing private policy and native products retain their authority. This contract exposes staged pure preparation and report expectations only. It defines no current briefing pilot or effect owner.

## Select the exact source

Build a fresh capsule from one reviewed full Git commit. The build reads only that commit's tracked blobs. It never reads report roots, installed state, private policy, or historical capsules.

```sh
node scripts/foundation-release.mjs build . <full-commit> <new-capsule.json>
node scripts/foundation-release.mjs build-portable . <full-commit> <new-portable-capsule.json>
node scripts/foundation-release.mjs verify <capsule.json> <trusted-sha256>
node scripts/foundation-release.mjs materialize <capsule.json> <trusted-sha256> <new-directory> pure
```

Verify the builder and consumer scripts through an independently trusted source before execution. The capsule hash comes from the accepted handoff, not from an untrusted adjacent manifest. Verification precedes source import. `build-portable` retains only the union of the automation planner, briefing compiler, and acquisition source closures. It cannot materialize a full runtime. `pure` materializes the exact shared compiler dependency closure. `acquisition` materializes the read adapter closure. Both exclude filesystem and effect owners. `runtime` materializes the complete public source snapshot for a staged local candidate. It does not install an alias, create native tasks, or grant provider access. Preserve historical capsules for exact replay.

## Bind the consumer

Retain a private acceptance record naming the procedure ID and version, source commit, capsule SHA-256, intended environment, exact runner, and prior runner. Bind private policy byte SHA-256 and semantic policy digest separately. Name the existing controller, report input paths or exact native IDs, report namespace, and final native destination. Missing readbacks remain unverified. This record is staged configuration until the parent accepts the exact consumers.

Query `daily-briefing` with `{ "action": "foundation", "input": {} }` to read the versioned contract and expected report rules. This read grants no action. Use `scripts/agent.mjs` for local operations. `help --json` describes commands and exit codes. Exit 0 completes a local operation. Exit 2 refuses malformed or corrupt input. Exit 3 retains actionable, partial, or held results. Doctor attention may describe historical unresolved evidence; it is not a new provider incident.

## Build any automation plan

Use the generic [automation foundation](automation-foundation.md). Select the reusable versioned procedure, pin the private per-automation configuration, then compile `automation` action `plan`. The repository emits the short prompt, deterministic plan digest, source pins, ordered acceptance steps, budgets, known report destination and explicit native-adoption holds. Prepare outcomes through the same canonical producer contract and read exact artifact references. Native products continue to own saving and operation.

## Prepare the daily briefing

1. Recover the existing LC1 controller and exact objective through the trusted installed dispatch command. Use a fresh project task for distinct implementation work.
2. Validate the exact private policy with `daily-briefing` action `policy`. Keep personal rules out of public packages.
3. Acquire only the authorized named sources. Retain original response bytes, source identity, actual acquisition bounds, original provider clocks, pagination, and declared coverage. Missing provider clocks stay null. File ingestion never refreshes source evidence.
4. Read the known report artifact or exact occurrence slot through the existing report helper. Supply kind, scheduled occurrence, provenance, minimum source end, and age bound. Read the named conflict marker too. Malformed unrelated history cannot gate this read. Namespace filtering after a whole-root scan is not scoped acquisition.
5. Invoke `daily-briefing` action `prepare` locally, or `executeBriefing` from `src/briefing-core.mjs` in the accepted portable consumer. Both call the same implementation. Preserve the complete JSON result and exact human body. The former v1 `compile/read` artifact lifecycle is retired from new source; retained installations can inspect old artifacts on copies. `briefing` remains advisory guidance acquisition.
6. Retain source and assessment evidence with the calling task. Unknown provider clocks produce a partial report. Pending checks remain pending; unavailable sources remain explicit gaps. Current morning journal writes refuse.

## Hold at the effect boundary

Local compilation grants no migration, sending, cleanup, publication, installation or scheduled invocation. The old morning migration/admission producer is retired. Historical policy and effect records retain exact replay and copied recovery; no installation acceptance is implied.

The pure preparation API grants no native execution, installation or recurrence. Current morning producer admission is retired.

## Recover or roll back

Before installation, stop using the staged capsule and preserve its evidence. After a later authorized installation, select the retained compatible prior runner through the supported control and read back its actual bytes. Preserve every policy, capsule, record, conflict, failed or stopped attempt, and native ID. A journal containing v3 records requires a v3-compatible reader. Never reset the journal or retry an uncertain provider effect to roll back source.
