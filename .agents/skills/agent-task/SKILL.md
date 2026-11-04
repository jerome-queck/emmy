---
name: agent-task
description: Prepare a structured Emmy task record, render its six-section prompt, and review original native and artifact evidence through supported parent tools.
---

# Run an agent task

Follow the [structured contract](../../../docs/agent-task-workflow.md) and [standing project policy](../../../AGENTS.md#standing-thread-and-model-policy). Use `task-workflow --file` to validate the original private record and render the prompt. `src/task-workflow.mjs` owns field validation; native Studio owns task state. The CLI reads supplied declarations and grants no authority.

Read destination context and installed `pstack:poteto-mode` when available. Resolve requested skills to actual absolute `SKILL.md` paths and place them in the record's `skills`. Missing explicitly requested skills require disclosure and manual invocation by the owner; continue independent work. Select relevant project verification. If missing, prepare task-relevant verification and propose a wider audit; ask before adding a missing CLI or feature map.

If the installed runner lacks `task-workflow`, preserve its refusal and follow [explicit candidate selection](../../../docs/agent-task-workflow.md#select-an-uninstalled-candidate-before-dispatch). The selected dispatcher retains validated prepare output and the exact native request before creation. Candidate use does not establish installed adoption.

Parent separately creates or reads the native task using the rendered prompt and existing supported route, retains the original response, then amends the same user-owned record. Pending or uncertain attempts require exact-objective rediscovery without automatic retry. Independently started tasks stay observation-only. Parent checks actual saved membership, settings and progress, then reviews original artifacts and criterion evidence. A reported review is not acceptance, deployment or ordinary adoption.

Run the [verification recipe](../verify/SKILL.md#agent-task-workflow-acceptance) after changes. No new controller or persistent ledger is introduced.
