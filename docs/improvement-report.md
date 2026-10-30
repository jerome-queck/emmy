# Compact improvement reports

Run `node scripts/improvement-report.mjs --file <private-request.json>` in the selected local environment. Every request explicitly names an existing absolute canonical private directory. Symlinked directory components, traversal, symlink files, nonregular files and oversized reads are refused. On systems where `/tmp` or `/var` is a symlink, use the directory's real canonical path. This helper does not create a journal authority, inspect OS-private state, execute jobs, schedule work or send messages.

Use one private directory across `maintenance`, `suggestions`, `token-optimisation`, `project-chat-cleanup`, `weekly-upkeep`, and `lifecycle-check` reports. Review jobs that share mutable state use its cooperative guard to exclude overlapping work. Claim before doing that work, publish the terminal result, then release with the exact returned token. If claim returns `held`, skip without deleting or killing another holder. A read-only lifecycle checker or later adaptation of retained evidence needs no new work claim. Interrupted claims and the short guard-operation gate require explicit operator recovery. There is no timeout, auto-steal, lease or process-death inference. Keep owner tokens private. The helper is a cooperative guard, not a security sandbox against hostile filesystem writers.

The request union is deliberately small.

```json
{ "action": "claim", "directory": "/canonical/private/improvement", "kind": "maintenance", "runId": "native-run-identity" }
```

```json
{ "action": "release", "directory": "/canonical/private/improvement", "ownerToken": "exact-token-from-claim" }
```

```json
{
  "action": "publish",
  "directory": "/canonical/private/improvement",
  "report": {
    "schemaVersion": 1,
    "kind": "maintenance",
    "scheduledFor": "2026-10-29T03:00:00Z",
    "runId": "native-run-identity",
    "provenance": "scheduled",
    "status": "completed",
    "coverage": "complete",
    "summary": "Reviewed the declared source window; no findings in that complete review.",
    "findings": 0,
    "evidenceRefs": ["private:actual-review-evidence"],
    "sourceWindow": { "start": "2026-10-28T00:00:00Z", "end": "2026-10-29T00:00:00Z" },
    "generatedAt": "2026-10-29T04:00:00Z"
  }
}
```

```json
{
  "action": "read",
  "directory": "/canonical/private/improvement",
  "kind": "maintenance",
  "scheduledFor": "2026-10-29T03:00:00Z",
  "maxAgeSeconds": 86400,
  "provenance": "scheduled",
  "minimumSourceEnd": "2026-10-29T00:00:00Z"
}
```

Dates are original UTC instants with seconds and optional milliseconds. `scheduledFor` is the exact expected occurrence, not an inferred recurrence. Slot keys normalize the occurrence to UTC ISO milliseconds, so equivalent timestamp spellings select the same occurrence. Reads compare occurrence instants. Original report fields remain unchanged. Scheduled reports cannot have `generatedAt` before `scheduledFor`. The terminal identity contains kind, occurrence and run ID. The immutable occurrence slot is keyed by kind, normalized occurrence instant and manual/scheduled provenance. Exact repeat publication is idempotent. A different second result, including a changed run ID, returns `conflict`, atomically links its complete candidate body to one deterministic per-slot conflict marker before returning, preserves each distinct candidate in a hash-named conflict file and leaves the first result unchanged. The marker retains the first conflicting body. Later conflicting publications preserve that marker. Exact repetition of the first report can still return `identical`, but it does not clear the dispute. Malformed, nonregular, oversized, symlinked or wrong-slot markers are refused. No automatic conflict clearing is provided. Hash-named candidates retained by older code without a marker require explicit review or republication to establish the marker; bounded reads do not discover them. No mutable latest pointer is maintained. Manual reports cannot satisfy scheduled queries.

Terminal `status` is `completed`, `failed`, or `skipped`; `coverage` is `complete`, `partial`, or `unavailable`. Declare absent evidence rather than a clean result. Publication remains independent of the guard so a terminal failure report can be retained; the caller owns claim/work/publication/release sequencing. Reports remain supplied declarations. The helper cannot authenticate native schedule firing, a complete review, evidence truth, execution or delivery.

Successful bounded work can declare `status: completed` with `coverage: partial`. The read status `partial` and exit 3 describe evidence eligibility. They do not reverse declared execution success. A completed native turn alone cannot establish that the requested work ran. Retain the requested scope, actual outcome and original evidence. Archive membership is independent of all these fields.

A read names expected kind, exact occurrence, provenance, `minimumSourceEnd` and maximum report age in seconds, from 0 through 31536000. The caller supplies its expected review cutoff. A report may cover a larger previous gap; its original window end must reach that minimum to be current. It performs no writes and reads only the selected slot and its single bounded conflict marker, never scans history or waits. A known marker returns degraded `conflict` with both bounded report bodies before freshness or completion classification. Reads that finish before a concurrent marker becomes visible are an ordinary snapshot limit. A crash after marker creation cannot hide the dispute, even if hash-named candidate retention has not finished. It returns `conflict`, `missing`, `future`, `stale`, `failed`, `skipped`, `partial`, `completed-empty`, or `completed-findings`. Age applies to both original `generatedAt` and `sourceWindow.end`. A fresh report wrapper cannot refresh stale source coverage. The original source window stays visible, and `sourceWindowCurrent` reports whether it reaches the requested minimum. A future occurrence or generated time cannot be current. Partial/unavailable coverage, absent evidence references or a source window ending before the requested minimum cannot return either completed state. Duplicate decoded JSON keys, unsafe keys and excessive nesting are rejected for requests and retained reports. Fresh failed results stay failed. Stale or future results retain the terminal status inside the returned report.

Requests are bounded to 32 KiB; each published or read report file to 16 KiB; summaries to 1600 characters; evidence references to 20 entries of 400 characters. Publication uses a complete private temporary file and an exclusive hard link. Named conflicts retain both results. A crash can leave a pending file or held guard; the helper does not silently clean either. Atomic visibility does not establish power-loss durability.

Exit 0 covers claimed/released/published/identical and current complete report reads. Exit 3 covers held guards, publication conflicts and degraded reads. Exit 2 covers malformed input or an operational refusal. Run `node --test test/improvement-report.test.mjs` and `node scripts/verify-behavior.mjs --focus token-review` for actual CLI claims, same-slot publication and bounded read controls. These boundaries add no canonical publication or bounded formal claim.

## Handover after chat archive

Every read adds `handover` without changing schema-1 reports or existing status/exit meanings. `reportAvailability` is `available`, `missing`, or `conflict`. `execution` preserves declared terminal status, or returns `unknown` for missing output and `conflicting` for a dispute. `evidenceCoverage` preserves declared coverage or exposes unavailable/conflicting evidence. Stale and future reads still expose the original report. These declarations cannot authenticate execution.

`snapshotDigest` hashes the normalized query policy, read classification, immutable report and first conflict marker. It excludes acquisition time and `evaluatedAt`. Equivalent UTC spellings and repeated reads under the same eligibility state share an identity. A new report, first conflict or changed eligibility changes that identity. Later conflict candidates remain retained under the existing first-marker contract; the digest identifies only the selected bounded snapshot. A repeated digest does not prove unchanged unread history.

The helper leaves `parentReceipt` and `userDelivery` as `parent-owned`. It stores neither acknowledgments nor notification state. Use the existing [fleet parent read contract](fleet-health.md#admit-bounded-parent-reads) for acquisition. Retain the exact helper output bytes as receipt evidence. Complete acquisition of this bounded output can have `receipt.coverage.complete: true` even when `report.coverage` is partial. It establishes only the read. Missing, failed or conflicting report contents remain explicit inside those bytes.

Keep the admitted read's stable job ID, occurrence, ticket, usage and result receipt. Repeat the same result to coalesce it. A new acquisition uses an explicit new read occurrence after supported rediscovery, even when its report digest is unchanged. Reuse the report digest as outcome identity in the existing parent review so repeated reads do not create new notifications. Changed or conflicting snapshots require review. The existing fleet send intent/readback and morning same-message delivery rules own any eventual user delivery. A helper result never grants a send or creates a second digest.

Cleanup and weekly upkeep publish their terminal compact reports beside the existing three report kinds. Evidence references point to their existing private receipts and journal. The one-off lifecycle checker remains a single occurrence. Consume its existing exact native thread and retained matrix; do not rearm it to add reporting. If old work lacks a report, retain a later parent-derived adaptation with its actual generation time, exact known root identity and original completion/source times in referenced evidence. Never invent a scheduler execution ID. If a native run finishes before its expected occurrence, keep the existing pre-occurrence publication refusal. Return its native terminal result immediately. A later authorized reader can adapt it after the occurrence without claiming the original run produced that report. Conflicting old reports remain immutable.

Use supported native `read_thread` with the exact known ID and host even after archive. If discovery is needed, use a bounded recent/archived listing and retain page coverage. Read requested work and terminal outcomes, rather than judging success from a title or transport completion. An exact archived listing proves membership only. Missing entries in partial coverage prove neither absence nor failure. Actor, cause, complete descendant state and artifact preservation remain separate gaps. Never unarchive a report to make it readable or use visible chats as a failure queue.

Read existing Krillion outcomes through the same bounded native route. Keep the exact root/host and any attributable automation envelope, requested match scope, settled results, open attempts and evidence limits. Missing terminal results remain unknown or unfinished. No Krillion producer, prompt, skill, gameplay or configuration change is needed. Cloud briefing and URECA already deliver to the parent and stay there. Parent reads these local outcomes through its authorized bridge and existing receipt flow; the helper invokes no native API.
