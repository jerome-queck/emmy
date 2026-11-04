---
name: agent-task
description: Prepare a structured Emmy task record, render its six-section prompt, and review original native and artifact evidence through supported parent tools.
---

# Run an agent task

Follow the [structured contract](../../../docs/agent-task-workflow.md) and [standing project policy](../../../AGENTS.md#standing-thread-and-model-policy). Use `task-workflow --file` to validate the original private record and render the prompt. `src/task-workflow.mjs` owns field validation; native Studio owns task state. The CLI reads supplied declarations and grants no authority.

Read destination context and installed `pstack:poteto-mode` when available. Resolve requested skills to actual absolute `SKILL.md` paths and place them in the record's `skills`. Missing explicitly requested skills require disclosure and manual invocation by the owner; continue independent work. Select relevant project verification. If missing, prepare task-relevant verification and propose a wider audit; ask before adding a missing CLI or feature map.

When a separately installed [task-only caller](../../../docs/task-runner.md) is configured for this workflow, invoke its stable `run-task-agent task-workflow --file <original-envelope>` path without a candidate override. Retain its source/runtime/home selection receipt separately from the original child stdout and exit. A pre-spawn receipt alone does not prove consumption. Require the expected source identity and successful original prepare result before continuing.

If no ordinary task caller is configured or the installed runner lacks `task-workflow`, retain that gap/refusal. An explicitly authorized [candidate exercise](../../../docs/agent-task-workflow.md#select-an-uninstalled-candidate-before-dispatch) remains separate from ordinary installed adoption. Invalid active selection, failed child execution or uncertainty stops the attempt without automatic fallback or retry. The selected dispatcher retains validated prepare output and the exact native request before creation.

Parent separately creates or reads the native task using the rendered prompt and existing supported route, retains the original response, then amends the same user-owned record. Pending or uncertain attempts require exact-objective rediscovery without automatic retry. Independently started tasks stay observation-only. Parent checks actual saved membership, settings and progress, then reviews original artifacts and criterion evidence. A reported review is not acceptance, deployment or ordinary adoption.

Run the [verification recipe](../verify/SKILL.md#agent-task-workflow-acceptance) after changes. No new controller or persistent ledger is introduced.
