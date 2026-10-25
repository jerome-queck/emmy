---
name: publication-contract
description: Check Emmy's bounded immutable record publication and dependency-first import interleavings after changing record writes, reads, imports, retries, or this TLC model.
---

# Check record publication

Run from the repository root with Node 24 or later and Java 21.

```sh
npm run verify:model
```

The command runs pinned TLC 2.19 from the official TLA+ tools 1.7.4 release. It verifies the jar's SHA-256 before executing it. A missing jar downloads into ignored `.local/tools/`. Set `EMMY_JAVA_BIN` or `EMMY_TLC_JAR` to use existing tools. An override still requires Java 21 and the pinned jar digest. No package, account, or API key is required.

Expect JSON with `status: "passed"`, two baseline state graphs, two intended model counterexamples, and two actual copied-source filesystem mutants. The command reruns both unchanged state graphs and filesystem baselines after the mutants. Logs, traces, copied source, actual record bytes, witness JSON and failures remain under the printed `.local/publication-model/run-*/report.json` path. A nonzero result requires reading that report and its named logs.

`npm run verify:formal` adds the existing actual-source finite predicates and merge-policy enumeration. Those checks remain complementary. `npm run check` also drives the real CLI and checks generated references and merge tests.

## Promise and harm

Every canonical record directory exposes complete matching record and evidence bytes. Exposing a half-written record can corrupt every later responsibility review.

The related `ImportPrefixSafe` property covers `retainImport` callers using `importOrder`. Every published prefix retains the dependencies of its records. `publishRecord` itself does not enforce dependency order. `ReadbackExact` checks successful readbacks. `CompletedSurvive` keeps returned records visible. `RetryConvergesOnReturn` checks the result if a retry finishes, without asserting that it finishes. `AcceptedManifestComplete` checks a reader result only after reference validation. `TypeOK` checks the model's state domains.

## Bounds and assumptions

Read [the coverage record](../../../verification/publication/coverage.json) and [the model](../../../verification/publication/RecordPublication.tla) before interpreting a pass.

The model has two writers, one observer, three symbolic hashes and two files per record. The identical-hash configuration gives each writer the same one-record request. The distinct configuration gives writer 1 an import of A then B, where B references A, and writer 2 independent C. Each writer can crash once and retry the same plan once. If A already exists when the import restarts, either lexical order of A and B is permitted. The observer lists once, reads each selected record and evidence file separately, then validates references. Its list conservatively permits any subset of currently visible hashes. A reader may refuse an incomplete manifest.

Pending creation, each file's partial write and completion, directory rename, record readback, evidence readback, cleanup, reply, import-next, crash and retry are separate actions. A crash can leave an ignored pending directory. The model retains its existence but abstracts its fresh name and bytes because no later operation reads that directory. Recursive pending cleanup has no canonical effect and is one silent action.

Assume collision-free hashes, fresh unique pending names, correct requested bytes when a file write completes, ordinary files, atomic same-filesystem directory rename, and no external deletion or mutation. Successful writes and duplicate-destination rename collisions are modeled. Unexpected I/O errors and cleanup failures are outside this model. Metadata checks and pure validation around an immutable file read are silent steps under these assumptions. No power-loss durability, arbitrary bundle size, unbounded retries, liveness, atomic review snapshot, native dispatch, provider authority, account, schedule, delivery, or deployment claim follows.

## Read the source mapping

The reviewed source commit is recorded in `verification/publication/coverage.json`. The record owner and its imported schema, reducer and work dependencies are pinned to that commit. The coverage record also checks current model, config, bridge, runner and skill digests.

| Model action or property | Production owner |
| --- | --- |
| Symbolic requested hashes and matching completed bytes | `recordPayload`, lines 280-290 |
| `CreatePending`, four `WriteFile` stages, `Rename` | `publishRecord`, lines 292-304 |
| `ReadRecord`, `ReadEvidence`, `Cleanup`, `Reply` | `publishRecord`, lines 305-310, and `readRecord`, lines 312-328 |
| `ObserveList`, `ObserveChoose`, `ObserveRecord`, `ObserveEvidence`, `ObserveValidate` | `readStore`, lines 330-340, and `readRecord`, lines 312-328 |
| `ImportNext`, retry plan, `ImportPrefixSafe` | `retainImport`, lines 401-422, `references`, lines 342-351, and `importOrder`, lines 553-563 |
| `Crash`, `Retry`, orphan existence | Process interruption between the mapped awaits and a fresh call using the same input. Real markers are in `publicationBoundary`, lines 273-278. |

Dispatch metadata adds pure validation and immutable lineage guards. The cross-project extension adds optional remote authority, creator and destination skill validation plus a separate parsed project-discovery input. All remain pure boundaries with no publication await or graph-reference change. It adds no publication await or reference edge. The import model starts after full bundle preparation and reference validation. It includes one dependency edge, not every record-type validation rule. Writer 2 has no dependencies. The observer's reads are deliberately not one atomic `readStore` action. Symbolic hash order and conservative list subsets overapproximate the configured callers.

## Cooperative cloud boundary

Cloud records add definition, controller-root, parent and optional epoch references. `cloud` validates the complete proposed record and its already-retained dependencies before calling `publishRecord`. Its schema guards are synchronous. The publisher, per-file readback, rename, pending-only cleanup and import ordering retain their mapped awaits.

The unchanged TLC model covers its configured one-edge importer and canonical byte-publication interleavings. It does not enumerate cloud lineage, controller claims, telemetry, retry policy, cooperative admission or cloud archive/recovery. The imported schema digest binds the copied-source filesystem driver dependency; it does not turn parser validation into a TLC theorem. The separate finite cloud property and real CLI driver cover their named domains.

Backup checks for unresolved current/configuration claims before selecting archive files. That preflight refusal does not atomically exclude concurrent claim acquisition. Completed claims are excluded from the archive; restored executable state still requires fresh responsibility epoch evidence and explicit controller resume. Neither this model nor those controls prove external exactly-once effects or provider restart survival.

## Fleet boundary

Fleet adds definition/root/parent/epoch reference edges and synchronous replay validation through `fleet-schema.mjs`, `fleet-state.mjs` and `work.mjs`. The copied-source filesystem driver includes this dependency closure. Canonical publisher, rename, per-file readback, pending cleanup and importer awaits retain their mapped operations. The same one-edge import and canonical byte-publication model remains unchanged.

The complete per-head hard-linked fleet intent, its exclusive selection, bounded real input reads, external parent tickets, health classification, send/readback semantics and backup preflight remain outside TLC. Actual stopped-writer replay and backup refusal are CLI controls. The 64 finite fleet predicates and thirteen paired mutants cover their declared pure domain. None establishes native source truth, actual tools, account recovery, message delivery or external exactly-once behavior.

## Replay a counterexample

`direct-canonical-mutant.cfg` exposes an empty canonical directory in `CreatePending`. Its actual copied-source mutation changes the pending path to the canonical destination. At `record:created`, the stopped child exposes that exact hash directory with neither requested file. Read `filesystem/mutant-direct/filesystem-witness.json` and the retained directory before treating the mutant as detected.

`reversed-import-mutant.cfg` renames B before A exists. Its actual copied-source mutation reverses `importOrder`'s result. At `import:record:1`, B is a complete ordinary record whose `supersedes.hash` names absent A. Read `filesystem/mutant-import/filesystem-witness.json`. `readStore` also refuses it, but that exception alone never counts as the witness.

Both mutations touch copies under ignored evidence. The command never edits product source. Model syntax errors, source-hash refusals, unrelated exceptions and absent filesystem witnesses fail the command. Neither can count as an intended counterexample.

## Maintain after a source change

Run the existing command before editing coverage and retain its refusal or failure. Diff every covered function from the recorded source commit to the target commit. Read new and moved owners of canonical files or dependencies. Review each await and decide whether the model's atomic steps still fit. Distinguish stale verification, an intentional promise change with source evidence, and a product bug.

Update the verification from that source reading. Never weaken a promise to accept a current bug. Replay any failure against actual copied production bytes and retain a filesystem witness. Rerun the two paired mutants and restored baselines. Then refresh verification digests. Advance the source commit only after reviewing its covered diff and running the updated mapping. The generator and runner never advance it automatically.

Use the installed `pstack:maintain-formal-verification-skill` workflow for this pass. Keep product fixes separate. Independent source review remains the coordinator's gate.
