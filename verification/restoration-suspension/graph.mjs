import { canonical } from '../../src/content.mjs';

const categories = ['target', 'authority', 'tasks', 'schedule'];
const times = ['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:02.000Z', '2026-01-01T00:00:13.000Z'];

export function fixtures(records) {
  const { parseDefinition, parseObservation, recordPayload } = records;
  const target = { projectId: 'alpha', repository: 'https://example.invalid/alpha', executor: 'local-codex', hostId: 'host-alpha', nativeProjectId: 'native-alpha', path: '/fixture/alpha', revision: 'a'.repeat(40), dirtyDigest: '1'.repeat(64) };
  const authority = { reference: 'Bounded owner request', action: 'verify', resource: 'alpha', destination: 'local-evidence' };
  const definition = recordPayload(parseDefinition({ id: 'restore-check', parents: [], goal: 'Retain bounded outcome.', context: 'Synthetic fixture.', target, action: 'verify', resource: 'alpha', destination: 'local-evidence', authorityRef: authority, criteria: [{ id: 'artifact', description: 'Reported result.', evidence: 'reported-check' }], freshness: { maxAgeMs: 10000, sources: [] }, reviewAt: '2026-01-02T00:00:00.000Z', feature: { id: 'bounded', method: 'Inspect evidence.', intendedEffect: 'Maintain outcome.', reviewAt: '2026-01-02T00:00:00.000Z' }, lifecycle: { status: 'active' } }));
  const epoch = [{ hash: 'e'.repeat(64), restoredAt: times[0] }, { hash: 'f'.repeat(64), restoredAt: times[2] }];
  const make = (category, generation, change = {}, origin = category === 'target' ? 'observed-local' : 'reported') => {
    const raw = { responsibilityId: definition.id, subject: target, observedAt: generation ? times[2] : times[1], observer: 'Synthetic bounded evidence', category, availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [], homeEpoch: epoch[generation].hash, ...(category === 'authority' ? { authority } : category === 'tasks' ? { tasks: [] } : category === 'schedule' ? { schedules: [] } : {}), ...change };
    return recordPayload({ ...parseObservation(raw), origin });
  };
  const items = epoch.map((_, generation) => categories.map(category => make(category, generation)));
  const defective = epoch.map((_, generation) => [
    make('target', generation, {}, 'reported'),
    make('authority', generation, { authority: { ...authority, action: 'foreign' } }),
    make('tasks', generation, { coverage: { complete: false, gaps: ['bounded gap'] } }),
    make('schedule', generation, { subject: { ...target, hostId: 'foreign' } }),
  ]);
  const unavailable = items.map((row, generation) => make('tasks', generation, { observedAt: times[2], availability: 'unavailable', supersedes: { hash: row[2].hash, reason: 'Current unavailable correction.' } }));
  const recovered = unavailable.map((row, generation) => make('tasks', generation, { observedAt: times[2], supersedes: { hash: row.hash, reason: 'Current re-observation.' } }));
  const bindings = { schemaVersion: 1, localHostId: target.hostId, hosts: { [target.hostId]: { label: 'Fixture', machine: 'fixture-machine' } }, projects: { alpha: { label: 'Alpha', repository: target.repository, hostId: target.hostId, nativeProjectId: target.nativeProjectId, path: target.path } } };
  const catalog = { projects: [{ id: 'alpha', label: 'Alpha', repository: target.repository }] };
  return { definition, epoch, items, defective, unavailable, recovered, bindings, catalog };
}

export function evaluate(modules, fixture, state) {
  const { work, responsibilities } = modules;
  const observations = fixture.items.flatMap((row, generation) => row.flatMap((item, index) => state.masks[generation] & 1 << index ? [state.fault?.generation === generation && state.fault.index === index ? fixture.defective[generation][index] : item] : []));
  for (let generation = 0; generation < 2; generation++) {
    if (state.revocations[generation]) observations.push(fixture.unavailable[generation]);
    if (state.revocations[generation] === 2) observations.push(fixture.recovered[generation]);
  }
  const asOf = state.expired ? times[3] : times[2];
  const definition = fixture.definition;
  const current = work.currentObservations(definition, observations, asOf);
  const status = observations.map(item => work.observationStatus(item, definition.target, asOf, definition.freshness.maxAgeMs));
  const authority = work.authorityStatus(definition, asOf);
  const restored = work.restoredState(fixture.epoch[state.epoch], observations, definition, asOf);
  const review = responsibilities.reconcileState(definition, { definitions: [definition], observations, repairs: [], reviews: [], epoch: fixture.epoch[state.epoch], bindings: fixture.bindings, catalog: fixture.catalog, machine: 'fixture-machine', asOf });
  return { restored, current: current.map(item => item.hash).sort(), status, authority, reviewRestore: review.restore, restoreFinding: review.findings.some(item => item.code === 'restore-suspended'), proposals: review.proposals.map(item => item.type) };
}

export function history(modules) {
  const fixture = fixtures(modules.records); const nodes = []; const edges = []; const seen = new Map();
  const intern = state => { const key = canonical(state); if (!seen.has(key)) { seen.set(key, nodes.length); nodes.push({ state, result: state.assessed ? evaluate(modules, fixture, state) : null }); } return seen.get(key); };
  intern({ epoch: 0, masks: [0, 0], revocations: [0, 0], fault: null, expired: false, assessed: false });
  for (let from = 0; from < nodes.length; from++) {
    const state = nodes[from].state; const next = [];
    if (!state.assessed) next.push(['Reconcile', { ...state, assessed: true }]);
    else if (!state.expired) {
      for (let i = 0; i < 4; i++) if (!(state.masks[state.epoch] & 1 << i)) { const masks = [...state.masks]; masks[state.epoch] |= 1 << i; next.push([`Arrive${categories[i][0].toUpperCase()}${categories[i].slice(1)}`, { ...state, masks, assessed: false }]); if (!state.fault) next.push([`Defective${categories[i][0].toUpperCase()}${categories[i].slice(1)}`, { ...state, masks, fault: { generation: state.epoch, index: i }, assessed: false }]); }
      const revocation = state.revocations[state.epoch];
      if (state.masks[state.epoch] === 15 && revocation === 0 && state.fault?.generation !== state.epoch) { const revocations = [...state.revocations]; revocations[state.epoch] = 1; next.push(['Unavailable', { ...state, revocations, assessed: false }]); }
      if (revocation === 1) { const revocations = [...state.revocations]; revocations[state.epoch] = 2; next.push(['Reobserve', { ...state, revocations, assessed: false }]); }
      if (state.epoch === 0 && state.masks[0] === 15 && revocation !== 1 && state.fault?.generation !== 0) next.push(['EpochPublished', { ...state, epoch: 1, assessed: false }]);
      if (state.masks[state.epoch] === 15 && revocation !== 1 && state.fault?.generation !== state.epoch) next.push(['TimeExpires', { ...state, expired: true, assessed: false }]);
    }
    if (!next.length) next.push(['Done', state]);
    for (const [action, nextState] of next) edges.push({ from, to: intern(nextState), action });
  }
  return { nodes, edges };
}

export function graphSpec(graph) {
  const tuple = values => `<<${values.join(', ')}>>`;
  const actions = [...new Set(graph.edges.map(edge => edge.action))];
  const definitions = actions.map(action => `${action} ==\n${graph.edges.filter(edge => edge.action === action).map(edge => `  \\/ /\\ node = ${edge.from + 1} /\\ node' = ${edge.to + 1}`).join('\n')}`).join('\n\n');
  const flag = fn => tuple(graph.nodes.map(node => fn(node) ? 'TRUE' : 'FALSE'));
  const validEpoch = ({ state }) => state.masks[state.epoch] === 15;
  const validCurrent = ({ state }) => state.revocations[state.epoch] !== 1;
  const validCategory = ({ state }) => state.fault?.generation !== state.epoch;
  const validTime = ({ state }) => !state.expired;
  return `---- MODULE Restoration ----\nEXTENDS Naturals\nVARIABLE node\nReady == ${flag(n => n.result !== null && !n.result.restored.suspended)}\nEpochComplete == ${flag(validEpoch)}\nCurrentAvailable == ${flag(validCurrent)}\nFresh == ${flag(validTime)}\nEligibleCategories == ${flag(validCategory)}\nReconcileAgrees == ${flag(n => n.result === null || canonical(n.result.restored) === canonical(n.result.reviewRestore) && n.result.restoreFinding === n.result.restored.suspended && (n.result !== null && !n.result.restored.suspended || n.result.proposals.length === 0))}\nInit == node = 1\n${definitions}\nNext == ${actions.join(' \\/ ')}\nEpochEvidence == Ready[node] => EpochComplete[node]\nCurrentEvidence == Ready[node] => CurrentAvailable[node]\nFreshEvidence == Ready[node] => Fresh[node]\nCategoryEvidence == Ready[node] => EligibleCategories[node]\nReconcileGate == ReconcileAgrees[node]\n====\n`;
}
export const config = 'INIT Init\nNEXT Next\nINVARIANT EpochEvidence\nINVARIANT CurrentEvidence\nINVARIANT FreshEvidence\nINVARIANT CategoryEvidence\nINVARIANT ReconcileGate\n';
