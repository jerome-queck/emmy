# Cooperative cloud admission

## Drive

Run `node scripts/verify-behavior.mjs --focus cloud`. The driver retains every two-phase acceptance call, isolated home, fault envelope, interrupted writer output and assertions under its named `cloud/` evidence directory. `node scripts/cloud-acceptance.mjs --home <private-home> --phase prepare` followed by a genuinely fresh `--phase resume` is the releasable bounded parent invocation. Read [the command contract](../../../../docs/cloud-admission.md).

One configured queue per private home uses one existing responsibility. A submit pins stable effect/job identity and exact contents. Pending jobs include the logical active job. Heavy work cannot consume interactive/morning reservations. One tick computes at most one pure standard-library SHA-256 chunk and commits its checkpoint/output together. Higher priority can precede heavy continuation at that boundary. Queued/in-flight/finished duplicates coalesce; conflicting contents refuse. Retry exhaustion is dead, explicit lifecycle pause is suspended and unverifiable ownership is unknown.

The real CLI drive verifies twelve logical jobs, four pending slots, payload refusal above 64 KiB, overflow, two priority reservations, backoff, retry exhaustion, duplicate prevention and checkpoint recovery across separate processes. A permissive bounded actual sampler control computes one tiny job without injected capacity. Other pressure, monitoring and sign-in controls explicitly inject synthetic signals. Stopped fixture writers prove busy/abandoned readouts, quiet durable pending escalation, wrong-token refusal, exact-token checkpoint/configure recovery and unresolved-backup refusal. No unowned process receives a signal. Reconciliation/replay includes cloud records; archive restore stays suspended.

## Source and bounded mapping

`src/cloud.mjs` owns the controller/reducer, actual telemetry, turn claims and pending escalation projection. `src/cloud-schema.mjs` validates inputs/configuration/executable records. `src/records.mjs` validates those records before publication and after reads, checks scoped lineage/checkpoints and archives the canonical records. `src/responsibilities.mjs` includes their context in reviews, pinned inputs, replay and doctor. CLI/metadata map one `cloud` command and `cloud-admission` scenario/property.

The finite `cloud-admission` property checks 106 production predicates and twelve actual-source mutants. Read [the coordination skill](../../coordination-contract/SKILL.md#cooperative-cloud-admission) before interpreting that pass. Live file/clock/authority/claim boundaries remain behavioral checks. Turn claims are retained, never reclaimed by deleting resources. Backup refuses unresolved current claims. Restore requires fresh existing epoch observations and explicit controller resume.

## Limits

No result establishes parent cloud use, provider quota/global enforcement, native browser execution, automatic adoption, notification delivery, arbitrary external exactly-once effects, whole-provider restart or power-loss survival. Pending escalation output is not a delivered Dot message. Actual parent use, installed bytes, loaded guidance and later ordinary-turn adoption need separate readbacks.
