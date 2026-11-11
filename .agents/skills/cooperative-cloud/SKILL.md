---
name: cooperative-cloud
description: Check bounded reachable histories of the actual cooperative cloud logical-job reducer after changes to its identity, checkpoint, retry or terminal state.
---

# Cooperative cloud reducer

Run `node verification/cooperative-cloud/check.mjs` with Node 24+, Java 21 selected by `EMMY_JAVA_BIN` or PATH and the repository's existing hash-pinned `.local/tools/tla2tools-1.7.4.jar`. It writes private evidence under `.local/verification/cooperative-cloud/`. No development bypass counts. Read every TLC result using the installed pstack:statechart skill by name. Replay any unexpected counterexample against the actual reducer before deciding whether the model or product is wrong. Never weaken a property to hide a source finding.

The graph enumerates reachable outputs of actual synchronous `cloudTransition` calls, beginning with `emptyCloudState`, validated `cloudConfig`, `cloudJobInput`, and `cloudEnvelope` inputs. Every nonviolating retained state is checked with `parseCloudRecord`. The source and import-closure hashes and reviewed source sync commit are in `verification/cooperative-cloud/coverage.json`. Before advancing the sync commit or any hash, review every affected source diff and mapped dependency, update the model and mutants as needed, then run this check and independent review. These hashes are change alarms, not proof of source authenticity.

| Invariant | Promise and harm | Actual-source negative |
| --- | --- | --- |
| Stable | A retained job keeps one key, input, digest and order across admitted steps. A duplicate or changed identity can misidentify work. | Remove duplicate guard. |
| Progress | Completed units never decrease; without a completed unit, the accumulator does not change. Losing a checkpoint repeats work. | Reset progress on recover. |
| Terminal | A finished or dead job retains its complete job record. Reopening it erases or duplicates its terminal result. | Recover terminal jobs. |

The three copied-source mutations must each yield the named TLC violation and replay every step against the changed function. The replay reports whether the real record parser rejects the resulting state; rejected reducer outputs are not externally committed violations. The original source runs before and after mutations. A clean run must show queued, running, retry-wait, finished, dead, checkpoint recovery, duplicate and conflicting submissions, suspension/resume and deferral.

Domain: one logical ID and one effect key; interactive jobs, payload `a` with conflicting `b`, two units, 0/1/2 transient failures; parsed defaults with two attempts, 100 ms fixed backoff, default reservations; six calls, timestamps 100 ms apart, synthetic fresh available/pressure and stale available samples. Each step may submit, tick, recover, suspend or resume. Inputs arrive serially; retained reducer state is supplied unchanged to the next call. The bound keeps violating results as leaves. It checks no unbounded history or multijob fairness. Hashes are assumed collision-free. It does not prove that a new accumulator is the correct SHA chain, nor liveness.

One reducer call is atomic in this model. Async claim acquisition, rechecks, output validation, journal publication, process incarnation and migration are separate. Synthetic samples are not observed capacity. This macOS check does not establish Linux kernel evidence, real recovery/migration, external effects, cloud provider state, native execution, authorization, persistence, crash durability, deployment, recurrence or adoption. The logical retained-state promise is not arbitrary external exactly-once.
