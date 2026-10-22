# ChatGPT Dot capability research

Accessed 2026-10-22. Official OpenAI pages only. Product documentation is verified. Emmy's account, permissions, cloud runtime, task visibility, and execution remain untested. This Codex session's tools are not evidence of Dot tools.

Throughput checkpoint: n/a, read-only investigation.

## Overview

Dots coordinate ongoing responsibilities, work between conversations, and delegate to Work or Codex. The main Dot is documented as GPT-6 Astra. Enterprise model defaults do not control the main Dot; delegated products have their own controls. [Meet dots](https://learn.chatgpt.com/docs/dots), [Dots administration](https://learn.chatgpt.com/docs/enterprise/dots-admin-guide).

Recommended architecture, inferred from these boundaries: Emmy coordinates priorities and evidence. Local Codex performs normal repository work. Emmy's cloud computer handles suitable research and artifacts. Codex Cloud handles explicitly selected work in a prepared environment. A repository records policy and evidence; it does not make Emmy omniscient.

## Key Concepts

| Component | Meaning |
| --- | --- |
| Main Dot | The continuing coordinator and its conversation. |
| Dot cloud computer | Its separate files, software, and browser sessions. |
| Delegated task | A distinct conversation with a specific execution location. |
| Connected computer | One explicitly authorized personal computer. |
| Saved schedule | A persisted recurring instruction and trigger. |
| Evidence record | Our proposed record of what actually executed and what it proved. |

The component definitions follow [Dot computers](https://learn.chatgpt.com/docs/dots/computers-and-apps), [Dot tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory), and [Dot controls](https://learn.chatgpt.com/docs/dots/controls). Evidence records are a recommendation.

## How It Works

### Capability matrix

All supported capabilities below still require an account probe before this repository labels them verified.

| Area | Documentation-supported capability | Boundary or unknown | Primary source |
| --- | --- | --- | --- |
| Cloud persistence | Cloud computer can retain state between uses and work while personal devices are off. | No promised retention duration, backup guarantee, stable filesystem path, or permanent daemon uptime. | [Computers](https://learn.chatgpt.com/docs/dots/computers-and-apps) |
| Files and software | Cloud computer has its own files and software. | OS, CPU, RAM, disk, shell, installed runtimes, package managers, privileges, install persistence, and inbound hosting are unspecified here. | [Computers](https://learn.chatgpt.com/docs/dots/computers-and-apps) |
| Browser | Separate cloud browser and sessions; user takeover and private sign-in are supported. | Local logins do not transfer. Sites may block cloud browsers. Saved-login reuse needs confirmation. | [Computers](https://learn.chatgpt.com/docs/dots/computers-and-apps) |
| Network | Browser, public networking, and computer use have distinct capability controls. | Enabled settings and reachable destinations need tests. Local VPN and local policies do not automatically extend to cloud. | [Dots administration](https://learn.chatgpt.com/docs/enterprise/dots-admin-guide), [Cloud security](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security) |
| Personal computer | One personal computer at a time; connection persists across tasks. | It must be online with the app open. Dot access is separate from Codex connection and Work Sync. | [Computers](https://learn.chatgpt.com/docs/dots/computers-and-apps) |
| Local task creation | Can create local Work and Codex tasks. | Availability depends on the connected computer. | [Computers](https://learn.chatgpt.com/docs/dots/computers-and-apps) |
| Continue local Codex | Can continue an identified existing local Codex task. | Does not establish access to every task on every Mac. | [Tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory) |
| Cloud tasks | Can start separate cloud threads. | A cloud thread is distinct from a local task. | [Computers](https://learn.chatgpt.com/docs/dots/computers-and-apps) |
| Cloud coding | Can use a previously configured Codex Cloud environment. | Each new cloud coding task gets its own workspace from a published environment. This is separate from Dot's computer. | [Tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory), [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) |
| Follow-up and readback | Can inspect results and send follow-ups to tasks it created. | Existing arbitrary cloud chats and existing local Work continuation are not explicitly promised by the task matrix. | [Meet dots](https://learn.chatgpt.com/docs/dots), [Tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory) |
| Cross-chat context | Can search past ChatGPT conversations. New delegated tasks receive selected context. | Computer access does not expose every conversation. No complete, continuous global Codex chat inventory is promised. | [Tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory) |
| Autonomous follow-up | Dot can decide when to pause and wake. | No documented wake latency or polling guarantee. | [Meet dots](https://learn.chatgpt.com/docs/dots) |
| Recurrence and events | Fixed-time work requires a saved schedule. Supported events can trigger work. Dot can read and edit existing Work automations. | A connected source alone does not start monitoring. Confirm supported events and saved schedule details. | [Tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory) |
| Review and stopping | Activity shows delegated work. Scheduled shows recurring work. | Pause, stopping a delegated task, and disabling a schedule are separate. Completed actions remain completed. | [Controls](https://learn.chatgpt.com/docs/dots/controls) |

### Proposed dispatch flow

1. Emmy records the requested outcome, sources, authorization, and completion evidence.
2. It selects an executor. Use the connected Mac for normal coding. Use its cloud computer for suitable research. Use an existing Codex Cloud environment when cloud coding earns its place.
3. It sends a bounded task packet with repository, revision, instructions, allowed actions, and required outputs.
4. It records the actual task ID, executor, computer or environment, and output locations.
5. It checks artifacts and relevant verification results. A task's completion status is insufficient proof of delivery. [Dot tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory).
6. It updates the responsibility record, reports meaningful changes, and preserves unresolved limits.

This is a proposed operating protocol. Native routing tools and task identifiers must first be demonstrated in Emmy.

## Where Things Live

| Item | Supported location and implication |
| --- | --- |
| Dot context | Current conversation, selected ChatGPT memory, and Dot-owned notes. Notes are separate from saved ChatGPT memory and are not a full transcript. [Tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory) |
| General Dot preferences | Conversation instructions. Use optional account custom rules for action boundaries. Rules do not grant connections or override safeguards. [Controls](https://learn.chatgpt.com/docs/dots/controls) |
| Local Codex guidance | Repository `AGENTS.md` and applicable global guidance. Discovery is documented for Codex, not as an automatic Dot cloud installation mechanism. [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) |
| Local skills | Codex scans repository `.agents/skills` and user `~/.agents/skills`. Dot local skills need a connected computer. [Build skills](https://learn.chatgpt.com/docs/build-skills), [Computers](https://learn.chatgpt.com/docs/dots/computers-and-apps) |
| Reusable cloud-facing workflows | Supported account plugins can package skills and MCP tools. Verify Dot compatibility, connection, and actions individually. A local pstack folder is not proof of cloud availability. [Skills and plugins](https://learn.chatgpt.com/docs/skills-and-plugins) |
| Codex Cloud setup | Published environment stores the prepared setup. Existing tasks preserve their own state; republishing affects new tasks. Commit important work. [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) |
| Recurring instructions | Saved prompt, trigger, and available skill or plugin. Web schedules do not retain a local folder or worktree between runs. Local schedules need the machine and app running. [Scheduled tasks](https://learn.chatgpt.com/docs/automations) |
| Repository contract | Proposed canonical policy, feature map, CLI, verification skills, capability register, and redacted evidence. Explicitly supply their revision to delegated tasks. |

## Gotchas

- Dot custom rules are account action instructions. Codex `.rules` configure command execution. The Codex rules documentation explicitly warns against assuming Work with local access reads local rule files. [Rules](https://learn.chatgpt.com/docs/agent-configuration/rules).
- Plugin installation does not deploy scripts to cloud execution. Plugin hooks are unsupported in cloud-orchestrated Work. Do not describe a local pstack SessionStart hook as an installed Dot hook. [Plugins](https://learn.chatgpt.com/docs/plugins).
- Work Cloud and Codex share execution mechanisms but do not have identical tools or permissions. Cloud configurations are distinct from local execution requirements. [Cloud security](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security).
- Read-only proactive research cannot itself send messages, change apps, or drive a computer. Authorized follow-up actions are a separate step. [Controls](https://learn.chatgpt.com/docs/dots/controls).
- Changing the selected computer does not migrate an existing task. [Tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory).
- Dot's own cloud computer is not documented as a general server with a stable public endpoint. Treat long-lived services, arbitrary package installation, SSH daisy chains, and multi-Mac discovery as hypotheses.
- Matching tool names in this Codex session prove nothing about Emmy. Preserve exact availability failures and permission denials.

## Low-risk probes

These are proposed prompts for the owner to send to Emmy. None ran during this investigation. Use a fresh nonce and UTC timestamp. Evidence needs real tool output or visible task and schedule records, not a capability claim.

1. **Runtime and network.** "Inspect only your own cloud computer. Report OS, current directory, available shell, Python and Node versions using read-only commands. Do not install anything or dump environment variables. Fetch https://example.com once through the browser and, if available, separately through shell networking. Show which tool ran each check, its output or status, and any limitation." Expected evidence is executor identity, command output, and independent browser/network results.

2. **Persistence.** "Create one harmless file in your cloud temporary directory containing nonce `<nonce>`. Return its absolute path and SHA-256. Do not create services or schedules." In a later interaction ask, "Read that exact file without recreating it; return the hash." Expected evidence is matching bytes and hash across separated turns. This tests observed persistence, not guaranteed retention.

3. **Cross-chat visibility.** "Using read-only discovery, find local Codex task `<known task ID/title>` on `<Mac Studio>` and ChatGPT conversation `<known title>`. Report their actual IDs, location, last visible status, and retrieval source. Do not send messages or start tasks. Explicitly list which requested records you cannot retrieve." Expected evidence is correct held-out details and clear scope limits. Compare against the owner's known inventory.

4. **Local routing and continuation.** "Create a read-only local Codex task on `<connected computer>` in `<scratch repo>`. Ask it to report its working directory, commit, and the digest of `probe.txt`. Also create a local Work task to summarize that file. Return both task links and execution locations. Modify no source files." Then instruct Emmy to send a fresh nonce follow-up to the Codex task. Expected evidence is visible tasks, executor readbacks, and a response in the same Codex task.

5. **Cloud delegation.** "Start one cloud Work thread to summarize https://example.com. If an already published Codex Cloud environment `<name>` exists, start a read-only coding task there to report the repository commit and available test command. Do not configure an environment or edit code. Return task links and locations; state what you cannot start." Expected evidence is distinct visible threads and correct environment identity.

6. **Skill and verifier access.** "On the connected computer, open `<absolute project verification SKILL.md>`, report the exact loaded path, and run its documented read-only check in `<repo>`. Return command, commit, exit code, and stdout. Do not install plugins or modify configuration. List any step unavailable in your cloud computer." Expected evidence is an actual verifier run and a justified local/cloud boundary.

7. **Autonomous wake.** "Keep responsibility for this single check. Pause and choose a follow-up within about ten minutes, then report nonce `<nonce>` in this Dot conversation. Do not create a recurring schedule or contact anyone else. Explain if your tools require a saved trigger." Expected evidence is an unsolicited, timestamped later result and its Activity record. A missed window is inconclusive until executor and service status are known.

8. **Saved scheduling.** "Create one harmless one-time check at `<future absolute time Asia/Singapore>` that reports nonce `<nonce>` only in this Dot conversation. Confirm the saved identifier, timezone, destination, and enabled state. After execution show the recorded run outcome. Do not create recurring work." Expected evidence is a Scheduled record, its saved fields, and an observed run. A promise without the saved record fails.

Recommended evidence fields are `probe_id`, `nonce`, `observed_at`, `product`, `executor`, `computer_or_environment`, `task_id`, `schedule_id`, `tool`, `command`, `exit_code`, `artifact_path`, `sha256`, `outcome`, and `limits`. Omit credentials and unrelated private content.

## Research disposition

ISSUES. Documentation supports the coordinator design, local-first coding, independent cloud work, and saved schedules. Emmy account access and the probes remain unverified. No repository files, accounts, tasks, schedules, or Dot settings changed.

The how investigation, technical-writing, and unslop skills shaped this report. No pstack leaf principle is claimed because none was applied as a separate loaded workflow.
