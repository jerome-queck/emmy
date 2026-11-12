---
name: morning-send
description: Check the bounded historical policy-v3 initial-send uncertainty reducer when changing morning delivery, its fleet wrapper, or their inputs.
---

# Morning initial send

Run `node verification/morning-send/check.mjs` from the repository root with Node 24 or later. No Java or TLC is used by this checker. Preserve the printed report on failure and read its generated `chart.mmd`.

## Promises

- `IntentSafe`: the sealed body is bound to an uncertain intent; pending attempts cannot be blindly repeated or resealed, and delivered attempts cannot be repeated.
- `DeliveryExact`: only the current attempt and body, exact configured scope and an acquisition from intent through evaluation, with a distinct readback reference and matching delivered body, establish the declared delivered state. Retain its declared native ID and reference.
- `ResolutionSafe`: only scoped, attributable known-unexecuted reconciliation of the current attempt clears uncertainty, retaining the old attempt and resolution. A subsequent intent may then proceed.

The checker makes a real parsed policy-v3 run using `morningFixture`, real assessments, `morningV3Plan` and the actual seal. It then calls the synchronous `fleetTransition` once per edge; the wrapper clones before `morningTransition` mutates. Independent command/prior-state predicates judge accepted actions. Refusals retain the prior snapshot, action and exact expected reason. Unexpected errors and bound overflow fail. The checker explores the staged actual reducer histories, not provider actions.

The staged menu has one run, one body and destination, two send references, two native IDs and bounded clocks. Intent is at zero, first readback evaluation at two seconds, retry at three seconds, retry readback evaluation at five seconds. It includes early/late, wrong scope, body, attempt, reused reference, invalid resolution, and stale prior-attempt controls. Depth is four; the explicit node and edge limits are 1000. A statechart can hide self loops, not graph exploration. The source mapping and immutable source sync are in [coverage.json](../../../verification/morning-send/coverage.json).

The copied-source negative controls remove the overlapping pending-send guards together, or separately break destination, attempt binding, delivered body, readback separation, acquisition interval, resolution outcome, and history retention. The shortest intended-rule counterexample is selected in deterministic edge order, and each exact trace is replayed against broken and restored modules. The paired pending mutation is necessary because either original guard alone can refuse the duplicate. Source pins reject drift before graph verification; static imports run before the pin check. Do not count syntax errors, unrelated exceptions or pin refusals as semantic counterexamples.

This checks supplied declarations, not true native execution or delivery, globally unique send references, real clocks, authentication, source acquisition, asynchronous journal publication, migration, cleanup, mail, edits, arbitrary histories, installation or provider behavior. The fixture-derived setup is a precondition, not a proof of intake or seal correctness.

## Maintain

Read every covered source and dependency diff from the recorded sync before moving a pin. Reassess each action, oracle and atomic boundary. Keep genuine baseline counterexamples as findings; never weaken a promise to hide one. Run the source mutants, restored baseline and pin refusal, then the aggregate and behavioral drives. Use `pstack:maintain-formal-verification-skill` and independent review. Hash refresh alone is not source review.

The fleet focus materializes a frozen synthetic v3 canonical journal, verifies exact historical replay and native identities, refuses current morning writes before publication, and drives CLI status, backup and suspended restore. The retained reducer properties test historical migration, uncertainty, delivered-body binding and same-message outcomes directly. No current morning producer or collection-envelope helper remains; no provider runs. Preserve `retainedMorning` after cleanup.

The initial-send graph still calls the unchanged historical reducer. Invariants, staged depth, refusal reasons and eight source mutations remain unchanged; it establishes no current CLI producer or native execution.

The checker validates edge endpoints and retained choice paths, independently traverses root reachability, and refuses any original-node rule violation. Every mutation must expose its intended rule and pass actual broken/restored replay. All eight mutations and the destination, attempt and clock ResolutionSafe variants remain required. This is finite production-code history checking with independent command/prior-state predicates, not TLA model checking or a universal proof.

Every run retains full `graph.json`, `chart.mmd`, and intended mutant `replay.json`. The baseline chart shows all accepted histories. A mutant chart shows the intended counterexample; its report names included nodes and omitted-state count. Refusals stay in the full graph. Graph/chart bytes are reread before acceptance. Evidence writes fail the command; a report-write failure can prevent a terminal report and still exits nonzero. Historical TLC evidence is preserved, but new runs emit no TLA/config or TLC output.

Run `node --test test/finite-fleet-checks.test.mjs` for actual checker CLI success without Java/TLC, source-pin refusal, surviving mutation, wrong intended rule, and graph/report write failures. These controls run in the existing aggregate test group. Other models retain their Java/TLC requirements.
