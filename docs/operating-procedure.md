# Run an accepted Emmy procedure

The staged foundation uses one source release for the local runner, guidance, report helpers, and portable briefing core. `src/operating-contract.mjs` identifies version 1. Its check occurrence rules describe expected reports; they do not schedule or activate work. Existing private policy and native products retain their authority. Daily briefing is the first pilot, followed by a parent observation hold.

## Select the exact source

Build a fresh capsule from one reviewed full Git commit. The build reads only that commit's tracked blobs. It never reads report roots, installed state, private policy, or historical capsules.

```sh
node scripts/foundation-release.mjs build . <full-commit> <new-capsule.json>
node scripts/foundation-release.mjs verify <capsule.json> <trusted-sha256>
node scripts/foundation-release.mjs materialize <capsule.json> <trusted-sha256> <new-directory> pure
```

Verify the builder and consumer scripts through an independently trusted source before execution. The capsule hash comes from the accepted handoff, not from an untrusted adjacent manifest. Verification precedes source import. `pure` materializes the exact shared compiler dependency closure. `acquisition` materializes the read adapter closure. Both exclude filesystem and effect owners. `runtime` materializes the complete public source snapshot for a staged local candidate. It does not install an alias, create native tasks, or grant provider access. Preserve historical capsules for exact replay.

## Bind the consumer

Retain a private acceptance record naming the procedure ID and version, source commit, capsule SHA-256, intended environment, exact runner, and prior runner. Bind private policy byte SHA-256 and semantic policy digest separately. Name the existing controller, report input paths or exact native IDs, report namespace, and final native destination. Missing readbacks remain unverified. This record is staged configuration until the parent accepts the exact consumers.

Query `daily-briefing` with `{ "action": "foundation", "input": {} }` to read the versioned contract and expected report rules. This read grants no action. Use `scripts/agent.mjs` for local operations. `help --json` describes commands and exit codes. Exit 0 completes a local operation. Exit 2 refuses malformed or corrupt input. Exit 3 retains actionable, partial, or held results. Doctor attention may describe historical unresolved evidence; it is not a new provider incident.

## Prepare the daily briefing

1. Recover the existing LC1 controller and exact objective through the trusted installed dispatch command. Use a fresh project task for distinct implementation work.
2. Validate the exact private policy with `daily-briefing` action `policy`. Keep personal rules out of public packages.
3. Acquire only the authorized named sources. Retain original response bytes, source identity, actual acquisition bounds, original provider clocks, pagination, and declared coverage. Missing provider clocks stay null. File ingestion never refreshes source evidence.
4. Read the known report artifact or exact occurrence slot through the existing report helper. Supply kind, scheduled occurrence, provenance, minimum source end, and age bound. Read the named conflict marker too. Malformed unrelated history cannot gate this read. Namespace filtering after a whole-root scan is not scoped acquisition.
5. Invoke `daily-briefing` action `prepare` locally, or `executeBriefing` from `src/briefing-core.mjs` in the accepted portable consumer. Both call the same implementation. Preserve the complete JSON result and exact human body. `compile/read` remain historical immutable v1 artifact operations; `briefing` remains advisory guidance acquisition.
6. Submit accepted source and assessment evidence only to the existing morning journal. Calendar source commands retain `providerObservation` separately from acquisition receipts. Unknown provider clocks produce a partial report. Pending checks remain pending; unavailable sources remain explicit gaps.

## Hold at the effect boundary

Local compilation does not grant migration, sending, cleanup, publication, installation, or scheduled invocation. The parent must independently accept the current policy, exact account and transport bindings, inactive predecessor, durable invocation identity, unresolved-effect discovery, and exact ChatGPT destination. The existing fleet/morning owner retains send and move intents, uncertain outcomes, same-ID readbacks, and same-message edits.

After foundation verification, the parent may authorize only the daily briefing pilot. Observe its complete body, source gaps, duplicate behavior, and native readbacks. Then hold. Other automations and all schedules remain unchanged.

## Recover or roll back

Before installation, stop using the staged capsule and preserve its evidence. After a later authorized installation, select the retained compatible prior runner through the supported control and read back its actual bytes. Preserve every policy, capsule, record, conflict, failed or stopped attempt, and native ID. A journal containing v3 records requires a v3-compatible reader. Never reset the journal or retry an uncertain provider effect to roll back source.
