# Deliver a locally verified change

This route needs no hosted job. It reuses [local assurance](local-assurance.md) and the existing [merge owner](automation.md). Source support does not install settings or grant an action.

## Prepare exact evidence

1. Freeze a clean committed checkout. Resolve current `main` through a fresh provider read and acquire that commit locally.
2. Run `npm run check -- --base <exact-current-base>`. Retain the printed receipt path, digest and original outputs.
3. Obtain a practical verdict from a separate agent that did not author the change. Bind it to exact head, base, source tree, receipt digest and context digest. Have the authorized coordinator accept its original native evidence.
4. Select the review and action grant by ordinary file path and SHA-256. Retain originals privately. Names and source references cannot authenticate independence or authority.

The request contains `schemaVersion: 1`, `mode: "local"`, `binding`, `baseRef`, `assurance`, `review`, `authorization`, `action`, `title` and `body`.

| Field | Required shape |
| --- | --- |
| `binding` | `repository: "jerome-queck/emmy"`, `branch: "codex/<name>"`, full Git `head`, `base`, `tree`, native `author` identity. |
| `baseRef` | The exact local base reference used for checks. |
| `assurance` | Original `receiptFile` and SHA-256 `receiptDigest`. |
| `review`, `authorization` | Original ordinary `file` and SHA-256 `sha256`. |
| `action` | One of `publish`, `open-pr`, `attest`, `merge`. |
| `title`, `body` | Exact reviewed PR text. |

The review contains `head`, `base`, `tree`, `author`, `reviewer`, `verdict`, `practical`, `receiptDigest`, `contextDigest` and `acceptanceRef`. Verdict is `PASS` or `PASS+NOTES`, `practical` is true, and reviewer differs from author. The grant contains `repository`, `branch`, `head`, `base`, `tree`, `actions`, `sourceRef`, `notBefore` and `expiresAt`. Times use ISO 8601. Omitted, expired or mismatched evidence refuses an effect.

## Run one authorized action

With an already authorized GitHub token in the process environment, run from the checked repository root.

```sh
node scripts/github-auto-merge.mjs --local <private-request.json>
```

The command acquires no credential. Run actions in order. Each invocation rereads selected files and original suite output, observes local source and toolchain, and checks current provider base and strict administrator protection. Source must equal its committed tree. Merge additionally requires exactly `emmy-local-assurance` and `emmy-independent-review` as required contexts, both successful at the reviewed head from the configured owner account. Colliding check runs must succeed. Historical `emmy-check` cannot silently become a local attestation.

Publication uses the exact HTTPS origin and a server-side absent-ref lease. It cannot overwrite an existing branch. PR discovery examines all states for the exact branch and destination. Closed or conflicting PRs hold creation. Attestation posts truthfully named supplied-evidence statuses. Merge reloads metadata twice and submits the reviewed head through GitHub's immediate head guard. A merged receipt also needs exact head, destination, full merge commit and provider comparison showing that commit in `main` history. No queue or deferred merge is armed.

## Recover an uncertain action

Intent is retained before each action under ignored `.local/verified-delivery/`, keyed by repository and branch. A process lock serializes cooperating callers. Original discoveries, errors and readbacks stay in checkpoint history. Unknown intent forces rediscovery and returns without another write, even when an invocation requests a different action. Failed reads, timeouts, denials and apparent absence never authorize blind retry. A positive exact read can confirm the original effect. Unresolved absence needs explicit owner reconciliation outside this command.

A crash can leave a lock. Inspect the owning process and retained intent before manually resolving it. There is no timed stale-lock deletion. A changed binding cannot replace the retained branch generation. Preserve uncertain records while preparing another candidate.

Filesystem observations are separate reads, not an atomic pin. Selections and statuses establish supplied-byte consistency and attribution claims, not execution or reviewer authentication. GitHub has no atomic expected-base merge parameter. Trusted current policy, cooperating writers and actual provider protection during the final request interval remain assumptions. Administrator capability grants no action permission.

## Migrate protection without losing a gate

Keep current hosted requirements until reviewed policy is present on trusted `main`. Prepare exact transition and rollback bodies from a fresh protection read. Obtain action-time owner confirmation naming repository, branch, current base, candidate head and both bodies.

Replace required `emmy-check` with `emmy-local-assurance`. Retain `emmy-independent-review`, strict current-base checks, administrator enforcement and every other setting. Validate local statuses and an exact-head guarded journey before setting repository variable `EMMY_DELIVERY_MODE` to `local`. That explicit variable skips both hosted jobs. An absent or different value retains historical execution. Event declarations remain for compatibility. Local mode requires no hosted job.

For rollback, restore hosted execution first by removing the local variable value. Restore the saved protection body and verify fresh hosted `emmy-check` plus independent review at the exact head. Protection and workflow settings need separate readbacks. Never disable the old gate before verifying its replacement. This route has no protection or repository-variable write command.

## Verify the implementation

Run `node --test test/github-auto-merge.test.mjs`, `node verification/merge-policy.mjs` and full `npm run check`. Tests drive the actual CLI with a labelled reduced plan and synthetic provider. Full checks separately execute every production suite. Follow [merge assurance](../.agents/skills/merge-assurance/SKILL.md) and `/statechart` for bounded facts, actual-source mutants, chart generation and limits.
