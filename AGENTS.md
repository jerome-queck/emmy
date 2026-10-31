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

When private project bindings select an authorized persistent native dispatcher, recover it and the objective through the trusted installed `dispatch` command before routing. Keep that dispatcher pinned for coordination. It creates fresh coding children; implementation belongs to those children. Use [private dispatch recovery](docs/native-dispatch.md), existing source authorization and parent-owned native progress. The command is read-only advice, not a native hook or access grant. Exact dispatcher and job identities remain private.

Use the designated host's native `mcp__codex_app__create_thread` with the discovered saved project ID and `target.environment.type = "local"`. `cloud_threads.create` durable tasks do not prove native creation. When Emmy lacks native tools directly, use the existing authorized control bridge for native creation and parent-owned `read_thread` or `wait_threads` progress. Do not depend on the coding chat waking Emmy. Resolve pending client IDs through native discovery before using ready thread operations. See [the concrete route](docs/change-delivery.md#create-through-the-native-host-service).

Discover the saved native project before dispatch. After creation, read back the returned thread's actual saved project membership and compare its project ID with the intended saved project. A working directory, request parameter, or returned thread ID alone does not prove membership. Retain the native thread ID, project ID, executor/host readback, requested settings, and verification time privately. If membership is missing, attach that same thread through the supported native project operation and read it back. If membership is unavailable or ambiguous, retain it as unverified and rediscover before any retry. Do not create a replacement thread to repair an uncertain association or edit native databases. Preserve contrary owner observations alongside later readbacks. See [the dispatch contract](docs/change-delivery.md#verify-the-created-threads-project-membership).

Use these model choices for Emmy-managed work:

| Role | Model and reasoning effort |
| --- | --- |
| Ordinary Codex session | `gpt-6.1-sol` at `medium` |
| Nontrivial subagent | `gpt-6.1-sol` at `medium` |
| Trivial subagent | `gpt-6-luna` at `max` permitted |
| Most automations | `gpt-6-luna` at `max` by default |
| Heavy-reasoning automation | `gpt-6.1-sol` at `high` maximum |

A trivial subagent performs one bounded action with a known target and supplied inputs. Investigation, architecture, and cross-file implementation are nontrivial. Ordinary coding sessions and substantive helpers use Sol Medium. Heavy reasoning uses Sol High maximum. Anything above High or a different coding model requires explicit one-time owner permission for that exact task, role, model and effort. No Astra default or automatic XHigh escalation. Generic "or higher" grants no permission. This coding/helper policy overrides pstack role defaults; unrelated automation selections remain unchanged. Compare effort levels within the selected model; effort names do not rank different model families.

Honor explicit human model and effort instructions within their named scope, subject to the exact one-time permission requirement. Existing thread selections remain in place. Project `.codex/config.toml` supplies defaults for new sessions and helpers. Explicit scoped instructions take precedence over project defaults and pstack role defaults. Do not change Studio-wide settings or another project's defaults. Distinguish requested settings, resolved configuration, and observed execution. If model selection or readback is unavailable, report that gap instead of claiming enforcement.

Standard/non-fast is the default for coding sessions, coordinators and helpers. Fast or Ultrafast requires explicit owner approval for that exact task, role and tier. An unanswered request is not approval; continue Standard without waiting. Never inherit an accelerated tier from a parent, saved session or broader preference. Model/effort permission does not grant speed permission. Use supported native/config controls only, verify recorded settings separately, and report an unavailable tier control or readback.

## Persistent calendar planning

Follow the calendar procedure in [the delivered operating brief](docs/operating-brief.md#plan-and-maintain-calendar-tasks). Find existing Tasks, choose slots, and create, move, or resize the same saved items within the user's concrete scope. Preserve Task versus Event intent and native IDs. Use capable connectors first and Emmy's cloud Calendar UI when duration needs it. A connected Mac's browser is a separate environment. Reopen saved items to verify their fields. Keep intent and readbacks in existing private notes or responsibilities. No recurring schedule is needed to establish this procedure.

## Evidence and scope

Label facts as documented, observed, reported, inferred, or unverified. A generated packet is a proposal. It is not a dispatched task, installed Dot configuration, saved schedule, merged PR, deployed site, or verified outcome.

Keep private machine paths, conversation IDs, raw app transcripts, account snapshots, tokens, and personal task state under ignored `.local/`. Commit only public project metadata and sanitized evidence. Never store credentials.

Prefer one owner per coding change and isolated worktrees for concurrent writers. Keep the human-facing plan concise. Give Emmy useful responsibilities and room for judgment. Add a new restriction only for a demonstrated boundary or explicit human requirement.
