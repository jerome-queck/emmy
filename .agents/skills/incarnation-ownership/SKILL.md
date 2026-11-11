---
name: incarnation-ownership
description: Check bounded asynchronous process-incarnation ownership evidence after changes to proc collection, scope comparison, target inspection or their verification fixtures.
---

# Incarnation ownership

Run `node verification/incarnation-ownership/check.mjs` from the repository root with Node 24+, Java 21, and the repository's existing hash-pinned TLC cache. Evidence is retained under `.local/verification/incarnation-ownership/`. No bypass counts. Read each TLC result with the installed pstack:statechart skill. A counterexample on unchanged source is a finding; replay it before deciding whether the model or source is wrong. Never weaken a promise to hide a finding.

The coverage record `verification/incarnation-ownership/coverage.json` pins the reviewed source and source-sync commit. Check the entire covered source diff and the actual await and comparison mapping before advancing a source pin. The graph and checker are independently pinned there. A changed dependency refuses normal execution, including the real source file; correct the mapping and obtain review rather than bypassing the pin.

The graph runs the exported `captureProcessIncarnation` and `inspectOwnerIncarnation` and actual parser, validation and decision helpers. It records actual asynchronous open, read, close, readlink, stat and statfs calls and outcomes. A graph edge is one recorded fixture choice, view change, I/O operation or returned decision, not a whole capture or inspection. The owner is captured once as a valid precondition and its actual trace precedes inspections. Each target choice admits no change or one PID namespace or proc-root change at each I/O boundary of its baseline execution. The 857 overlapping histories have a maximum of 160 I/O calls each, 1,200 histories and 100,000 graph nodes; bound overflow fails. Fault cases include denied boot ID and PID 1 namespace reads, malformed self and target stat, ENOENT, EACCES, same start and reused start. Normal runs require observed alive, absent and unknown cases and the optional PID 1 failure fallback.

| Invariant | Promise | Copied-source break |
| --- | --- | --- |
| CaptureScope | Two observed capture roots that differ cannot yield a known capture. | Remove the two-capture scope guard. |
| InspectionScope | Stable observer and after pairs with different proc roots cannot yield a known owner decision. | Remove the outer inspection scope guard. |
| OwnerComparable | Known owner decisions require validated owner and observer with comparable boot, PID and time namespace witnesses. | Remove the owner/observer comparability guard. |
| TargetEvidence | Alive needs the same target PID and start; absence needs ENOENT or the same PID with a different valid start. Denied target reads stay unknown. | Treat unreadable target as absent. |

Every mutated source must produce its named TLC violation and an exact I/O-schedule replay against the broken function. The restored source replays the same fixture schedule; if it refuses sooner, its actual I/O must be a prefix of the broken run. Original source is checked before and after mutations. Unexpected source failures, syntax errors, bounds, pins or unrelated exceptions do not count as semantic counterexamples.

All identities and proc bytes are synthetic, including Linux platform input through the existing options interface. Files sample bytes at open and each handle stays stable; namespace and proc-root stats sample the current view. At most one persistent view change is admitted. No ABA, inode reuse, start-tick collision, hostile proc substitution, arbitrary races, physical continuity or atomic Linux snapshot is claimed. Mount identity is checked within the source's scope rechecks, not between the owner and observer. Optional `/proc/1/ns/pid` denial is allowed by source. `observedAt` is omitted from the graph and replay comparison because the identity logic ignores it; the original outcomes retain it. Unknown cannot imply absence.

Darwin's default unsupported/unknown result is an actual platform observation, not a Linux collection. Linux kernel behavior, migration, actual turn acquisition, claims, sidecars, resume, provider effects, authentication, deployment and installation remain separate unproved boundaries.
