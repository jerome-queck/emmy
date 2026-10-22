# Emmy feature map

Generated from `src/metadata.mjs`. Read [the driver skill](../SKILL.md) before a change. Run `npm run verify:behavior` to drive every mapped scenario.

| Feature | Commands | Scenarios | Bounded properties |
| --- | --- | --- | --- |
| [Orientation and inventory](orientation.md) | help, doctor, catalog, snapshot, brief | orientation, scoped-inventory | scope-freshness |
| [Routing and proposals](routing.md) | plan, probe | local-proposal, unavailable-host, explicit-cloud, immutable-publication, probe-packet | local-first, exact-binding, scope-freshness, proposal-only |
| [Evidence and receipts](evidence.md) | receipt, assess | local-digest, reported-check, identity-conflict, revision-conflict, contradiction, missing-evidence | identity, revision, evidence-required, contradictions, reported-assurance |
| [Upkeep and public boundaries](upkeep.md) | maintain | derived-drift, public-isolation, review-record-stable | Public derivation is exercised behaviorally |

Feature instructions are maintained prose. This index and the command reference are derived. Maintenance does not independently read behavior or review formal assumptions.
