# Persistent Emmy contract

Selected design, 22 October 2026. This replaces the initial proposal-only registry design. The implementation must satisfy the acceptance cases below before release. Read [the setup critique](research/setup-critique.md) for observed evidence and design judgments.

## Usage first

Emmy supplies these files. Jerome primarily speaks to Emmy.

```sh
agent responsibility --file release-watch.json
agent reconcile --id release-watch --import readbacks.json --as-of <UTC>
agent reconcile --id release-watch --as-of <later-UTC>
agent backup --to <private-bundle>
agent restore --from <private-bundle> --into <new-private-home>
```

Each reconciliation returns the retained goal/context, evidence age and assurance, open findings, corrections, and bounded next proposals. It checks current local artifacts itself. No separate prepare or assessment sequence. Every invocation works in a fresh process. Omit `--id` to review all responsibilities. Imports are optional, immutable contributions. Global `--home` selects private state, defaulting to `<root>/.local`; `--root` retains its public-source meaning.

## Decision and critique

Choose A's immutable journal, reduced to responsibility definitions, observations, repair links, and retained reviews. Graft B's single reconciliation operation, explicit false-claim correction versus later regression, and feature utility reviews.

Observed source already supplies canonical hashing, complete-directory publication, local-byte checks, routing, and generated command metadata. A fits these without another runtime. B's SQLite transactions simplify current-row updates and compare-and-swap, but add database availability, snapshot migration, and evidence/database consistency work. Its checkpoint plus immutable history also risks two owners for findings. A pays replay cost and explicit branch handling. Accept that for this small private register. Neither shape establishes native dispatch safety.

The original plan correctly kept native task state authoritative. Its caller-selected single receipt and Dot note list cannot independently recover responsibility context or reconcile competing evidence. That gap now has an explicit requirement.

Observed Grok roles do not prove useful specialization. Keep one Emmy. Fold briefing into her review, use study on demand, and treat coding/computer work as executor choices. Combine audit/maintenance into an improvement responsibility with independent checks when required. An enabled weekday digest proves configuration. Sleeping computer state proves no watchdog failure. Watchdog/receipt narratives remain reported. Remove permanent mutual watchdogs until observed missed work justifies them.

## Shape and ownership

```ts
Definition = {id, parents, goal, context, target, action, resource, destination, authorityRef,
  criteria, freshness, reviewAt, trigger?, feature, lifecycle}
Observation = {subject, observedAt, coverage, availability,
  claims, evidenceRefs, supersedes?}
Repair = {findingId, failureRefs, changeRef, expectedSubject, recheckRefs}
Review = {definitionHash, inputHashes, inputContext, ruleVersion, ruleDigest, requestedAsOf, asOf,
  findings, corrections, proposals, limits}
AuthorityRef = {reference, action, resource, destination, expiresAt?}
```

Active definitions require at least one finish criterion. Retired or merged definitions may retain none. Omitted executor defaults to local Codex. Optional workClass is code, academic, research, or coordination. A supplied cloud rationale is nonempty text. Adoption and review output expose criterion specHash values for imports.

The exact subject includes project, canonical repository, executor, host, native identity when applicable, path, revision, and dirty-worktree digest for code. Criteria declare evidence kind and any independent-review requirement.

`responsibilities.mjs` owns these operations and reconciliation policy. `records.mjs` owns boundary parsing, hashes, retained evidence bytes, immutable publication, and archives. Keep pure routing/evidence helpers in `work.mjs` behind that operation. CLI parses/renders. `metadata.mjs` remains the command/property registry. Maintenance derives references. Four operations hide replay and recovery without exposing storage stages.

Validate complete import bundles and retained evidence bytes before publication. Plan dependency-first publication before writing any record, including forward references. Every completed prefix has its dependencies; cycles or missing dependencies refuse before publication. Interrupted multi-record imports replay idempotently. Missing references prevent review. Store content-addressed records under ignored `.local/`. Keep public procedures in Git. Native products own tasks, schedules, and delivery. This register owns commitments and evidence about them. Imported text cannot authenticate native success or human authority. Only actual local inspection earns observed-local assurance. A digest verifies bytes, not semantic correctness.

## Reconciliation rules

1. Evaluate the pinned definition against all retained relevant evidence, not the latest selected receipt. Timestamp order never overrides contradiction. A supersession names its predecessor and explains replacement. Retain both.
2. Missing, partial, unavailable, stale, and future observations produce distinct findings. Default maximum age remains 24 hours, inclusive. Definitions may tighten it. Future records remain retained but ineligible at that review. Later reviews reevaluate their age. Stale evidence can support historical context, never current readiness or closure.
3. Reinspect configured local artifact bytes and actual local repository revision. Remote identity remains reported. Wrong host, path, repository, criterion, revision, dirty bytes, or verifier identity prevents the relevant closure.
4. Resolve a finding only through its exact ID, retained failure, identified correction, expected resulting subject/revision, and passing recheck of every affected criterion. Missing or failed rechecks keep it open. Required independent review cannot come from the repair author's report. Two failed repairs with the same failure signature change the next proposal to diagnosis.
5. Evidence disproving an earlier claim emits a correction referencing that review. Evidence showing subsequent deterioration emits a regression. Neither deletes the old review. Revising criteria cannot silently resolve an old failure.
6. Authority references bind action, resource, and destination, with expiry when specified. Missing scope produces an observation/decision request. CLI records do not create native permissions or expand their own grants.

Store only the next explicit UTC due window supplied by the native schedule readback, plus native ID, prompt digest, timezone, and destination. Avoid a second recurrence engine. After its deadline/grace, fresh complete run coverage with no matching run yields `missed-run`. Partial/stale coverage yields `schedule-observation-needed`. A run without promised outcome evidence yields `run-no-evidence`; missing delivery proof yields `delivery-unverified`. Disabled/missing schedule is separate. After a long gap, flag the known missed window and require fresh discovery for later windows. Repeated review deduplicates the finding. No automatic catch-up dispatch. Total dormancy requires an external wakeup.

## Recovery, duplicates, and concurrency

Identical publications converge. Distinct concurrent observations survive. Definitions name parent hashes. Concurrent revisions create two heads, preserved as a conflict that blocks new action proposals until an explicit definition references every head. No mutable head file or last-writer-wins rule.

Reviews pin a sorted input manifest including prior reviews and incoming-transfer sources. They retain the bindings, catalog, machine context, and rule digest needed to replay the decision. New concurrent records require another review. Determinism applies to the same manifest/time/rules, not an imaginary globally atomic native snapshot.

Proposal effect keys bind responsibility, target, intended effect, and due occurrence. Packets separately pin definition/revision. A definition edit alone does not create a new effect. Repeated review returns the same key. Known pending/uncertain native effects yield rediscovery proposals only. A native task without an effect key also requires rediscovery and exposes its uncorrelated native ID. Its completed status cannot prove completion of the current intended effect. Include the key in native task context where supported.

Earlier completion suppresses duplicate initial green work. Later open findings, trigger gaps, or incoming obligations still propose bounded observation, diagnosis, or rediscovery under that same key. Such continuation explicitly requires fresh native rediscovery before continuing known work or deciding on another execution. Missing or expired scope falls back to observation/decision; pending or uncertain state retains rediscovery-only priority. Exact closure returns completed green work to quiet suppression.

Reject A's exclusive dispatch reservation. A proposal-only CLI cannot promise native-independent at-most-once dispatch, even if one process receives a packet. It cannot see a crash between native action and readback or prevent somebody dispatching outside it. Require current native discovery before execution. Unknown coverage never proves absence. Defer execution reservation semantics until a demonstrated native idempotency/reconciliation API exists.

Backup fixes a manifest, copies every referenced record/evidence byte and private bindings, verifies hashes/references, and publishes the archive atomically. Restore refuses corruption and existing destinations. The archive covers selected records, their retained evidence, historical records, and bindings. It excludes unrelated inbox files, verification output, and source checkouts. A valid restore creates a new home epoch, preserves all failures, and suspends action proposals until fresh target, authority, task, and schedule observations. Keep stable effect keys for rediscovery. No hardware-loss guarantee without a verified external backup.

## Evolution and migration

Feature reviews record useful outcomes, false alarms, repair effort, motivating failures, and review dates. Recommend retain/change/merge/retire. Zero actions alone does not discredit monitoring. Retirement immediately stops new work proposals. It remains pending until every linked trigger has attributable native disablement readback, with imported assurance still reported. Preserve unresolved findings or explicitly transfer them to a replacement. Merged IDs redirect without rewriting history. The replacement review exposes incoming unresolved transfers. An unsuperseded current enabled readback keeps native disablement pending even beside a disabled report. Scope-safe explicit supersession can report ordinary enabled-to-disabled evolution.

Replace `snapshot`, `brief`, `plan`, `receipt`, and `assess` with `responsibility` and `reconcile`. Retain `help`, `doctor`, `catalog`, `probe`, `maintain`. Add `backup` and `restore`. Nine commands total. `doctor` checks private-store integrity and suspension, without native probes. Exit 0 completes the local operation, 2 rejects invalid/corrupt input, 3 reports actionable findings/conflict. No exit code asserts native execution.

Migrate examples, driver, metadata, operating brief, and onboarding together; delete old public command branches. Preserve legacy immutable records as historical imports without upgrading assurance. Rewrite the existing four feature files for orientation, responsibility/routing, reconciliation/evidence, and upkeep/recovery. Regenerate indexes. Review covered diffs before updating formal hashes. No parallel legacy API.

## Verification and implementation gate

Serial real CLI acceptance must cover:

1. Adopt, import, restart, and recover identical context. Repeat import and reconcile without duplicate findings/effect keys.
2. Reach a supported local-byte criterion. Induce artifact corruption. Fresh reconciliation detects it without supplied failure evidence. Attempt an incorrect repair; recheck remains failed. Repeat failure to trigger diagnosis, then verify a matching correction closes only that finding.
3. Register E002's retained failing CLI evidence and issue #1. A failed repair stays open. Closure requires the corrected exact revision and independent actual CLI negative-control replay. This contract assumes no unmerged fix. Supply wrong-target, stale, future, partial, conflicting, and self-certified evidence; observe distinct refusals.
4. Exercise missed window, no-op run, retirement without disablement, restore requiring refresh, and corrupted archive refusal.
5. Interrupt each record/archive publication boundary. Replay converges or clearly refuses corruption. Concurrent observations survive; forked definitions block proposals.

Bounded production-function properties enumerate two responsibilities/targets/revisions, zero-to-two observations/criteria/repairs, all evidence statuses, exact freshness boundaries, two definition heads, and trigger states. Targeted temporal traces extend to four criterion observations, two repairs, and three prior reviews, including recurrence across source advances and failure after native completion. Check deterministic replay/permutation, identity/assurance, authority scope/expiry, failure preservation, repair closure, branch blocking, proposal-key stability, and restore suspension. Mutants force foreign identity to match, drop age/coverage gates, promote reports, accept absent/expired authority, ignore failed rechecks, forget failures, choose one fork, change effect keys with time, infer absence from partial inventory, activate restored state, omit prior review replay, or silence failure after completion. Each must fail its paired property with a designated counterexample, never syntax/import errors. Filesystem and process claims require the CLI driver.

Model the Domain chose responsibility records. Boundary Discipline kept imported assurance separate. Make Operations Idempotent chose immutable publication. Migrate Callers Then Delete Legacy APIs removed five public workflows. Subtract Before You Add removed permanent roles and reservations.

Build one full self-check/failed-repair journey first. The coordinator owns integration and an independent reviewer must run the completed artifact. Native probes remain required. No Dot installation, actual schedule, or dispatch was verified. All design seats used Sol max by instruction; model diversity was absent.

## Implementation reconciliation

The coordinator accepted these clarifications during implementation. Ineligible stale, future, partial, or unavailable history remains visible in observation diagnostics. A separate current eligible observation can establish coverage. Retained failures and contradictions still require an exact repair; timestamp order cannot erase them.

`reconcile` is a live operation. It records `requestedAsOf`, uses actual UTC completion times for local observations, and sets each review's effective `asOf` to the latest of that request, live completion and local observation times. Live completion applies even when cloud execution, an unbound route, or conflicting definitions yield no local observations. Local execution authority is checked against at least the actual current clock. An invocation cannot backdate a command result. Fixed historical replay uses its pinned time. Determinism applies to the same input manifest, effective time, and rules.

An optional `local-check` criterion executes a pinned repository-relative `.mjs` script through the current Node executable, with an argument array and no shell. Separate `run-local-check` authority binds resource and destination. The script must match its declared digest and the current repository identity. A check has a finite timeout of at most 60 seconds and a combined output limit of 1 MiB. Records retain its source, arguments, exit, output, runtime, and resulting subject. Timeout, output limit, and handled cancellation terminate the owned POSIX process group when signalling succeeds. A denied EPERM signal records failed evidence, its process-group ID and unverified cleanup, then stops waiting. Cancellation reports denied cleanup as an operational error. Unverified groups may still contain processes; no termination is claimed. The original observed EPERM cause remains unresolved. Detached descendants and arbitrary malicious code containment are outside this contract. Windows reports local-check execution unsupported.

Each executable criterion reacquires canonical repository identity. Changed or unreadable source refuses execution with unknown evidence and preserves earlier failures. After acquisition reads, a fresh live cutoff checks separate command authority and canonical restored eligibility from the pinned epoch and observations. No awaited work separates those authority checks from launch. Post-execution inspection remains necessary. This does not establish atomic filesystem pinning or atomic revocation.

The local verifier identity is a digest of the pinned script and arguments. It proves which command ran. It cannot establish that a reviewer was independent of the repair author. Imported review names or artifacts remain reported. Any criterion already requiring independence emits `external-review-needed` and remains unable to close through this CLI. Native coordination and repository review gates establish acceptance outside this register. Local execution assumes trusted definitions and trusted repository code; a reference is not authenticated native authority.

Restored suspension permits local byte inspection but prevents local-check execution and work proposals until fresh exact target, authority, task, and schedule observations name the new home epoch. Eligibility uses current scoped supersession before both execution and review, so a superseded authority cannot lend its old scope to a new check. Local targets require actual inspection; Dot-cloud and prepared Codex Cloud target readbacks remain reported. Source hashes and formal sync records move only after covered-diff review and intended failing controls.
