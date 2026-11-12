import assert from 'node:assert/strict';
import { actionInput, parseFleetRecord } from '../../src/fleet-schema.mjs';
import { fleetRoot, fleetEntities, fleetCapture, fleetTime } from '../fleet-fixtures.mjs';
import { digest } from '../../src/content.mjs';

export const limits = { steps: 5, states: 5000, edges: 5000, alerts: 20 };
const root = structuredClone(fleetRoot); root.action.entities = fleetEntities.slice(0, 2); parseFleetRecord(root);
const clock = n => new Date(Date.parse(fleetTime) + n * 1000).toISOString();
const menus = [
  ['both', 'empty'],
  ['monitor-fail', 'auth-fail', 'auth-partial', 'auth-unprotected', 'future', 'scope', 'stale'],
  ['monitor-good', 'auth-good', 'auth-fail', 'auth-different', 'empty', 'backdate', 'same-time', 'policy'],
  ['monitor-good', 'monitor-fail', 'auth-good', 'auth-fail', 'old-wrapper'],
  ['monitor-good', 'auth-good', 'auth-fail', 'empty', 'stale']
];
const names = ['StableEpisode', 'ConservativeHealth', 'FreshRecovery', 'Admission', 'Recurrence'];
const bad = row => !['healthy', 'recovered'].includes(row.condition);
const semantic = row => JSON.stringify([row.condition, row.issueKey, row.actionIdentity]);
const entity = (state, id) => state.entities.find(row => row.expected.id === id);
function input(choice, step, state, path) {
  const advanced = path.includes('stale');
  if (choice === 'stale' && advanced) return null;
  const now = clock(choice === 'stale' ? 400 : step + (advanced ? 400 : 0));
  if (choice === 'policy') { if (!advanced) return null; const action = { operation: 'policy-revise', version: 1, previousDigest: null, maxAgeMs: 86400000, entities: root.action.entities.map(row => ({entityId: row.id, scope: row.scope, maxAgeMs: 86400000})), sourceRef: 'synthetic-owner', reason: 'Revise windows.' }; actionInput(action, 2); return {action, at: now}; }
  if (choice === 'old-wrapper') { if (!advanced || !state.policy || !entity(state,'protected').capture) return null; const previous = entity(state,'protected').capture.receipt; const observedAt = new Date(Date.parse(previous.observedAt) + 1000).toISOString(); const capture = fleetCapture('protected','healthy',observedAt); capture.receipt.capturedAt = now; const action = {operation:'assess',captures:[capture]}; actionInput(action,2); return {action,at:now}; } const make = (id, condition) => fleetCapture(id, condition, now, { nextAction: step % 2 ? 'Inspect this scoped result.' : 'Review the scoped result.' });
  let captures = [];
  if (choice === 'both') captures = [make('monitor', 'healthy'), make('protected', 'healthy')];
  if (choice.startsWith('monitor-')) captures = [make('monitor', choice === 'monitor-good' ? 'healthy' : 'monitoring-failed')];
  if (choice.startsWith('auth-')) captures = [make('protected', choice === 'auth-fail' ? 'login-expired' : 'healthy')];
  if (choice === 'auth-partial') captures[0].receipt.coverage = { complete: false, gaps: ['Incomplete synthetic coverage'] };
  if (choice === 'auth-unprotected') captures[0].protectedContent = false;
  if (choice === 'auth-different') captures = [make('protected', 'login-expired')], captures[0].actionIdentity = {kind: 'request-authority', target: 'protected'};
  if (choice === 'future') captures = [make('protected', 'healthy')], captures[0].receipt.capturedAt = clock(step + 1);
  if (choice === 'scope') { captures = [make('protected', 'healthy')]; captures[0].receipt.scope = { ...captures[0].receipt.scope, resource: 'foreign' }; }
  if (choice === 'backdate') captures = [fleetCapture('protected', 'healthy', clock(0))];
  if (choice === 'same-time') { const previous = entity(state, 'protected').capture; if (!previous) return null; captures = [{...structuredClone(previous), nextAction: previous.nextAction + ' Changed.'}]; }
  const action = { operation: 'assess', captures }; actionInput(action, 2); return { action, at: now };
}
function rules(before, after, action, at) {
  const result = Object.fromEntries(names.map(name => [name, true]));
  for (const old of before.entities) {
    const row = entity(after, old.expected.id); const supplied = (action.captures ?? []).find(c => c.entityId === old.expected.id);
    if (old.fingerprint !== null && bad(old) && bad(row) && semantic(old) === semantic(row)) {
      result.StableEpisode &&= row.episode === old.episode && row.alertId === old.alertId && after.alerts.filter(a => a.scope === row.expected.id).length === before.alerts.filter(a => a.scope === row.expected.id).length;
    }
    if (old.expected.id === 'protected' && row.condition === 'healthy') {
      const monitor = entity(after, 'monitor');
      const receipt = row.capture?.receipt;
      result.ConservativeHealth &&= monitor.condition === 'healthy' && !!receipt && receipt.coverage.complete && receipt.coverage.gaps.length === 0 && row.capture.protectedContent === true && Date.parse(receipt.observedAt) <= Date.parse(receipt.capturedAt) && Date.parse(receipt.capturedAt) <= Date.parse(at) && Date.parse(at) - Date.parse(receipt.observedAt) >= 0 && Date.parse(at) - Date.parse(receipt.observedAt) <= (after.policy?.entities.find(p => p.entityId === row.expected.id)?.maxAgeMs ?? 300000);
    }
    const newAlerts = after.alerts.filter(a => !before.alerts.some(b => a.id === b.id) && a.scope === old.expected.id);
    if (old.recoveryPending && supplied && row.condition === 'healthy') {
      const pending = old.recoveryPending; const receipt = supplied.receipt;
      const eligible = Date.parse(receipt.observedAt) >= Date.parse(pending.at) && (!pending.observedAt || Date.parse(receipt.observedAt) > Date.parse(pending.observedAt)) && digest(receipt) !== pending.receiptDigest;
      if (eligible) result.FreshRecovery &&= newAlerts.some(a => a.condition === 'recovered' && a.id === row.alertId) && row.recoveryPending === null;
    }
    for (const alert of newAlerts.filter(a => a.condition === 'recovered')) {
      const pending = old.recoveryPending; const receipt = supplied?.receipt;
      result.FreshRecovery &&= !!pending && !!receipt && Date.parse(receipt.observedAt) >= Date.parse(pending.at) && (!pending.observedAt || Date.parse(receipt.observedAt) > Date.parse(pending.observedAt)) && digest(receipt) !== pending.receiptDigest && alert.episode === old.episode + 1 && alert.receipt !== null;
    }
    const last = before.alerts.find(a => a.id === old.alertId);
    if (bad(row) && (old.fingerprint === null || semantic(old) !== semantic(row))) {
      result.Recurrence &&= row.episode === old.episode + 1 && row.alertId !== old.alertId && newAlerts.some(a => a.id === row.alertId && a.episode === row.episode);
    }
    if (!bad(old) && !old.recoveryPending && last?.condition === 'recovered' && bad(row)) {
      result.Recurrence &&= row.episode === old.episode + 1 && row.alertId !== old.alertId && newAlerts.some(a => a.id === row.alertId && a.episode === row.episode);
    }
    if (supplied) {
      const previous = old.capture;
      const invalid = JSON.stringify(supplied.receipt.scope) !== JSON.stringify(old.expected.scope) || previous && (Date.parse(supplied.receipt.observedAt) < Date.parse(previous.receipt.observedAt) || supplied.receipt.observedAt === previous.receipt.observedAt && JSON.stringify(supplied) !== JSON.stringify(previous));
      if (invalid) result.Admission = false;
    }
  }
  return result;
}
export function graph(api) {
  const initial = api.fleetInitial(root); const states = [{ state: initial, rules: Object.fromEntries(names.map(x => [x, true])), path: [] }]; const edges = []; const rejected = [];
  let frontier = [0];
  for (let step = 1; step <= limits.steps; step++) {
    const next = [];
    for (const from of frontier) for (const choice of menus[step - 1]) {
      const prior = states[from].state; const event = input(choice, step, prior, states[from].path); if (!event) continue;
      const { action, at } = event; const snapshot = structuredClone(prior); let value;
      let expected = null;
      for (const capture of action.captures ?? []) {
        const row = entity(prior, capture.entityId); const previous = row.capture;
        if (JSON.stringify(row.expected.scope) !== JSON.stringify(capture.receipt.scope)) expected = 'Capture crosses exact source, account or environment scope';
        else if (previous && Date.parse(capture.receipt.observedAt) < Date.parse(previous.receipt.observedAt)) expected = 'Capture predates retained source';
        else if (previous && capture.receipt.observedAt === previous.receipt.observedAt && JSON.stringify(capture) !== JSON.stringify(previous)) expected = 'Contradictory same-time capture requires a fresh attributable read';
      }
      try { value = api.fleetTransition(prior, action, root, at).state; }
      catch (error) { assert.deepEqual(prior, snapshot); assert.equal(error.message, expected, `Unexpected transition exception: ${choice}`); rejected.push({ from, choice, message: error.message }); continue; }
      assert.deepEqual(prior, snapshot); assert.ok(value.alerts.length <= limits.alerts, 'Alert bound exceeded');
      const properties = rules(prior, value, action, at); const to = states.length;
      states.push({ state: value, rules: properties, path: [...states[from].path, choice] }); edges.push({ from, to, choice, action, at });
      assert.ok(states.length <= limits.states && edges.length <= limits.edges, 'Graph bound exceeded');
      if (Object.values(properties).every(Boolean)) next.push(to);
    }
    frontier = next;
  }
  return { states, edges, rejected, limits };
}
export function inspectGraph(g, expected) {
  const outgoing = g.states.map(() => []);
  for (const edge of g.edges) {
    assert.ok(Number.isInteger(edge.from) && outgoing[edge.from] && Number.isInteger(edge.to) && outgoing[edge.to], 'Invalid graph edge');
    assert.deepEqual(g.states[edge.to].path, [...g.states[edge.from].path, edge.choice], 'Edge disagrees with retained history');
    outgoing[edge.from].push(edge.to);
  }
  const paths = new Map([[0, [0]]]); const queue = [0];
  for (let i = 0; i < queue.length; i++) for (const to of outgoing[queue[i]]) {
    if (!paths.has(to)) { paths.set(to, [...paths.get(queue[i]), to]); queue.push(to); }
  }
  assert.equal(paths.size, g.states.length, 'Graph contains unreachable states');
  if (!expected) {
    assert.ok(g.states.every(s => Object.values(s.rules).every(Boolean)), 'Original graph violates a rule');
    return null;
  }
  assert.ok(names.includes(expected), 'Unknown intended rule');
  const broken = queue.find(i => g.states[i].rules[expected] === false);
  assert.notEqual(broken, undefined, `Mutation survived ${expected}`);
  return paths.get(broken);
}

export function chart(g, trace) {
  const path = ['both', 'auth-fail', 'auth-fail', 'auth-good', 'auth-fail'];
  const nodes = trace ?? g.states.flatMap((s, i) => JSON.stringify(s.path) === JSON.stringify(path.slice(0, s.path.length)) ? [i] : []);
  const lines = ['stateDiagram-v2', '  [*] --> n0'];
  for (const i of nodes) {
    const row = entity(g.states[i].state, 'protected');
    const failed = Object.entries(g.states[i].rules).filter(([, ok]) => !ok).map(([name]) => name);
    lines.push(`  n${i}: ${row.condition}${row.recoveryPending ? ' / recovery pending' : ''}${failed.length ? ' / breaks ' + failed.join(', ') : ''}`);
    if (failed.length) lines.push(`  class n${i} breaks`);
  }
  for (const e of g.edges) if (nodes.includes(e.from) && nodes.includes(e.to)) lines.push(`  n${e.from} --> n${e.to}: ${e.choice}`);
  lines.push('  classDef breaks fill:#ffecee,stroke:#e72e3b');
  return { text: lines.join('\n') + '\n', nodes, omittedStates: g.states.length - nodes.length, scope: 'One exact failure/recovery/recurrence history, or the intended counterexample. Full graph.json retains all explored histories and refusals.' };
}
export { root, names, rules };
