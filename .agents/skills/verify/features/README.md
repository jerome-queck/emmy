# Emmy feature map

Generated from `src/metadata.mjs`. Read [the driver skill](../SKILL.md) before a change. Run `npm run verify:behavior` to drive every mapped scenario.

| Feature | Commands | Scenarios | Bounded properties |
| --- | --- | --- | --- |
| [Fleet health and sign-in recovery](fleet.md) | fleet, signin | fleet-health, signin-recovery | fleet-contract |
| [Cooperative cloud admission](cloud.md) | cloud | cloud-admission | cloud-admission, process-incarnation, legacy-baseline |
| [Orientation and private integrity](orientation.md) | help, doctor, catalog | orientation | Public derivation is exercised behaviorally |
| [Responsibilities and proposals](routing.md) | responsibility, dispatch, probe | persistent-context, binding-boundaries, native-effect-correlation, native-dispatch, probe-packet, definition-concurrency | exact-binding, branch-blocking, effect-stability, authority-scope, native-uncertainty, dispatch-recovery |
| [Reconciliation and correction](evidence.md) | reconcile, briefing, calendar | self-check-repair, evidence-boundaries, live-cutoff, local-check, local-check-cleanup, trigger-evolution, briefing-guidance, briefing-draft, briefing-boundaries, calendar-acceptance | observation-gates, reported-assurance, failure-preservation, repair-closure, deterministic-replay, current-evidence, live-cutoff, process-group-cleanup, trigger-coverage, retirement-closure, calendar-acceptance |
| [Upkeep and recovery](upkeep.md) | maintain, backup, restore | archive-recovery, cloud-recovery, restored-current-context, publication-interruption, derived-boundaries | restore-suspension, import-prefix |

Feature instructions are maintained prose. This index and the command reference are derived. Maintenance does not independently read behavior or review formal assumptions. Briefing scenarios are behavioral checks; the existing bounded properties do not prove advisory policy. Calendar scenarios check declared evidence through the CLI; finite calendar claims require their own reviewed mapping.
