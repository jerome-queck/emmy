---
name: merge-assurance
description: Check Emmy's hosted or explicit local merge policy, source-bound admission, provider recovery and bounded lifecycle after covered changes.
---

# Merge and local delivery assurance

An effect needs exact checked source, current base, accepted independent practical review and scoped authority. Unknown results must force rediscovery without another effect. A broken guard can publish unreviewed source or repeat an uncertain action.

## Run the checks

From the repository root with Node 24 or later, existing Java 21 and the existing pinned TLC jar, run:

```sh
node --test test/github-auto-merge.test.mjs
node verification/merge-policy.mjs
npm run check
```

Merge tests include the actual fresh-process local CLI. Its copied fixture uses a labelled two-command assurance plan and synthetic GitHub fetch and push boundaries. Full aggregate separately runs every production suite. Original commands, stdout, stderr, receipts, provider requests and checkpoints remain under `.local/verification/delivery-cli/`. These tests perform no live provider writes.

The merge verifier retains historical 30,720 production-function cases and four source mutants. It also runs the local delivery checker. Run `node verification/delivery/check.mjs` for that local part alone. `--development` skips reviewed pins and cannot satisfy aggregate acceptance. Reports, graphs, generated TLA+, raw TLC output and actual-code replays remain under `.local/verification/delivery/`. Preserve failures.

Read every TLC result with `/statechart` by name. Use its current installed instructions in a scratch directory outside the repository, passing generated spec, config and view. It shows charts and shortest invariant violation paths. Do not substitute a hand-drawn chart for a checker result. The committed [chart](../../../verification/delivery/chart.mmd) comes from the passing source graph. It hides only transitions within one displayed label.

## Read the mapping before moving pins

Historical sync IDs and hashes are in [merge coverage](../../../verification/merge-coverage.json). Local source, verification hashes, full sync commit, mappings, bounds and assumptions are in [delivery coverage](../../../verification/delivery/coverage.json). Runners compare working bytes with immutable source commits. A digest proves byte consistency, not execution or review authenticity.

| Rule | Production mapping and harm |
| --- | --- |
| Local admission | `evaluateLocalEvidence` requires equal head/base/clean tree, exact receipt/context, accepted separate review and expiring scope. A broken gate can authorize unrelated source. |
| Eligibility | `evaluateEligibility` keeps historical github-actions admission and selects local mode explicitly. Local merge also requires exact provider head/base, strict administrator protection and truthful local/review statuses. |
| `EffectSafe` | `deliveryTransition` admits an intent only after checks, review and scope, plus merge authorization for merge. |
| `UnknownPreserved` | Unknown intent changes phase only on an exact confirmed observation of its own action. |
| `MergeReadback` | Merged phase requires exact confirmed merge observation. The adapter separately checks the full merge commit in main history. |
| `NoDuplicate` | A completed action cannot admit another intent in one branch generation. The adapter also forces pending-intent rediscovery across processes. |

The graph calls actual `beginDelivery` and `deliveryTransition`, with separate raw facts for check, review, scope, authorization and intent counts. One transition is one synchronous reducer call. Filesystem writes, separate provider reads and network effects are not atomic model actions. Their boundaries require CLI and adapter controls.

## Bounds and negative controls

Local admission enumerates 4,096 combinations of twelve binary faults. The lifecycle graph explores one branch generation, four action identities, valid/invalid checks, review and scope, drift, exact/wrong receipts, denial and absence. Exploration stops at a second same-action intent, where `NoDuplicate` must already fail. This bound prevents an intentionally broken guard from growing an unbounded completion list. Passing production has 44 states and 1,320 edges.

Four admission mutants remove same-author rejection, source equality, review-receipt binding and expiry. Five lifecycle mutants remove review validity, intent validity, confirmed readback, exact readback and completed-action rejection. Each must execute valid source and expose its intended forbidden behavior. TLC paths replay every mutated production call with matching states. An empirical source mutant removes the actual adapter's unknown-intent return. It must repeat the denied effect that production attempts once. Syntax/import errors and unrelated exceptions never count as killed mutants. Restore production and rerun after controls.

Assume collision-free hashes, trusted checker/coordinator code, honest acquired observations, accepted native review provenance and ordinary cooperating filesystem behavior. Names and consistently rehashed fabricated receipts cannot establish independence or actual execution. The graph proves no GitHub enforcement, live permission, arbitrary payload safety, OS trust, atomic source/base comparison, every-instruction crash durability, provider-wide exactly-once effects, stale-lock recovery, installation or future invocation. The CLI retains unknown results and stale locks.

## Maintain after changes

Run old checks and preserve failures first. Read every covered diff from its full sync commit, including moved code and new callers. Classify intentional promises, verification drift and product bugs separately. Update facts from code before rerunning. Never weaken a property to hide a bug.

Follow installed pstack maintain-formal-verification-skill. Replay mutants, inspect counterexamples and rerun restored production. Commit reviewed source before advancing sync IDs/hashes in a separate verification change. Maintain the project driver and feature prose. Generated maintenance does not review assumptions. Independent exact-head practical review remains a parent release gate.
