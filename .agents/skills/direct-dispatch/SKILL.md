---
name: direct-dispatch
description: Check direct-root and historical dispatch authority, creator provenance, route immutability and uncertain-launch recovery after changing dispatch source, parsers or callers.
---

# Direct dispatch contract

Run `node verification/direct-dispatch/check.mjs` with Node 24 or later, Java 21 and the existing hash-pinned TLC jar. No tool download occurs. Run `node scripts/verify-behavior.mjs --focus dispatch` for actual CLI/import/archive/source boundaries. Full `npm run check` includes both and the unchanged historical coordination domains.

Read every TLC result with the installed pstack `/statechart` skill by name. The report identifies generated spec, config, view, raw output, graph and actual-code replay. Follow that skill's current invocation. It draws valid admission and holds, or the shortest violating path. Reproduce a failed path against the named actual source before judging it.

## Properties and harms

| Rule | Promise and harm | Actual owner |
| --- | --- | --- |
| `AuthorityHeld` | Missing current exact root, project, source, skill, model, tier or child policy holds advice. Borrowed scope could create unauthorized work. | `dispatchDecision`, `rootReasons`, `directScope`, `readbackReasons` |
| `ProvenanceHeld` | Ready direct children bind their principal, attempt, original request and native result separately from an optional actual native creator. False lineage could adopt unrelated work. | `dispatchDecision` creation/ancestry checks |
| `HistoryHeld` | Pending, uncertain and incomplete histories never authorize another create. Erasing them risks duplicate work. | Common observation/effect/attempt selection in `dispatchDecision` |
| `RouteHeld` | Mixed routes and silent route changes refuse. Reinterpreting old history could fabricate direct authority. | `dispatchDefinition`, `dispatchIdentity`, `validateReferences` |
| `ViableRoute` | Valid direct and historical inputs retain their respective callable advice. Requiring the old hop would prevent direct creation. | `dispatchDecision` |

The exact finite cases live in [domain.mjs](../../../verification/direct-dispatch/domain.mjs). Each graph path supplies a complete synthetic history and calls the actual synchronous assessment or parser/identity check once. It is not an external create lifecycle or a theorem over arbitrary inputs. The five-phase direct product spans complete/partial inventory and available/unavailable/denied/unknown availability. Separate cases cover root/child policy, identity, source, settings, creator provenance, lost response, completed continuation and immutable revisions across every phase, remote source/skill/authority and fresh versus borrowed pre-restore root/creation captures. Historical coordination enumeration still checks its original domains and mutants.

Fourteen copied-source mutants individually remove selection, direct authority, principal, root settings, child policy, original-request binding, creation principal, native creator, unresolved-history, immutable-root, mixed-route, direct-admission or pre-restore root/creation behavior. Each must import successfully, violate its intended rule through a real outcome disagreement, and replay the exact case against the mutated module. Syntax errors and unrelated exceptions fail the checker. Unchanged production runs again afterward.

## Source mapping and maintenance

The full source sync commit, source/verification digests and mapping live in [coverage.json](../../../verification/direct-dispatch/coverage.json). The checker validates both current bytes and commit bytes. `src/dispatch.mjs` owns advice and acquisition. `src/records.mjs` owns parsing and immutable journal validation. The empirical driver owns filesystem/CLI assertions. Other mapped source hashes establish integrity only; they do not extend TLC semantics.

Run the old gate first and preserve drift failures. Read every covered diff from its sync commit, including callers and moved functions. Classify intentional direct-route migration separately from stale verification or a product defect. Update graph facts from code, never from the desired pass. Keep the original historical domains and promises. Follow installed pstack formal maintenance after changes.

Run all real-source mutants and restored baseline. Read every result with `/statechart`, replay its reported case against the real copied module, and run the CLI driver. Commit reviewed source, then update the full sync commit/digests in a separate verification commit. Never advance a blocked pin. `--development` skips reviewed-source gates and cannot satisfy aggregate acceptance. Independent native exact-head review remains required before integration.

Assume trusted verifier code, parsed byte-verified journal inputs, honest current native captures and collision-free hashes. Reports cannot authenticate principal/owner truth, native creator telemetry, complete omitted history, effective access or approval policy, provider execution, arbitrary payloads, concurrent native calls, at-most-once execution, installation, adoption, schedules or future delivery. A fabricated consistently rehashed input can pass. Direct source support does not install a binding or change settings. Missing telemetry stays unverified.
