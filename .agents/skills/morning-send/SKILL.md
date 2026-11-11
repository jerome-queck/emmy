---
name: morning-send
description: Check the bounded actual policy-v3 initial-send uncertainty reducer when changing morning delivery, its fleet wrapper, or their inputs.
---

# Morning initial send

Run `node verification/morning-send/check.mjs` from the repository root with Node 24+, Java 21 and the existing pinned TLC jar. Preserve the printed report on failure. Read TLC results with the installed `pstack:statechart` skill.

## Promises

- `IntentSafe`: the sealed body is bound to an uncertain intent; pending attempts cannot be blindly repeated or resealed, and delivered attempts cannot be repeated.
- `DeliveryExact`: only the current attempt and body, exact configured scope and an acquisition from intent through evaluation, with a distinct readback reference and matching delivered body, establish the declared delivered state. Retain its declared native ID and reference.
- `ResolutionSafe`: only scoped, attributable known-unexecuted reconciliation of the current attempt clears uncertainty, retaining the old attempt and resolution. A subsequent intent may then proceed.

The checker makes a real parsed policy-v3 run using `morningFixture`, real assessments, `morningV3Plan` and the actual seal. It then calls the synchronous `fleetTransition` once per edge; the wrapper clones before `morningTransition` mutates. Independent command/prior-state predicates judge accepted actions. Refusals retain the prior snapshot, action and exact expected reason. Unexpected errors and bound overflow fail. TLC explores the generated actual reducer graph, not provider actions.

The staged menu has one run, one body and destination, two send references, two native IDs and bounded clocks. Intent is at zero, first readback evaluation at two seconds, retry at three seconds, retry readback evaluation at five seconds. It includes early/late, wrong scope, body, attempt, reused reference, invalid resolution, and stale prior-attempt controls. Depth is four; the explicit node and edge limits are 1000. A statechart can hide self loops, not graph exploration. The source mapping and immutable source sync are in [coverage.json](../../../verification/morning-send/coverage.json).

The copied-source negative controls remove the overlapping pending-send guards together, or separately break destination, attempt binding, delivered body, readback separation, acquisition interval, resolution outcome, and history retention. TLC must name the intended invariant, and each exact trace is replayed against broken and restored modules. The paired pending mutation is necessary because either original guard alone can refuse the duplicate. Source pins reject drift before graph and TLC verification; static imports run before the pin check. Do not count syntax errors, unrelated exceptions or pin refusals as semantic counterexamples.

This checks supplied declarations, not true native execution or delivery, globally unique send references, real clocks, authentication, source acquisition, asynchronous journal publication, migration, cleanup, mail, edits, arbitrary histories, installation or provider behavior. The fixture-derived setup is a precondition, not a proof of intake or seal correctness.

## Maintain

Read every covered source and dependency diff from the recorded sync before moving a pin. Reassess each action, oracle and atomic boundary. Keep genuine baseline counterexamples as findings; never weaken a promise to hide one. Run the source mutants, restored baseline and pin refusal, then the aggregate and behavioral drives. Use `pstack:maintain-formal-verification-skill` and independent review. Hash refresh alone is not source review.

The held transport retirement changes the CLI driver to record intents and synthetic outcomes directly. This initial-send graph still exercises the unchanged actual reducer, exact uncertainty and known-unexecuted recovery. It has never proved the removed external tool adapter. Bounds, invariants and eight paired source breaks remain unchanged.
