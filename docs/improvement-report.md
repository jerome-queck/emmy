# Compact improvement reports

Run `node scripts/improvement-report.mjs --file <private-request.json>` in the selected local environment. Every request explicitly names an existing absolute canonical private directory. Symlinked directory components, traversal, symlink files, nonregular files and oversized reads are refused. On systems where `/tmp` or `/var` is a symlink, use the directory's real canonical path. This helper does not create a journal authority, inspect OS-private state, execute jobs, schedule work or send messages.

Use one private directory across `maintenance`, `suggestions`, and `token-optimisation` jobs so their cooperative guard excludes overlapping work. Claim before doing work, publish the terminal result, then release with the exact returned token. If claim returns `held`, skip without deleting or killing another holder. Interrupted claims and the short guard-operation gate require explicit operator recovery. There is no timeout, auto-steal, lease or process-death inference. Keep owner tokens private. The helper is a cooperative guard, not a security sandbox against hostile filesystem writers.

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

Dates are original UTC instants with seconds and optional milliseconds. `scheduledFor` is the exact expected occurrence, not an inferred recurrence. Use exactly the same timestamp representation when publishing and reading. Scheduled reports cannot have `generatedAt` before `scheduledFor`. The terminal identity contains kind, occurrence and run ID. The immutable occurrence slot is keyed by kind, exact occurrence text and manual/scheduled provenance. Exact repeat publication is idempotent. A different second result, including a changed run ID, returns `conflict`, preserves its candidate in a separate conflict file and leaves the first result unchanged. No mutable latest pointer is maintained. Manual reports cannot satisfy scheduled queries.

Terminal `status` is `completed`, `failed`, or `skipped`; `coverage` is `complete`, `partial`, or `unavailable`. Declare absent evidence rather than a clean result. Publication remains independent of the guard so a terminal failure report can be retained; the caller owns claim/work/publication/release sequencing. Reports remain supplied declarations. The helper cannot authenticate native schedule firing, a complete review, evidence truth, execution or delivery.

A read names expected kind, exact occurrence, provenance, `minimumSourceEnd` and maximum report age in seconds, from 0 through 31536000. The caller supplies its expected review cutoff. A report may cover a larger previous gap; its original window end must reach that minimum to be current. It performs no writes and reads only the selected slot, never scans history or waits. It returns `missing`, `future`, `stale`, `failed`, `skipped`, `partial`, `completed-empty`, or `completed-findings`. Age applies to both original `generatedAt` and `sourceWindow.end`. A fresh report wrapper cannot refresh stale source coverage. The original source window stays visible, and `sourceWindowCurrent` reports whether it reaches the requested minimum. A future occurrence or generated time cannot be current. Partial/unavailable coverage, absent evidence references or a source window ending before the requested minimum cannot return either completed state. Duplicate decoded JSON keys, unsafe keys and excessive nesting are rejected for requests and retained reports. Fresh failed results stay failed. Stale or future results retain the terminal status inside the returned report.

Requests are bounded to 32 KiB; published reports and reads to 16 KiB; summaries to 1600 characters; evidence references to 20 entries of 400 characters. Publication uses a complete private temporary file and an exclusive hard link. Named conflicts retain both results. A crash can leave a pending file or held guard; the helper does not silently clean either. Atomic visibility does not establish power-loss durability.

Exit 0 covers claimed/released/published/identical and current complete report reads. Exit 3 covers held guards, publication conflicts and degraded reads. Exit 2 covers malformed input or an operational refusal. Run `node --test test/improvement-report.test.mjs` and `node scripts/verify-behavior.mjs --focus token-review` for actual CLI claims, same-slot publication and bounded read controls. These boundaries add no canonical publication or bounded formal claim.
