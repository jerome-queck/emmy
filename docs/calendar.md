# Declared calendar acceptance

`calendar --file <private-envelope.json>` checks one declared snapshot. It reads a regular UTF-8 file of at most 2 MiB and prints JSON. It writes no journal, calls no provider, and returns no native write request. Existing private notes or responsibilities own intent and history. Native products own Tasks and Events.

Exit 0 returns `checked`. Exit 3 returns `revise` for known mismatches or `needs-evidence` for missing proof. Both finding classes remain visible when they coexist. Exit 2 rejects unreadable or malformed input. A successful check establishes consistency of supplied evidence only.

## Input reference

The closed envelope uses `schemaVersion: 1` and these members. All references name entries in this file. Capture paths and URLs are never followed.

| Member | Shape |
| --- | --- |
| `intent` | `revision`, `acquiredAt`, raw `ownerInstruction`, `target`, `window`, positive `maxEvidenceAgeMs`, `items`, `sources`, `budgets`, `morningRequirements`, `eventConstraints`. Optional `buffers`, `allowedDeliverables`, and `requestedDeliverables`. |
| `plan` | `null`, or `intentDigest`, `inventoryIds`, `allocations`, `queuedChanges`, and optional claimed `digest`. Missing plan yields null derived campaign results. |
| `inventories` | Entries with `id`, `target`, `window`, `acquiredAt`, raw `attribution`, separate `taskLists` and `calendars`. |
| `readbacks` | Entries with `id`, exact `identity`, `acquiredAt`, raw `attribution`, `forOperation` or null, `sequence`, `fields`, and optional `supersedes`. |
| `attempts` | Entries with `id`, `operationId`, `effectScope`, exact `identity` or null for an unknown historical identity, `attemptedAt`, `outcome`, raw receipt, and optional intent/plan digests, `retryOf`, or `resolution`. |
| `history` | Raw `corrections`, `completeThrough`, `complete`, `gaps`, and optional `aggregateReports`. |
| `clocks` | Entries with `id`, exact `identity`, source `surface`, raw display, `acquiredAt`, named `timeZone`, `offset`, and extracted `instant`. Unknown zone, offset, or instant is null. |
| `clockResolution` | Optional `clockIds`, `source` of `owner` or `native`, raw attribution, `acquiredAt`, `settledInstant`, and `timeZone`. |

A target has exact `environment`, `accountId`, `taskListIds`, and `calendarIds`. A native identity has exact `environment`, `accountId`, `containerKind` of `task-list` or `calendar`, `containerId`, and `nativeId`. A title never establishes identity. A window has offset-bearing `start`, `end`, and a named IANA `timeZone`.

Each intended item has a unique `key`, exact `identity`, `expected` field map, and `authorizedFields`. The field names are `type`, `title`, `date`, `start`, `end`, `durationMinutes`, `timeZone`, `deadline`, `completed`, `recurrence`, and `notes`. Omission means unrequested. Explicit null requests absence for nullable schedule, deadline, and recurrence fields. Titles and notes are strings, type is `task` or `event`, and completion is Boolean. Deadline is null or `{kind: "date"|"instant", value}`. Recurrence is null, a declared `{kind: "rule", frequency: "daily"|"weekly"|"monthly", interval, until?}`, or `{kind: "unsupported", raw}`. Unsupported recurrence stays pending. The command expands no recurrence.

A captured field has `origin`, raw text, and typed `value`. Origins are `saved-field`, `label`, `popup`, `editor-draft`, `acknowledgement`, and `unreadable`. Unreadable values may be null. String raw text equals its value unless `extraction: {start, end}` names the exact UTF-16 slice. No trimming, newline conversion, or Unicode normalization occurs. The result reports hashes, lengths, first difference, and trailing-whitespace delta. Raw notes remain in the input.

A persistence sequence contains `closedAt`, `reloadedAt`, and `reopenedAt`. Null means unavailable. A post-operation sequence also contains `savedAt` and names a retained attempt through `forOperation`. Baselines have no fabricated save. Explicit supersession has `readbackId` and `fields`, and requires an earlier same-identity capture. Fresh unreadable replacement evidence cannot borrow the superseded green field.

Each inventory row has `containerId`, `available`, `complete`, `gaps`, `cursorExhausted`, `coverage`, and `items`. Task coverage separately declares `timed`, `untimed`, `allStatuses`, and `synthetic`. Calendar coverage declares `allDay` and `transparency`. Each item has exact `identity`, `type`, `title`, `synthetic`, `completed`, reported `status`, `interval` or null, and raw capture. Events also have `transparency` of `busy`, `transparent`, or `unknown`. Intervals contain offset-bearing `start`, `end`, named `timeZone`, and `allDay`. Optional `campaignKey` identifies a declared duplicate candidate. Repeated titles remain ambiguous candidates. They cannot supply identity or prove duplication by themselves.

Each source has `sourceId`, exact `name`, `kind`, raw `instruction`, and declared `requiredMinutes`, `requiredSessions`, or both. Whole-source work requires one continuous allocation and its exact declared source name in the saved Task title. Use a concise declared source name. Ongoing research keeps its existing labels. Ongoing research permits repeated sessions. Each allocation has `itemKey`, exact `identity`, `sourceId`, `sourceKind`, `start`, and `end`. All durations use half-hour increments. Budgets have `scope` of `day`, `source`, or `campaign`, a `key`, and `maxMinutes`. A morning requirement has local `date`, `start`, `end`, and `minMinutes`. Every declared morning window must be fully covered. A smaller minimum cannot waive a gap. Buffers contain `beforeMinutes` and `afterMinutes`. Event constraints retain exact `identity`, Boolean `mandatory`, and raw `instruction`.

A queued change contains `id`, exact `identity`, `action` of `move`, `resize`, `update`, or `remove-date`, a changed `fields` map, `sourceId` or null, current `intentDigest`, `planDigest`, `baselineReadbackId`, `baselineDigest`, and `inventoryDigests` keyed by selected inventory ID. An unavailable baseline uses null ID and digest. Optional `operationDigest` is checked. Queued fields must still match current intent and allocation. A fresh token cannot legitimize stale values. Baseline drift checks type, completion, notes, schedule, and every other supported field. A recorded save may differ only through its same-operation authorized fields. The result grants no authority.

Attempt outcomes are `saved`, `failed`, `uncertain`, `denied`, and `consumed`. Resolution contains `kind` of `saved` or `no-effect`, `readbackIds`, `inventoryId`, and raw attribution. Uncertainty needs fresh same-ID saved evidence and complete post-attempt duplicate discovery. No-effect resolution also compares all protected baseline fields. Known current-operation intent and plan bindings must match before its saved evidence can qualify. Unknown identities require rediscovery. Denied and consumed effects stay terminal within their exact scope. Unrelated history remains retained without invalidating current item acceptance. Later evidence never deletes the first failure.

Corrections contain `id`, `revision`, `acquiredAt`, raw text, affected `itemKeys`, and `fields`. Aggregate reports contain `outcome`, `count`, named `attemptIds`, and raw text. Contradictory counts stay gaps. Clock resolutions cover every disputed capture and cannot shift the intended interval to conceal disagreement.

Unknown keys, unsupported enums, bad types/dates/zones, unsafe numbers, duplicate IDs, dangling references, incompatible supersession, and impossible sequence order exit 2. Each collection is limited to 2,000 entries. Standard `JSON.parse` uses the last value for duplicate decoded object keys. There is no custom duplicate-key or depth parser.

## Digests and limits

The input digest is SHA-256 of original file bytes. Intent uses the existing canonical JSON digest with strings unchanged. Plan digest excludes `queuedChanges` and its optional claimed `digest`. Each operation digest binds exact identity, current intent and plan, baseline fields, selected inventory bytes, action, changed fields, allocation, and authorized fields. These hashes establish declared byte identity only.

`assessCalendar(input, {evaluatedAt, inputDigest})` is the pure production export for bounded checking. It trusts a validated domain envelope. The CLI validates the boundary and acquires its actual clock. Callers cannot override that clock through an option. The synthetic builders in `verification/calendar-fixtures.mjs` generate executable examples. They contain no personal identities or real campaign state.

The `calendar-acceptance` property runs 429 predicates in seventeen finite partitions with forty-two paired actual-source mutants. Its [reviewed mapping and assumptions](../.agents/skills/coordination-contract/SKILL.md#declared-calendar-acceptance) separate declared assessment from file/parser/clock acquisition and native truth. The [domain declaration](../verification/calendar-properties.mjs) records the fixed clock, exact dimensions, named cases and aggregate count guards.

A fabricated complete envelope can pass. This evaluator cannot authenticate captures, recover omitted history, stop an external queue, select slots, authorize changes, or establish native adoption. Scheduled whole-source coverage establishes neither study completion nor mastery. Exact source, installed executable, loaded guidance, ordinary-turn use, and native saving remain separate claims. Finite property coverage requires its separately reviewed source mapping.
