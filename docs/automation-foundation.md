# Build a staged automation plan

`automation --file <request.json>` is the generic repository interface for automation plans, outcome preparation, and exact artifact reads. It performs no native creation, source acquisition, operation, schedule change, or publication. The pure `planAutomation` API is also a declared portable release entry. Source capsule format v2 adds this entry; the current reader preserves exact v1 capsule entries and materialization.

Use [bounded-automation-v1.json](../procedures/bounded-automation-v1.json) as the reusable procedure. Keep per-automation objectives, sources, environment, exact runner, private parameters, budgets, controller, report namespace, automation ID and destination in a separate versioned configuration. The [synthetic configuration](../verification/automation-fixtures.mjs) shows the complete schema without native account data.

## Compile the plan

A request supplies exact absolute file paths and SHA-256 values for both files.

```json
{
  "action": "plan",
  "procedure": { "path": "/private/procedure.json", "sha256": "<exact-byte-hash>" },
  "configuration": { "path": "/private/configuration.json", "sha256": "<exact-byte-hash>" }
}
```

The compiler reads and hashes those same bounded bytes before strict parsing. Configuration binds the procedure's canonical digest. It rejects unsupported schemas, unknown members, duplicate stage/source IDs, missing ownership/destination and invalid budgets. Ordered steps need no dependency scheduler. Steps carry explicit acceptance text; the actual executor must enforce that text and the declared budgets.

The result contains a deterministic semantic plan digest, original file pins, configuration identity/digest, exact source release, stages, source references, owner, destination and a short prompt with its SHA-256. Private parameter values are not copied into the prompt. Raw file pins and semantic digests have distinct meanings. Whitespace may change a file pin while leaving the semantic plan unchanged.

The output always remains staged, effects unauthorized, native creation unperformed and deployment held. An unchanged plan does not create a second objective or resolve an uncertain invocation. The existing dispatch and native products retain creation and operation authority.

## Prepare the canonical outcome

Use action `report` with the same procedure/configuration references and an `input` matching the existing producer contract. Include the two `reportEvidenceRefs` emitted by the plan. Namespace and automation ID must match configuration. Supply the original invocation identity, origin, clocks, execution, coverage, availability and exact predecessor chain explicitly. An absent scheduled binding stays scheduled-unbound. A running result has no terminal report.

`automation-reporting.mjs` owns producer and publication validation for every automation kind. It emits the existing canonical run and occurrence envelopes, byte-for-byte compatible with briefing reporting. The briefing adapter owns only its expected check assessment. No second outcome format or publication writer is introduced.

Report preparation returns exact artifact bytes, semantic IDs, byte hashes and the intended destination. Publication and delivery remain unverified. Native upload attempts and independent exact-ID readbacks use the existing publication contract; uncertain attempts require rediscovery.

## Read one known artifact

Use action `read` with the same procedure/configuration references, an `artifact` path/byte hash, its semantic `recordId`, and `maxAgeSeconds`. The reader verifies exact canonical bytes through the same validator as publication. It binds the report owner and procedure/configuration evidence references, then reports original age and available, partial, pending, stale or future status.

The reader opens only the named files. It never enumerates a report root or reconstructs history. A byte hash includes the producer's newline; the semantic record ID does not. An exact revision read does not establish that no later revision or conflict exists. Use separately authorized exact discovery when that question matters.

## Verify before native adoption

Run the generic unit tests and the `automation-foundation` behavioral scenario. The source release includes the procedure and compiler. Bounded `automation-contract` checks cover supplied configuration binding, scope, budgets, deterministic identity and effect-free planning. They assume symbolic honest source pins and cannot authenticate the source release or future provider execution.

Follow the [common operating procedure](operating-procedure.md) to stage exact consumer bindings. Parent acceptance of source, private policy, actual adapters, predecessor state, unresolved effects and destination precedes native saving or execution. Only the daily briefing is the first later pilot. Hold after parent observation.
