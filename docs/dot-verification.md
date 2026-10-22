# Verify Emmy's actual abilities

The repository's CLI tests cannot prove Dot access, cloud persistence, delegation, or scheduled delivery. Treat those as operational checks with their own evidence. Run them in Emmy's conversation after reviewing the [capability research](research/dot-capabilities.md).

## Record a result

Keep private results under `.local/probes/`. Each result needs a probe ID, fresh nonce, observation time, executor, source, actual task or schedule identity if created, artifact or output, result, and limitations. Classify it as passed, failed, blocked, or unverified. A self-report of capability leaves it unverified.

Use an unrelated fresh nonce on a later readback. A failed read should stay failed. Preserve its output before cleanup. Store sanitized summaries in the public capability register only when they add reusable evidence.

## Run the probes

The [eight prompts](research/dot-capabilities.md#low-risk-probes) test the cloud runtime, persistence, chat discovery, local task creation and continuation, cloud delegation, skill access, autonomous wake, and saved scheduling. Begin with read-only runtime and chat-discovery checks. Use a scratch repository for delegated work.

Compare chat-discovery results against a held-out native Codex snapshot. Compare a reported task location against output from that task. Read a persistence file in a later interaction without recreating it. Read back a saved schedule before waiting for its run. Verify the actual run record afterward.

Use the same source twice with distinct inputs, then test a missing source and an unavailable designated host. Confirm that Emmy records the failure and the last known observation, instead of treating old information as current.

## Test recovery and closure

Stop one harmless delegated probe and verify it stays stopped. Ask Emmy to rediscover the existing probe before retrying. Confirm that a repeated request does not silently create duplicate work.

After a successful local task, ask for a follow-up in that same chat. Verify the task ID and the new result. A different chat is a different continuation result. Test cross-Mac access only after the Studio path works, and distinguish a native remote-host connection from a daisy chain through a shell.

For fixed-time work, test one harmless one-time run before making a recurring schedule. Confirm notification delivery separately from task execution. Disable or delete test schedules through the provider after collecting their evidence.

## Current boundary

Direct Computer Use access to the ChatGPT app was denied during setup. No Dot browser was available to this session. These prompts were prepared, not executed. Emmy's installed instructions, native task reach, autonomous wake, cloud runtime, and schedules remain unverified until these records exist.
