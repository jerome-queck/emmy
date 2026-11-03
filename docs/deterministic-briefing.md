# Deterministic briefing pilot

`agent daily-briefing --file <private-request.json>` compiles supplied source bytes into one immutable daily briefing artifact. It performs no account reads, mail moves, message sends, schedule changes or controller writes. Every artifact has `execution: "compiled-only"`, `effectsAuthorized: false` and `delivery: "unverified"`.

This is a foundation for the briefing pilot. The complete saved owner policy, migration of the existing effect owner, independent review and parent-observed ChatGPT delivery remain gates. Supplying a policy file records its digest; it cannot satisfy those gates.

## Compile request

The request has exactly `action: "compile"`, `directory` and `input`. The destination directory must already exist at an absolute canonical path without symlink components. Keep it in the private home, separate from canonical journal records and other producers.

The input has these exact members:

- `schemaVersion: 1`.
- `identity: {day, provenance, scheduledFor}`. The day is `YYYY-MM-DD` in Singapore. Manual origin requires `scheduledFor: null`. Scheduled origin requires the actual supplied nominal UTC time on that Singapore day. Never infer scheduled origin from the current clock.
- `asOf`, the assessment cutoff in canonical UTC milliseconds, such as `2026-11-03T01:00:00.000Z`. It must not be in the future or cross the identity's Singapore day.
- `policy`, either null or `{path, sha256}` for exact saved policy bytes. Missing policy stays explicit. Code does not interpret or reconstruct owner policy.
- `sources`, exactly four `{role, artifact: {path, sha256}}` references, one each for `gmail`, `outlook`, `calendar` and `tasks`. Source order does not change report section order. The input digest still binds the exact declared input.

All references require absolute paths and SHA-256 of the exact UTF-8 bytes. Reads use bounded ordinary-file descriptors. No directory listing, chat discovery, latest-file search or network request supplies a normal input. Each source and the request are bounded to 1 MiB. Total source and thread-context reads are bounded to 4 MiB. Each context is bounded to 256 KiB. Repeated context reads count again.

## Structured source declarations

Every source has exactly `schemaVersion: 1`, `role`, `account`, `surface`, `observedAt`, `capturedAt`, `complete`, `gaps` and the role-specific fields below. Outlook requires `surface: "browser"`; the other roles require `"connector"`. Gmail and school Outlook must name distinct accounts. Exact account authority requires the later saved-policy comparison.

`observedAt` is the original content clock. `capturedAt` is acquisition time. Both use canonical UTC milliseconds. They must satisfy `observedAt <= capturedAt <= asOf`. Content older than five minutes creates a coverage gap. A new file or acquisition clock cannot refresh it. A false `complete` or nonempty `gaps` also degrades coverage. These are attributed declarations, not authenticated provider truth.

Mail sources add `inboxIds` and `items`. Each item has exactly:

- `nativeId`, `threadId`, `sender`, `subject` and original boolean `unread`.
- `context: {artifact: {path, sha256}, complete, unreadPreserved}`. Retain the full inspected context bytes. Both declarations are booleans.
- `judgment: {action, reason, facts, flags}`. Actions are `keep`, `archive` or `trash`. Reasons are single-line text. Facts and flags are bounded single-line lists.

Each reviewed native ID must belong to the declared Inbox inventory and appear once. Omitted IDs remain counted gaps. Incomplete context, unsafe read-state inspection or any protected-item flag renders Keep and a review hold. Other actions remain proposals. Trash always means recoverable Trash. No proposal grants an effect. Missing policy cannot be bypassed by a favorable judgment.

Calendar and Tasks sources add `window: {start, end}`, `containerIds` and `containers`. The window covers exactly midnight to midnight of the full Singapore day. Each container has `nativeId`, boolean `complete` and `entries`. Entries have exactly single-line `title` and `summary`. Omitted or incomplete calendars and Task lists create gaps. These fields describe read-only context; they create no timed Tasks or calendar writes.

Lists retain at most 500 entries or IDs, 64 containers, and 20 facts, flags or gaps. Human text rejects line controls and escapes Markdown. Read [the executable synthetic fixture](../verification/daily-briefing-fixtures.mjs) for the full shape. Fixture identities and judgments are examples, never saved policy or real evidence.

## Exact artifact and read request

The slot name is SHA-256 of the canonical contract identity, followed by `.json`. The contract is `daily-briefing-v1`. Compile returns the exact destination path and body digest. The artifact includes fixed Markdown sections, source clocks, coverage gaps, policy digest and unconditional migration holds. It retains neither thread bodies nor policy contents. Native IDs remain private source data; the human report uses sender, subject and facts.

The read request has exactly `action: "read"`, `directory`, `identity` and `maxAgeSeconds`, an integer from zero through 86400. It reads only that exact slot and its exact conflict marker. Unrelated malformed history does not affect acquisition. The result distinguishes missing, conflict, future, stale, partial and available. Available means a current local artifact with complete declared coverage. It grants no effects or delivery claim.

Publication hard-links a complete temporary file into the exact slot without replacing an existing file. Identical repeats converge. A different candidate preserves the first artifact, a persistent first-conflict marker and a candidate file. A crash after publishing the marker cannot restore a healthy read. Readers may precede a concurrent marker and must reread after observing a change. Interrupted temporary files stay private and never become normal inputs. Retry the same compile input only; a conflict needs explicit review. There is no workload retry, new invocation identity, current pointer or second controller.

The [bounded slot model](../verification/briefing-slot/README.md) covers its declared publication invariants. The existing canonical journal backup and publication model do not cover these derived artifacts. Preserve wanted artifacts separately.

## Migrate the briefing only

The current morning effect owner retains its historical v2/Slack rules and uncertain attempts. Do not reconfigure or reinterpret those records as ChatGPT delivery. Preserve compatible installed readers and all history. The compiler is an independent artifact boundary, not a replacement effect owner.

Before final migration, compare the complete saved policy byte-for-byte with the owner source and encode its actual semantics. Preserve primary Gmail, school Outlook UI only, complete Inbox triage, original read state, recoverable Trash only, read-only Calendar and Tasks, protected correspondence and one verified ChatGPT report. The partial requirements are not a substitute for the full policy. Inspect current saved execution state before any deployment. Owner-reported pauses do not prove jobs are idle.

The parent then owns a separate accepted effect migration and observes one briefing-only pilot, its same-identity repeat, degraded-input behavior and actual ChatGPT output readback. Retain exact before/after state for any authorized mail action. Resolve uncertain effects by exact identity; never replay them from this artifact. Hold after observing that pilot. Other automations, the automation-control API and access settings stay outside this migration.

## Verify and roll back

Run `node --test test/daily-briefing.test.mjs test/improvement-report.test.mjs`, `node scripts/verify-behavior.mjs --focus token-review`, `node scripts/verify-briefing-slot.mjs` and `npm run check`. The behavioral report retains synthetic input, output and conflict bytes through teardown. No fixture proves account access, actual policy compliance, scheduler behavior or user delivery.

Rollback the source change or keep using the previous exact installed release. No installed alias or live state changes as part of this foundation. Preserve every artifact and conflict; the new reader is needed to read its new format. Never reset the existing v2 journal, downgrade its compatible reader, delete historical records or restore old schedule definitions as a rollback shortcut.
