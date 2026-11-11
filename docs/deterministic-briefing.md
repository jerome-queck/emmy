# Shared daily briefing compiler

`agent daily-briefing --file <private-request.json>` uses `executeBriefing` from `src/briefing-core.mjs`, the same pure entry as the portable consumer. The supported actions are `foundation`, `policy`, `prepare`, `reporting` and `learning`. Each request has exactly `action` and `input`. The local CLI supplies the actual assessment clock; portable callers must supply it explicitly for `prepare`.

Follow the [operating procedure](operating-procedure.md) for exact policy, original source bytes and clocks, fixed check reports and historical journal interpretation. The [v3 migration contract](briefing-migration.md) defines current preparation inputs and historical migration interpretation. Preparation creates a body and digest without saving a briefing artifact slot or granting effects. Retain original raw captures, failed attempts, requests and complete results with the calling task.

## Retired v1 artifact operations

The new source refuses `compile` and `read`. It has no `daily-briefing-v1` compiler, slot publisher or artifact reader. Existing artifact files and exact installed releases are left untouched. When historical inspection is needed, use the compatible retained installation on copies. Do not retry a native effect or reset the journal to inspect old artifacts. This source retirement changes no selected runner, saved job or provider state.

`immutable-slot.mjs` and its [bounded slot verifier](../verification/briefing-slot/README.md) remain because improvement reports still use that writer. Its retained publication promises do not make the removed daily artifact API supported.

## Verification and recovery

Run `node --test test/daily-briefing.test.mjs test/briefing-policy.test.mjs test/briefing-acquisition.test.mjs test/morning-v3.test.mjs` and `node scripts/verify-behavior.mjs --focus token-review`. The real CLI drive compares the current compiler with its portable entry, checks repeat body digests, refuses future/retired inputs and preserves old artifact bytes. The fleet focus verifies frozen migrated-history replay, current-write refusal and copied backup/restore. Run `npm run check` for the complete local suite.

The historical morning interpreter retains send/move intents, uncertain outcomes, exact message and item identities, delivery-before-cleanup, the prior unchanged delivered-facts branch and same-message corrections. Source tests establish declared local semantics only. Actual source completeness, accepted migration, native delivery, scheduling and adoption remain separate external outcomes. Source rollback uses the prior exact release and never rewrites history or replays uncertain effects.
