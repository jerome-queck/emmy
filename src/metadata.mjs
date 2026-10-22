export const commands = [
  { name: 'help', description: 'List commands and JSON contracts.', options: [], feature: 'orientation' },
  { name: 'doctor', description: 'Check runtime, public registry, bindings, and generated references.', options: [], feature: 'orientation' },
  { name: 'catalog', description: 'Read public projects, source claims, capabilities, tools, and probes.', options: [], feature: 'orientation' },
  { name: 'snapshot', description: 'Import a scoped, timestamped inventory into private storage.', options: [{ name: 'import', required: true }], feature: 'orientation' },
  { name: 'brief', description: 'Read one retained snapshot with its age and coverage gaps.', options: [{ name: 'snapshot', required: true }, { name: 'as-of', required: true }], feature: 'orientation' },
  { name: 'plan', description: 'Publish an immutable task proposal. Native products dispatch it.', options: [{ name: 'request', required: true }, { name: 'snapshot' }, { name: 'as-of', required: true }], feature: 'routing' },
  { name: 'receipt', description: 'Import an attributed result for one task.', options: [{ name: 'task', required: true }, { name: 'import', required: true }], feature: 'evidence' },
  { name: 'assess', description: 'Assess exact identity, contradictions, and local artifact bytes.', options: [{ name: 'task', required: true }, { name: 'receipt', required: true }, { name: 'revision', required: true }, { name: 'as-of', required: true }], feature: 'evidence' },
  { name: 'probe', description: 'Publish a proposed Dot onboarding packet with eight probes.', options: [{ name: 'id' }, { name: 'nonce', required: true }], feature: 'routing' },
  { name: 'maintain', description: 'Compare or regenerate public references without changing review records.', options: [{ name: 'check', flag: true }, { name: 'write', flag: true }], feature: 'upkeep' }
];

export const verification = {
  features: [
    { id: 'orientation', title: 'Orientation and inventory', commands: ['help', 'doctor', 'catalog', 'snapshot', 'brief'], scenarios: ['orientation', 'scoped-inventory'], properties: ['scope-freshness'] },
    { id: 'routing', title: 'Routing and proposals', commands: ['plan', 'probe'], scenarios: ['local-proposal', 'unavailable-host', 'explicit-cloud', 'immutable-publication', 'probe-packet'], properties: ['local-first', 'exact-binding', 'scope-freshness', 'proposal-only'] },
    { id: 'evidence', title: 'Evidence and receipts', commands: ['receipt', 'assess'], scenarios: ['local-digest', 'reported-check', 'identity-conflict', 'revision-conflict', 'contradiction', 'missing-evidence'], properties: ['identity', 'revision', 'evidence-required', 'contradictions', 'reported-assurance'] },
    { id: 'upkeep', title: 'Upkeep and public boundaries', commands: ['maintain'], scenarios: ['derived-drift', 'public-isolation', 'review-record-stable'], properties: [] }
  ],
  properties: [
    { id: 'local-first', source: 'src/work.mjs', functions: ['planTask'], statement: 'Normal coding selects the designated local Codex executor.' },
    { id: 'exact-binding', source: 'src/work.mjs', functions: ['planTask'], statement: 'An unavailable designated host never substitutes another host or cloud.' },
    { id: 'scope-freshness', source: 'src/work.mjs', functions: ['snapshotStatus', 'planTask'], statement: 'Partial, foreign, stale, future, or unavailable observations cannot make a route ready.' },
    { id: 'proposal-only', source: 'src/work.mjs', functions: ['planTask'], statement: 'Every task remains a proposal even when the route is ready.' },
    { id: 'identity', source: 'src/work.mjs', functions: ['assessOutcome'], statement: 'Only evidence matching task, project, executor, and criterion supports a claim.' },
    { id: 'revision', source: 'src/work.mjs', functions: ['assessOutcome'], statement: 'Receipt and claim revisions must match the current requested result revision.' },
    { id: 'evidence-required', source: 'src/work.mjs', functions: ['assessOutcome'], statement: 'Every finish criterion needs passing evidence of its declared kind.' },
    { id: 'contradictions', source: 'src/work.mjs', functions: ['assessOutcome'], statement: 'Any matching failed claim prevents a supported assessment.' },
    { id: 'reported-assurance', source: 'src/work.mjs', functions: ['assessOutcome'], statement: 'Hand-entered success stays reported unless local bytes are actually checked.' }
  ]
};
