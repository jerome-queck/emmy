# Emmy

Emmy is Jerome's ChatGPT Dot. This repository gives one chief of staff durable responsibility context, current evidence checks, retained failures and repairs, and bounded next proposals.

Use Node 24 or later. The agent CLI needs no dependency install. Verification uses locked development dependencies. No database, server, or API key is required.

```sh
npm ci --ignore-scripts
npm run agent -- doctor
npm run agent -- help --json
npm run agent -- briefing --home <private-home>
npm run agent -- responsibility --file .local/responsibility.json
npm run agent -- reconcile --id scratch-watch --as-of <UTC>
npm run check
```

Read [onboarding](docs/onboarding.md) to bind a designated Mac, adopt a responsibility, and recover it from a fresh process. Use [the one-time Dot bootstrap](docs/dot-bootstrap.md) to adopt the routine in Emmy's existing notes. The commands retain local commitments and evidence and provide advisory briefing and dispatch checks. Native products still own native execution, permissions, schedules, and delivery.

[Private dispatch recovery](docs/native-dispatch.md) loads a project's selected native dispatcher and objective bindings from the existing private home. `dispatch --project <project-key> --as-of <UTC>` recovers the selection and jobs. Use `--resolve <explicit-selector> --discovery <private-capture>` for a fresh saved destination. With `--id <objective-id> --discovery <private-capture>`, it validates retained evidence and current source before returning native advice. Coordinator ownership and destination host/project remain separate. Authorized saved remote projects use Studio's native configured-host route, with remote source and installed-skill readbacks; the command runs no remote commands. It writes no records, creates no task and changes no permissions.

`briefing` returns readable guidance from one pinned public-main bundle. With `--file <private-draft.json>`, it checks declared sources and renders the exact Markdown to show. [The briefing contract](docs/briefing.md) defines input, source age, correction scope and degraded output. The command does not install a native hook or verify automatic invocation.

[Change delivery](docs/change-delivery.md) proposes Emmy's native coding route and repository quality gates. Published source, installed runner, loaded guidance and ordinary-turn adoption require separate readbacks. Briefing recovery and output evidence stay private; the human body contains scoped updates, safe source links and material limits.

The standing [thread and model policy](AGENTS.md#standing-thread-and-model-policy) applies to all Emmy work. Project `.codex/config.toml` supplies Sol High session and Sol Medium helper defaults. The [delivered calendar procedure](docs/operating-brief.md#plan-and-maintain-calendar-tasks) finds existing Tasks and maintains their saved slots through native connectors or Emmy's cloud Calendar UI. Existing native items and private notes or responsibilities own persistence. Follow [native acceptance](docs/dot-verification.md#verify-persistent-calendar-planning-and-standing-policy) to verify actual saved behavior separately from this guidance.

[`cloud --file <private-envelope.json>`](docs/cloud-admission.md) executes one bounded cooperative standard-library chunk on the invoking executor. One responsibility-backed queue per private home retains priorities, explicit backpressure, retries, checkpoints and pending health escalation. It cannot enforce provider-wide capacity or deliver a Dot notification. The two-phase acceptance script survives a separate process invocation; parent cloud use remains a separate acceptance stage.

[`fleet --file <private-envelope.json>`](docs/fleet-health.md) retains executable scoped health, corrections, alert episodes, and bounded parent-owned read tickets in the same responsibility journal. Parent performs actual app/native/schedule reads and separate alert send/readback. [`signin`](.agents/skills/sign-in/SKILL.md) chooses a secure recovery handoff without accepting secrets. Browser and connector recovery remain separate.

[`calendar --file <private-envelope.json>`](docs/calendar.md) checks declared current intent, exact saved fields, complete inventory, allocations, and retained attempts without native execution or journal writes. Its result cannot authenticate a save or stop an external queue.

A responsibility retains its goal, context, exact repository/host/path/revision, authority reference, finish criteria, source age, next review, feature, and lifecycle. `reconcile` imports optional evidence and reads actual local bytes and git identity. It preserves contradictions, failed repairs, and original reviews. Imported text stays reported. Required independent review stays an external gate.

Use `--home <private-state>` to select one private register. The default is this checkout's ignored `.local/`. `backup` verifies a pinned record/evidence manifest and bindings. `restore` requires a new destination and suspends work until fresh observations name its new epoch. This does not establish hardware-loss recovery.

The [CLI reference](docs/cli.md), [architecture](docs/architecture.md), and [public catalog](docs/catalog.md) define the contracts. Missing or partial native observations remain visible. The public catalog is a starting inventory; exact private bindings can add projects. Nonlocal coding requires a reason and explicit cloud authority. Codex Cloud also requires a prepared environment.

Run `maintain --check` at session start. After metadata changes, run `maintain --write` and inspect the diff. The [behavioral skill](.agents/skills/verify/SKILL.md) drives real isolated CLI journeys. The [coordination contract](.agents/skills/coordination-contract/SKILL.md) checks finite production-function domains and paired source mutants. The [publication contract](.agents/skills/publication-contract/SKILL.md) runs a bounded TLA+ model of filesystem interleavings with paired actual-source witnesses. That check requires Java 21 and downloads a hash-pinned TLC jar into ignored local storage. The aggregate check retains both finite verifiers and the existing merge tests.

Use the installed pstack verification maintenance workflows after covered changes. Generated references do not replace independent source reading, a live pass, or review of formal assumptions. Actual Dot installation and capabilities remain unverified until the [native probes](docs/dot-verification.md) succeed.

`npm run check` first checks local Markdown links and runs the link checker's CLI fixtures. Use `npm run check:links` for the link check alone. It reads current bytes of tracked Markdown, including hidden skills, and checks exact-case tracked targets and heading fragments. The [verification skill](.agents/skills/verify/SKILL.md#scope) defines its heading rules, diagnostic locations, and limits.
