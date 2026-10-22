---
name: verify
description: Drive Emmy's real CLI after changes to responsibility context, reconciliation, repairs, local checks, native uncertainty, feature lifecycle, archives, commands, or generated references.
---

# Verify Emmy

## Launch and health

Use Node 24 or later. Run `npm run agent -- help --json`. It returns `ok: true` with nine commands. Run `npm run agent -- doctor` and `maintain --check`. Doctor checks local runtime, catalog, bindings, store references/evidence, historical records, generated drift, and restored suspension. It does not probe native tools.

Each driver command starts a fresh Node process. Run `npm run verify:behavior` for the complete mapped drive. It creates and health-checks its own synthetic temporary git repository and private home. After a surprising failure, retain the report and rerun in a new isolated session with doctor. Expected refusal controls are part of the drive.

## Drive and interpret

Read [the four-feature map](features/README.md). Every mapped scenario must execute in the full driver. The driver captures arguments, stdout, stderr, exit status, actual record/evidence bytes, result assertions, and cleanup. It checks command sentinels to establish that its own drive did not invoke native executors or network CLIs.

Use `node scripts/verify-behavior.mjs --focus self-check-repair` for the first durable loop. It adopts a responsibility, repeats imports, recovers context in fresh processes, detects actual artifact corruption, retains failed repairs, proposes diagnosis, verifies an exact later repair, reopens a subsequent regression, and rejects unreadable current bytes. Earlier native completion suppresses duplicate green work while later failure still gets attention requiring fresh native rediscovery. Pending/uncertain state keeps rediscovery-only priority. This focused run does not cover the complete feature map.

For a manual target, follow [onboarding](../../../docs/onboarding.md). Use its selected private home and current bindings. `reconcile` exit 3 is expected for unresolved findings, uncertain scope, conflicts, or restored suspension. Preserve the refusal; repair its cause rather than weakening criteria.

## Evidence and teardown

Full and failed runs retain `.local/verification/behavior-*/report.json` plus immutable synthetic records/evidence. The report survives temporary-repository cleanup. Check that named path exists. Failed command and assertion output remains available even when the driver exits nonzero.

The full drive includes ten observed checkpoint cancellations. A child stops at named record/archive/restore publication boundaries or the first dependency-complete import publication, then the driver sends SIGKILL and replays. This is evidence at those boundaries. It is not all-instruction crash durability or filesystem flush proof.

Local-check timeout, output limit, normal completion, and handled cancellation terminate the owned POSIX process group. The driver proves a real child is gone. Detached descendants and hostile-code containment remain outside the contract. The driver cleans only its own temporary state and processes, then retains evidence under this checkout's ignored home.

## Scope

Observed local bytes and bounded Node output prove their declared checks. Imports remain reported. The synthetic E002 analogue uses its own failing/corrected repositories and actual CLI negative controls; it consumes no personal root evidence. Required independence stays `external-review-needed` even after local success and an imported different reviewer name.

No result establishes native dispatch, Dot installation, account access, schedules, delivery, merges, deployment, or hardware-loss recovery. Keep those [native probes](../../../docs/dot-verification.md) separate.

Run `npm run check` for generated references, full behavior, existing merge tests, bounded responsibility properties/mutants, and the unchanged merge-policy verifier. Apply the installed pstack maintenance workflows after feature changes. Generated indexes do not perform independent source review or advance formal pins.
