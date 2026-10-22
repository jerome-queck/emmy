---
name: merge-assurance
description: Check Emmy's automatic merge decision after changes to its policy, revision gates, GitHub metadata adapter, or verification bounds.
---

# Automatic merge assurance

Emmy may request an immediate merge only for the configured repository's current reviewed head, with the intended base, required CI, an owner-attested independent review, and enforced branch requirements. A broken guard can land an unreviewed revision.

## Run the check

From the repository root with Node 24.19.0, run:

```sh
node --test test/github-auto-merge.test.mjs
node verification/merge-policy.mjs
```

Both commands must exit zero. The bounded command writes `.local/verification/merge-policy.json`. Keep that file after cleanup. It names each domain and mutation witness. It makes no GitHub requests and starts no service.

## Covered code and reviewed revision

The bounded check imports the production `evaluateEligibility` function from `scripts/github-auto-merge.mjs`. The GitHub adapter and `considerPullRequest` are exercised by provider-boundary tests, not by the exhaustive eligibility proof. Read `verification/merge-coverage.json` for the canonical reviewed commit, source hashes, property mapping, bounds, and assumptions. The verifier checks those hashes against the checkout and the recorded commit. It also checks the case count and mutation mapping.

Before relying on these checks after a change, read every diff from the reviewed revision for the source, verifier, test, and merge workflow. Confirm that the fields read by `evaluateEligibility` still describe the adapter's normalized GitHub records. A source hash or a passing check cannot replace that review.

## Bounds and assumptions

The runner checks 30,720 inputs. Ten binary dimensions cover repository identity, merged state, open state, draft state, head repository, head SHA, target branch, base SHA, current branch SHA, and administrator enforcement. It combines six CI states with five review states.

Other fields are fixed in that enumeration. Focused tests cover missing protection, required contexts, wrong publishers, check identity, status ordering, metadata reloads, API requests, and receipt states. This is a finite code check. It does not prove arbitrary metadata, GitHub enforcement, network ordering, live token permissions, atomic base comparison, or actual reviewer independence.

The source assumes GitHub's typed metadata, SHA-1 repository identities, and trusted writers of the protected default branch. The adapter reloads observations before an immediate head-guarded merge. It leaves no deferred authorization for future heads.

## Required failing variants

The verifier compiles copies of the actual source with the head, base, CI, and independent-review guards removed separately. Each copy must execute a valid case, and then admit the intended forbidden case that the original refuses. Its witness names exactly one original failing gate and reports `mutantEligible: true`.

A syntax error, import error, unmatched mutation anchor, or unrelated disagreement is a verification failure. It is not a killed mutant. Restore the original code after any manual scratch change, rerun both commands, and confirm the evidence still exists.

## Maintain the mapping

Use the installed pstack maintain-formal-verification-skill after covered changes. Run the old check before editing its description. Read the covered diff, classify verification drift separately from a product bug, and update bounds only for a supported change in the promise. Replay the failing variants before moving the reviewed revision or source hashes. Keep verification updates separate from product fixes.

For live acceptance, use `docs/automation.md` to verify the repository, branch rules, exact-head CI and review status, and actual merge commit. Local tests do not install those provider settings.
