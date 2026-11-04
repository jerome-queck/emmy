---
name: agent-task
description: Prepare, route, supervise, and accept a bounded Emmy agent task through supported native tools using a human six-section contract.
---

# Run an agent task

Use this skill when Emmy delegates an objective or reviews its handoff. Keep one accountable owner. Follow the existing [project policy](../../../AGENTS.md#standing-thread-and-model-policy), [native workflow](../../../docs/agent-task-workflow.md), and [verification skill](../verify/SKILL.md). These instructions add no controller, schema, journal, cache, or CLI.

## Prepare the contract

Read the destination project's standing context. Keep shared policy there and put task-specific decisions in the [prompt template](assets/task-prompt.md). Use these six headers in order:

- **Goal**: State the observable outcome, accountable owner, and exact target.
- **Verification**: Define acceptance criteria before work, original evidence to retain, required checks, and any independent reviewer.
- **Subgoals**: Give each subgoal an observable result, acceptance criterion, and dependencies.
- **Boundaries**: Name authorized effects, exclusions, source revision, and worktree ownership.
- **Output**: Specify deliverables and the evidence handoff.
- **Delegation**: Name permitted helpers, their scopes, and monitoring owner. Say when none are needed.

Roughly 500 words is a provisional prompt target, never a validator or rejection threshold. Add length when authority, acceptance, or recovery needs it and explain the exception. Prefer pointers to standing context over repetition.

Resolve and read installed `pstack:poteto-mode` for every task when available. Select other pstack skills for the actual work, plus the project's relevant verifier. For every requested skill, put its invocation before the six sections in the initial prompt. Use a Markdown link with `$` plus the exact skill name as its label and the existing absolute `SKILL.md` path as its target. Resolve paths on the destination host. Never invent an installed path.

If a skill is missing, disclose it and use available guidance within scope. If an explicitly requested skill cannot be resolved, tell the owner and ask them to invoke it manually. Continue independent work. If the project lacks a verifier, prepare a task-relevant verification skill and propose a wider audit. Ask before adding a missing project CLI or feature map. A fallback cannot replace a required independent review or authorize external effects.

## Execute and review

Use the [native workflow](../../../docs/agent-task-workflow.md#route-and-supervise) for discovery, creation, uncertain results, membership, settings, and parent-owned progress. A written prompt is preparation, not execution.

Before acceptance, review the actual artifact and map each criterion to its original receipts and observed outcome. Follow the [handoff requirements](../../../docs/agent-task-workflow.md#review-the-handoff). Leave incomplete criteria as gaps. Missing telemetry holds only the claims that need it, not unrelated bounded work. Deployment and operational adoption require their own authorization and readbacks.
