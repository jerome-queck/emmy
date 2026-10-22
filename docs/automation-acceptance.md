# Verify installed repository automation

Use this procedure after changing repository checks, merge policy, protection or review attestation. Configuration files alone do not establish an installed workflow.

## Capture the candidate

Record the repository, PR number, full head SHA, target branch and observed base SHA. Confirm both deferred auto-merge and merge-queue admission are absent before rewriting a candidate. Do not change protection to make a run pass.

Run `npm run check` under Node 24.19.0. Retain the actual report paths and failed evidence. Obtain a separate non-author verdict covering the complete current diff. Record its head, base, stable patch ID, commands and limits. A source change invalidates the exact-head status even if the earlier patch looked similar.

## Observe hosted execution

Read back `main` protection and required contexts `emmy-check` and `emmy-independent-review`. Confirm enforcement includes administrators and strict up-to-date checks. Read the hosted check run at the candidate SHA, its conclusion and uploaded revision receipt. An older successful run cannot establish the new candidate.

The configured owner's user account posts the independent-review status only after the separate review. The status records that process; account identity alone does not prove independence. The privileged workflow cannot publish this status.

Read the `Emmy auto-merge` run and its event. Its log must show the trusted-main policy considering the exact candidate and returning `merged` with a full merge commit OID. `enabled`, `queued`, `skipped`, a successful job, or an accepted API request does not establish landing. A manual workflow dispatch can test installed policy and token permissions; it does not prove that a different event fires unattended.

## Verify the landed artifact

Read the PR back. Require merged state, the reviewed head, target `main`, and the same non-null merge commit. Fetch the remote default branch and confirm that commit is its ancestor. Clone the public repository into a fresh directory with full history, then run the documented checks there.

The source commits recorded in `verification/coverage.json` and `verification/merge-coverage.json` must be reachable in the fresh clone. The checkers read those exact Git objects. Preserve merge commits; squash or history truncation can remove this evidence.

GitHub normally suppresses push workflows caused by `GITHUB_TOKEN`. Record whether a post-merge check actually ran. Dispatch a default-branch check when needed, and label its event honestly. Preserve the hosted artifact before its retention expires.

## Keep native upkeep separate

Read a native heartbeat's saved cadence, prompt and destination through its own provider. Verify its first run and delivery later. Repository CI does not install Dot instructions or establish Dot wake, delegation, scheduling or notification access. Run the [native probes](dot-verification.md) in Emmy's actual conversation before relying on those abilities.

## Initial installation receipt

The initial release [PR #16](https://github.com/jerome-queck/emmy/pull/16) reviewed head `6fc9e820c656589ea3c812588c6ba3c7edc6e54a` and landed merge commit `c5d4c28d5e85e798606eca0147ecf9fe106b5599` into `main`. The coordinator fetched that commit and confirmed both formal source anchors were ancestors. [Hosted checks](https://github.com/jerome-queck/emmy/actions/runs/39830932862) passed at the reviewed head. A separate non-author review read the entire release, ran the aggregate and six independent CLI controls, and approved that exact head.

Bootstrap invoked the reviewed adapter locally because its trusted-main workflow had not yet been installed. Before attestation it returned `skipped` for the missing independent-review status. After the actual non-author verdict was attested, it returned `merged` with the full commit above. This establishes the bootstrap path. The PR that adds this runbook records its own installed-workflow result in its conversation after landing.
