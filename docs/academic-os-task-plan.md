# Prepare an Academic OS API plan

Current preparation requires `intent.source`, `intent.policy` and the independently retained current `observation.policy`. The shared calendar policy assessor requires equal policy bytes, exact occurrence/native association, source semantics and owner rules. Creates require an unbound occurrence matching `identity.sourceOccurrenceId`; existing changes and completion require the same retained Task binding. Corrections require a timed-attempt predecessor for the same assignment covering every corrected question. Changed titles retain the source label. Missing legacy associations return no call. The outer prepared packet retains this policy; `task-plan/1` fields remain unchanged. The official provider read does not authenticate this owner-policy supplement or establish native timing.

The local adapter prepares the reviewed Academic OS `task-plan/1` wire contract. It sends no call and loads no credentials. Its counterpart implementation and Emmy adapter require separate deployment and client adoption. Negotiate `tasks_sync_capabilities` before future use; the existing deployed service does not establish this new contract.

Use this adapter for an explicit module or research create, title change or completion. It does not translate arbitrary [native Calendar handoff](calendar-handoff.md) operations. Dates, timing, descriptions, cancellation, reopening and combined operations are refused. The native checker already represents existing-Task completion; creation remains outside its existing-identity contract.

## Prepare the exact operation

Obtain a fresh official `tasks_read_register` or `research_tasks_read_register` result through existing supported access. Preserve its original acquisition time and source reference. The adapter checks its `failed: false`, `outcome: "read"`, fresh register, protocol, target, list, generation and provider snapshot. It does not refresh a register itself.

Run `calendar-register --file <private-envelope.json>` with this envelope.

```json
{
  "schemaVersion": 1,
  "action": "academic-os",
  "requestFile": "/private/academic-os-request.json"
}
```

The request has `schemaVersion: 1`, `stage: "prepare"`, `intent` and `observation`. The [synthetic fixtures](../verification/academic-os-plan-fixtures.mjs) supply complete examples without private data.

| Intent field | Required value |
| --- | --- |
| `schemaVersion`, `operationId` | Version `1` and the original stable operation ID. |
| `issuedAt`, `maxEvidenceAgeMs` | Original UTC decision time and positive freshness ceiling, at most one day. |
| `target` | Exact `{kind,key,title}` from the official read. Kind is `module` or `research-project`. |
| `identity` | Declared `environment`, `accountId`, `listId`, plus exact `taskId` for an existing Task or stable `sourceOccurrenceId` for creation. Never derive identity from a title. |
| `expectedSnapshot` | The exact original Academic OS token. It must match both read-register token fields and cannot be replaced during preparation. |
| `operation` | `{name:"create",title,provenance?}`, `{name:"change",title}` or `{name:"complete"}`. The adapter inserts the existing exact ID into the wire operation. |
| `baseline` | Existing operations require the original exact `{title,status:"open"}`. Creation has no existing baseline. |
| `policyDigest`, `coordinationDefinitionHash`, `planDigest`, `operationDigest`, `effectKey` | Retained original cloud associations, each a SHA-256 digest. Their presence does not authenticate policy validation or approval. |
| `sourceRef`, `authorityRef` | Retained source and concrete authorization evidence references. The caller must establish actual scope separately. |
| `nativeSnapshotDigest`, `preflightDigest` | Optional original native-window and native-preflight associations. They remain separate from the API token and establish no native timing authorization. |

Module create provenance permits `assessment`, `source` and `milestone`. Research also permits `claim`, `meeting` and `deliverable`. Existing source metadata remains owned by Academic OS. A title change cannot silently rewrite provenance.

The observation contains declared `environment`, `accountId`, `capturedAt`, `evidenceRef` and the actual MCP SDK `result: {content:[{type:"text",text:"<report JSON>"}],isError}`. The adapter parses exactly one JSON text block and rejects malformed or duplicate-key JSON. The internal service shape `{failed,report}` is also accepted for direct service fixtures; it is not the MCP wire format. The upstream read does not expose authenticated account or environment, so the outer binding remains declared. Require independent account/configuration evidence when choosing that binding.

For an existing Task, the adapter selects exactly one `report.tasks` row by `taskId` and compares its title and API-domain status. Missing, duplicate, completed, cancelled or changed rows return to cloud. API register statuses are `open`, `completed` and `cancelled`; raw Google `needsAction` is not silently converted. Unpushed local rows do not become native identities.

`api-plan-ready-reported` returns the immutable `prepared` packet and `tasks_apply_plan({plan_json})` arguments. Retain that first exact packet privately before any separately authorized application. Only the strict API plan enters `plan_json`; cloud associations and account evidence stay alongside it. Raw notes, other rows and negotiation metadata are omitted from the output. Its expiry uses the oldest original read or intent time, so reevaluation cannot renew old evidence.

The full-list API token covers more fields than the selected title/status baseline. Do not recompute it from module rows or substitute Emmy's native-window digest. Neither token equality nor this narrow baseline proves native timing, original protected fields, complete owner history or approval. The pure adapter cannot enforce durable retention or stop an external caller from sending a changed packet.

## Retain the original result

Use the same envelope with a request containing `schemaVersion: 1`, `stage: "receipt"`, the original `prepared` packet and `receipt`. A receipt contains `attemptedAt`, `observedAt`, `evidenceRef` and either the MCP SDK `result` or the parsed Academic OS `report`. Include `isError` with a parsed report when the tool supplied it. Contradictory error flags and code-bearing `applied` reports cannot pass. For a lost response, retain `transportError` instead of inventing a report. Keep original raw response bytes under the evidence reference. The adapter returns a canonical parsed-receipt digest and selected report fields; raw byte retention and hashing remain separate caller checks.

| Observed report | Adapter outcome |
| --- | --- |
| Matching `applied`, exact existing ID or known create ID, fresh register, no contradictory tool flag, attempt within original expiry | `api-applied-reported`. |
| Matching `conflict` | `return-to-cloud` with its original code, packet and fixed token. |
| `uncertain`, `failed`, missing response, shortened migration response, unknown outcome or mismatched identity | `reconcile-original-operation`; no new call. |

An unknown create ID stays unknown. Preserve the original occurrence and operation ID, inspect Academic OS's retained journal, and reconcile through its supported route. Do not match titles, regenerate IDs or resend. A failure alone does not prove no effect. Receipt assessment is stateless; retain every original uncertain response before a later same-operation reconciliation. It does not erase earlier evidence or establish safe retries by itself.

All outputs have `execution: "none"`, `nativeVerified: false` and empty native completed-effect keys. API application proves neither source learning nor saved timing nor [root Calendar acceptance](calendar-handoff.md#root-acceptance). Complete final-window acquisition, explicit timezone, same-ID saved timing and visual/numeric review remain separate. Cloud/Tasks clock contradictions remain unresolved until attributable native evidence explains them.

Exit `0` means a prepared API packet or API-only reported application. Exit `3` returns a conflict or reconciliation requirement. Exit `2` rejects malformed or unsupported input. No result proves the counterpart runtime is deployed or a live mutation works.

## Verify compatibility

Run `node --test test/academic-os-task-plan.test.mjs` and `node scripts/verify-behavior.mjs --focus calendar`. These check literal wire plans, both target kinds, all supported operations, original identities/tokens/baselines, freshness, prohibited fields and uncertain outcomes. The driver retains the original inputs and outputs after teardown and performs no native writes.

The separate private compatibility probe uses the exact supplied Academic OS parser and guarded tool wrapper with a synthetic executor. Its unused timing/date/checksum dependencies are throwing sentinels. That probe tests the undated wire subset and argument guards, not provider execution, serialization by a deployed MCP server or native timing. No private counterpart source is copied into this repository.
