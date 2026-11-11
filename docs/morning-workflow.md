# Historical morning journal

The current fleet CLI refuses every `morning` action before publication. Historical policy-v1/v2/v3 records, migration acceptance, source clocks, uncertain intents, native identities and same-message outcomes remain readable through the unchanged replay reducer. Use `fleet` with `operation: "status"` to inspect them. No current producer or collection-envelope command remains.

For historical recovery, preserve original records and evidence. Work on a copy. Current readers, backup and suspended restore retain complete canonical histories. Generic import does not accept fleet events. An unfinished historical morning publication blocks backup: use its exact retained installation on a copy to finish only the already-retained pure publication, verify the resulting bytes, then archive and restore that recovered copy into a new home. Never repeat native effects or reconstruct an uncertain effect as known-unexecuted. A new journal-backed producer would require separately accepted consumers and implementation.

The NEW briefing route uses in-chat supported reads, judgment and ChatGPT output. No observed callsite binds it to this historical journal or the pure compiler. Its actual source freshness, effects, delivery and recurring execution require original native evidence.

## Retained interpretation

`src/morning.mjs`, `fleet-state.mjs` and `fleet-schema.mjs` retain versioned parsing, deterministic replay and views. Migration predecessor digests and inactive-producer declarations remain historical validation rules. They cannot activate a producer through the current CLI. Exact delivery/body/readback, unread-preserved item outcomes, prior delivered-facts evidence and same-message correction histories keep their original semantics. Unknown fields in retained raw evidence stay untouched.

## Verification

Run `node scripts/verify-behavior.mjs --focus fleet` for frozen synthetic migrated history, current-ingress refusal, exact canonical bytes, CLI status, backup and suspended restore. The historical reducer unit/finite tests and [morning-send graph](../.agents/skills/morning-send/SKILL.md) test declared historical transitions separately. No provider actions run.

The pure [briefing preparation](deterministic-briefing.md) and [source normalization](briefing-source-normalization.md) remain available without journal production.
