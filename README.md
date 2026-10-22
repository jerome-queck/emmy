# Emmy

Emmy is Jerome's ChatGPT Dot. This repository gives one chief of staff durable responsibility context, current evidence checks, retained failures and repairs, and bounded next proposals.

Use Node 24 or later. No dependency install, database, server, or API key is required.

```sh
npm run agent -- doctor
npm run agent -- help --json
npm run agent -- responsibility --file .local/responsibility.json
npm run agent -- reconcile --id scratch-watch --as-of <UTC>
npm run check
```

Read [onboarding](docs/onboarding.md) to bind a designated Mac, adopt a responsibility, and recover it from a fresh process. Read [the operating brief](docs/operating-brief.md) with Emmy in the actual Dot. The nine commands retain local commitments and evidence. Native products still own execution, permissions, schedules, and delivery.

A responsibility retains its goal, context, exact repository/host/path/revision, authority reference, finish criteria, source age, next review, feature, and lifecycle. `reconcile` imports optional evidence and reads actual local bytes and git identity. It preserves contradictions, failed repairs, and original reviews. Imported text stays reported. Required independent review stays an external gate.

Use `--home <private-state>` to select one private register. The default is this checkout's ignored `.local/`. `backup` verifies a pinned record/evidence manifest and bindings. `restore` requires a new destination and suspends work until fresh observations name its new epoch. This does not establish hardware-loss recovery.

The [CLI reference](docs/cli.md), [architecture](docs/architecture.md), and [public catalog](docs/catalog.md) define the contracts. Missing or partial native observations remain visible. The public catalog is a starting inventory; exact private bindings can add projects. A cloud route requires a prepared environment, a reason, and explicit cloud authority.

Run `maintain --check` at session start. After metadata changes, run `maintain --write` and inspect the diff. The [behavioral skill](.agents/skills/verify/SKILL.md) drives real isolated CLI journeys. The [coordination contract](.agents/skills/coordination-contract/SKILL.md) checks bounded production functions and paired source mutants. The aggregate check also retains the existing merge tests and merge-policy verifier.

Use the installed pstack verification maintenance workflows after covered changes. Generated references do not replace independent source reading, a live pass, or review of formal assumptions. Actual Dot installation and capabilities remain unverified until the [native probes](docs/dot-verification.md) succeed.
