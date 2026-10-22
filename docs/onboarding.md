# Adopt and recover a responsibility

Use a scratch repository first. Read [the operating brief](operating-brief.md) with Emmy in the actual Dot and discover tools there. This checkout prepares guidance; it cannot install Dot instructions.

## Bind the source

Copy `examples/bindings.json` into `.local/bindings.json`. Replace its hostname, designated host, exact native project ID, repository, and absolute path with readbacks. Keep other unknown or partially bound projects visible in their source inventory. A recent chat list is scoped evidence, not a complete global inventory.

Prepare `examples/responsibility.json` under `.local/`. Set the actual goal, retained context, authority reference, finish criteria, and next review. An active responsibility needs at least one criterion. Optional `workClass` is `code`, `academic`, `research`, or `coordination`; omitted means code. A supplied `cloudReason` must be nonempty text. Omitting its executor selects local Codex. Supply the current full commit SHA and dirty-worktree digest. This helper reads them through the same local inspection used by reconciliation:

```sh
SCRATCH_REPO=/replace/with/scratch-repository node --input-type=module <<'JS'
import { inspectRepository } from './src/responsibilities.mjs';
console.log(JSON.stringify(await inspectRepository(process.env.SCRATCH_REPO), null, 2));
JS
```

A local target must match the designated binding, the actual machine hostname, intended canonical repository, path, full revision, and dirty bytes. A mismatch requests observation. It prevents local-check execution and work proposals.

```sh
node scripts/agent.mjs responsibility --file .local/responsibility.json
node scripts/agent.mjs reconcile --id scratch-watch --as-of <UTC>
```

Adoption returns the immutable definition hash and ready-to-use criterion IDs, evidence kinds, and `specHash` values. Reconciliation returns the same hashes with support and assurance. Use those values when creating an import; canonical hashing is not a caller task.

## Import a native readback

Fill `examples/observations.json` with actual subject identity, UTC observation time, observer/source, availability, coverage, gaps, and source references. A task inventory includes its scoped `tasks` array. A schedule inventory includes a specific `schedule` or a scoped `schedules` array. Preserve pagination gaps. Retain evidence files by absolute path and SHA-256 in `evidenceRefs` when available.

```sh
node scripts/agent.mjs reconcile --id scratch-watch --import .local/readbacks.json --as-of <UTC>
node scripts/agent.mjs reconcile --id scratch-watch --as-of <later-UTC>
```

Both calls start fresh processes. The second recovers the retained goal, context, failures, and effect key without the prior conversation. Repeat imports converge. Reviews pin their sorted record manifest, prior reviews, rule digest, and private/public decision context. New concurrent evidence requires another review.

`reconcile` performs live local inspection. `requestedAsOf` records the caller cutoff. Each review's effective `asOf` includes actual local completion time. Local results are never backdated. Stale, future, partial, unavailable, and foreign observations remain distinct diagnostics. A separate current eligible observation can establish coverage; it cannot erase a retained failure.

Imports remain reported, including claimed native success, authority, and reviewer identity. Work proposals require current native discovery before execution. Pending or uncertain native effects return rediscovery only. Earlier completion suppresses duplicate green work, but a later open failure, trigger gap, or incoming obligation still proposes bounded attention. Such continuation keeps the effect key and explicitly requires fresh native rediscovery before continuing known work or deciding on another execution. Missing or expired scope yields an observation/decision proposal. Stable effect keys do not guarantee native at-most-once execution.

## Recheck an error

For a safe guided drive, run:

```sh
node scripts/verify-behavior.mjs --focus self-check-repair
```

The driver uses its own temporary repository and private state. It changes only a synthetic artifact, discovers the failure through real CLI inspection, retains two ineffective repairs, then verifies the matching correction. It also induces a later regression and unreadable current bytes. The printed report and immutable evidence survive cleanup.

For your responsibility, preserve the original failure reference. Fill `examples/repair.json` with its exact finding ID, failure references, identified change, expected resulting subject, and retained recheck observation hashes. Every original affected criterion must pass after the latest failure. An older green result, a weakened criterion, or a wrong revision cannot close it. A later same-signature failure reopens the finding while preserving the earlier valid repair review.

A `local-check` criterion executes only a pinned repository-relative `.mjs` script with Node, exact arguments, a finite timeout, and separate scoped `run-local-check` authority. Use trusted code within the granted scope. The command has the current OS user's permissions; the limits are not a sandbox. Its observed output does not authenticate independent authorship. Declared independence stays `external-review-needed` in this CLI.

Every executable criterion reacquires canonical repository identity. Changed or unreadable source prevents that command from running. After acquisition reads, the current clock checks command authority and restored eligibility before launch. A check changing tracked source, or restored authority expiring during one check, prevents the next command. Post-execution inspection still detects changes during a command; filesystem pinning and revocation are not atomic.

## Evolve a method

Import a utility review shaped like `examples/feature-review.json`. Record useful outcomes, false alarms, repair effort, motivating failures, and the next review. Quiet monitoring can remain useful.

To change the actual definition, set `parents` to every current head hash. Retired and merged definitions stop new work and old local-check execution immediately. Preserve unresolved findings or explicitly list `transferFindingIds` and an existing `replacementId`. The replacement exposes incoming obligations. Linked native triggers remain pending until current attributable disablement readback resolves any enabled-state conflict. Assurance remains reported.

After a legitimate source advance, adopt a descendant definition pinning the new exact subject. Keep the authority and original failure criteria intact unless the human changes the contract. A definition edit alone does not create a new effect key.

## Recover a private home

```sh
node scripts/agent.mjs backup --to /replace/with/private-archive
node scripts/agent.mjs restore --from /replace/with/private-archive --into /replace/with/new-home
node scripts/agent.mjs doctor --home /replace/with/new-home
```

The archive contains selected immutable records, retained evidence bytes, historical records, and bindings. It excludes unrelated inbox files, verification output, and repository checkouts. Inspect the returned manifest. Store a verified external copy if hardware-loss recovery matters.

Restore refuses corruption, traversal, symlinks, missing evidence, and an existing destination. The new epoch preserves failures and effect keys. Import fresh target, authority, task, and schedule observations naming that epoch. Actual local target inspection supplies its own observed readback. Byte inspection remains available during suspension; local-check execution and work proposals wait for all required fresh categories.
