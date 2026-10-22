# Critique of the current setup

The current Grok Bot roster is evidence to examine. It is not the target architecture. The first Emmy implementation also needs revision. It preserves proposals and receipts, but leaves ongoing responsibility and error recovery largely to conversation context.

## Evidence boundary

Read-only app inspection on 22 October 2026 showed a chief of staff, briefing, study, coding, computer operations, auditing, and maintenance roles. An enabled weekday digest was visible. The computer view reported asleep. Messages described watchdogs, restart recovery, stale repository copies, retries, and passing tests. Their underlying runs, backups, and fixes were not independently replayed. The Library showed saved artifacts. Further navigation returned an unavailable-window error. No Grok configuration changed.

These observations support questions about the design. They do not establish that any particular bot or repair failed. See [local observations](local-observations.md) and the [source-backed pattern review](grok-patterns.md).

## Design judgments

| Current pattern | Weakness or unresolved question | Design response | Acceptance evidence |
| --- | --- | --- | --- |
| Separate briefing bot | Another handoff and another context to reconcile. Does it produce a distinct useful outcome? | Make the brief a view of Emmy's current responsibilities. | The brief identifies source age, unresolved findings, next action, and actual decisions. |
| Standing coding and study specialists | A role name does not justify permanent duplication. | Use bounded specialists when work needs their tools, expertise, or independent judgment. Keep one accountable coordinator. | A delegation names its exact target, outcome, authority, native identity, and verified return. |
| Computer operations, maintenance, and fleet auditing | Overlapping ownership can produce mutual reassurance instead of independent checks. | Consolidate upkeep responsibility. Separate authorship from required verification. | A reviewer can replay the check against the current artifact without trusting the repair narrative. |
| Reported stale-checkout errors followed by delayed retries | Waiting cannot establish the correct repository, path, revision, or dirty bytes. | Reobserve target identity before retrying. Retain the original failure. | The same failure on the correct target produces a different diagnosis, not endless retries. |
| Receipt attribution by bot name | Attribution helps investigation but does not establish task identity or correctness. | Bind evidence to responsibility, task, executor, criterion, artifact, and current revision. Preserve assurance labels. | Wrong-target and stale-success controls fail. A reported success remains reported. |
| Enabled digest or watchdog | Saved configuration is different from an actual run, useful output, and delivered notification. | Retain expected observations and detect overdue or empty runs. | Saved fields, run record, output, and notification have separate readbacks. Silence is visible at the next independent observation. |
| Conversation memory | Useful context may omit commitments, failures, or prior decisions after a restart. | Store durable responsibility context and evidence outside transient conversation. | A fresh process reconstructs the goal and unresolved failures without the prior transcript. |
| Automatic repair | The system could erase a failure by weakening its own test or declaring success. | Keep the failure, correction, and recheck linked. Review contract changes explicitly. | A failed repair remains unresolved. Deliberately broken guards produce their intended counterexamples. |
| More routines after each incident | Additive patches accumulate overlapping behavior and wake costs. | Review useful outcomes, false alarms, effort, replacements, and unresolved obligations. Support keep, change, merge, or retire. | Retirement preserves history and verifies that native triggers stopped. Quiet monitoring is not automatically useless. |

Grok's own documentation recommends a small roster, current authoritative sources, and testing a successful one-off method before automation. Hiding a bot does not pause its routines. Its recent run history is bounded. These mechanics argue for explicit retirement and retained evidence, not a larger roster by default. [Bot management](https://docs.x.ai/grok-bot/bots), [routines](https://docs.x.ai/grok-bot/skills-routines-and-automations).

## Critique of the first Emmy design

The initial registry correctly separates reported evidence from observed local bytes and keeps native task state authoritative. Those boundaries remain useful. Its caller nevertheless has to assemble a snapshot, proposal, receipt, and assessment manually. Nothing executable remembers which outcome still matters, discovers a later contradiction, or checks whether a routine went silent. That is a substantial gap for a chief of staff.

The revised design must make responsibility the durable unit. It must retain intent, sources, authority, target, expected evidence, failures, and the next review. It must derive current findings from fresh observations, expose uncertainty, and reopen an earlier conclusion when evidence contradicts it. It must also allow changing or deleting methods that no longer earn their cost.

Dot notes can preserve responsibilities, but they are not a complete transcript or a substitute for current records. Proactive research can suggest improvements; it does not itself authorize app changes. Assign self-correction explicitly and verify its actual trigger and results. [Dot tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory).

## Boundaries the design must keep

One user-facing chief of staff is useful. Permanent specialists are optional. Native execution, scheduling, and delivery remain native product facts. A local proposal cannot guarantee exactly-once remote execution. An entirely dormant system cannot detect its own silence without another observer. A backup on the same machine does not establish recovery from hardware loss.

Ship a local recovery and correction loop first. Test Dot's real access with the [operational probes](../dot-verification.md). Add a daemon, replicated writers, another standing bot, or a cloud service only when an observed workflow demonstrates the need and its acceptance test.
