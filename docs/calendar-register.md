# Calendar register reference

`calendar-register --file <private-envelope.json>` collects Calendar occurrences and native Tasks, or checks a proposed plan. It applies no native changes. All files and provider captures belong under ignored `.local/` or the selected private home.

The owner’s broader goal and proposed versioned constraint model are recorded in [Shared Task planning and module convergence](academic-os-alignment.md). That Academic OS handoff covers both access points, automatic provider-to-module propagation and policy validation for creation, edits and rearrangement. The current register does not yet consume that complete policy model.

The separate [typed cloud/local handoff](calendar-handoff.md) reuses this assessor to bind an exact cloud plan, one-operation local preflights, retained receipts and fresh root acceptance. It adds no native writer and does not change generic executor defaults.

The separate [Academic OS API-plan adapter](academic-os-task-plan.md) uses `action: "academic-os"` to prepare an explicit module or research create/title-change/complete packet, or inspect its original API result. It preserves the official list token separately from this register's native-window digest. It sends no call, provides no timing authorization and cannot turn API application into native acceptance.

## Refresh

The refresh envelope has these fields.

```json
{
  "schemaVersion": 1,
  "action": "refresh",
  "scope": {
    "environment": "designated-host",
    "accountId": "verified-account@example.test",
    "window": {
      "start": "2026-10-28T00:00:00+08:00",
      "end": "2026-11-09T00:00:00+08:00",
      "timeZone": "Asia/Singapore"
    }
  },
  "academicOsRoot": "/private/existing/academic-os",
  "configFile": "/private/existing/academic-os.config.json"
}
```

The adapter loads `google-auth-library` from the existing Academic OS installation. It uses only that installation's scheduled-read Calendar and Tasks credentials. Credential files stay on that executor. It creates no OAuth grant, credential, server, scheduler, module mirror or native item. A different executor needs its own supported existing route. An SSH connection does not transfer credentials or confer new authority.

The collector enumerates CalendarList with hidden and deleted entries, every Task list, bounded expanded Event occurrences, and every Task status. Tasks requests include `showCompleted`, `showHidden`, `showDeleted` and `showAssigned`. Calendar requests include `singleEvents`, `showDeleted` and `showHiddenInvitations`. Filters that could omit commitments are excluded. An empty page can have a continuation token. Repeated IDs, cursor loops, malformed responses, failed reads and exhausted bounds retain explicit gaps.

Each source retains its request parameters, page chain, response digest and original acquisition times. Raw returned Task, Event and discovery rows retain provider IDs, completion, cancellation, original occurrence anchors and recurrence metadata. Calendar series must arrive as provider-expanded occurrences for this window. Cancelled exceptions remain tombstones. All-day end dates are exclusive and use the source Calendar timezone.

The version-one snapshot contains `scope`, `acquisition`, `discovery`, `calendars`, `taskLists`, `taskSchedules`, `mappings`, `sourceScopes` and `ownerDone`. The live collector initializes the last four arrays empty. Native schedule readbacks, source intent and owner corrections enter the separate request. Provider rows are derived data, not a manual work list.

Snapshots are immutable content-addressed JSON under `<home>/calendar-register/snapshots/`. Repeated identical bytes converge to the same file. Temporary files never select a current version. Corrupt existing bytes refuse publication. Exports are bounded at 32 MiB. They are derived artifacts outside the responsibility journal's backup manifest. Existing responsibilities retain intent, original attempts and their evidence references. Refresh can reacquire provider data, but it cannot recover omitted owner history.

`collected` means all declared REST queries exhausted. It does not mean native Task scheduling is known. `partial` retains successful rows and source gaps. CalendarList enumerates calendars added to the account's list, not every potentially accessible calendar. Deleted historical resources can disappear from Google. Collection is not atomic. The account binding is declared and requires an independent account readback.

## Assess

The assessment envelope contains `schemaVersion: 1`, `action: "assess"`, `snapshotFile` and `requestFile`. Both file references resolve locally. The command reads bounded UTF-8 JSON, rejects duplicate decoded keys, uses its actual clock and writes no journal or provider state.

The request has these fields.

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `snapshotDigest` | Version one and the exact exported snapshot digest. |
| `window`, `workingIntervals` | Offset-bearing start/end instants and the named planning timezone. Working intervals stay inside the collected window. |
| `maxEvidenceAgeMs` | A positive inclusive age limit, at most 24 hours. Every underlying page and native supplement must qualify. |
| `mealPolicy` | Exactly `protect-all`. Meal titles and exact `protectedIdentities` block even when Free. An absent protected ID is a coverage gap. |
| `taskSchedules` | Same-ID native saved readbacks with Task digest, observation time, evidence reference, complete window, explicit recurrence state of `none`, `recurring` or `unknown`, recurrence coverage, and zero or more actual intervals. An empty complete readback means observed unscheduled, not an absent API field. |
| `mappings` | Exact Task and Event identities, their raw digests, observation time and attributable mapping evidence. Titles never establish a mapping. Duplicate projections and mismatched geometry remain gaps. |
| `sources` | Stable source ID, exact native `identity`, concise literal `name`, module-file `reference`, exact `range`, `kind`, `actualDurationMinutes`, `dependsOn` and `completed`. |
| `lifecycle` | Exact dismissed or superseded IDs, original owner evidence/time and replacement identities. Native open status stays unchanged. |
| `ownerDone` | Exact native identities with original owner evidence and times. These remain terminal even beside a stale open mirror. |
| `history` | Complete existing responsibility history, its `completeThrough` time and `evidenceRef`. It covers owner-done decisions and every original attempt. Missing or old coverage blocks planning. |
| `operations` | Exact ID, exact protected `baselineDigest`, transport, changed fields and source ID. Titles, dates, starts, ends, duration, timezone and completion are supported domain fields. Descriptions and notes are rejected. |
| `attempts` | Original effect and operation digests, identity, first outcome/time/evidence, exact `prepared` before-state and optional explicit saved/no-effect resolution. |
| `visualReview` | Exact snapshot digest, fresh observed time, evidence reference, window, `mealsProtected: true` and `numericCompared: true`. This records actual native Calendar review, not a rendered draft. |

The executable [synthetic fixture](../verification/calendar-register-fixtures.mjs) supplies the complete shape. It contains no personal state.

The output always has `execution: "none"`. Its versioned `register` combines original provider rows and acquisition metadata with source scopes, exact native schedule/projection evidence, owner history and lifecycle overlays. Native statuses remain separate from the overlay. Its `counts` separate proposed, blocked, already-saved and executed operations; executed is always zero. Availability uses half-open intervals. It sorts and unions blockers, clips them to the window, then subtracts them from working intervals. Busy Events, protected meals and supplied native Task intervals block. Optional Free classes can overlap. Completed or cancelled Tasks are terminal for edits; a supplied surviving interval still blocks. Missing Task timing keeps `freeIntervals` null. A date-only REST response never establishes an untimed Task.

Scheduled blocks have a 30-minute minimum and round up to 30-minute multiples. `actualDurationMinutes` remains source data. A 40-minute paper attempt receives a 60-minute slot with a reported 20-minute rounding allowance. The current campaign's owner decision includes corrections inside the rounded paper bookings and withdraws separate correction units. A separately requested correction in another scope can use its own explicit allowance and dependency. Current 60-minute tests remain 60-minute actual attempts. No generic catch-up, meeting preparation or other obligation is invented.

Every proposed title or interval requires a source mapped to that exact native identity. Its concise source name must appear as a whole label in the Task title. A label such as `Lecture 5` cannot match `Lecture 50`. Source dependencies must be completed or have an earlier valid proposal. A blocked prerequisite blocks its dependent correction. Existing owner-done work cannot reopen. Explicitly dismissed or superseded open Tasks remain in the inventory and cannot be rescheduled or regenerated. An overlay never marks a native Task completed, deletes it or proves an absent interval. Native timing evidence still determines occupancy.

Task REST and Academic OS MCP proposals support title, do-date and completion. They cannot schedule duration. Timed changes use a separately authorized capable native UI. Event REST proposals map a verified complete domain interval to Event start and end; duration is derived. Date-only Event changes and dates outside the collected window are refused. Date-only updates to an already timed Task and recurring or unknown-recurrence Task timing operations are refused even when only one occurrence falls inside the window. The command creates no Task, deletes no item and converts no Task to an Event.

## Execution boundary

Every current proposal requires a retained `policy` in both snapshot and request. Their complete bytes must agree. Provider collection cannot supply owner policy; attach the existing responsibility's retained policy before retaining the assessed snapshot. Missing policy blocks proposals. A refreshed native baseline cannot revoke a policy rule. Historical packets remain inspectable, without a legacy switch permitting new proposals.

The policy has `schemaVersion: 1`, exact environment/account `scope`, and four arrays. `assignments` retain stable IDs, source references and ordered question IDs. `occurrences` retain stable IDs, assignment IDs, name/range/kind, selected `unitIds`, `predecessors`, and open/completed/dismissed/superseded state. Both carry `observedAt` and `evidenceRef`. Each request source names its `assignmentId` and `occurrenceId`. Display labels cannot replace that source. Generic preparation requires an evidenced obligation.

`bindings` associate each active occurrence with one exact native identity. Each retains evidence and `supersedes`, either null or its predecessor's digest. Rebinding requires the same native identity, later evidence and one explicit predecessor; a replaced occurrence remains retained as superseded. Duplicate active native or occurrence associations block. No provider item is created or migrated.

Question groups select contiguous units from the retained ordered inventory. Earlier unfinished units and explicit predecessors require earlier valid proposals. Clearing request-local dependencies cannot remove those requirements. Corrections keep their explicit original-attempt prerequisite and can target only questions needing correction.

`ownerRules` retain an ID, occurrence/native identity, protected `changes`, evidence and exact predecessor digest. Supersession requires the same occurrence, identity and field set, with later evidence. An unrelated rule or newer timestamp cannot revoke protection. Moving an existing timed interval requires a matching evidenced rule. Timing rules compare validated instants, so equivalent UTC and offset strings agree without rewriting evidence. Invalid dates and hour24 refuse. Date-only rules keep date semantics. Title-only edits preserve timing. The [policy fixtures](../verification/calendar-policy-fixtures.mjs) include forbidden manual-move reversal and allowed exact supersession.

Owner attribution and complete policy history remain reported. A caller fabricating both snapshot and policy can fabricate a consistent declaration. Retain original bytes and responsibility history. These checks cannot authenticate owner intent or intercept another executor.

A `proposed` result is reviewable advice. It is neither permission nor a queued native action. Retain the request, snapshot, exact prepared operation and full result in the existing private responsibility evidence before a parent executes one separately authorized action.

The prepared operation binds the original snapshot, intent digest, baseline bytes and capture time. Its stable effect key survives a new acquisition. An attempt cannot predate its before-state. A lost response, interrupted write or mismatched end time requires reconciliation. No-effect resolution compares the original protected before-state, not a newly selected baseline. Saved resolution checks all changed fields and protected native fields, plus fresh protected schedule evidence. A verified saved effect returns `already-saved` and requires no duplicate write. Denied and consumed scopes stay terminal.

Before each action, refresh the affected full window and same native identity. Any new event, changed baseline or changed intent requires another assessment. After Save, close, reload and reopen the same native Task. Verify Task identity and Calendar projection independently. Compare exact title, date, start, end, duration and type. Then inspect the actual Calendar visually and compare its intervals numerically. Proposed, attempted, saved and independently verified counts are separate.

Existing native notes remain untouched. Clearing notes requires its own authorized action. A planning request cannot authorize a notes cleanup.

The checker cannot authenticate reported owner instructions, account identity, native supplements, complete history or visual review. It cannot stop an external executor. Native products remain authoritative. The legacy [`calendar` assessor](calendar.md) retains its version-one saved-state acceptance contract and replay behavior.

Provider Event timestamps with explicit offsets denote absolute instants. A valid IANA endpoint timezone can differ from the returned timestamp offset, such as UTC timestamps beside `Asia/Singapore` recurrence metadata. Preserve that metadata without treating the valid representation as an unreadable commitment. Proposal wall-clock checks and all-day Calendar-zone interpretation remain separate.
