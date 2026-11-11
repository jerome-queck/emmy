---
name: calendar-attempt
description: Check bounded exact Task attempt reconciliation after changes to the Calendar register assessor or its evidence fixtures.
---

# Calendar attempt reconciliation

Run `node verification/calendar-attempt/check.mjs` from the repository root with Node 24+, Java 21 and the existing pinned TLC jar at `.local/tools/tla2tools-1.7.4.jar`. Read every TLC result with the installed pstack:statechart skill. Retained graphs, model output and replay steps are named in the report.

The graph calls `assessCalendarRegister` for each synthetic observation. It carries the actual first proposal into a declared uncertain attempt, then supplies a bounded later observation. It checks that unresolved and terminal attempts stay held, no-effect resolution preserves the original baseline, and saved resolution preserves protected native fields. A broken copied assessor must produce the named invariant violation; replay compares each actual mutated and restored call. A syntax error, pin refusal or unrelated exception is not a counterexample.

The selected domain is one synthetic Task, account, list, window, move, policy version 1 and at most one retained attempt. The fixture choices include stale schedule and wrong schedule identity, changed original baseline, mismatched snapshot digest, incomplete discovery, wrong end, protected-field drift and declared terminal states. A saved control permits changed etag and update time. Terminal states are supplied claims, not modeled provider transitions. Snapshots and claims are unauthenticated. This is not a model of a native writer, arbitrary provider lifecycle, handoff retry, real account, schedule, installation or delivery.

The source sync commit and digests are in `verification/calendar-attempt/coverage.json`. Before advancing the sync commit, inspect the covered source and caller diff, update the graph and independent assertions where warranted, replay actual semantic mutants and run the restored gate. Never weaken a property to hide an actual defect. Independent review remains separate.
