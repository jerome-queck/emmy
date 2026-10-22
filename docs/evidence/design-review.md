Recommend registry-first for v1. Both documents were read end to end. This is design judgment. Neither candidate implements or executes tasks. All arena seats use Sol max by user override, so model diversity is absent.

| Rubric criterion | Registry | Ledger |
| --- | ---: | ---: |
| 1. Local coding and execution environments | 5 | 5 |
| 2. Small CLI, metadata, private bindings and snapshots | 4 | 4 |
| 3. Evidence boundaries and exact execution identity | 5 | 3 |
| 4. Cheap behavioral and bounded verification | 4 | 4 |
| 5. Automated upkeep and public-data isolation | 4 | 5 |
| 6. One Dot, scalable without competing task state | 5 | 3 |
| Total | 27 | 24 |

Both preserve the native execution boundary, distinguish environments, and avoid cloud fallback. Registry more directly satisfies the user's flexible chief-of-staff goal. Immutable packets and receipts retain evidence without requiring Emmy to maintain native-task lifecycle projections. Laziness Protocol changes the choice to registry because the receipt graph and reconciliation commands lack a demonstrated v1 need.

Registry explicitly assesses task, executor, criterion and result revision. Ledger binds receipts to packet digests but omits result revision and executor fields from its receipt contract. Its formal properties therefore cannot establish the rubric's exact-revision requirement. Packet identity alone does not identify the returned commit.

Both verification plans import production functions and require real-source mutations. Neither provides runnable proof yet. Keep bounds finite, report runtime, and show each mutant failing its designated property. Atomic publication, provider identity, Dot installation and remote completion remain outside those checks.

Take two ledger grafts:

1. Generate feature documentation by joining command, scenario and property identifiers. Fail maintenance on uncovered commands. Give public generators only public registry and verification metadata.
2. Adopt explicit JSON output and exit-code contracts, plus child-process interruption tests around publication. Keep registry's record directories and avoid introducing ledger events.

Correct these before implementation:

- Ledger's claim that registry loses retained outcomes is unsupported. Registry already retains task and receipt records.
- `.agents/skills/verify-formal/SKILL.md` violates the formal-skill naming requirement. Use an area name such as `.agents/skills/evidence-contract/SKILL.md`, without `verify-`.
- Docs-only auto-merge is an added policy, not the user's request. Allow eligible code PRs to auto-merge after required independent review and exact-head checks. Verify forge settings separately. If maintenance uses `GITHUB_TOKEN`, explicitly arrange verification rather than assuming its PR triggers CI.

Start with one complete local proposal, receipt import and assessment journey. Defer event history, remote adapters and cross-Mac replication until observed coordination failures justify them.
