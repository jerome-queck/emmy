# Change delivery

Design for Emmy's user-triggered coding loop. Repository gates exist; native dispatch and ordinary-turn adoption require the acceptance below. This document does not install a hook or grant permissions.

## One request, one owner

Jerome asks Emmy for an outcome. Emmy handles app work or research itself when appropriate. Coding goes to local Codex in the intended project on its designated, connected Mac. Cloud coding remains an explicitly authorized exception.

Before dispatch, Emmy discovers the actual native project and any matching live task. Create a fresh project-bound thread for each distinct new objective. Continue an existing thread only for that same objective when its context is needed. Sharing a repository or topic is insufficient. Rediscover uncertain dispatches before retrying. Correlate the request with a stable effect key in private context; a key cannot enforce native at-most-once execution.

The task carries the goal, source context, exact target/revision, authority, finish evidence and effect key. Resolve the executor's actual installed pstack skill first. When invoking it in a new task, use `[$pstack:poteto-mode](/absolute/resolved/path/SKILL.md)` followed by the task details. The example path is a placeholder, not an invocation. Apply the standing role policy in `AGENTS.md` and the delivered operating brief. Ordinary Codex sessions use Sol High minimum. Nontrivial helpers use Sol Medium minimum, and trivial helpers may use Luna Max. Most automations default to Luna Max, with heavy reasoning on Sol High or higher. Honor explicit human settings within their named scope. Leave existing thread selections and Studio-wide settings unchanged.

Project `.codex/config.toml` supplies new-session Sol High and helper Sol Medium defaults through [supported native keys](https://learn.chatgpt.com/docs/config-file/config-reference). Defaults are not enforcement or proof of a run's model. Read back resolved configuration separately from requested settings and actual execution. Calendar app work follows [the delivered calendar procedure](operating-brief.md#plan-and-maintain-calendar-tasks) in Emmy's cloud browser when connectors lack the needed Task fields.

Emmy owns coordination and authorized follow-ups. The CLI's proposals are not dispatched tasks. The actual native identifier and product readback establish dispatch.

When a private project binding selects a persistent local native dispatcher, that route takes precedence. Recover its identity and known objectives with the trusted installed `dispatch` command. Keep the selected dispatcher pinned for coordination and use the existing authorized control connection to give it the scoped objective. It creates the fresh implementation child. Private bindings and objective/task records retain exact identities, human source authorization, launch attempts and native readbacks. [Private dispatch recovery](native-dispatch.md) defines the supported schema and invocation. The command is a read-only projection over the existing archived journal, not a native executor or a second authority store.

## Create through the native host service

Discover the current tool catalog and saved projects on the designated Mac. A selected eligible dispatcher performs the creation. If no dispatcher is selected, use the supported direct or authorized bridge route. Use `mcp__codex_app__list_projects`, then `mcp__codex_app__create_thread` with the returned native project ID and a local environment:

```json
{
  "target": {
    "type": "project",
    "projectId": "<discovered-native-project-id>",
    "environment": { "type": "local" }
  },
  "model": "gpt-6.1-sol",
  "thinking": "high",
  "title": "<project> · <objective> 🟡",
  "prompt": "<resolved skill invocation followed by the authorized task and correlation marker>"
}
```

The example explicitly requests the ordinary-session minimum. Apply stronger scoped human settings when specified. A connected host's `local` environment means that project's saved checkout on that host. Rediscover its identity rather than copying a project ID between environments.

The inspected native create schema exposes no permission profile, approval policy, sandbox, or Full Access field. The inspected native catalog also exposes no per-thread access-mode setter. Preserve an existing explicit standing human scope for qualifying FullAccess children and reuse it without repeated consent. Verify the dispatcher's actual host/project/pin and recorded policy/model, then the child's actual first-turn record. Stop the affected action on mismatch. Keep authorization, recorded settings, effective access and provider execution separate. Native creation cannot enforce access through nonexistent parameters. Any scope expansion needs concrete confirmation; do not alter global/project security settings, other threads or connector/Computer Use grants.

`cloud_threads.create` creates cloud-managed durable tasks. A repository path or project parameter in that request does not establish native host creation. Moving an existing durable task is a separate association attempt and cannot pass direct native creation acceptance. A delegation sender label alone cannot identify the backend. Inspect the actual operation and its native readbacks.

If Emmy lacks the native operations directly, use an existing authorized control bridge that exposes them on the designated Mac. The bridge performs the native create above. Do not substitute another durable coding create. If neither direct tools nor that bridge are available, report native creation unavailable and describe the supported fallback without claiming native success.

Emmy retains ownership through that bridge. Keep the ready native ID and actual host ID, then request supported `read_thread` detail or bounded `wait_threads` progress through the bridge. Retain cursors as `afterCursor`, back off on unchanged state, and read back completion. Do not depend on the ordinary coding chat waking or messaging Emmy. No new schedule or polling service is required. Reuse retained human authorization for the same objective. An expansion requires scoped confirmation.

## Verify the created thread's project membership

Discover the intended saved project and retain its native ID and execution environment before creation. Pass those supported fields to the native create operation. Record the requested model and effort separately from resolved defaults and observed execution.

After creation, use a supported native listing or thread/project readback that explicitly returns the created thread ID and its saved project ID. Compare that saved membership with the intended project. A `cwd`, project-shaped prompt, request parameter, or returned thread ID alone cannot pass this check. A readback that omits membership leaves that field unverified. Preserve actual host identifiers as returned rather than silently treating different host names as equivalent.

If the existing thread lacks membership, attach that same ID through the supported native project operation and read back the saved association. If current membership is already correct, preserve that current observation without claiming it was correct at creation. Retain the owner's contrary observation. No direct native database edit is part of this procedure.

For pending creation, retain `clientThreadId` and resolve it through supported native discovery. Never pass it to an operation requiring a ready `threadId`. Correlate the eventual ready ID with the original request before continuing. For uncertain creation or association, recover the existing task before retrying. Missing or conflicting readback stays unverified. Do not launch another task to repair an uncertain project association. Retain the create receipt, membership readback, any correction, actual verification time, and limitations privately.

Reopen the ready thread through the supported native service. Verify saved membership through an explicit native listing when the detail read omits it. Read session model and effort only through supported exposed readbacks. Requested fields and project configuration are separate evidence. If no session readback is exposed, retain that gap. Provider execution, visibility from another device, and later ordinary-turn adoption each require their own observations.

## Quality belongs to the repository

`AGENTS.md` routes qualifying work through pstack and requires relevant verification before behavior changes. The coding owner reads current architecture and feature instructions, reproduces bugs through the real CLI, keeps one implementation owner, and updates command metadata, feature instructions and public procedures with the source change.

Run pstack's behavioral and formal maintenance workflows. Read source, drive the real feature and review the code-to-property mapping; generated references do not perform these reviews. Keep the finite checks of production functions and the TLA+/TLC publication model as complementary verification. A bounded model needs explicit assumptions, source-step mapping and counterexamples from deliberately broken variants.

`npm run check` enforces executable checks and generated-document consistency. Protected merge requires exact-head CI plus an independent reviewer that did not write the change. The owner account attests that review; it cannot turn self-review into independent review. No checker can prove that an agent read or followed every prose instruction. Review evidence must explain material decisions and remaining limits.

## Delivery is more than a merge

Track these states separately, bound to exact revisions:

| State | Acceptance |
| --- | --- |
| Published | Protected merge readback and actual public source identity. |
| Installed | Verified runtime retained in a versioned private path, installed source hashes and stable launcher target; existing private state preserved. |
| Guidance loaded | Runner refresh receipt names the new approved guidance digest. |
| Adopted | Emmy actually invokes the installed capability in the intended native environment and reads back the useful result. |

Guidance refresh downloads approved data. It cannot execute new code or install a capability. Executable changes need a reviewed runner update. A new app connection or permission needs actual native discovery and the human's existing authority. Report the last proven delivery state instead of saying a feature is active merely because its PR merged.

Keep a small stable bootstrap in Emmy's existing native note. It points to the trusted runner and current guidance rather than copying every procedure. Load that guidance after resumption and before briefings; recover scoped corrections independently. Preserve existing schedule cadence and destination. No new polling service or recurrence is needed for this user-triggered loop.

For selected-dispatcher projects, the bootstrap also loads `run-agent dispatch --project <project-key> --as-of <UTC>` from the reviewed versioned installation and recovers the matching objective before a native instruction. Verify the saved private selection, actual installed invocation, and source guidance digest separately. Preserve the existing bootstrap and corrections when adding this short route.

These instructions and project defaults do not install an automatic dispatcher or calendar executor. The existing runner executes guidance acquisition and checking. Native products perform thread association and calendar writes. Verify those actual operations separately from delivered prose.

## Native acceptance

Use a later ordinary human request without a setup reminder. Observe Emmy creating the correct local project task, then an authorized follow-up continuing it. Confirm the task used current repo instructions, passed relevant checks and independent review, and returned the exact published/installed revision. After an approved changed-guidance release, observe a later invocation loading its new digest and using the change. Preserve failures and unavailable steps privately. Prompted rehearsals and saved-note readback do not prove ordinary-turn invocation.

For that later unrelated objective, retain the actual guidance refresh, fresh native thread ID and explicit saved project membership after creation. Requested model and resolved project defaults do not establish provider execution. Read back execution when supported and leave unavailable evidence unverified. Do not count the setup or repair conversation as this later acceptance. This acceptance waits for the real human request and needs no new schedule.

Primary sources: [Dot task support](https://learn.chatgpt.com/docs/dots/tasks-and-memory), [connected-computer boundaries](https://learn.chatgpt.com/docs/dots/computers-and-apps), [pstack verification creation](https://github.com/cursor/plugins/blob/main/pstack/skills/create-formal-verification-skill/SKILL.md).

## Route saved local and remote projects

Use [native destination resolution](native-dispatch.md#resolve-the-saved-destination) with complete fresh discovery and repository evidence. The coordinator's own project does not determine the child's destination. Each saved destination has its own exact scope and independently verified membership. The native project creation route's local environment runs on the saved project's configured host. Authorized Studio-connected remote projects use that existing route, with separate host-specific scope, source, and destination-installed skill readbacks. No Dot attachment switch or cloud executor is implied.

Studio-local source inspection is observed directly. Remote reports remain reported and cannot inherit Studio's source or skill assurance. Missing evidence holds the action. Actual remote creation, destination-host model availability, and first-turn permission inheritance need their own native acceptance. A local marker cannot establish them.
