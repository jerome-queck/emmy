---
name: coordination-contract
description: Check Emmy's bounded production routing and evidence contract after changing planTask, snapshotStatus, assessOutcome, their properties, mutation targets, or verification metadata.
---

# Coordination contract

## Run and interpret

Run `npm run verify:formal` with Node 24 or later. No package installation or solver is required. The checker enumerates finite input domains and calls the actual exported production functions. JavaScript has no suitable built-in proof assistant here. Exhaustive execution of the real functions gives a cheap reproducible bound without a second routing model.

A pass covers the domains below and the stated assumptions. It is not universal proof. Failure retains the actual input and result in `.local/verification/formal-*/report.json`. Read that counterexample in the code's terms. Do not weaken a property to accept a defect. A legitimate intended contract change needs an independently reviewed mapping and new mutations.

## Properties and harm

| Property | Production function | Required behavior and harm prevented |
| --- | --- | --- |
| local-first | planTask | Normal coding selects designated local Codex. Cloud substitution sends work to the wrong environment. |
| exact-binding | planTask | Host, native project, and path match the designated private binding. Another Mac or checkout may expose the wrong files. |
| scope-freshness | snapshotStatus, planTask | Only exact, complete, available, current scope can make a route ready. Partial or old observations conceal unavailable execution. |
| proposal-only | planTask | A packet always remains a proposal. A ready route must not falsely claim dispatch. |
| identity | assessOutcome | Receipt task, project, executor, and criterion match. Another task's evidence cannot close this result. |
| revision | assessOutcome | Receipt and claim revisions match the supplied current revision. Old green checks cannot validate newer code. |
| evidence-required | assessOutcome | Every criterion has passing evidence of its declared kind. Missing bytes or checks cannot become success. |
| contradictions | assessOutcome | Wrong identity, revision, future observations, failed claims, foreign criteria, or byte mismatches prevent support. Last-writer-wins would hide a known failure. |
| reported-assurance | assessOutcome | Hand-entered check success remains reported. A transcript cannot become an authenticated observation. |

## Bounds and assumptions

`verification/properties.mjs` exports every domain. Routing enumerates 524,544 inputs over two projects, two designated Macs, four executor choices including default, four binding states, cloud reason and authority bits, scoped observation products and host identities, exact or absent or wrong project observations, complete or partial coverage, four availability states, absent snapshots, and ages of negative one millisecond, zero, exactly 24 hours, or one millisecond beyond.

Assessment enumerates 36,864 inputs over two projects, two hosts, local or reported or both criteria, task/project/executor identity bits, receipt and claim revision bits, absent/pass/fail/pass-and-fail/unknown/foreign criterion claims, matching or wrong evidence kinds, four artifact-check results, and present or future receipt times. Each assessment takes one receipt, at most two criteria, and at most two claims per criterion. Reports retain counts per property. These counts describe generated combinations, not real accounts or independent user journeys.

Boundary parsing and artifact byte reads are separate production boundaries exercised by the behavioral driver. The caller must supply the actual current revision and honest scope. The checker varies possible local byte-check results. It does not prove provider authentication, filesystem atomicity, crash durability, arbitrary native execution, account access, scheduling, merges, deployment, or all-size behavior.

## Coverage and sync record

The reviewed source commit is `3c79e7387f5c40df8d12ebfc13cfbcd42c40e1c1`. `verification/coverage.json` records exact file digests and the function-to-property mapping. It also pins boundary parsers and the verification runner so changes to the assumed inputs or checking method require review. The coordinator reviewed the mapping against the integrated source. Independent release review remains required.

| Covered file | SHA-256 |
| --- | --- |
| src/work.mjs | 12d65c393322b78c56717b4f4bff4c23ed1dd1afefa9438d6b41192dd799771e |
| src/records.mjs | 6d1c64c44b657db9a339da18d169e75193f32ae4426980d1836020c36cc1f7bd |
| src/metadata.mjs | 1223803a887fc3bbc0d7aac0d7e2ce31ec694b727088d5239dd3f52b92012ea3 |
| verification/properties.mjs | d80551ac3d1b42c7fb7d17c60657d5f45d1fbc8c60eafe4dc841e3aa2895fc69 |
| verification/mutations.mjs | bf7dd8a7a9e9146eaa123f94db9952e0167b2f27e1f96d71a6da4e67bdac255e |
| scripts/verify-formal.mjs | 670da1154c5bc7a9c7ecb9df83bf481a592669017337c7a5fa05f4f5f78d15bc |

The runner checks the working bytes and those bytes at the sync commit. After a covered change, inspect `git diff <sourceCommit> -- src/work.mjs src/records.mjs src/metadata.mjs verification/properties.mjs verification/mutations.mjs scripts/verify-formal.mjs`. Read the production functions and assumptions. Update both the properties and source mutants when the intended behavior changes. Commit the reviewed source. Only then update the coverage hashes and sync commit, plus this skill's record. Never advance them just to make a drift check pass. `maintain --write` cannot move this record.

## Demonstrate failure and restore

The runner applies sixteen mutations to isolated copies of the actual `src/work.mjs` bytes. Each mutant must import successfully, then fail its named property with a retained counterexample. Syntax, import, or unrelated exceptions fail the run and never count as a killed mutant. `verification/mutations.mjs` gives the exact expressions and replacement bytes for replay.

For example, `ignore-executor-identity` changes the receipt executor comparison to true. A receipt for a foreign host then becomes supported in the mutant. The `identity` property rejects that result. `claim-dispatch` labels a proposed packet dispatched, and `proposal-only` rejects that result. Each counterexample JSON retains the task, receipt or request, observed result, and expected property.

After all mutants, the runner removes its scratch directory and re-enumerates the unchanged production module. Both baseline passes must agree. Evidence and failed attempts survive cleanup under `.local/verification/`. Use the installed `pstack:maintain-formal-verification-skill` workflow after relevant changes. Independent reviewers must confirm the bounds and source mapping before this check supports a release.
