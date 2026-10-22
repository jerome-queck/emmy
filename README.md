# Emmy

Emmy is Jerome's ChatGPT Dot. This repository supplies its chief-of-staff operating brief, public project catalog, local task planner, evidence assessment, and verification tools.

Use Node 24 or later. There are no external dependencies or API keys.

```sh
npm run agent -- doctor
npm run agent -- help --json
npm run agent -- catalog
npm run agent -- probe --nonce fresh-owner-value
npm run check
```

Read [the onboarding procedure](docs/onboarding.md) to create private machine bindings, import a scoped native inventory, prepare a task proposal, and assess its returned evidence. Read [the operating brief](docs/operating-brief.md) with Emmy in the actual Dot. Generated packets are proposals. No command dispatches tasks, installs instructions, schedules work, or merges changes.

Normal coding selects local Codex on the designated Mac. Missing, unavailable, stale, or partial observations stay visible. Explicit Codex Cloud selection needs a prepared environment, a reason, and cloud authority. Other projects can be added through private bindings.

The [public catalog](docs/catalog.md), [CLI reference](docs/cli.md), [architecture](docs/architecture.md), and [research](docs/research/dot-capabilities.md) record the current contracts. All Dot account capabilities remain unverified until native probes establish them. Private paths, chat identities, raw inventories, and task state stay under ignored `.local/`.

Run `npm run agent -- maintain --check` at session start. Run `maintain --write` after public metadata changes, then inspect the diff. The [behavioral skill](.agents/skills/verify/SKILL.md) drives actual CLI journeys. The [coordination-contract skill](.agents/skills/coordination-contract/SKILL.md) checks bounded routing and evidence properties against production functions and source mutations. Both retain local evidence after cleanup.

Use the installed `pstack:maintain-verification-skill` and `pstack:maintain-formal-verification-skill` workflows after relevant changes. The local generator refreshes derived references. It does not independently review behavior, advance source review dates, or approve a formal sync record.
