import assert from 'node:assert/strict';
import { actionInput, parseFleetRecord } from '../../src/fleet-schema.mjs';
import { fleetRoot, fleetEntities, fleetCapture, fleetTime } from '../fleet-fixtures.mjs';
import { digest } from '../../src/content.mjs';

export const limits = { steps: 5, states: 5000, edges: 5000, alerts: 20 };
const root = structuredClone(fleetRoot); root.action.entities = fleetEntities.slice(0, 2); parseFleetRecord(root);
const clock = n => new Date(Date.parse(fleetTime) + n * 1000).toISOString();
const menus = [
  ['both', 'empty'],
  ['monitor-fail', 'auth-fail', 'auth-partial', 'auth-unprotected', 'future', 'scope'],
  ['monitor-good', 'auth-good', 'auth-fail', 'auth-different', 'empty', 'backdate', 'same-time'],
  ['monitor-good', 'monitor-fail', 'auth-good', 'auth-fail'],
  ['monitor-good', 'auth-good', 'auth-fail', 'empty', 'stale']
];
const names = ['StableEpisode', 'ConservativeHealth', 'FreshRecovery', 'Admission', 'Recurrence'];
const bad = row => !['healthy', 'recovered'].includes(row.condition);
const semantic = row => JSON.stringify([row.condition, row.issueKey, row.actionIdentity]);
const entity = (state, id) => state.entities.find(row => row.expected.id === id);
function input(choice, step, state) {
  const now = clock(choice === 'stale' ? 400 : step); const make = (id, condition) => fleetCapture(id, condition, now, { nextAction: step % 2 ? 'Inspect this scoped result.' : 'Review the scoped result.' });
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
    const row = entity(after, old.expected.id); const supplied = action.captures.find(c => c.entityId === old.expected.id);
    if (old.fingerprint !== null && bad(old) && bad(row) && semantic(old) === semantic(row)) {
      result.StableEpisode &&= row.episode === old.episode && row.alertId === old.alertId && after.alerts.filter(a => a.scope === row.expected.id).length === before.alerts.filter(a => a.scope === row.expected.id).length;
    }
    if (old.expected.id === 'protected' && row.condition === 'healthy') {
      const monitor = entity(after, 'monitor');
      const receipt = row.capture?.receipt;
      result.ConservativeHealth &&= monitor.condition === 'healthy' && !!receipt && receipt.coverage.complete && receipt.coverage.gaps.length === 0 && row.capture.protectedContent === true && Date.parse(receipt.observedAt) <= Date.parse(receipt.capturedAt) && Date.parse(receipt.capturedAt) <= Date.parse(at) && Date.parse(at) - Date.parse(receipt.observedAt) >= 0 && Date.parse(at) - Date.parse(receipt.observedAt) <= 300000;
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
      const prior = states[from].state; const event = input(choice, step, prior); if (!event) continue;
      const { action, at } = event; const snapshot = structuredClone(prior); let value;
      let expected = null;
      for (const capture of action.captures) {
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
export function spec(g) {
  const successors = g.states.map(() => []); for (const edge of g.edges) successors[edge.from].push(edge.to + 1);
  const next = successors.map((s, i) => `{${(s.length ? s : [i + 1]).join(',')}}`).join(',');
  return `---- MODULE FleetHealth ----\nEXTENDS Naturals, Sequences\nVARIABLE node\nSuccessors == <<${next}>>\nInit == node = 1\nStep == node' \\in Successors[node]\nNext == Step\n${names.map(name => `${name} == node \\notin {${g.states.flatMap((s, i) => s.rules[name] ? [] : [i + 1]).join(',')}}`).join('\n')}\n====\n`;
}
export const cfg = `INIT Init\nNEXT Next\n${names.map(n => `INVARIANT ${n}`).join('\n')}\n`;
export { root, names, rules };
