# Retain fleet health and recover sign-in

Use the trusted installed `run-agent` with the primary private home recovered through [dispatch](native-dispatch.md). An empty isolated worktree journal is a fixture, not the live fleet. `fleet` keeps health, read jobs, corrections, and alert receipts under the existing responsibility journal. It invokes no connector, browser, native executor, schedule API, shell wrapper, or Dot sender.

## Adopt and assess the inventory

Adopt an ordinary active responsibility with exact scoped authority and finish criteria. Use its ID in each envelope. The first envelope uses `action.operation: "configure"`, `entities`, and optional `config`. Later mutations require the exact `expectedHead` returned by `fleet`. Read current state with `action.operation: "status"`.

Every envelope has `schemaVersion: 1`, `responsibilityId`, `action`, and optional `evidence`. Each evidence item has an absolute `path`, exact `sha256`, and attributable `sourceRef`. Receipt bytes must be nonsecret and already approved for retention. The command copies them into the canonical record. Inputs reject duplicate JSON keys, unknown fields, nonordinary files, invalid UTF-8, and bounded-size violations.

Configure entities with these fields:

- `id` is a stable private inventory key. `kind` is `repository`, `installed`, `native-job`, `cloud-job`, `schedule`, `authentication`, or `monitor`.
- `scope` names `service`, `environment`, `surface`, and exact `resource`. Include the intended `account` for authentication. Surfaces are `repository`, `installed`, `native`, `cloud`, `schedule`, `browser`, or `connector`.
- Repository and installed entities bind optional `expectedRevision` or `expectedDigest`. Their captures supply `actualRevision` or `actualDigest`. Missing expected or actual identity stays unknown; mismatched identity is stale even with fresh acquisition. Actual digest claims require retained matching artifact bytes. Revision provenance remains reported.
- Optional `maxAgeMs` tightens source age. Optional `monitorId` names a configured monitor. Monitors cannot depend on other monitors.
- Optional `dueAt` is the explicit expected run-window end in UTC. The command infers no recurrence or time-zone correction. Use an owner-attributed `inventory` revision when the expected window or inventory changes. Do not manufacture expected windows from a run's configuration.
- Optional `requiresDelivery` requires an actual artifact delivery reference. Completed runs alone cannot satisfy it.

Acquire fresh repository, installed guidance and launcher, native coding jobs, cloud jobs, and actual schedules in the environment that owns each source. Preserve gaps in the returned inventory. Include disabled and failed runs. Inventory the monitoring mechanism itself. Configuration is not execution. A live PID or quiet stdout does not establish progress, suspension, or death. Same-box snapshots do not establish independent backup.

Supply `action.operation: "assess"` with `captures`. Each capture names `entityId`, `condition`, stable `issueKey`, exact `nextAction`, and a `receipt`. A receipt has `sourceRef`, `sha256`, `observedAt`, `capturedAt`, `observer`, exact matching `scope`, and `coverage: {complete, gaps}`. Underlying source time stays separate from acquisition time. A fresh wrapper cannot refresh old source evidence. Each receipt needs matching retained evidence bytes.

Conditions are `healthy`, `login-expired`, `denied-action`, `unavailable-tool`, `timeout`, `resource-pressure`, `monitoring-failed`, `workflow-failed`, `suspended`, `unknown`, or `pending`. Expired login requires `authResponse`. The reducer derives `stale-source` and one `recovered` alert per recovery. A healthy authentication capture also requires `protectedContent: true` and the exact intended account scope. Imports remain reported claims, even when their bytes and references match.

Optional capture fields are `execution`, `enabled`, `runRef`, `runDueAt`, `outcomeRef`, and `deliveryRef`. After an expected window, `runDueAt` must equal that exact expected `dueAt`; an older run cannot satisfy it. Execution is `configured`, `running`, `completed`, `suspended`, or `unknown`. Disabled or missed expected runs, missing outcomes, and missing delivery remain distinct issues. Post-window absence requires fresh complete coverage. Missing or failed monitor coverage leaves dependent entities unknown. It never makes them healthy.

Run an empty `assess` to retain newly stale sources or expired parent attempts. `status` and `doctor` expose `needsAssessment` without pretending they persisted a new alert. They remain read-only. A totally dormant monitor still needs an external parent wakeup.

## Admit bounded parent reads

Use `action.operation: "submit"` with a `job`. Closed kinds are `health-read` and `briefing-source-read`. Fields are `id`, `kind`, stable `occurrence`, `priority`, exact configured `entityIds`, `purpose`, `maxReads`, `maxBytes`, and `steps`. No executable expressions or arbitrary tool names are accepted. The parent owns actual API call counts and grants.

The default queue retains at most 64 jobs and four unfinished jobs, including uncertainty. Heavy work leaves two slots reserved. Morning work leaves one slot reserved. Interactive work can use all four. Requests are at most 16 KiB; unfinished request bytes total at most 64 KiB. A read declares at most 32 calls, 256 KiB total output per job, and 16 checkpoints. One parent attempt can be outstanding. Explicit resource pressure defers admission. These are cooperative local bounds, not provider-wide enforcement.

Stable job identity binds responsibility effect, kind, occurrence, and ID. Equal requests coalesce before, during, and after completion. Changed contents under one identity refuse. No history is evicted. Queue or alert retention exhaustion returns backpressure or refusal with all prior records intact.

Use `action.operation: "claim"` with attributable `ownerRef`. An admission is retained before returning its ticket. Only a fresh admission response returns a ticket for one bounded parent read. A repeated command returns no execution ticket. Parent calls its supported connector or browser directly, then submits `result` with `jobKey`, exact `ticket`, next `checkpoint`, `outcome`, cumulative attempt `usage: {reads, bytes}`, and attributable `receipt` plus evidence bytes. Declared counters cannot rewind or exceed total job budgets. The retained bytes cannot exceed declared output. An uncertain attempt followed by reconciliation counts the same cumulative usage once. The receipt scope must match the admitted source, and acquisition time must fall within that attempt for successful work. A late result can reconcile an acquisition made inside the ticket interval. Fresh post-deadline reads cannot complete an expired ticket. No-effect and blocked reconciliation can use later inspection receipts. Underlying source time remains separate and may remain stale. Partial coverage cannot complete a read. `completed` requires the declared final checkpoint. `checkpoint` retains progress and queues the next bounded read. Completion means retained acquisition, not delivered work or closed responsibility criteria.

A lost response, expired attempt, or explicit `uncertain` result stays uncertain and consumes capacity. Inspect actual effects and receipt history before using `resolve`. Reconciliation requires the same ticket, receipt, and a reason. `known-unexecuted` permits bounded retry after backoff, at most three failed attempts. `blocked` stops that job. Preserve denials and use the sign-in decision path before a denied action's one scoped retry. Never infer no effect from a process disappearing. No kernel time-namespace witness is required for this non-executing contract, and it does not repair cloud restart acceptance.

Mutations publish through one durable per-head pure journal intent. A competing mutation refuses. After an interrupted publication, repeat the exact input to finish that same transition. The command never replays a parent read. Backup refuses an unresolved journal intent. Restore preserves jobs, alerts, receipts and uncertainty, requires the existing fresh responsibility epoch observations, then explicit `resume`. Old captures stay unknown until fresh post-resume reads arrive.

## Correct findings and deliver meaningful changes

`inventory` requires `entities`, `sourceRef`, and `reason` with retained owner-source evidence. It adds bounded entities or revises existing expectations in the same controller. Existing IDs keep their exact kind, account, environment and resource scope. Entity age cannot exceed the controller freshness bound. Prior expectations remain in correction history. No entity or failure is automatically deleted.

`correct` requires `entityId`, `sourceRef`, and `reason` with retained source evidence. Corrections appear beside that entity on every read. `dismiss` requires the exact `alertId`, `sourceRef`, and `reason`. It suppresses that episode while retaining its failure. Neither operation changes health or supplies recovery proof. A later recurrence creates a fresh episode.

Unchanged healthy reads and unchanged episodes create no new alert. New failure, materially changed action, and recovery create durable pending alerts. `pendingAlerts` is inspectable work for the parent. It is not a sent message.

For a meaningful alert, the parent prepares the exact useful message with the scoped failure, coverage limit, and next action. Retain its `send-intent` before the supported Dot send. Supply `alertId`, exact `bodyDigest`, `sendRef`, and retained body bytes. Delivery becomes uncertain before the actual send. Parent sends once in the existing Dot conversation, then reads it back. `send-ack` requires matching alert/body/send identity and a distinct `readbackRef` with retained evidence. Only that separate acknowledgment marks reported delivery. If the send outcome is unknown, inspect the conversation before retry. `send-resolve` reopens pending delivery only with attributable `known-unexecuted` evidence. No callable Dot route means delivery remains blocked and pending. Do not change schedules to create one.

## Choose the sign-in handoff

Load [the reusable sign-in skill](../.agents/skills/sign-in/SKILL.md). `signin` accepts a private nonsecret envelope with `schemaVersion`, `service`, intended `account`, `provider`, actual `environment`, `surface`, `sourceRef`, `observedAt`, and `state`. States are `login-required`, `password`, `mfa`, `verify`, `authenticated`, `denied`, `uncertain`, or `unavailable`.

Set `secureForm` or `authHandoff` only after discovering actual supported capability. Prefer the secure form. MFA metadata uses `mfa` of `otp`, `number-matching`, or `owner-approval`, plus the observed `loginService` and matching `issuingService`. An SSO provider may issue the challenge for another protected service. The observed login service must match that declared provider or protected service. Never put the OTP or challenge in the envelope. `authenticated` requires `protectedContent` and matching `protectedAccount`. Browser recovery does not establish connector recovery.

A denied state requires `denial: {sourceRef, scope, knownUnexecuted, persistent}`. One bounded retry additionally requires `retry: {count: 0, authorizationRef, scope, materialChange}`. Its scope must match and its new authorization must differ from the denial source. After that attempt, count becomes one. Persistent denial stops. These are attributable parent inputs, not authenticated grants.

## Verify the release and actual adoption

Run `node scripts/verify-behavior.mjs --focus fleet`, the focused unit controls, and the bounded formal fleet cases/mutations. Run the full aggregate and independent exact-head review before protected release. Retain any red evidence.

After publication, verify installed source and launcher bytes, then acquire `briefing` through the actual installed route and inspect the loaded skill text. Parent next performs a safe real fresh native/app/schedule round trip, invokes this release, inspects pending alerts, sends meaningful findings once, and retains separate send/readback acknowledgment. Fixtures, loaded guidance, parent acceptance, actual delivery, and later ordinary-turn adoption are separate claims.

## One morning run and audited revisions

The [morning procedure](morning-workflow.md) extends the same fleet journal with `morning` commands. `src/morning.mjs` owns explicit run, reviewed-item, delivery, mail-intent and same-message-edit states. Acquisition jobs still use the existing fleet queue. Every source, complete inventory, context artifact, exact assessment output and delivered-body readback remains attributable parent evidence. Native I/O and schedules stay parent-owned. Status exposes unfinished and uncertain morning work as needing attention.

`policy-revise` appends a version/digest, exact entity scopes, windows and owner source. It preserves original captures, timestamps and stale/failure episodes. A policy-only eligibility change is distinct from fresh recovery. Later explicit tighter limits win; new unaudited entities keep the root default. `group-send-intent`, `group-send-ack` and `group-send-resolve` retain one atomic set of pending alert IDs and one exact send/body/readback. A historical single-alert send cannot be reused or expanded into a group. No owner/process-recovery rule is relaxed.
