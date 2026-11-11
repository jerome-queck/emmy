import { canonical } from '../../src/content.mjs';
import { cloudConfig, cloudEnvelope, cloudJobInput, parseCloudRecord } from '../../src/cloud-schema.mjs';

const effect = 'a'.repeat(64);
const config = cloudConfig({ maxAttempts: 2, backoffMs: 100, maxBackoffMs: 100 });
const jobs = [0, 1, 2].map(transientFailures => cloudJobInput({ id: 'job', priority: 'interactive', payload: 'a', units: 2, transientFailures }, config));
const time = n => new Date(Date.parse('2026-01-01T00:00:00.000Z') + n * 100).toISOString();
const envelope = input => cloudEnvelope({ schemaVersion: 1, responsibilityId: 'one', ...input });
const validateState = (state, at) => parseCloudRecord({ schemaVersion: 1, type: 'cloud-step', responsibilityId: 'one', definitionHash: effect, rootHash: effect, parentHash: effect, seq: 1, at, operation: 'tick', state });

export function graph(module) {
  const states = []; const edges = []; const ids = new Map();
  const intern = row => { const k = canonical(row); if (!ids.has(k)) { ids.set(k, states.length); states.push(row); } return ids.get(k); };
  intern({ state: module.emptyCloudState(), depth: 0, stable: true, progress: true, terminal: true });
  for (let from = 0; from < states.length; from++) {
    const row = states[from];
    if (!row.stable || !row.progress || !row.terminal) continue;
    validateState(row.state, time(row.depth));
    if (row.depth === 6) continue;
    const at = time(row.depth + 1); const prior = row.state.jobs[0];
    const candidates = prior ? [['SameSubmit', { operation: 'submit', job: prior.input }], ['ConflictSubmit', { operation: 'submit', job: { ...prior.input, payload: 'b' } }]] : jobs.map((job, n) => [`Submit${n}`, { operation: 'submit', job }]);
    candidates.push(['Tick', { operation: 'tick', capacity: { synthetic: true, state: 'available', observedAt: at } }], ['Pressure', { operation: 'tick', capacity: { synthetic: true, state: 'pressure', observedAt: at } }], ['Stale', { operation: 'tick', capacity: { synthetic: true, state: 'available', observedAt: time(-400) } }], ['Recover', { operation: 'recover' }], ['Suspend', { operation: 'suspend', reason: 'test' }], ['Resume', { operation: 'resume', reason: 'test' }]);
    for (const [action, raw] of candidates) {
      const input = envelope(raw); const event = input.operation === 'tick' ? { ...input, sample: input.capacity } : input;
      const result = module.cloudTransition(structuredClone(row.state), event, config, at, effect); const next = result.state; const matches = prior ? next.jobs.filter(job => job.key === prior.key) : [];
      const same = matches[0];
      const stable = row.stable && (!prior || matches.length === 1 && next.jobs.length === 1 && canonical(same.input) === canonical(prior.input) && same.inputDigest === prior.inputDigest && same.order === prior.order);
      const progress = row.progress && (!prior || !!same && same.completedUnits >= prior.completedUnits && (same.completedUnits !== prior.completedUnits || same.accumulator === prior.accumulator));
      const terminal = row.terminal && (!prior || !['finished', 'dead'].includes(prior.status) || !!same && canonical(same) === canonical(prior));
      const to = intern({ state: next, depth: row.depth + 1, stable, progress, terminal });
      edges.push({ from, to, action, input: event, at, outcome: result.outcome });
    }
    if (states.length > 40000) throw new Error('Graph exceeds declared state bound');
  }
  return { states, edges };
}

export function spec(g) {
  const actions = [...new Set(g.edges.map(e => e.action))];
  const defs = actions.map(a => `${a} ==\n${g.edges.filter(e => e.action === a).map(e => `  \\/ /\\ node = ${e.from + 1} /\\ node' = ${e.to + 1}`).join('\n')}`).join('\n');
  const values = key => `<<${g.states.map(s => s[key] ? 'TRUE' : 'FALSE').join(',')}>>`;
  return `---- MODULE CooperativeCloud ----\nEXTENDS Naturals\nVARIABLE node\nStableValues == ${values('stable')}\nProgressValues == ${values('progress')}\nTerminalValues == ${values('terminal')}\nInit == node = 1\n${defs}\nDone == /\\ node \\in {${g.states.map((s, i) => s.depth === 6 || !s.stable || !s.progress || !s.terminal ? i + 1 : null).filter(Boolean).join(',')}} /\\ UNCHANGED node\nNext == ${actions.join(' \\/ ')} \\/ Done\nStable == StableValues[node]\nProgress == ProgressValues[node]\nTerminal == TerminalValues[node]\n====\n`;
}
export const cfg = 'INIT Init\nNEXT Next\nINVARIANT Stable\nINVARIANT Progress\nINVARIANT Terminal\n';
