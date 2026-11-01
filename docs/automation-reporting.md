# Private automation reporting

The reporting CLI reads validated immutable outcomes. Existing improvement-report producers and fleet responsibilities still own reporting and monitoring. This hub never reruns gameplay, quizzes, mail, Tasks or calendar actions. No remote service, OAuth, installation or account permission is needed for local operation.

```sh
mkdir -m 700 /absolute/private/reporting-store
npm run reporting -- --help
npm run reporting -- status --directory /absolute/private/reporting-store
npm run reporting -- import-improvement --directory /absolute/private/reporting-store --namespace maintenance --automation-id daily-maintenance --file /absolute/private/compact-report.json --dry-run
npm run reporting -- import-improvement --directory /absolute/private/reporting-store --namespace maintenance --automation-id daily-maintenance --file /absolute/private/compact-report.json
npm run reporting -- list --directory /absolute/private/reporting-store --limit 50 --query unresolved
npm run reporting -- serve --directory /absolute/private/reporting-store
```

Use an existing absolute canonical directory without symlink ancestry. `serve` prints its loopback URL and binds only `127.0.0.1`; stop its owned process with Ctrl-C. GET-only HTTP serves the same validated model. There are no rerun or cancellation controls.

## CLI contract

Each invocation prints one JSON result. Exit 0 means its local operation completed, 2 means invalid input or an operational refusal, and 3 means findings requiring attention. A completed review with partial evidence is a valid execution outcome; `coverage-partial` is evidence attention, not execution failure. Missing reports and delivery remain separate. Empty inventory means registered-only coverage with unknown undiscovered automations, never complete fleet coverage.

`inspect`, `status`, `diagnose` and `reconcile` read the bounded store without writes or native actions. `validate` and `dry-run` validate a supplied record and ownership without writes. `publish-own-record` requires `--namespace` matching the envelope. `export-outcome --id <current-run-digest> --to <absolute-private-output>` writes a bounded sanitized outcome file without cloud calls. It refuses incomplete scans, invalid/conflicted/superseded runs, known credentials, private paths/account addresses in exported text, and unsafe artifact URLs. Identical output retries converge; different existing bytes remain unchanged. `get --id` retrieves an exact immutable digest, including historical revisions. `list` supports namespace, automation, bounded search, digest cursor and limit 1–200. Its cursor addresses observed immutable IDs; restart pagination to discover concurrent insertions before a cursor. CLI help lists exact flags. The existing `agent reporting --file <request.json>` exposes the same core JSON operations.

Scans inspect at most 200 root entries and 5,000 namespace entries, including pending files. Each record is bounded to 32 KiB. Exceeding a bound or finding corrupt/mismatched canonical bytes yields explicit incomplete coverage and suppresses accepted run execution. Pending write bytes are ignored within those bounds. A scan may precede a later write and is not a transactional filesystem snapshot. No all-account completeness claim follows.

## Version 1 record schema

Every envelope has exactly `schemaVersion`, `namespace`, `automationId`, `kind`, `key`, `revision`, `previous`, `recordedAt`, and `data`. Version is 1. Namespace and automation ID are safe identifiers of at most 120 characters. Keys retain bounded original logical identities, including compact-report run IDs; keys never form filesystem paths. Timestamps are canonical UTC. Revision zero has null predecessor. Later revisions reference the exact prior digest, same identity, preceding revision and nondecreasing record clock. Run occurrence identity and receipt subject stay fixed. Missing or invalid predecessors and divergent leaves remain visible and unusable.

`automation` data contains `name`, `enabled`, `schedule`, `environment`, `nativeRef`, `model`, `destination`, nullable `freshChat` and `archiveOnSuccess`, `sourceRef`, and `observedAt`. It preserves declared native configuration; it does not configure a scheduler. Freshness checks the original native observation, not just the latest envelope.

`occurrence` data contains `scheduledFor` and `expiresAt`. Expected slots exist independently of observed invocations. An expired slot without a validated run is overdue. Invalid or conflicted invocation evidence leaves the slot unknown. No slot or archive membership implies completion.

`run` data contains nullable `occurrenceKey`, `execution`, `coverage`, nullable `report`, and bounded `evidenceRefs`. Execution is unknown, running, blocked, pending-approval, completed, failed or skipped. Terminal execution cannot change state in a successor. A retry uses a new invocation key. Same-state successors can append corrected report/coverage evidence; old facts remain immutable. Coverage is complete, partial or unavailable. Optional `telemetry` contains measured `runtimeMs`, `inputTokens`, `outputTokens` (unavailable values are null), and `sourceRef`. Optional `timing` contains nullable `startedAt`, `lastHeartbeatAt`, `endedAt`, plus `observedAt` and `sourceRef`. Event times are ordered and no later than the source observation; observation is no later than the envelope. Omitted timing projects explicit nulls. Report generation, import and envelope clocks never become actual run events. Values are supplied measurements, never estimates of provider billing. The reader preserves raw measured values; it invents no trends from missing telemetry.

The compact report is the existing [improvement-report](improvement-report.md) v1 contract. Its execution/coverage/run identity must match the envelope, and scheduled provenance must match the exact occurrence time. `import-improvement` uses deterministic slot identity and scheduled-time bytes for the occurrence, preserving the original report generation time on the run. Distinct attempts for one slot therefore share one expected occurrence. Manual reports create no expected slot. Publication retry is safe after interruption between the two immutable writes and never replays the underlying work.

`publication` and `delivery` data contain exact run digest `subject`, `state` (pending, accepted, verified or failed), and nullable `evidenceRef`. Verified requires an evidence reference and cannot regress in a successor. Subjects must be current valid nonconflicting runs in the same producer scope and precede the receipt. Acceptance is not verified publication; publication is not user delivery. Both remain attributable reported claims. Their references do not authenticate a provider or recipient.

`issue` data contains bounded searchable `title`, state open/acknowledged/resolved, and `evidenceRefs`. Resolution requires evidence. Immutable revisions retain acknowledgements and later reopenings. Only compact sanitized outcomes and safe artifact references belong in these records. Keep secrets, raw logs, full mail and sensitive account payloads out. Publication rejects recognized API-key, Bearer, private-key and credential-URL patterns. Cloud export explicitly selects compact outcome fields and hashed timing references; it excludes local evidence refs. Its additional policy refuses recognizable local paths, account email addresses, raw headers and credential-bearing URLs. Refusal leaves publication pending. These bounded lexical checks cannot establish that arbitrary prose contains no secret; producers still own sanitization.

## Storage and ownership

Each producer writes only `<store>/<namespace>/<sha256>.json`. The SHA-256 covers recursively sorted JSON. A fully written fresh pending file is hard-linked to the canonical digest, read back, then the owned pending file is removed. Identical retries converge; differing records are retained. Readers derive the view from all validated facts; producers never write a shared index or dashboard. Namespace selection is cooperative ownership, not OS-user authentication. Ordinary trusted private directories, collision-resistant hashes, atomic same-filesystem hard links and no hostile concurrent ancestor replacement are assumptions. No power-loss durability follows.

`pendingPublicationQueue` derives from runs without a verified publication receipt. Retrying that queue means retrying reporting only. Native sync/publication and the existing ChatGPT notification workflow remain parent-owned. No new notification channel is created. Keep a pending notice distinct from an independently verified user delivery.

## Native adoption and folder upkeep

Inventory existing native and cloud definitions before migrating adapters, including disabled definitions and missing fields. Retain actual authority, timings, model, destination and lifecycle fields privately. Retained cloud metadata is not a current readback. Parent owns cloud prompt changes. Future automation prompts should publish their own compact record after bounded work, preserve their original workload success criteria, and record failure/blocked/approval outcomes without replaying effects.

Drive publication requires independent evidence mapping the exact existing folder IDs and intended account to the local synced directory. A matching name or readable mount is insufficient. Keep local immutable records and the pending queue until that mapping is verified. A successful local write is not uploaded publication or user delivery.

Exactly one separately named local folder-upkeep automation may maintain managed names, paths, links and freshness after that gate. It must not invent outcomes, edit artifact content or permanently delete files. Keep it paused when the exact synced mapping is unverified. Models, fresh-chat and archive settings require saved native readbacks separately; unsupported controls remain unverified. Other automation schedules stay unchanged.

## Verification

Run `node --test test/automation-reporting.test.mjs test/automation-reporting-cli.test.mjs`, `npm run verify:reporting`, and `npm run check`. The [behavioral driver](../.agents/skills/verify/SKILL.md) retains real fresh-process CLI requests and immutable evidence after teardown. The [reporting formal contract](../.agents/skills/automation-reporting-contract/SKILL.md) records exact source mapping, bounded TLA+ assumptions and intended model/source mutants. Read results with installed `pstack:statechart`. Model checking covers its finite model, not Drive, actual runtime execution, native delivery or absence of all bugs.
