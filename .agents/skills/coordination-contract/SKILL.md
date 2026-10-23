---
name: coordination-contract
description: Check Emmy's bounded responsibility routing, replay, observation, repair, trigger, lifecycle, import-order, and restore properties after changing their production source, parsers, or verifier.
---

# Persistent responsibility contract

## Run and interpret

Run `node scripts/verify-formal.mjs` with Node 24 or later for the responsibility checker. It requires no package install, solver, service, or account. `npm run verify:formal` also runs the merge-policy enumeration and the [publication model](../publication-contract/SKILL.md), which requires Java 21 and a hash-pinned TLC jar.

The responsibility checker calls actual functions in `src/work.mjs`, `src/responsibilities.mjs`, and `src/records.mjs`. It checks 6,913 predicates across seventeen named properties, then kills thirty-seven paired mutations of those actual source files, then reruns unchanged production. These are finite checks, not a universal proof.

Read each failed counterexample under `.local/verification/formal-*/`. A mutant counts only if it imports successfully and its designated property rejects the intended behavioral disagreement. Syntax/import errors, ambiguous edit anchors, unrelated exceptions, and surviving mutants fail verification. Failed attempts remain retained.

## Production mapping

`src/metadata.mjs` owns property IDs and feature mapping. `verification/coverage.json` owns the reviewed source commit, exact digests, and function-to-property mapping. Read that record before interpreting a pass. The runner validates both working bytes and the bytes at the recorded commit.

The mapping covers exact own bindings and canonical repository intent; observation identity/age/coverage/availability; authority scope/expiry; live cutoff selection; owned-group signal result classification; stable effect keys; concurrent heads; reported assurance; retained failures; exact all-criterion repair closure; current local evidence; native uncertainty and task correlation; trigger coverage; retirement conflicts; current restored suspension; dependency-complete import order; and deterministic replay from a pinned manifest/context.

`reconcileState` is the production policy. `replayReview` reconstructs its inputs from the stored manifest and decision context. Boundary parsers force imports to reported origin. Actual local inspections are separate filesystem/process boundaries exercised by the behavioral driver.

The behavioral boundary also covers reacquiring canonical repository identity before each executable criterion and evaluating canonical restored eligibility at a fresh clock after acquisition reads. Changed or unreadable identity and authority expiry between checks require actual CLI controls. The pure restored-state predicates do not prove that live acquisition occurs.

## Bounds and assumptions

`verification/properties.mjs` exports the exact domains. They use two responsibility IDs, two targets, two revisions, zero-to-two structure sizes, all three claim outcomes, four availability states, complete/partial coverage, ages of minus one millisecond, zero, exactly 24 hours, and one millisecond beyond, one/two definition heads, and explicit trigger states. Active zero-criterion definitions are rejected by the actual parser; zero criteria cover retired/merged definitions.

Targeted temporal traces exceed the small structure product. They include green-then-unknown, failure/pass/repair/later failure, a later exact repair, retained recurrence across a source advance, weaker definitions, and two failed repairs after native completion. The longest recurrence trace has four criterion observations, with up to two target observations, one task observation, two effect observations, two repairs, and three prior reviews. Completed green work stays suppressed; later failures retain attention, require native rediscovery, and fall back to observation/decision when scope expires. Two-criterion closure enumerates absent/pass/fail/unknown rechecks for both original criteria. The products and traces are separate partitions, not a giant Cartesian product or a claim that every synthetic tuple is a reachable CLI state.

Import-order checks call the actual dependency planner over both orderings of two content-addressed observations and inspect every prefix. A separate abstract cycle must refuse. Scope validation rejects replacing a different native schedule. Trigger checks distinguish missing/partial/unavailable coverage, missed run, missing outcome, delivery gap, disabled state, contradictory enabled/disabled readbacks, and explicit supersession.

Additional partitions cover five requested/completion time offsets and zero-to-two inspection timestamps, plus fixed historical replay against live expiry. Native task traces use four statuses, missing/old/current effect keys, fresh/stale ages, and complete/partial coverage. Restore checks include local Codex, Dot-cloud, and Codex Cloud, all four required epoch categories, and explicit wrong-scope, unavailable, denied, unknown, partial, future, unsuperseded and renewed authority traces. Current supersession follows the existing scoped policy; timestamp order alone does not replace a record.

Ten signal-boundary predicates call `terminateOwnedProcessGroup` with an injected signal function over two synthetic PIDs, two independent calls per success/absence/EPERM trace, no acquired PID, and an unexpected EIO. They send no real signals. These checks classify each helper call, not a child's one-request lifecycle. Actual asynchronous callbacks, recorded cleanup uncertainty, cancellation, and descendant teardown require the CLI driver. Neither checker identifies the cause of the original observed EPERM.

The pure checks assume honest production local-inspection results. A caller-supplied observed label cannot supply one; the actual parser controls that boundary. Local bytes prove a digest match. Local command output proves its bounded result. Neither authenticates native provider state, native authority, independent authorship, or semantic correctness.

Filesystem bytes/references, actual git identity, local execution, child cleanup, publication interruption, archive traversal/symlinks/corruption, and restore are verified by `npm run verify:behavior`. No formal claim covers arbitrary-size inputs, power-loss durability, hostile detached processes, native at-most-once execution, total dormancy, account access, schedules, delivery, deployment, or hardware-loss recovery.

## Review source before moving pins

Run the existing gate before updating it and retain any drift failure. Diff every file listed in `verification/coverage.json` from its source commit. Read moved/new owners as well. Classify intentional contract migration, verification drift, and product bugs separately. Do not weaken a property to accept a bug.

For this migration, the accepted architecture replaces the legacy single-request/single-receipt functions with responsibility replay. Old routing and assessment domains no longer describe production. The replacement finite partitions cover the new actual functions; temporal recurrence and import-prefix controls address demonstrated defects. The merge source, tests, policy, and coverage remain unchanged.

Commit final product/verifier source first. Review the full covered diff and mapping, replay every intended mutant, and retain the restored baseline result. Then update coverage hashes and source commit in a separate verification commit. Follow this skill again with the default reviewed-source gate enabled. The local `maintain` generator cannot move this record.

`node scripts/verify-formal.mjs --development` can exercise new source before review. Its report explicitly disables the reviewed-source gate. It cannot satisfy the aggregate check or release acceptance.

The implementation owner's review is source maintenance. The coordinator's source wave, live pass, and independent release review remain separate requirements. Use the installed pstack formal maintenance workflow for that pass. Keep native and protected repository acceptance outside this local proof.
