# Bounded immutable slot verification

Run from repository root.

```sh
node scripts/verify-briefing-slot.mjs
```

Java 21 and the existing hash-pinned `.local/tools/tla2tools-1.7.4.jar` are required. `EMMY_JAVA_BIN` and `EMMY_TLC_JAR` may select existing installations. Tool metadata and the exact jar SHA-256 come from `verification/publication/coverage.json`. This runner never changes that coverage or its sync record. Each TLC invocation has a 60-second timeout. Every run retains logs, copied modules, killed-worker checkpoints and JSON results beneath `.local/deterministic-sop-refactor-20261103-v1/slot-verification/`.

`coverage.json` pins the reviewed `src/immutable-slot.mjs` digest and all verifier/model inputs. Drift refuses before TLC or filesystem mutation witnesses run. `publishSlot` creates an exclusive fresh temporary, writes and closes complete bytes, then hard-links that inode to the canonical name. EEXIST reads the original and returns identical only for exact bytes. Differing bytes publish a first conflict marker, validate an existing marker through the caller callback, retain the exact content-addressed candidate, and select conflict. Finally it unlinks only its temporary. `ordinary` supplies bounded ordinary-file reads. Directory/path validation, callback semantics and arbitrary parser domains are not proved by this model.

`BriefingSlot.tla` maps those operations to `Create`, `Write`, `Publish`, `Read`, `Mark`, `Retain` and `Reply`. `Crash` and `Retry` retain canonical/conflict state while resetting only the retry's fresh temporary. Owned cleanup and honest callback validation are silent model steps. `ObserveSlot` and `ObserveMarker` are independent reads. A marker absent during one read may exist after a later conflict. No atomic snapshot or permanently conflict-free read is promised.

The bounded domain has two cooperative writers, one or two symbolic candidate values, at most one crash and one retry per writer, one canonical slot and a single observer's two reads. Retry may follow a crash or a successful attempt. It does not promise eventual retry or completion. A crash can leave an ignored orphan temporary or a marker without the later content-addressed conflict file. The conflict-retention invariant applies to returned conflict outcomes. No failed or interrupted attempt is reported as returned success.

Invariants check complete prepared bytes before visible canonical publication, unchanged first canonical bytes, exact successful retries, unchanged first marker, marker plus candidate evidence for every returned conflict, and immutable values observed by separate reads. Both same-byte and distinct-byte baseline graphs must exhaust. They repeat after the mutations with identical state counts.

Three model mutants must fail their intended invariant. The filesystem bridge pairs each with an actual invocation of a copied `publishSlot` source.

| Mutant | Required model failure | Actual copied-source witness |
| --- | --- | --- |
| Early canonical link | `PublishedComplete` | Link the open empty temporary before writing, pause the owned child, kill it, read incomplete canonical bytes. |
| Replace canonical | `CanonicalImmutable` | Unlink the first canonical name before linking; actual calls replace `a` with `b`. |
| Omit marker | `ConflictRetained` | Skip the marker hard-link; actual call returns conflict while the marker is absent. |

Production source is never mutated. The bridge checks unique textual anchors before instrumenting copies. It kills its own child after a checkpoint at created, written, closed, canonical, marker, candidate-evidence and cleanup boundaries. Checkpoints contain the exact child PID and completed newline JSON. Each is written to a fresh temporary and renamed only after writing completes. The child then remains alive at that boundary until its owner sends SIGKILL. Each retained directory is retried exactly once through an unmodified copied publisher. Equal/different concurrent writes, immutable first marker with another candidate, invalid preexisting marker refusal, separate observer reads and restored baseline controls also run. The runner rechecks production source bytes afterward.

Assume atomic same-filesystem hard-links, complete immutable closed file bytes, fresh disjoint temporary names, collision-free hashes, honest caller validation and a cooperating ordinary directory. Exclude external deletion/mutation, hostile symlink substitution, arbitrary I/O errors, cleanup failures, power loss and filesystem flush guarantees. Unexpected child/parser/TLC errors fail rather than count as a mutant witness. TLC remains bounded state exploration subject to its logged fingerprint collision estimate.

This proves neither semantic briefing correctness nor complete owner policy, provider truth, native execution, scheduling, delivery, production activation, unbounded concurrency, liveness or durability. Existing canonical journal publication coverage remains separate.
