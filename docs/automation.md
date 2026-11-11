# Repository automation

This document describes repository behavior for `jerome-queck/emmy`, the canonical repository confirmed by the human. Workflow files are proposals until that GitHub repository runs them. Use the [installed acceptance procedure](automation-acceptance.md) to collect actual provider receipts.

## Checks and evidence

`Emmy checks` publishes one required job named `emmy-check`. It uses Node 24.19.0 and the hosted runner's Java 21. It installs locked verification dependencies with `npm ci --ignore-scripts`, then runs `npm run check`. The publication checker downloads the official TLA+ tools 1.7.4 jar into ignored `.local/tools/` when absent and verifies its pinned SHA-256 before execution. The job checks the PR head for pull requests and the event SHA for other events. It records the actual checkout SHA before running the command.

`npm run check` first runs the tracked Markdown link checker and its CLI fixture tests, then checks generated references and combines three verification layers:

- Real CLI journeys and GitHub adapter tests check observed behavior.
- Finite coordination and merge-policy checks call actual production functions and reject paired source mutants.
- The bounded TLA+ publication model explores filesystem interleavings. Paired copied-production mutations must produce matching actual filesystem witnesses.

`npm run verify:formal` runs both finite checkers and the publication model. `npm run verify:model` runs the [publication contract](../.agents/skills/publication-contract/SKILL.md) alone. Its pass covers the stated model bounds and assumptions, not arbitrary filesystem behavior or native execution.

`npm run check:links` runs the Markdown check alone. Local targets must exist with exact tracked spelling; Markdown fragments must match the repository's heading rules. External URLs and code examples are ignored. The [verification skill](../.agents/skills/verify/SKILL.md#scope) records the block-level diagnostic locations and unsupported HTML anchors and links.

The workflow runs on these events:

| Event | Checked revision |
| --- | --- |
| `pull_request` | Exact proposed head. |
| `push` | Pushed branch or tag revision when GitHub dispatches the event. |
| `merge_group`, `checks_requested` | GitHub's proposed merge group. |
| Weekly Sunday, 01:17 UTC | Default branch. GitHub may delay scheduled runs. |
| `workflow_dispatch` | Selected ref. |

Each run uploads `.local/verification/`, including the checkout receipt and captured command output, and `.local/publication-model/`, including TLC logs, counterexamples, copied-source filesystem witnesses and restored baselines. Artifact names contain the checked SHA, run ID, and attempt. Retention is 30 days. Upload also runs after failure. Other `.local/` content, including the cached jar and private account or machine state, is excluded.

The read-only CI token has `contents: read`. PR code runs only in this job. Checkout does not persist credentials. Upstream actions use commit SHA pins. Dependabot proposes weekly GitHub Actions updates through the same review policy.

Weekly CI detects failing checks and stale generated outputs. It does not research product changes, rewrite operating instructions, review formal assumptions, install Dot instructions, or create a Dot schedule.

GitHub suppresses most new workflow runs caused by `GITHUB_TOKEN`, including push runs after a token-driven merge. Premerge checks remain required. Weekly or manual checks can verify the resulting default branch. See GitHub's [workflow recursion rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Auto-merge policy

`evaluateEligibility` is the pure merge decision. The GitHub adapter reads metadata and requests an immediate merge commit through the REST API. The request includes the exact head SHA and `merge_method: "merge"`. Merge commits retain reviewed commits that the formal verifiers read with `git show` in fresh clones. Squash merges would discard that ancestry. The adapter does not arm GitHub's deferred auto-merge setting, enqueue a PR, or request a rule bypass.

This choice keeps authorization tied to the reviewed revision. GitHub can retain deferred auto-merge after a writer pushes another head. A generic required status context cannot enforce this helper's reviewer-account restriction. Immediate merging avoids leaving that authorization active for a later revision. The coordinator accepted this design after reviewing GitHub's documented behavior.

Every gate must pass:

| Gate | Requirement |
| --- | --- |
| Repository | Canonical configured repository and both PR repositories match it. |
| Pull request | Open, unmerged, non-draft PR with a valid number. |
| Head | Current PR head matches the candidate's exact SHA. |
| Base | Current PR targets `main`, and the PR base and observed branch match the captured base SHA. |
| Protection | Protected `main`, required checks enforced for everyone, and both required contexts present. |
| CI | Latest `emmy-check` check run at that head completed successfully through GitHub Actions. A colliding status must also succeed. |
| Independent review | Latest `emmy-independent-review` status at that head succeeds, posted by the configured repository owner's user account. A colliding check run must also succeed. |

The adapter reads all status pages and check runs for the exact SHA. A newer pending, error, failure, cancelled, skipped, or neutral result cannot borrow an older success. A successful check named `emmy-independent-review` cannot replace the required status.

Before requesting a merge, the adapter reloads metadata and rechecks every gate against the original head and base. GitHub's head guard rejects a head change at the merge API. GitHub enforces branch requirements at the merge. A not-ready response leaves the PR skipped, with no deferred authorization. A later status or check event reruns eligibility.

GitHub's merge API has no atomic expected-base argument. The adapter refuses observed base changes. Protection and trusted repository writers remain assumptions during the final API interval. The adapter's readback reports a changed head or target as `unverified`.

The workflow runs on PR metadata changes, successful `Emmy checks` completion, relevant commit statuses, and manual dispatch. PR events include opened, reopened, synchronize, ready for review, and edited. Manual dispatch accepts an optional PR number. Empty input considers all open PRs into `main`.

The privileged workflow checks out `main` and executes its policy. It never checks out or imports PR code, downloads PR artifacts, or interpolates PR text into shell source. Fork repositories skip the job before receiving its token. A fork PR's metadata may trigger the upstream workflow, but the own-repository gate refuses it. The token has only `contents: write`, `pull-requests: read`, `checks: read`, and `statuses: read`. It cannot publish its own independent-review status.

The merge workflow has no concurrency group that can cancel a pending status event. Repeated runs can observe the same candidate. The server's exact-head check and merge readback handle duplicate immediate requests.

Results distinguish `skipped`, `enabled`, `queued`, `merged`, `failed`, and `unverified`. Enabled or queued states are observations of preexisting provider state and carry `observedOnly: true`. This helper creates neither state. A successful API response does not prove a merge. The adapter reads GitHub's PR state afterward. Only a confirmed merged PR at the expected head and target with a valid full merge commit OID gets `merged`.

## Required GitHub setup

Repository files do not install settings or branch protection. The repository owner must confirm these provider settings before relying on unattended merges:

1. Use `jerome-queck/emmy`, the canonical repository in `intendedRepository`. The workflow observes `GITHUB_REPOSITORY`; the helper compares that value with this one configured identity.
2. Enable merge commits to retain the reviewed source commits required by the formal verifiers. GitHub's deferred auto-merge setting is separate and is not required by this helper.
3. Protect `main`. Require `emmy-check` and `emmy-independent-review`. Require branches to be current before merging and enforce protection for administrators. Preserve any stricter existing rules, review requirements, and conversation requirements. Prohibit force pushes and branch deletion.
4. Verify the branch API exposes the two required contexts and `enforcement_level: everyone`. Missing or unreadable metadata leaves this helper closed. Classic protection provides this metadata. Other rulesets need provider readback and compatibility testing.
5. Run a reviewed PR through hosted CI, record its exact-head review status, and inspect the workflow's merge receipt. Local tests do not establish token permissions or hosted enforcement.

The check workflow includes `merge_group` validation. This helper does not install or support queue landing. A queue requires a separate policy for its current merge group. The immediate REST endpoint refuses PRs that require a queue.

## Independent review and maintenance

Future coding sessions obtain a verdict from a reviewer that did not write the change. That reviewer inspects the complete current diff, including workflow changes, and records its head SHA and evidence. A trusted session posts `emmy-independent-review` as `success` only for that reviewed head. Pending work uses `pending`; rejected work uses `failure` or `error`. Any source change needs a new review at the new head. No additional human merge approval is required once the configured gates pass.

The repository owner's account may authenticate several independent local agents. The status is an attestation of their separate review process. GitHub account identity alone cannot prove agent independence. The author must not certify their own work. This workflow never creates the attestation.

A native Codex heartbeat can run semantic upkeep after weekly CI. It reads current sources, runs the installed pstack maintenance workflows, reviews covered diffs and formal assumptions, and submits verified changes through this policy. Account-specific cadence, provider receipts, and installation state belong under ignored `.local/`. A native Codex heartbeat is separate from a Dot schedule.

Local verification uses these commands:

```sh
node --test test/github-auto-merge.test.mjs
node verification/merge-policy.mjs
```

The bounded verifier executes the actual eligibility function across 30,720 cases. Its ten binary dimensions cover identity, merged state, open state, draft state, repository ownership, exact head, target branch, base SHA, branch SHA, and administrator enforcement. It combines six CI states and five review states. Four compiled mutants remove the head, base, CI, and independent-review guards. Each mutant must execute and admit its intended forbidden case while the original refuses it. The verifier writes synthetic counterexamples to `.local/verification/merge-policy.json`.

These checks establish finite policy behavior and adapter contracts. They do not establish GitHub execution, live race freedom, token permissions, provider protection, actual reviewer independence, or installed Dot behavior.

## Primary sources

GitHub documents [workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [commit-status ordering](https://docs.github.com/en/rest/commits/statuses#list-commit-statuses-for-a-reference), [check-run metadata](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference), and [branch metadata permissions](https://docs.github.com/en/rest/branches/branches#get-a-branch). Its [immediate merge endpoint](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request) documents the head SHA guard and excludes queue landing. Its [deferred auto-merge documentation](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request) describes when new pushes disable deferred authorization. Sources and the live GraphQL input schema were inspected on 22 October 2026.
