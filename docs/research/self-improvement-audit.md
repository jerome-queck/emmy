# Emmy workflow audit, 29 October 2026

The review compares recent reported workflow failures with source at `01019426a4b41a7c45b1a3c7dd9a4f7e966b035e`. That revision contains the interface-timing implementation from `6d93858657de565cf1d5b2b12c030ef8c49c80b9`. Retained installation receipts identify the same runner and guidance revision. Current native adoption is a separate question.

The central problem is incomplete continuity between owner intent, source work, native identity, module views, and completion claims. Existing checks cover many execution details, but passing them does not establish every planning policy. Adding daily prose alone cannot close those implementation gaps.

This public report omits private identities and correspondence. Detailed parent-provided incident evidence, current readbacks, rerunnable synthetic probes, and test output remain in the ignored private audit directory. Reported historical impact is distinct from observed source behavior. No synthetic probe changes native state.

## Incident and root-cause matrix

| Incident | Evidence and actual impact | Current status | Cause and remaining work |
| --- | --- | --- | --- |
| Calendar collisions and missing constraints | Reported repeated overlap and meal conflicts required owner inspection and correction. A later bounded repair has reported native readbacks. | Repaired for that bounded plan; recurrence prevention remains incomplete. | Observed register code protects Busy intervals, protected Free meals, unknown Task timing, and exact baselines. Complete owner policy and ordinary-turn invocation are not proven by those checks. |
| Assignment identity and worksheet order | Parent directly reread an execution artifact showing an original assignment retitled as different work, then restored with distinct IDs and ordered tasks. The original obligation had become hidden. | Specific identity/order repair is reported verified. Do not reopen from old notes. | Observed synthetic proposals still accept semantic repurposing and opaque nonsequential ranges. Native ID equality alone does not preserve the assignment's meaning. |
| Task/Event substitution and duration errors | Reported incorrect native type and duration required repair. Public API metadata omits native timing. | Existing exact-type/timing safeguards are implemented; live use remains separately evidenced. | An API result cannot establish a native timed Task. The API adapter intentionally excludes timing. Reject missing timing rather than treating it as empty availability. |
| Editor timezone mismatch | Reported one-hour discrepancy between two interfaces. Source and retained installation receipts contain the interface-aware repair. | Implemented, tested and historically installed. No new regression demonstrated here. | Canonical Singapore instants and scoped editor conversion are separate. Do not apply a blanket offset or infer all old Tasks were wrong. |
| Module drift and incomplete recovery | Reported differing registers and accidental removal required recovery work. Metadata snapshots/guarded restore are reported deployed in the separate project. | Partly repaired; full native timed restoration remains unsupported. | Provider save, module publication, local propagation, and native timing recovery need separate evidence. This audit did not inspect that deployment's current code or restore a real Task. |
| Mail preference handling | Reported incorrect or repetitive handling prompted narrow owner corrections. The later briefing applied the exact exceptions according to parent evidence. | Specific corrections reported verified. | Keep source/date/scope of each preference. A later clarification is not automatically proof of an earlier policy violation. General sender rules cannot erase exact-thread exceptions. |
| One uncertain mail destination | Parent reread an artifact showing Inbox removal without a matching same-ID destination. Actual final location remains unknown. | Unresolved and correctly reported as uncertain. | Neither actor nor backend cause is established. Inspect before retry; no new destructive action to obtain a clean count. |
| Missed daily briefing occurrence | Reported enabled schedule had no recorded expected run; a later manual request produced the briefing. Actual impact was delayed useful output. | Manual recovery verified by parent; recurrence repair unverified. | No causal scheduler diagnostic. Null next-run metadata also occurred elsewhere. A synthetic manual rescue can satisfy the current fleet shape if associated with the expected due time. |
| Incomplete completed-Task history | Parent reread partial collection evidence after UI timeouts. The final brief disclosed the gap and made no Task changes. | Partial coverage remains explicit. | Header totals are not read counts. Preserve page checkpoints and isolate source failures; do not convert unavailable history into zero work. |
| Krillion setup and approvals | Wrong initial executor rejected local automation creation. A later native local creation succeeded. Repeated owner intervention and delay are reported; no game loss was established. | Active saved automation and stronger learning prompt directly reread in this audit. Future automatic play and first occurrence remain unverified. | Route failure is known. The remaining native thread approval flag is opaque and does not prove the saved update failed. No exact pending permission can be diagnosed from that flag. |
| Stale progress and completion claims | Reported old summaries/titles continued to describe completed repairs as pending. Late callbacks also conflicted with terminal state. | Some metadata corrected; process gap remains. | Use exact current receipts and preserve historical failures. Requested, accepted, started, completed, installed, adopted, and delivered states must not collapse into “done.” |

## Reproduced implementation limits

The calendar probe invokes `assessCalendarRegister` with the shipped synthetic fixture. Each of the following returns `proposed`, with `counts.executed = 0`:

1. Rebind the existing Task's declared source and title to a different assignment.
2. Declare a whole-source range containing nonadjacent questions with no dependency edges.
3. Declare generic preparation as a source without establishing an owner-requested obligation.
4. Supply a fresh baseline containing a manually moved interval, then move it back without a retained scoped protection for that owner decision.

The relevant boundaries are [source validation](../../src/calendar-register.mjs), the [API plan adapter](../../src/academic-os-task-plan.mjs), and the [handoff](../../src/calendar-handoff.mjs). The handoff explicitly reports digest binding with external policy validation required. The complete policy model in [Academic OS alignment](../academic-os-alignment.md) remains proposed.

The fleet probe invokes production `captureCondition` and `fleetTransition` with synthetic fixtures:

1. A manual rescue with the expected `runDueAt`, outcome, and delivery references classifies as healthy. The [capture schema](../../src/fleet-schema.mjs) has no invocation-origin field.
2. Paraphrasing only `nextAction` for the same fresh denied-action issue creates another alert episode. The [fingerprint](../../src/fleet-state.mjs) includes that prose.
3. Widening a source-age policy can emit a recovery episode without acquiring a new source. This matches the existing reducer; the [morning workflow](../morning-workflow.md) already distinguishes policy eligibility from actual recovery.

These probes show accepted representations, not proof of the original live cause. Changing fleet fingerprints or capture semantics also affects immutable journal replay. A small-looking conditional edit can invalidate old records; compatibility must be designed and tested.

## Prioritized engineering work

| Priority | Change and acceptance | Potential impact and rollback |
| --- | --- | --- |
| 1 | Retain a stable assignment/source-occurrence binding independent of title; require explicit supersession for repurposing. Test the original assignment versus a later worksheet question and retry deduplication. | Incorrect migration could hide work or create duplicates. Read existing associations first, keep ambiguous rows unresolved, and retain original mappings for rollback. No automatic live migration. |
| 1 | Add typed question groups, prerequisites, and scoped owner-move/exclusion evidence. Test source order, a later manual move, and conflict with campaign defaults. | Overbroad policy can freeze legitimate replanning or recreate dismissed work. Preserve rule versions and require exact scoped supersession. |
| 1 | Add schedule invocation provenance and exact occurrence identity with legacy replay. A manual rescue must not satisfy a scheduled-trigger criterion. | Incorrect interpretation can suppress a genuine missed-run alert. Historical origin remains unknown; retain prior receipts and migrate with explicit semantics. |
| 2 | Use a stable structured action identity if real runs demonstrate paraphrase-driven duplicate alerts. Test unchanged wording, paraphrase, and a materially changed owner action. | Collapsing too much can hide a new required action. Preserve old fingerprints for historical replay and version the new behavior. |
| 2 | Verify provider-save, module generation, and local readback separately; investigate supported native timing recovery. | Recovery can duplicate or resurrect intentionally removed work. This needs the separate project's authority and same-ID live acceptance. |
| 2 | Test ordinary-turn adoption and the next real scheduled occurrence. | Fixtures cannot establish these outcomes. Keep the gate pending if no legitimate occurrence is available. |

The daily procedure is a safe first operating change. It reuses existing journals, reports exact stages, and keeps larger repairs reviewable. The separate token assessor and bounded report handoff implement accounting and reporting safeguards. They do not repair the calendar or fleet gaps above. Native schedules use the existing scheduler; this feature creates no incident database, provider writer, or permission grant.

## Approval and model findings

The inspected global configuration already requests unrestricted local sandbox access with no manual sandbox prompts. This audit task runs under a narrower managed workspace profile with automatic review. Saved config and effective session access are therefore demonstrably different kinds of evidence; changing global defaults is not a justified remedy.

Native thread creation accepts model and effort but exposes no permission setter. The scheduler schema accepts an exact model string and reasoning effort for local project cron runs. Subagent calls also accept explicit supported model/effort pairs. None of those interfaces establishes that a future unattended run can access every required tool. Keep requested, resolved, recorded, and observed execution settings separate.

Use the task-specific family policy in [AGENTS.md](../../AGENTS.md#standing-thread-and-model-policy). Prefer one capable daily lead with optional bounded helpers over two permanent cooperating implementation schedules. A split saves work only if the supplied task is clear enough for the helper and the review overhead is justified. No comparative local token-cost benchmark was performed.

## Verification and limits

The existing focused calendar suites passed 67 tests; the focused fleet/morning suites passed 44. The aggregate passed its link, unit, behavioral, finite-property, and mutation stages before the publication model hit a sandbox-denied Java listener. The unchanged pinned publication verifier then passed under a narrowly reviewed escalation, including both intended model counterexamples and both copied-source filesystem mutants. The initial failure remains retained as an environment limit, not a product counterexample.

Doctor reports `needs-attention` for retained private fleet state while integrity and generated references are current. `ok: true` is not equivalent to “all responsibilities healthy.” The final delivery report records post-change checks, the token/report feature, and its reviewed source-pin update separately. The existing calendar/fleet production functions, finite properties, mutations, and model bounds remain unchanged. The new accounting and handoff boundaries have separate unit and CLI controls; they are not new finite proofs.

Native calendar/mail state, current Academic OS deployment, future scheduler execution, Computer Use access, provider model execution, and ordinary-turn adoption remain outside this local source audit. The [daily review procedure](../daily-improvement.md) keeps those acceptance gates explicit.
