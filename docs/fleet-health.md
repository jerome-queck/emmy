# Retain fleet health and recover sign-in

Use the trusted installed `run-agent` with the primary private home recovered through [dispatch](native-dispatch.md). An empty isolated worktree journal is a fixture, not the live fleet. `fleet` keeps health, read jobs, corrections, and alert receipts under the existing responsibility journal. It invokes no connector, browser, native executor, schedule API, shell wrapper, or Dot sender.

## Adopt and assess the inventory

Adopt an ordinary active responsibility with exact scoped authority and finish criteria. Use its ID in each envelope. The first envelope uses `action.operation: "configure"`, `semanticsVersion: 2`, `entities`, and optional `config`. Later mutations require the exact `expectedHead` returned by `fleet`. Read current state with `action.operation: "status"`.

Every envelope has `schemaVersion: 1`, `responsibilityId`, `action`, and optional `evidence`. Each evidence item has an absolute `path`, exact `sha256`, and attributable `sourceRef`. Receipt bytes must be nonsecret and already approved for retention. The command copies them into the canonical record. Inputs reject duplicate JSON keys, unknown fields, nonordinary files, invalid UTF-8, and bounded-size violations.

Configure entities with these fields:

- `id` is a stable private inventory key. `kind` is `repository`, `installed`, `native-job`, `cloud-job`, `schedule`, `authentication`, or `monitor`.
- `scope` names `service`, `environment`, `surface`, and exact `resource`. Include the intended `account` for authentication. Surfaces are `repository`, `installed`, `native`, `cloud`, `schedule`, `browser`, or `connector`.
- Repository and installed entities bind optional `expectedRevision` or `expectedDigest`. Their captures supply `actualRevision` or `actualDigest`. Missing expected or actual identity stays unknown; mismatched identity is stale even with fresh acquisition. Actual digest claims require retained matching artifact bytes. Revision provenance remains reported.
- Optional `maxAgeMs` tightens source age. Optional `monitorId` names a configured monitor. Monitors cannot depend on other monitors.
- Scheduled entities require explicit `occurrenceId` and `dueAt`, the expected run-window end in UTC. Other run-backed entities use the same pair when a due window is declared. The command infers no recurrence or time-zone correction. Use an owner-attributed `inventory` revision when the expected window or inventory changes. Do not manufacture expected windows from a run's configuration.
- Optional `requiresDelivery` requires an actual artifact delivery reference. Completed runs alone cannot satisfy it.

Acquire fresh repository, installed guidance and launcher, native coding jobs, cloud jobs, and actual schedules in the environment that owns each source. Preserve gaps in the returned inventory. Include disabled and failed runs. Inventory the monitoring mechanism itself. Configuration is not execution. A live PID or quiet stdout does not establish progress, suspension, or death. Same-box snapshots do not establish independent backup.

Supply `action.operation: "assess"` with `captures`. Each current capture names `entityId`, `condition`, stable `issueKey`, `actionIdentity: {kind, target}`, readable `nextAction`, and a `receipt`. `kind` is a stable lowercase identifier; `target` is a stable reference for the actual action scope. Paraphrasing `nextAction` preserves the episode. Changing the structured action identity creates a new episode when the failure remains actionable. A receipt has `sourceRef`, `sha256`, `observedAt`, `capturedAt`, `observer`, exact matching `scope`, and `coverage: {complete, gaps}`. Underlying source time stays separate from acquisition time. A fresh wrapper cannot refresh old source evidence. Each receipt needs matching retained evidence bytes.

Conditions are `healthy`, `login-expired`, `denied-action`, `unavailable-tool`, `timeout`, `resource-pressure`, `monitoring-failed`, `workflow-failed`, `suspended`, `unknown`, or `pending`. Expired login requires `authResponse`. The reducer derives `stale-source` and one `recovered` alert per newly observed recovery. A healthy authentication capture also requires `protectedContent: true` and the exact intended account scope. Imports remain reported claims, even when their bytes and references match.

Optional capture fields are `execution`, `enabled`, `runRef`, `runDueAt`, `outcomeRef`, and `deliveryRef`. Run-backed captures also declare `invocation: {origin, occurrenceId?}`. Origins are `scheduled`, `manual`, or `unknown`; only `scheduled` carries an occurrence ID. A current scheduled capture must explicitly declare origin, even when unknown. Scheduled health requires the exact expected occurrence ID. Manual rescue keeps its actual run, outcome and delivery references but cannot satisfy the scheduled occurrence. Absent historical origin remains unknown and is never inferred from a run reference. After an expected window, `runDueAt` must equal that exact expected `dueAt`; an older run cannot satisfy it. Execution is `configured`, `running`, `completed`, `suspended`, or `unknown`. Disabled or missed expected runs, missing outcomes, and missing delivery remain distinct issues. Post-window absence requires fresh complete coverage. Missing or failed monitor coverage leaves dependent entities unknown. It never makes them healthy.

Run an empty `assess` to retain newly stale sources or expired parent attempts. `status` and `doctor` expose `needsAssessment` without pretending they persisted a new alert. They remain read-only. A totally dormant monitor still needs an external parent wakeup.

## Admit bounded parent reads

Use `action.operation: "submit"` with a `job`. Closed kinds are `health-read` and `briefing-source-read`. Fields are `id`, `kind`, stable `occurrence`, `priority`, exact configured `entityIds`, `purpose`, `maxReads`, `maxBytes`, and `steps`. No executable expressions or arbitrary tool names are accepted. The parent owns actual API call counts and grants.

The default queue retains at most 64 jobs and four unfinished jobs, including uncertainty. Heavy work leaves two slots reserved. Morning work leaves one slot reserved. Interactive work can use all four. Requests are at most 16 KiB; unfinished request bytes total at most 64 KiB. A read declares at most 32 calls, 256 KiB total output per job, and 16 checkpoints. One parent attempt can be outstanding. Explicit resource pressure defers admission. These are cooperative local bounds, not provider-wide enforcement.

Stable job identity binds responsibility effect, kind, occurrence, and ID. Equal requests coalesce before, during, and after completion. Changed contents under one identity refuse. No history is evicted. Queue or alert retention exhaustion returns backpressure or refusal with all prior records intact.

Use `action.operation: "claim"` with attributable `ownerRef`. An admission is retained before returning its ticket. Only a fresh admission response returns a ticket for one bounded parent read. A repeated command returns no execution ticket. Parent calls its supported connector or browser directly, then submits `result` with `jobKey`, exact `ticket`, next `checkpoint`, `outcome`, cumulative attempt `usage: {reads, bytes}`, and attributable `receipt` plus evidence bytes. Ordinary result counters cannot rewind or exceed total job budgets. The retained bytes cannot exceed declared output. An uncertain attempt followed by reconciliation counts the same cumulative usage once. The receipt scope must match the admitted source, and acquisition time must fall within that attempt for successful work. A late result can reconcile an acquisition made inside the ticket interval. Fresh post-deadline reads cannot complete an expired ticket. No-effect and blocked reconciliation can use later inspection receipts. Underlying source time remains separate and may remain stale. Partial coverage cannot complete a read. `completed` requires the declared final checkpoint. `checkpoint` retains progress and queues the next bounded read. Completion means retained acquisition, not delivered work or closed responsibility criteria.

A lost response, expired attempt, or explicit `uncertain` result stays uncertain and consumes capacity. Inspect actual effects and receipt history before using `resolve`. Reconciliation requires the same ticket, receipt, and a reason. `known-unexecuted` permits bounded retry after backoff, at most three failed attempts. `blocked` stops that job. Preserve denials and use the sign-in decision path before a denied action's one scoped retry. Never infer no effect from a process disappearing. No kernel time-namespace witness is required for this non-executing contract, and it does not repair cloud restart acceptance.

Mutations publish through one durable per-head pure journal intent. A competing mutation refuses. After an interrupted publication, repeat the exact input to finish that same transition. The command never replays a parent read. Backup refuses an unresolved journal intent. Restore preserves jobs, alerts, receipts and uncertainty, requires the existing fresh responsibility epoch observations, then explicit `resume`. Old captures stay unknown until fresh post-resume reads arrive.

## Correct findings and deliver meaningful changes

`inventory` requires `entities`, `sourceRef`, and `reason` with retained owner-source evidence. It adds bounded entities or revises existing expectations in the same controller. Existing IDs keep their exact kind, account, environment and resource scope. Entity age cannot exceed the controller freshness bound. Prior expectations remain in correction history. No entity or failure is automatically deleted.

`correct` requires `entityId`, `sourceRef`, and `reason` with retained source evidence. Corrections appear beside that entity on every read. `dismiss` requires the exact `alertId`, `sourceRef`, and `reason`. It suppresses that episode while retaining its failure. Neither operation changes health or supplies recovery proof. A later recurrence creates a fresh episode.

Unchanged healthy reads and unchanged episodes create no new alert. New failure, materially changed structured action, and fresh observed recovery create durable pending alerts. `pendingAlerts` is inspectable work for the parent. It is not a sent message.

For a meaningful alert, the parent prepares the exact useful message with the scoped failure, coverage limit, and next action. Retain its `send-intent` before the supported Dot send. Supply `alertId`, exact `bodyDigest`, `sendRef`, and retained body bytes. Delivery becomes uncertain before the actual send. Parent sends once in the existing Dot conversation, then reads it back. `send-ack` requires matching alert/body/send identity and a distinct `readbackRef` with retained evidence. Only that separate acknowledgment marks reported delivery. If the send outcome is unknown, inspect the conversation before retry. `send-resolve` reopens pending delivery only with attributable `known-unexecuted` evidence. No callable Dot route means delivery remains blocked and pending. Do not change schedules to create one.

## Choose the sign-in handoff

Load [the reusable sign-in skill](../.agents/skills/sign-in/SKILL.md). `signin` accepts a private nonsecret envelope with `schemaVersion`, `service`, intended `account`, `provider`, actual `environment`, `surface`, `sourceRef`, `observedAt`, and `state`. States are `login-required`, `password`, `mfa`, `verify`, `authenticated`, `denied`, `uncertain`, or `unavailable`.

Set `secureForm` or `authHandoff` only after discovering actual supported capability. Prefer the secure form. MFA metadata uses `mfa` of `otp`, `number-matching`, or `owner-approval`, plus the observed `loginService` and matching `issuingService`. An SSO provider may issue the challenge for another protected service. The observed login service must match that declared provider or protected service. Never put the OTP or challenge in the envelope. `authenticated` requires `protectedContent` and matching `protectedAccount`. Browser recovery does not establish connector recovery.

A denied state requires `denial: {sourceRef, scope, knownUnexecuted, persistent}`. One bounded retry additionally requires `retry: {count: 0, authorizationRef, scope, materialChange}`. Its scope must match and its new authorization must differ from the denial source. After that attempt, count becomes one. Persistent denial stops. These are attributable parent inputs, not authenticated grants.

## Verify the release and actual adoption

Run `node scripts/verify-behavior.mjs --focus fleet`, the focused unit controls, and the bounded formal fleet cases/mutations. Run the full aggregate and independent exact-head review before protected release. Retain any red evidence.

After publication, verify installed source and launcher bytes, then acquire `briefing` through the actual installed route and inspect the loaded skill text. Parent next performs a safe real fresh native/app/schedule round trip, invokes this release, inspects pending alerts, sends meaningful findings once, and retains separate send/readback acknowledgment. Fixtures, loaded guidance, parent acceptance, actual delivery, and later ordinary-turn adoption are separate claims.

## Historical morning records

Historical morning interpretation preserves original policy versions, migration predecessor digests, source/assessment clocks, uncertainty, exact native identities, delivered-body readbacks and same-message outcomes. The current CLI refuses all `morning` actions before publication. Use the ordinary fleet `status` operation for read-only inspection. Current collection and migration admission are retired; pure briefing compilation/acquisition remain separate.

Fleet policy revision and grouped-alert operations remain supported. Historical morning recovery follows [the history contract](morning-workflow.md); incomplete pure publications require the exact retained installation on a copy.

## Explicit history archival

`archive` reclaims current projection capacity inside the same immutable controller. It never deletes journal records, evidence, jobs from native products, or account artifacts. It has no timer and performs no native action. The parent first reads `status`, chooses exact closed rows, and retains its attributable archival reason. The envelope uses that exact `expectedHead`; the action also binds `stateDigest` to SHA-256 of canonical `status.state`.

```json
{
  "schemaVersion": 1,
  "responsibilityId": "your-existing-fleet-id",
  "expectedHead": "<exact status headHash>",
  "action": {
    "operation": "archive",
    "stateDigest": "<digest of exact status state>",
    "jobKeys": ["<completed job key>"],
    "runIds": ["<complete resolved morning run ID>"],
    "alertIds": ["<delivered or dismissed alert ID>"],
    "groupSendRefs": ["<resolved group whose alerts archive together>"],
    "entityIds": ["<entity whose older correction history moves out of the projection>"],
    "policyHistory": true,
    "sourceRef": "<retained owner audit source>",
    "reason": "Archive these exact closed rows; retain their original evidence."
  },
  "evidence": [{"path": "<absolute audit artifact path>", "sha256": "<artifact digest>", "sourceRef": "<retained owner audit source>"}]
}
```

Omit unused selection fields. Jobs must be completed. Queued, attempted, uncertain, retrying, blocked and dead jobs refuse. Retained morning references, including old cleanup generations, protect their completed source jobs. Archive a complete run and its source jobs together. Morning runs require resolved delivery, mail effects and summary, with every selected cleanup ID kept or verified. Uncertain delivery cannot be bypassed by dismissal. Groups cannot detach from retained alerts. Entity compaction retains the latest correction and current expected scope, capture, episode, fingerprint and alert identity. Policy compaction retains the current exact policy/version/digest. Earlier correction sources and policy history remain immutable and applicable historical context; archival does not revoke owner instructions.

The archived step's `parentHash` names the exact immutable snapshot before removal. Retain the archive step hash and that predecessor hash. A parent can reopen its original snapshot and raw evidence named by `record.fileDigests` through the installed source's read-only record reader. With `EMMY_HOME` set to the selected private home and `ARCHIVE_PARENT` to that retained predecessor hash, run this from the matching installed source directory.

```sh
node --input-type=module <<'JS'
import { readStore } from './src/records.mjs';
const { records } = await readStore(process.env.EMMY_HOME);
const record = records.find(row => row.hash === process.env.ARCHIVE_PARENT);
if (!record || record.type !== 'fleet-step') throw new Error('Exact retained predecessor missing');
console.log(JSON.stringify(record));
console.log(Object.keys(record.fileDigests ?? {}).map(name => `${process.env.EMMY_HOME}/records/${record.hash}/${name}`).join('\n'));
JS
```

Stable archived job and run identities are looked up in verified ancestors, outside the bounded current snapshot. Identical requests coalesce without new tickets or active rows; changed requests refuse. Exact old job results coalesce; new results cannot mutate archived work. Historical send/edit references cannot authorize another effect. Missing ancestry refuses integrity/replay, and missing history at the reducer boundary refuses new identity use. Backup copies the same complete immutable record/evidence graph. Restore preserves reclaimed capacity and old identity evidence while requiring the existing fresh-epoch observations and explicit resume.

The 64-job, 32-run, 1 MiB state, freshness, read budgets and authority limits stay unchanged. Archive before another operation would exceed a bound. If unresolved work itself fills a bound, archival refuses and the parent must resolve that work within existing authority. Immutable disk usage and replay cost continue to grow with retained history; this operation bounds current state, not total storage or long-term replay time. No native continuation is proven by fixtures.

The current fleet CLI refuses every `morning` action before publication. Historical policy-v1/v2/v3 records, migration acceptance, source clocks, uncertain intents, native identities and same-message outcomes remain readable through the unchanged replay reducer. Use `fleet` with `operation: "status"` to inspect them. No current producer or collection-envelope command remains.

Blocked known-ended read-only failure reconciliation permits an unknown byte total with an explicit known lower bound. Attributable final proof, same ticket and no contradictory native-effect fields are required. Measured bytes remain null; conservative reservation is separately labeled, and budget compliance remains unverified. Success, mutation uncertainty and actual denial guards are unchanged. Original failed attempts and source timestamps persist.

## Explicit evidence-semantics upgrade

New CLI configuration requires `semanticsVersion: 2`. An existing unversioned controller remains exactly replayable, but current evidence/work mutations require an explicit `upgrade` first. A restored old controller first needs fresh exact epoch/authority observations and the existing explicit `resume`, then upgrade against that resumed state. The old-semantics resume exception requires an actual epoch mismatch; same-epoch and second legacy resumes refuse. Resume grants no read ticket or new evidence semantics. Read its current head and state, then submit `action: {operation: "upgrade", semanticsVersion: 2, stateDigest, sourceRef, reason}` with `expectedHead` and retained owner-source bytes. `stateDigest` is the SHA-256 of the canonical current state. A changed predecessor or repeated upgrade refuses. The upgrade neither grants authority nor changes the stable responsibility effect.

Upgrade retains historical captures, alerts, IDs, receipts, corrections, jobs and delivery uncertainty. It seeds current structured fingerprints without inventing historical action or invocation declarations and without emitting retrospective alerts. Old scheduled expectations lacking an occurrence ID stay unverified until an owner-attributed `inventory` supplies that explicit ID and a new capture supplies matching scheduled provenance. Current configure/inventory operations reject a due window without an occurrence ID. Status exposes unknown historical `invocationOrigin`; stale age or another concrete failure can retain diagnostic precedence.

A relaxed audited age policy changes current eligibility only. It retains the original source/acquisition times, old alert bytes and `recoveryPending`. Status reports `recoveryStatus: "fresh-recovery-unverified"` and remains actionable while recovery awaits fresh evidence, even after old alerts were acknowledged. Policy revision, inventory change, empty assessment and a fresh wrapper around an older source cannot emit `recovered`. A subsequent successful scoped assessment must advance underlying source time beyond the prior failing source, reach the failure observation time, and carry a distinct receipt. That assessment can emit recovery even when policy already made the current condition healthy. The receipt remains a parent declaration, not authenticated provider truth.

Historical transition replay uses the unversioned rules, including the original prose fingerprint and policy recovery behavior, to validate exact retained states. Current ingestion has one version-two route. Replay compatibility never permits current callers to select legacy writes. No record type, canonical publisher await, external action or native authority is added.

Responsibility reviews pin `fleetViewVersion: 2` when retaining fleet inputs. Historical reviews without that field replay the original fleet view exactly; current status uses version-two evidence semantics. This keeps historical review bodies and projection fields unchanged while exposing missing old provenance in current status.

Measured known-ended overruns use a separate `failure.kind: "read-only-known-overrun"` on a blocked `result` or expired-ticket `resolve`. Numeric usage retains the exact actual attempt counts. The reducer requires a real original-cap breach and monotone cumulative accounting, records original read/byte caps with `budgetCompliance: "exceeded"`, and never advances a checkpoint or reuses the ticket. Success and unknown-byte paths retain their original limits.

The failure references retained strict JSON proof containing exact `jobKey`, `ticket`, `scope`, `actualReadAttempts`, `totalSerializedResponseBytes`, `admittedMaxReads`, `admittedMaxBytes`, `allReadsEnded: true`, `readOnly: true`, and `nativeEffects: "none"`. Its `responses` array names each retained response by `sourceRef`, `sha256`, exact `bytes`, `startedAt`, and `capturedAt`. All response bytes must match their retained evidence, add to the exact numeric total, and fall after attempt admission and no later than receipt capture. Duplicate response references, wrong attribution/caps, contradictory effect fields and ongoing acquisitions refuse. An ended observer call does not imply its observed workload ended. Proof remains attributable parent reporting, not authenticated provider truth. Existing parser and 1 MiB retained-evidence bounds remain.

Old readers refuse the new failure discriminator. Before private installation, verify the existing journal and backup with the compatible new reader, preserve the old release and retain the compatible reader for recovery. Never rewrite historical records or roll back an extended journal to an incompatible reader.

Measured failure counts accept nonnegative safe integers beyond the admission ceilings, including33reads or262145bytes. Ordinary admission, successful outcomes and unknown-byte handling keep their existing limits. Cumulative sums must also remain safe integers.

The existing262144-byte per-evidence-file,64-file and1MiB total retention bounds remain. A response exceeding those bounds can use explicit `failure.retention: "measurement-only"`. Its bounded proof repeats that mode and exact counts, supplies `largestResponseBytes`, `rawResponseCommitment`, `rawResponsesRetained: false`, `startedAt` and `capturedAt`, and demonstrates a numeric retention overflow. Valid overflow means a response larger than262144bytes, more than63response files plus proof, or response bytes plus proof beyond1MiB. The receipt must declare incomplete coverage and the exact gap `Raw responses omitted because existing evidence-retention bounds were exceeded.`

This mode retains declared exact numeric measurements while explicitly marking `responseRetention: "measurement-only"` and `rawResponseBytesVerified: false`. A commitment identifies omitted bytes; it cannot verify them. No raw artifact is fetched or allocated to settle the failure. The original2-read161853-byte case fits existing retention bounds and must use complete-response evidence. A false overflow assertion refuses. Blocked settlement grants no further call or enlarged budget.
