---
name: automation-reporting-contract
description: Verify bounded immutable automation-report publication, incomplete or conflicting scans and reported-only authority after changing automation reporting storage or aggregation.
---

# Automation reporting contract

Run from the repository root:

```sh
node scripts/verify-automation-reporting.mjs
```

Requires Node 24 and Java 21. `EMMY_JAVA_BIN` selects Java; `EMMY_TLC_JAR` selects a jar whose SHA256 must match the existing publication verifier's pinned official TLA+ tools 1.7.4 release. Missing jars download only from that pinned release. No account, provider or API key is used.

Read `verification/automation-reporting/coverage.json`, `AutomationReporting.tla` and the actual production functions named in the mapping before interpreting a pass. Read results with the installed pstack `/statechart` skill. Its current location and invocation belong to that installed skill, not this contract.

The promise: readers never accept partial, corrupt, reference-incomplete or conflicting captured records as current, and producer records never authenticate execution or delivery. A false clean status can hide a missed run or failed delivery. Immutable publisher records remain complete and returned publications remain visible across retries.

The bounded model has two writers publishing distinct conflicting revision-one successors of one retained predecessor, one reader, one corrupt sync input, a stale/fresh captured input flag and one crash/retry per writer. Pending partial writes, completed writes, atomic hard link, reply, crash, retry, list capture and classification are separate actions. A scan can capture any subset and separately claim complete or incomplete. This overapproximates concurrent snapshots; it is not a globally atomic snapshot guarantee. `bad` abstracts corrupt or rejected synced bytes. The current captured set does not change when later writes arrive.

`PublishedComplete` checks canonical producer bytes are committed, `CompletedSurvive` checks returned records persist, `AcceptedSafe` requires complete valid conflict-free captured inputs and `NoFalseAuthority` prohibits independently authenticated status. `StaleVisible` keeps old supplied records visibly stale, while preserving their historical reported execution. `TypeOK` checks domains. The authority flag represents independent authentication, not producer-reported verified state.

Assume collision-free digests, completed writes contain exact intended bytes, atomic same-filesystem hard links, ordinary immutable files, unique pending names and no external deletion or modification of already-published producer records. Corrupt sync is explicitly separate untrusted input. Metadata checks are silent under these assumptions. No liveness, power-loss durability, arbitrary input-size proof, hostile OS ownership protection, authenticated telemetry, native execution, provider calls, schedule firing, delivery, deployment or cloud adoption follows.

The command must report a complete baseline and restored state graph, seven intended model counterexamples and seven concrete witnesses against copied production source. A parse error, missing mutation anchor, unrelated thrown exception, source-drift refusal or missing witness is failure, never a detected mutant. Evidence stays under ignored `.local/automation-reporting-model/`.

Before updating coverage, retain the stale-byte refusal; read every covered source diff from its recorded review basis and review every await, validation gate and projection field. Keep atomic model steps aligned with actual source. Do not weaken an invariant to match a bug. Replay counterexamples against actual copied source, then run unchanged restored baselines. Refresh source and verification digests only after reviewing the exact bytes; advance the source commit only after independently reviewing the committed covered diff. The initial implementation can name a base commit and exact uncommitted source digests explicitly; it must never claim those bytes exist at that base commit. Use `pstack:maintain-formal-verification-skill` after later changes.

The paired copied-source witnesses cover canonical open-before-write, suppressed completeness/conflict/predecessor validity, producer assurance escalation and hidden staleness. Corrupt filesystem scans exercise the same completeness refusal, and an actual stopped baseline writer restarts then retries identically. Missing occurrence correlations, receipt causal clocks, telemetry schema, native ownership, exhaustive parser validation, list pagination and dashboard presentation remain separate behavioral checks. A pending orphan can remain after a crash; no model or baseline promises cleanup or automatic recovery.


`RunTransitions.tla` is a separate small transition model. Its supplied execution states are unknown/running/blocked/pending-approval/completed/failed/skipped. An expected slot without a run never reports success. Terminal completed/failed/skipped states cannot change execution on a same-key revision. A verified receipt cannot regress on a same-key revision. Explicit producer creation can supply any run state; it remains reported. New-key retries, receipt subject changes and occurrence binding are production guards outside this model's enumeration. Three actual-source mutants infer completed from a missing slot, remove the terminal execution guard and remove the receipt stability guard. Baseline actual publication refuses both regressions; mutants publish the invalid successor. Equal-terminal evidence attachment is allowed. No progress, retry completion or externally true terminal state follows.

Run timing is optional producer-supplied evidence. `actualTiming` preserves supplied timing or explicit nulls; it never substitutes recordedAt for actual start, heartbeat or end. Timing observation age feeds the existing stale flag. The copied-source stale mutant is also checked against an old timing observation under a fresh wrapper. Timestamp ordering and schema validation remain behavioral checks outside TLC; no actual process liveness or measured heartbeat truth is proved.

The copied-source dependency closure includes reporting-privacy.mjs. Known credential-pattern rejection runs synchronously before kind validation and adds no publication await or modeled transition. Its lexical coverage and cloud export selector are behavioral controls, outside TLC. A pass proves neither arbitrary secrecy nor safe content for every provider; local paths can remain valid private reporting data.
