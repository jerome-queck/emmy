export const commands = [
  { name: 'help', description: 'List commands and JSON contracts.', options: [], feature: 'orientation' },
  { name: 'doctor', description: 'Check runtime, public references, bindings, private integrity, and restored suspension.', options: [], feature: 'orientation' },
  { name: 'catalog', description: 'Read public projects, source claims, capabilities, tools, and probes.', options: [], feature: 'orientation' },
  { name: 'responsibility', description: 'Retain an immutable goal, context, exact target, criteria, authority, feature, and lifecycle definition.', options: [{ name: 'file', required: true }], feature: 'routing' },
  { name: 'reconcile', description: 'Import evidence, inspect current local state, retain findings/repairs, and propose bounded next work.', options: [{ name: 'id' }, { name: 'import' }, { name: 'as-of', required: true }], feature: 'evidence' },
  { name: 'dispatch', description: 'Resolve saved destinations, recover explicit direct-root or historical bindings, and return read-only native dispatch advice.', options: [{ name: 'id' }, { name: 'project' }, { name: 'resolve' }, { name: 'discovery' }, { name: 'as-of', required: true }, { name: 'context-needed', flag: true }], feature: 'routing' },
  { name: 'cloud', description: 'Run bounded cooperative cloud jobs with durable checkpoints, priority admission and pending health escalation.', options: [{ name: 'file', required: true }], feature: 'cloud' },
  { name: 'fleet', description: 'Retain scoped fleet health, parent read admission, alert delivery and explicit bounded history archival in the responsibility journal.', options: [{ name: 'file', required: true }], feature: 'fleet' },
  { name: 'signin', description: 'Choose a scoped sign-in recovery handoff without accepting or retaining secrets.', options: [{ name: 'file', required: true }], feature: 'fleet' },
  { name: 'token-review', description: 'Assess bounded supplied usage captures and complete cost per verified success without telemetry or execution.', options: [{ name: 'file', required: true }], feature: 'evidence' },
  { name: 'calendar', description: 'Assess declared current calendar intent, exact saved fields, inventory, allocations and retained attempts without execution.', options: [{ name: 'file', required: true }], feature: 'evidence' },
  { name: 'calendar-register', description: 'Collect read-only Calendar/Tasks snapshots, assess exact-ID proposals, validate shared versioned planning rules and handoffs, or prepare Academic OS API plans and inspect reports without applying them.', options: [{ name: 'file', required: true }], feature: 'evidence' },
  { name: 'automation', description: 'Plan a staged automation from exact procedure/configuration bytes, prepare existing canonical outcome artifacts, or read one exact artifact without native execution.', options: [{ name: 'file', required: true }], feature: 'upkeep' },
  { name: 'daily-briefing', description: 'Read the staged operating contract, validate private briefing policy, prepare fixed reports and reporting contracts, or compile/read exact held artifact slots without native effects.', options: [{ name: 'file', required: true }], feature: 'upkeep' },
  { name: 'briefing', description: 'Load an explicitly pinned local release or canonical public guidance, check a declared draft, and retain exact advisory Markdown.', options: [{ name: 'file' }], feature: 'evidence' },
  { name: 'guidance-pin', description: 'Activate, inspect or deactivate an exact approved installed local guidance release without changing canonical caches.', options: [{ name: 'file', required: true }], feature: 'evidence' },
  { name: 'probe', description: 'Publish current-environment onboarding proposals; cloud delegation requires an explicit probe ID.', options: [{ name: 'id' }, { name: 'nonce', required: true }], feature: 'routing' },
  { name: 'assurance', description: 'Replay one exact retained local check receipt against current source, base, suite and environment without executing checks.', options: [{ name: 'file', required: true }], feature: 'upkeep' },
  { name: 'maintain', description: 'Compare or regenerate public references without changing review records.', options: [{ name: 'check', flag: true }, { name: 'write', flag: true }], feature: 'upkeep' },
  { name: 'backup', description: 'Verify and atomically archive a pinned private record/evidence manifest and bindings.', options: [{ name: 'to', required: true }], feature: 'upkeep' },
  { name: 'restore', description: 'Verify an archive and restore into a new suspended private home.', options: [{ name: 'from', required: true }, { name: 'into', required: true }], feature: 'upkeep' }
];

export const briefingGuidance = {
  schemaVersion: 1,
  checkerVersion: 1,
  path: 'docs/briefing-guidance.json',
  paths: ['docs/operating-brief.md', 'docs/briefing.md', '.agents/skills/sign-in/SKILL.md']
};

export const verification = {
  features: [
    { id: 'fleet', title: 'Fleet health and sign-in recovery', commands: ['fleet', 'signin'], scenarios: ['fleet-health', 'signin-recovery', 'morning-run'], properties: ['fleet-contract', 'morning-contract'] },
    { id: 'cloud', title: 'Cooperative cloud admission', commands: ['cloud'], scenarios: ['cloud-admission'], properties: ['cloud-admission', 'process-incarnation', 'legacy-baseline'] },
    { id: 'orientation', title: 'Orientation and private integrity', commands: ['help', 'doctor', 'catalog'], scenarios: ['orientation'], properties: [] },
    { id: 'routing', title: 'Responsibilities and proposals', commands: ['responsibility', 'dispatch', 'probe'], scenarios: ['persistent-context', 'binding-boundaries', 'native-effect-correlation', 'native-dispatch', 'probe-packet', 'definition-concurrency'], properties: ['exact-binding', 'branch-blocking', 'effect-stability', 'authority-scope', 'native-uncertainty', 'dispatch-recovery'] },
    { id: 'evidence', title: 'Reconciliation and correction', commands: ['reconcile', 'briefing', 'guidance-pin', 'calendar', 'calendar-register', 'token-review'], scenarios: ['self-check-repair', 'evidence-boundaries', 'live-cutoff', 'local-check', 'local-check-cleanup', 'trigger-evolution', 'briefing-guidance', 'briefing-draft', 'briefing-boundaries', 'calendar-acceptance', 'calendar-register', 'token-review'], properties: ['observation-gates', 'reported-assurance', 'failure-preservation', 'repair-closure', 'deterministic-replay', 'current-evidence', 'live-cutoff', 'process-group-cleanup', 'trigger-coverage', 'retirement-closure', 'calendar-acceptance', 'calendar-register'] },
    { id: 'upkeep', title: 'Upkeep and recovery', commands: ['maintain', 'backup', 'restore', 'automation', 'daily-briefing', 'assurance'], scenarios: ['archive-recovery', 'cloud-recovery', 'restored-current-context', 'publication-interruption', 'derived-boundaries', 'improvement-report', 'automation-foundation', 'daily-briefing-pilot', 'local-assurance'], properties: ['restore-suspension', 'import-prefix', 'automation-contract'] }
  ],
  properties: [
    { id: 'morning-contract', source: 'src/morning.mjs', functions: ['classifyMail', 'morningTransition', 'renderMorning', 'morningView', 'deliveryReadback'], statement: 'Versioned conservative mail judgments, fleet-backed fresh Singapore-day source acquisitions, complete reviewed-ID accounting, exact delivered-body gates, unread-preserved reversible outcomes and same-message edits retain scoped provenance without claiming native truth.' },
    { id: 'fleet-contract', source: 'src/fleet-state.mjs', functions: ['captureCondition', 'fleetHistory', 'fleetTransition', 'fleetState', 'fleetView'], statement: 'Current scheduled health requires exact occurrence provenance; structured actions coalesce paraphrases, fresh source acquisitions close pending recovery, and explicit upgrades preserve historical states and review views. Parent read, uncertainty, archive ancestry and delivery guards remain bounded.' },
    { id: 'process-incarnation', source: 'src/process-incarnation.mjs', functions: ['parseProcStat', 'parseProcStatus', 'parseProcMount', 'validIncarnation', 'compareIncarnations', 'ownerDecision'], statement: 'Validated kernel witnesses distinguish process incarnations while missing, incomparable or unrooted namespace evidence leaves owner absence unknown.' },
    { id: 'legacy-baseline', source: 'src/cloud-migration.mjs', functions: ['assessLegacyAttestation'], statement: 'Exact legacy checkpoint/report bindings, distinct attributable calls and declared review establish reported historical evidence only; fresh observed baseline and later restart remain separate live gates.' },
    { id: 'automation-contract', source: 'src/automation-plan.mjs', functions: ['planAutomation'], statement: 'Versioned staged plans bind supplied configuration, scope, source pins, budgets and destinations. Canonical run ingestion rejects invalid timing, telemetry and nonterminal reports without granting effects or native creation.' },
    { id: 'cloud-admission', source: 'src/cloud.mjs', functions: ['cloudTransition', 'capacityDecision', 'cloudState'], statement: 'Bounded cooperative transitions reserve priority capacity, coalesce stable identities, retain checkpoints, bound retries, defer unavailable capacity and deduplicate pending health escalation.' },
    { id: 'exact-binding', source: 'src/work.mjs', functions: ['routeTarget'], statement: 'Only own project/host bindings with exact target identity establish a local route.' },
    { id: 'branch-blocking', source: 'src/responsibilities.mjs', functions: ['reconcileState'], statement: 'Concurrent definition heads survive and block action proposals.' },
    { id: 'effect-stability', source: 'src/work.mjs', functions: ['effectKey'], statement: 'Same responsibility, target, effect and occurrence retain the same effect key across review time and definition edits.' },
    { id: 'authority-scope', source: 'src/work.mjs', functions: ['authorityStatus'], statement: 'Absent, wrong-scope or expired authority cannot authorize work proposals.' },
    { id: 'observation-gates', source: 'src/work.mjs', functions: ['observationStatus'], statement: 'Foreign, future, stale, partial or unavailable observations remain ineligible.' },
    { id: 'live-cutoff', source: 'src/work.mjs', functions: ['reviewAsOf'], statement: 'Live review cutoffs include requested time and actual completion while fixed historical replay keeps its supplied time.' },
    { id: 'process-group-cleanup', source: 'src/responsibilities.mjs', functions: ['terminateOwnedProcessGroup'], statement: 'Owned-group signalling distinguishes absent groups, denied cleanup and unexpected errors without claiming unknown cleanup succeeded.' },
    { id: 'reported-assurance', source: 'src/responsibilities.mjs', functions: ['reconcileState'], statement: 'Imported reports cannot satisfy observed-local criteria or authenticate independent review.' },
    { id: 'failure-preservation', source: 'src/responsibilities.mjs', functions: ['reconcileState'], statement: 'A later pass, weaker definition or earlier native completion cannot erase a retained failure or silence required attention.' },
    { id: 'repair-closure', source: 'src/work.mjs', functions: ['repairStatus'], statement: 'Closure requires the exact finding/failure, current expected subject and every original criterion recheck.' },
    { id: 'deterministic-replay', source: 'src/responsibilities.mjs', functions: ['reconcileState', 'replayReview'], statement: 'Identical sorted evidence manifests/time/rules produce identical reconciliation results under permutation.' },
    { id: 'current-evidence', source: 'src/responsibilities.mjs', functions: ['reconcileState'], statement: 'Newest actual local identity/bytes cannot borrow an older green result.' },
    { id: 'native-uncertainty', source: 'src/responsibilities.mjs', functions: ['reconcileState'], statement: 'Known pending, uncertain or uncorrelated native tasks require rediscovery; partial inventories cannot prove absence and unkeyed completion cannot prove an intended effect.' },
    { id: 'dispatch-recovery', source: 'src/dispatch.mjs', functions: ['dispatchDecision'], statement: 'Independent coordinator and destination identities, fresh project/source evidence, exact destination/remote-host scope, recorded settings and creator lineage gate bounded dispatch advice without erasing launch uncertainty or reused child bindings.' },
    { id: 'calendar-register', source: 'src/calendar-register.mjs', functions: ['assessCalendarRegister'], statement: 'Fresh exhaustive query coverage and exact native Task timing gate free intervals; snapshot-bound assignment and occurrence identity, ordered questions, scoped owner supersession, protected meals, capabilities, done evidence and uncertain effects gate current proposals without execution.' },
    { id: 'calendar-acceptance', source: 'src/calendar.mjs', functions: ['assessCalendar'], statement: 'Validated declared calendar envelopes require exact saved fields, current content bindings, complete inventory, readable Busy or mandatory Event timing, exact whole-source labels, compatible allocations and scoped retained history; unresolved clocks and effects cannot establish acceptance.' },
    { id: 'trigger-coverage', source: 'src/work.mjs', functions: ['triggerStatus'], statement: 'Missed runs require fresh complete post-window coverage; no-op and delivery gaps remain distinct.' },
    { id: 'retirement-closure', source: 'src/work.mjs', functions: ['retirementStatus'], statement: 'Unsuperseded enabled readbacks keep native disablement pending and retirement stops proposals.' },
    { id: 'import-prefix', source: 'src/records.mjs', functions: ['importOrder', 'validateReferences'], statement: 'Every imported publication prefix is dependency-complete and supersession stays within scope.' },
    { id: 'restore-suspension', source: 'src/work.mjs', functions: ['restoredState', 'currentObservations'], statement: 'Restored homes require current fresh exact target, authority, task and schedule observations in their new epoch; cloud targets remain reported and local targets require inspection.' }
  ]
};

// Reviewed association of subsystem evidence; file inventory remains in verification/subsystems.json.
export const subsystemEvidence = {
  "cooperative-cloud": {
    "drivers": ["verification/cloud-drive.mjs"],
    "skills": [".agents/skills/cooperative-cloud/SKILL.md"],
    "replay": ["verification/cooperative-cloud/check.mjs"],
    "coverageRecords": ["verification/coverage.json", "verification/cooperative-cloud/coverage.json"],
    "model": "reachable-reducer",
    "skillStatus": "maintained",
    "graph": { "kind": "reachable-reducer", "path": "verification/cooperative-cloud/graph.mjs", "record": "verification/cooperative-cloud/coverage.json", "checker": "verification/cooperative-cloud/check.mjs", "exports": ["graph", "spec"] }
  },
  "responsibility-closure": {
    "drivers": ["scripts/verify-behavior.mjs"],
    "skills": [".agents/skills/responsibility-closure/SKILL.md"],
    "replay": ["verification/responsibility-closure/check.mjs"],
    "coverageRecords": ["verification/coverage.json", "verification/responsibility-closure/coverage.json"],
    "model": "reachable-history",
    "skillStatus": "maintained",
    "graph": {
      "kind": "reachable-history",
      "path": "verification/responsibility-closure/graph.mjs",
      "record": "verification/responsibility-closure/coverage.json",
      "checker": "verification/responsibility-closure/check.mjs",
      "exports": ["closureGraph"]
    }
  },
  "restoration-suspension": {
    "drivers": ["scripts/verify-behavior.mjs"],
    "skills": [".agents/skills/restoration-suspension/SKILL.md"],
    "replay": ["verification/restoration-suspension/check.mjs", "verification/restoration-suspension/replay-statechart.mjs"],
    "coverageRecords": ["verification/coverage.json", "verification/restoration-suspension/coverage.json"],
    "model": "reachable-history",
    "skillStatus": "maintained",
    "graph": { "kind": "reachable-history", "path": "verification/restoration-suspension/graph.mjs", "record": "verification/restoration-suspension/coverage.json", "checker": "verification/restoration-suspension/check.mjs", "exports": ["history", "graphSpec"] }
  },
  "responsibility": {
    "drivers": [
      "scripts/verify-behavior.mjs",
      "verification/properties.mjs"
    ],
    "skills": [
      ".agents/skills/coordination-contract/SKILL.md"
    ],
    "replay": [
      "verification/mutations.mjs",
      "scripts/verify-formal.mjs"
    ],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "finite-predicates",
    "skillStatus": "maintained"
  },
  "dispatch": {
    "drivers": [
      "verification/dispatch-drive.mjs"
    ],
    "skills": [
      ".agents/skills/direct-dispatch/SKILL.md"
    ],
    "replay": [
      "verification/direct-dispatch/check.mjs"
    ],
    "coverageRecords": [
      "verification/direct-dispatch/coverage.json"
    ],
    "model": "finite-assessment",
    "skillStatus": "maintained",
    "graph": {
      "kind": "finite-assessment",
      "path": "verification/direct-dispatch/graph.mjs",
      "record": "verification/direct-dispatch/coverage.json",
      "checker": "verification/direct-dispatch/check.mjs",
      "exports": [
        "dispatchGraph",
        "dispatchSpec",
        "dispatchConfig"
      ]
    }
  },
  "cloud": {
    "drivers": [
      "verification/cloud-drive.mjs"
    ],
    "skills": [
      ".agents/skills/coordination-contract/SKILL.md"
    ],
    "replay": [
      "verification/cloud-mutations.mjs",
      "verification/incarnation-mutations.mjs",
      "scripts/verify-formal.mjs"
    ],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "finite-predicates",
    "skillStatus": "maintained"
  },
  "fleet": {
    "drivers": [
      "verification/fleet-drive.mjs"
    ],
    "skills": [
      ".agents/skills/coordination-contract/SKILL.md"
    ],
    "replay": [
      "verification/fleet-mutations.mjs",
      "scripts/verify-formal.mjs"
    ],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "finite-predicates",
    "skillStatus": "maintained"
  },
  "morning": {
    "drivers": [
      "verification/morning-drive.mjs",
      "verification/morning-v3-drive.mjs"
    ],
    "skills": [
      ".agents/skills/coordination-contract/SKILL.md",
      ".agents/skills/morning-collect/SKILL.md"
    ],
    "replay": [
      "verification/morning-properties.mjs",
      "scripts/verify-formal.mjs"
    ],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "finite-predicates",
    "skillStatus": "maintained"
  },
  "briefing": {
    "drivers": [
      "verification/daily-briefing-drive.mjs",
      "verification/briefing-drive.mjs"
    ],
    "skills": [
      ".agents/skills/coordination-contract/SKILL.md"
    ],
    "replay": [
      "verification/briefing-slot/drive.mjs",
      "scripts/verify-briefing-slot.mjs"
    ],
    "coverageRecords": [
      "verification/briefing-slot/coverage.json",
      "verification/coverage.json"
    ],
    "model": "hand-mapped-await",
    "skillStatus": "missing",
    "graph": {
      "kind": "hand-mapped-await",
      "path": "verification/briefing-slot/BriefingSlot.tla",
      "record": "verification/briefing-slot/coverage.json",
      "checker": "scripts/verify-briefing-slot.mjs",
      "reviewedSha256": "ce970cea18806e44fe923e9bb6771b2543f199071bbcfff1efac81aeb327580a",
      "checkerSha256": "0e61fb002d6b2b0a175920d644411b024a02f1fee5b9b2bbc37c698650781ae3"
    }
  },
  "calendar": {
    "drivers": [
      "verification/calendar-drive.mjs",
      "verification/calendar-register-drive.mjs"
    ],
    "skills": [
      ".agents/skills/coordination-contract/SKILL.md"
    ],
    "replay": [
      "verification/calendar-mutations.mjs",
      "scripts/verify-formal.mjs"
    ],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "finite-predicates",
    "skillStatus": "maintained"
  },
  "planning-policy": {
    "drivers": [
      "verification/calendar-register-drive.mjs",
      "test/planning-policy.test.mjs"
    ],
    "skills": [
      ".agents/skills/planning-policy/SKILL.md"
    ],
    "replay": [
      "verification/planning-policy/check.mjs"
    ],
    "coverageRecords": [
      "verification/planning-policy/coverage.json"
    ],
    "model": "finite-assessment",
    "skillStatus": "maintained",
    "graph": {
      "kind": "finite-assessment",
      "path": "verification/planning-policy/graph.mjs",
      "record": "verification/planning-policy/coverage.json",
      "checker": "verification/planning-policy/check.mjs",
      "exports": [
        "planningGraph",
        "planningSpec",
        "planningConfig"
      ]
    }
  },
  "automation": {
    "drivers": [
      "test/automation-procedure.test.mjs",
      "scripts/verify-behavior.mjs"
    ],
    "skills": [
      ".agents/skills/coordination-contract/SKILL.md"
    ],
    "replay": [
      "verification/automation-properties.mjs",
      "scripts/verify-formal.mjs"
    ],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "finite-predicates",
    "skillStatus": "maintained"
  },
  "publication": {
    "drivers": [
      "verification/publication/drive.mjs"
    ],
    "skills": [
      ".agents/skills/publication-contract/SKILL.md"
    ],
    "replay": [
      "scripts/verify-publication.mjs"
    ],
    "coverageRecords": [
      "verification/publication/coverage.json"
    ],
    "model": "hand-mapped-await",
    "skillStatus": "maintained",
    "graph": {
      "kind": "hand-mapped-await",
      "path": "verification/publication/RecordPublication.tla",
      "record": "verification/publication/coverage.json",
      "checker": "scripts/verify-publication.mjs",
      "reviewedSha256": "9570ee406a8ea90a767dc5093186585860f83cbf082b94b9b8e13e67a83d0edb",
      "checkerSha256": "f883deaedb39f8c551baa065ea43fbeec51f9412b835d6f487f8de2cd2fd954a"
    }
  },
  "local-assurance": {
    "drivers": [
      "verification/local-assurance/drive.mjs"
    ],
    "skills": [
      ".agents/skills/local-assurance/SKILL.md"
    ],
    "replay": [
      "verification/local-assurance/check.mjs"
    ],
    "coverageRecords": [
      "verification/local-assurance/coverage.json"
    ],
    "model": "reachable-reducer",
    "skillStatus": "maintained",
    "graph": {
      "kind": "reachable-reducer",
      "path": "verification/local-assurance/graph.mjs",
      "record": "verification/local-assurance/coverage.json",
      "checker": "verification/local-assurance/check.mjs",
      "exports": [
        "assuranceGraph",
        "graphSpec",
        "graphConfig"
      ]
    }
  },
  "local-delivery": {
    "drivers": [
      "verification/delivery/drive.mjs"
    ],
    "skills": [
      ".agents/skills/merge-assurance/SKILL.md"
    ],
    "replay": [
      "verification/delivery/check.mjs"
    ],
    "coverageRecords": [
      "verification/delivery/coverage.json"
    ],
    "model": "reachable-reducer",
    "skillStatus": "maintained",
    "graph": {
      "kind": "reachable-reducer",
      "path": "verification/delivery/graph.mjs",
      "record": "verification/delivery/coverage.json",
      "checker": "verification/delivery/check.mjs",
      "exports": [
        "deliveryGraph",
        "deliverySpec",
        "deliveryConfig"
      ]
    }
  },
  "guidance-release": {
    "drivers": [
      "test/foundation-release.test.mjs",
      "test/guidance-pin.test.mjs"
    ],
    "skills": [],
    "replay": [],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "empirical-only",
    "skillStatus": "missing"
  },
  "improvement": {
    "drivers": [
      "verification/improvement-drive.mjs",
      "test/token-review.test.mjs"
    ],
    "skills": [],
    "replay": [],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "empirical-only",
    "skillStatus": "missing"
  },
  "shared-utilities": {
    "drivers": [
      "test/automation-procedure.test.mjs",
      "scripts/verify-behavior.mjs"
    ],
    "skills": [],
    "replay": [],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "empirical-only",
    "skillStatus": "not-applicable"
  },
  "orientation-and-checks": {
    "drivers": [
      "test/agent-local.test.mjs",
      "scripts/verify-behavior.mjs"
    ],
    "skills": [],
    "replay": [],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "empirical-only",
    "skillStatus": "not-applicable"
  },
  "verification-tooling": {
    "drivers": [
      "scripts/verify-formal.mjs",
      "scripts/verify-behavior.mjs"
    ],
    "skills": [],
    "replay": [],
    "coverageRecords": [
      "verification/coverage.json"
    ],
    "model": "empirical-only",
    "skillStatus": "not-applicable"
  }
};
