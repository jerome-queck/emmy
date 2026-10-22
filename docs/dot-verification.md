# Verify Emmy's actual abilities

The repository's CLI tests cannot prove Dot access, cloud persistence, delegation, or scheduled delivery. Treat those as operational checks with their own evidence. Run them in Emmy's conversation after reviewing the [capability research](research/dot-capabilities.md).

## Record a result

Keep private raw results under `.local/probe-evidence/`; the legacy `.local/probes/` directory is reserved for immutable records. Each result needs a probe ID, fresh nonce, observation time, executor, source, actual task or schedule identity if created, artifact or output, result, and limitations. Classify it as passed, failed, blocked, or unverified. A self-report of capability leaves it unverified.

Use an unrelated fresh nonce on a later readback. A failed read should stay failed. Preserve its output before cleanup. Store sanitized summaries in the public capability register only when they add reusable evidence.

## Run the probes

The [eight prompts](research/dot-capabilities.md#low-risk-probes) test the cloud runtime, persistence, chat discovery, local task creation and continuation, cloud delegation, skill access, autonomous wake, and saved scheduling. Begin with read-only runtime and chat-discovery checks. Use a scratch repository for delegated work.

Compare chat-discovery results against a held-out native Codex snapshot. Compare a reported task location against output from that task. Read a persistence file in a later interaction without recreating it. Read back a saved schedule before waiting for its run. Verify the actual run record afterward.

Use the same source twice with distinct inputs, then test a missing source and an unavailable designated host. Confirm that Emmy records the failure and the last known observation, instead of treating old information as current.

## Test recovery and closure

Stop one harmless delegated probe and verify it stays stopped. Ask Emmy to rediscover the existing probe before retrying. Confirm that a repeated request does not silently create duplicate work.

After a successful local task, ask for a follow-up in that same chat. Verify the task ID and the new result. A different chat is a different continuation result. Test cross-Mac access only after the Studio path works, and distinguish a native remote-host connection from a daisy chain through a shell.

For fixed-time work, test one harmless one-time run before making a recurring schedule. Confirm notification delivery separately from task execution. Disable or delete test schedules through the provider after collecting their evidence.

## Proposed self-correction and simplification probe

Run this only after read-only access and the normal local route pass. It is a proposed assigned task, never executed by this local acceptance suite. Keep the catalog's eight capability probes separate.

In an owner-supplied scratch repository and private scratch home on the designated Mac, read Emmy's current verification skill and run doctor. Use the focused synthetic driver as a reference, then follow onboarding's responsibility/import/repair flow in the retained scratch home. Keep that repository and home until the later-turn recovery check. Adopt an explicit goal, context, exact target, authority, and finish criterion. Reconcile in a fresh process, change only the scratch artifact, and preserve the detected failure. Attempt a deliberately ineffective repair before the intended harmless correction. Inspect actual retained bytes or bounded verifier output. Preserve original criteria and all failed evidence.

In a later interaction, recover that responsibility through its retained definition and evidence files without recreating it or repeating an earlier assistant message. If a native task exists, rediscover its actual identity before another launch. Show how an unavailable designated Mac changes the next observation or decision.

Separately propose one useful simplification supported by a concrete duplicate, false alarm, or failed workflow. It may merge or remove a method. Preserve unresolved obligations and identify every native trigger requiring disablement. Keep retirement proposed during this probe. Use descendant definitions for legitimate source advances; preserve old failures and authority scope.

Expected evidence includes the executor, exact repository/revision, fresh-process reads, original failure and ineffective repair, actual current recheck, observed versus reported assurance, stable effect identity, recovery source, and a bounded method proposal. A returned reviewer name cannot authenticate independent authorship. Independent acceptance remains a native or protected repository gate.

Use only the approved synthetic scratch state. Software installation, production edits, messages to other people, and recurring schedules are outside this probe. If a tool cannot support a step, retain that step as blocked with its actual failure.

## Current boundary

Direct Computer Use access to the ChatGPT app was denied during setup. No Dot browser was available to this session. These prompts were prepared, not executed. Emmy's installed instructions, native task reach, autonomous wake, cloud runtime, and schedules remain unverified until these records exist.
