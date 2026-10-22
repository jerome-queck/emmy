# Emmy

Emmy is a flexible chief-of-staff operating kit for one ChatGPT Dot and delegated Work or Codex tasks. Default coding to local Codex. Treat cloud Work, the Dot's cloud computer, Codex Cloud, and each connected Mac as separate environments.

## Start each session

1. Read `README.md`, `docs/architecture.md`, and `.agents/skills/verify/features/README.md` when present.
2. Run `npm run agent -- doctor`, then `npm run agent -- maintain --check` when those commands exist.
3. Apply installed `pstack:poteto-mode` for work across files, architecture choices, and unknown bugs. Honor the human's model settings. Use configured defaults for new chats and agents unless the current prompt specifies an override.
4. Read the relevant project verification skill before changing behavior. Keep its feature map, command metadata, and docs in sync with code.

## Finish each change

Run `npm run check`. Run the behavioral driver and bounded formal verifier after changes to their covered code. Review the code-to-property mapping and replay failing mutations. Refresh generated docs. Never advance a formal sync record without reviewing the covered diff.

Run the installed pstack maintenance workflows when features or covered code change. The local maintenance command detects drift and regenerates derived content. It does not replace independent source reading, live driving, or reviewing formal assumptions.

## Evidence and scope

Label facts as documented, observed, reported, inferred, or unverified. A generated packet is a proposal. It is not a dispatched task, installed Dot configuration, saved schedule, merged PR, deployed site, or verified outcome.

Keep private machine paths, conversation IDs, raw app transcripts, account snapshots, tokens, and personal task state under ignored `.local/`. Commit only public project metadata and sanitized evidence. Never store credentials.

Prefer one owner per coding change and isolated worktrees for concurrent writers. Keep the human-facing plan concise. Give Emmy useful responsibilities and room for judgment. Add a new restriction only for a demonstrated boundary or explicit human requirement.
