# Cloud calendar plan and exact local implementation

Current plans require the register's retained semantic policy. The context digest includes that entire policy, so changed assignment bindings or owner rules invalidate preflight and acceptance. The opaque external `policyDigest` remains a separate association; it cannot replace the executable source and owner checks. Full preference validation and native enforcement remain external.

This is a declared-evidence boundary for delegated local implementation over the [Calendar register](calendar-register.md), not a native executor. The [operating procedure](operating-brief.md#plan-and-maintain-calendar-tasks) selects supported inspection and execution from the current authorized session. This persisted typed handoff still requires its existing cloud planning and root-acceptance roles; direct Studio attachment does not migrate those roles or authorize relabelling a Studio session as `dot-cloud`. Cloud reads do not establish write capability; this local handoff contract does not model cloud-native application. The source supports `calendar-register` with `action: "handoff"`. Confirm the actual installed revision supports this action before using it. The previously installed read-only collector and a successful capture do not establish handoff installation or ordinary-turn adoption.

New planning responsibilities use `workClass: "calendar-planning"` and explicit `target.executor: "dot-cloud"`. The parser rejects an omitted executor, a local executor or coding-cloud executor for this new class. Generic coordination and other existing definitions keep their prior defaults and effect identities. Code implementation remains a local task; native IDs retain their original account/environment identity when delegated.

The handoff envelope contains `schemaVersion: 1`, `action: "handoff"`, `snapshotFile`, `requestFile` and `packetFile`. All references are private local bounded JSON. Every stage invokes the existing register assessor for availability, source, lifecycle, capability and baseline checks. No stage writes a journal, launches work or mutates a provider.

## Packet and plan

The closed version-one packet contains these fields.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Exactly `1`. |
| `stage` | `plan`, `preflight` or `accept`. |
| `executor` | `dot-cloud` for planning and root acceptance; `local-executor` for preflight and local error reporting. These are declared roles, not authenticated runtime identities. |
| `coordinationDefinitionHash` | The retained cloud planning responsibility's exact definition hash. Retrieve its actual record; a supplied hash alone cannot authenticate it. |
| `policyDigest` | The resolved scoped owner-policy version. Binding this digest does not implement or prove every preference; cloud policy validation remains separately required. |
| `plan` | Required after planning. Preserve the returned body and `planDigest` unchanged. |
| `operationDigest` | Preflight selects one exact original prepared operation. Root acceptance covers all operations. |
| `preflights` | Retained successful preflight records referenced by local receipts. |
| `receipts` | Chronological original local reports. Preserve failures and uncertainty when adding later reconciliation. |
| `timing` | Versioned interface timing targets, fresh zone observations and independent final timing readbacks. Required for timed operations. See [interface timing](calendar-timing.md). |

The cloud `plan` stage requires a fully proposed register assessment with at least one operation. Its returned plan binds original snapshot and policy digests, coordination definition, window, source/owner context, evidence-age ceiling and exact prepared operations. Each operation carries the original before-state, operation digest, stable effect key and Task/Event type. The command supports operations on existing identities; creation remains outside this checker.

Timed Task operations also bind their selected editor and execution environment, separately from the provider identity. Canonical intervals and conflict checks remain in Singapore time. The timing helper formats separate editor input from original instants. A missing timing contract blocks old timed packets at planning, preflight and acceptance. Untimed operations retain their existing behavior. Supported editor routes do not imply support for connector datetime writes or other timing interfaces.

Date-only and timezone-only changes count as timing changes and require the complete canonical interval. This Task-editor contract rejects Event timing routes. Title-only changes retain their prior behavior.

## One local operation

Immediately before one authorized operation, acquire a fresh complete window and native timing supplements and submit the original plan plus `operationDigest` to `preflight`. Keep the original baseline and changed fields. A fresh snapshot normally has a different digest because acquisition timestamps changed; that does not authorize rebasing the original operation. Changed dates, titles, native IDs, representation, source intent or policy return to cloud planning. Evidence age may tighten but cannot widen the cloud ceiling.

The selected operation must be unapplied. Previously verified effects may remain terminal while another operation proceeds; they require their own receipts and saved readbacks. An operation with an attempt or receipt cannot receive another application preflight under that same plan. The fresh API window and native timing/projection evidence must postdate the plan and any preceding local report. Unavailable or conflicting evidence returns to Emmy rather than allowing a replacement timetable.

Retain the successful preflight result and its `preflightDigest`, exact original attempt and before-state in the existing responsibility evidence before applying. A preflight record binds its plan, selected operation, snapshot, original baseline, policy, coordination definition, assessor digest, oldest applicable evidence time, age ceiling and expiry. Expiry is the earliest used API-page, native-readback, history or visual evidence time plus the ceiling; evaluating old evidence later cannot renew it. Native implementation checks that expiry before using the separately authorized surface for that exact operation. No checker output grants access or authorization.

For a timing operation, retain its prepared timing digest and the exact separate editor input. Fresh zone evidence must match the planned interface, input zone, account and execution environment epoch. It contributes its original acquisition time to preflight expiry. A changed interface or environment requires cloud replanning. A receipt must compare the actual submitted fields with prepared input and saved Calendar SGT fields with the unchanged canonical interval. Uncertain outcomes retain their original attempt; no further conversion or replacement write is inferred.

Each local receipt names `planDigest`, original `operationDigest`, `preflightDigest`, exact native `identity`, `itemType`, `attemptedAt`, `observedAt`, `outcome`, `completedEffectKeys`, `evidenceRef` and any failure `reason`. Outcomes are `verified`, `failed`, `denied`, `pending` or `uncertain`. Failure reports return the operation ID, target, outcome, completed effects and reason. A batch error cannot erase an earlier saved effect or turn later pending work into applied work.

A lost save response remains the original uncertain receipt. Same-attempt readback can resolve it; a different `attemptedAt` is another write and requires return to cloud planning. Keep original uncertainty in both the request's attempt history and chronological receipts. A new operation's retained preflight must postdate every preceding local report; preflighting an entire batch before its first effect cannot authorize later steps. A pending, failed or uncertain earlier outcome must be resolved before another operation begins. Per-receipt completed effects refer only to already verified effects in that chronological prefix. Missing original before-state, missing successful preflight, expired preflight, changed evidence reference or unresolved uncertainty prevents continuation. A denied scope stays terminal. A fresh plan cannot erase the existing assessor's retained attempt/lifecycle gates.

## Root acceptance

The root uses `stage: "accept"` with `executor: "dot-cloud"`. Reacquire the entire final window after the latest local report, including native Task timing and projection evidence. Reopen each same native ID and compare all saved fields and Task/Event representation. Perform the fresh actual visual and numeric Calendar review. The existing assessor must independently resolve every planned operation as `already-saved` from its original before-state and current same-ID readback; a worker's completion label or receipt alone cannot pass.

Timing acceptance additionally requires a fresh Calendar-side SGT readback after the last report. Compare each endpoint's date and clock, including rollover, and the duration. Require the observed native Task identity or an attributable fresh exact Task-to-projection mapping. A stable projection ID without that mapping keeps identity acceptance pending even when timing matches.

`accepted-reported` means this supplied evidence satisfies the contract. It does not authenticate provider state, complete owner history, the policy implementation, preflight execution or native authorship. All outputs have `execution: "none"`. Retain original packets, preflight results, attempts, local reports and final assessment privately. The executable synthetic examples are in [the unit suite](../test/calendar-handoff.test.mjs) and [real CLI driver](../verification/calendar-register-drive.mjs).


## Shared rule selection

For semantic policy version two, each original prepared operation retains `planningResolution`. Preflight and final acceptance compare the current computed bundle digest, exact selected rule versions and decisions with that original selection. Changed policy bytes also remain bound by the existing context digest. Original attempts retain their first selection; they cannot be re-associated with replacement rules. Historical version-one prepared fields and external `policyDigest` semantics remain unchanged. See [shared planning policy](planning-policy.md).
