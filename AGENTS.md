# Emmy

Emmy is a flexible chief-of-staff operating kit for one ChatGPT Dot and delegated Work or Codex tasks. Default coding to local Codex. Treat cloud Work, the Dot's cloud computer, Codex Cloud, and each connected Mac as separate environments.

## Start each session

1. Read `README.md`, `docs/architecture.md`, and `.agents/skills/verify/features/README.md` when present.
2. Run `npm run agent -- doctor`, then `npm run agent -- maintain --check` when those commands exist.
3. Apply installed `pstack:poteto-mode` for work across files, architecture choices, and unknown bugs. Apply the standing thread and model policy below throughout all Emmy work.
4. Read the relevant project verification skill before changing behavior. Keep its feature map, command metadata, and docs in sync with code.

## Finish each change

Run `npm run check`. Run the behavioral driver and bounded formal verifier after changes to their covered code. Review the code-to-property mapping and replay failing mutations. Refresh generated docs. Never advance a formal sync record without reviewing the covered diff.

Run the installed pstack maintenance workflows when features or covered code change. The local maintenance command detects drift and regenerates derived content. It does not replace independent source reading, live driving, or reviewing formal assumptions.

## Standing thread and model policy

Create a fresh project-bound thread for each distinct new objective. Continue an existing thread only when continuing that same objective and its context is needed. A shared repository or topic is insufficient. Rediscover uncertain dispatches before retrying so an ambiguous launch cannot create duplicate work.

Use these model choices for Emmy-managed work:

| Role | Model and reasoning effort |
| --- | --- |
| Ordinary Codex session | `gpt-6.1-sol` at `high` minimum |
| Nontrivial subagent | `gpt-6.1-sol` at `medium` minimum |
| Trivial subagent | `gpt-6-luna` at `max` permitted |
| Most automations | `gpt-6-luna` at `max` by default |
| Heavy-reasoning automation | `gpt-6.1-sol` at `high` or higher |

A trivial subagent performs one bounded action with a known target and supplied inputs. Investigation, architecture, and cross-file implementation are nontrivial. Ordinary lead sessions keep the Sol High floor even for small requests. Compare effort levels within the selected model; effort names do not rank different model families.

Honor explicit human model and effort instructions within their named scope, including stronger reviewer choices. Existing thread selections remain in place. Project `.codex/config.toml` supplies defaults for new sessions and helpers. Explicit scoped instructions take precedence over project defaults and pstack role defaults. Do not change Studio-wide settings or another project's defaults. Distinguish requested settings, resolved configuration, and observed execution. If model selection or readback is unavailable, report that gap instead of claiming enforcement.

## Persistent calendar planning

Follow the calendar procedure in [the delivered operating brief](docs/operating-brief.md#plan-and-maintain-calendar-tasks). Find existing Tasks, choose slots, and create, move, or resize the same saved items within the user's concrete scope. Preserve Task versus Event intent and native IDs. Use capable connectors first and Emmy's cloud Calendar UI when duration needs it. A connected Mac's browser is a separate environment. Reopen saved items to verify their fields. Keep intent and readbacks in existing private notes or responsibilities. No recurring schedule is needed to establish this procedure.

## Evidence and scope

Label facts as documented, observed, reported, inferred, or unverified. A generated packet is a proposal. It is not a dispatched task, installed Dot configuration, saved schedule, merged PR, deployed site, or verified outcome.

Keep private machine paths, conversation IDs, raw app transcripts, account snapshots, tokens, and personal task state under ignored `.local/`. Commit only public project metadata and sanitized evidence. Never store credentials.

Prefer one owner per coding change and isolated worktrees for concurrent writers. Keep the human-facing plan concise. Give Emmy useful responsibilities and room for judgment. Add a new restriction only for a demonstrated boundary or explicit human requirement.
