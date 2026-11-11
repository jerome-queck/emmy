---
name: fleet-health
description: Check bounded semantics-v2 fleet health and recovery episode histories after changes to their source, inputs, or verifier.
---

# Fleet health histories

Run `node verification/fleet-health/check.mjs` from the repository root with Node 24+, Java 21 and the existing pinned TLC jar. Read every result with `pstack:statechart` and replay counterexamples against the copied and restored source. The report and full graph remain under `.local/verification/fleet-health/`. The checker must refuse changed covered bytes. Do not change a pin before reading every covered source diff and rechecking this mapping.

`StableEpisode` preserves identity and alert count across consecutive equal bad fingerprints. `ConservativeHealth` prevents a dependent authentication entity from appearing healthy when its monitor is bad, its source is stale or its coverage/protected-content declaration is insufficient. `FreshRecovery` requires an explicitly supplied assessment with an observed clock at or after pending time, strictly after any retained baseline, and a changed receipt digest. It also checks that eligible evidence emits recovery. `Admission` rejects exact scope mismatch, backdating and contradictory same-time captures. `Recurrence` preserves a distinct later failure episode after recovery and checks failure transitions advance the episode.

The graph calls the actual synchronous `fleetInitial` and `fleetTransition`, with parsed synthetic root and actions. One edge is one reducer call at a declared clock. It explores only the stage-specific menus in `graph.mjs`, with five calls, two entities, a six-minute-forty-second stale clock, optional age-policy relaxation and an old source wrapped in a later acquisition, and explicit state/edge/alert bounds. Stale advance is available once; policy and old-wrapper choices require that history. Unexpected reducer errors or exceeded bounds fail. Rejected edges retain actual error and untouched prior state. A path after a violated property is a retained leaf. Fingerprints compare condition, issue key and structured action identity, not prose. The graph retains full state and receipts; no episode or receipt is hash-collapsed.

Each named property has a copied-source semantic mutation, intended TLC counterexample and actual broken/restored replay. The run includes original and restored baselines. Review the returned counterexample and distinguish a current-source failure from stale verification. Do not weaken a promise or repair product semantics within this skill.

[Coverage](../../../verification/fleet-health/coverage.json) records the reviewed source commit and file pins. Read changed source and relevant callers, compare atomic boundaries and assumptions, update the graph where needed, replay intended mutations and only then advance the sync record. Run the installed `pstack:maintain-formal-verification-skill` and the empirical [verify skill](../verify/SKILL.md) after covered changes.

Synthetic reported scopes and protected-content fields are not authenticated. The graph does not prove sign-in, provider health, real acquisition, asynchronous journal publication, delivery, native tools, installation, recovery of a physical service, arbitrary input histories or unbounded execution. `signin` is a separate advisory caller, not a fleet transition.
