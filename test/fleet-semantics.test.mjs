import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureCondition, fleetInitial, fleetTransition, fleetView } from '../src/fleet-state.mjs';
import { actionInput, captureInput } from '../src/fleet-schema.mjs';
import { replayReview } from '../src/responsibilities.mjs';
import { digest, validateReferences } from '../src/records.mjs';
import { fleetCapture, fleetEntities, fleetRoot, fleetTime } from '../verification/fleet-fixtures.mjs';
const root = { ...fleetRoot, action: { ...fleetRoot.action, semanticsVersion: 2, entities: fleetEntities.map(row => ({ ...row, ...(row.dueAt ? { occurrenceId: 'routine-2026-10-25' } : {}) })) } };
const capture = (id = 'protected', condition = 'healthy', at = fleetTime, extra = {}) => ({ ...fleetCapture(id, condition, at), actionIdentity: { kind: 'inspect', target: id }, ...(id === 'routine' ? { invocation: { origin: 'scheduled', occurrenceId: 'routine-2026-10-25' } } : {}), ...extra });
const step = (state, action, at = fleetTime) => fleetTransition(state, action, root, at).state;
const green = () => step(fleetInitial(root), { operation: 'assess', captures: fleetEntities.map(row => capture(row.id)) });
const legacy = JSON.parse(readFileSync(new URL('./fixtures/fleet-v1-journal.json', import.meta.url)));
test('frozen complete legacy transition journal retains every exact output', () => {
  assert.equal(digest(legacy), '1d8b99f328cd8006f59d99a9fe54cc4e960f3fe6b21bb8efd6a1ef6fa467e463');
  let state = fleetInitial(legacy.root); assert.deepEqual(state, legacy.initial);
  for (const { action, at, ...expected } of legacy.steps) { const actual = fleetTransition(state, action, legacy.root, at); assert.deepEqual(actual, expected); state = actual.state; }
});
test('v2 scheduled health requires origin and exact occurrence while retaining manual outcomes', () => {
  const state = green(); const row = state.entities[2];
  for (const invocation of [undefined, { origin: 'unknown' }, { origin: 'manual' }, { origin: 'scheduled', occurrenceId: 'other-day' }]) {
    const current = capture('routine', 'healthy', fleetTime, { invocation });
    assert.notEqual(captureCondition(row, current, state, { maxAgeMs: 1000 }, fleetTime).condition, 'healthy');
  }
  assert.equal(captureCondition(row, capture('routine'), state, { maxAgeMs: 1000 }, fleetTime).condition, 'healthy');
  const manual = step(state, { operation: 'assess', captures: [capture('routine', 'healthy', '2026-10-25T12:00:01.000Z', { invocation: { origin: 'manual' }, runRef: 'manual-rescue' })] }, '2026-10-25T12:00:01.000Z');
  assert.equal(manual.entities[2].capture.runRef, 'manual-rescue'); assert.equal(manual.entities[2].issueKey, 'manual-run-only');
});
test('v2 action identity coalesces paraphrases and reopens materially changed actions', () => {
  const fail = (state, at, extra) => step(state, { operation: 'assess', captures: [capture('protected', 'denied-action', at, extra)] }, at);
  let state = fail(green(), '2026-10-25T12:00:01.000Z', { nextAction: 'Inspect denied read.' }); const id = state.alerts[0].id;
  state = fail(state, '2026-10-25T12:00:02.000Z', { nextAction: 'Inspect this denied read.' }); assert.equal(state.alerts.length, 1); assert.equal(state.entities[1].alertId, id);
  state = fail(state, '2026-10-25T12:00:03.000Z', { actionIdentity: { kind: 'request-authority', target: 'protected' } }); assert.equal(state.alerts.length, 2);
  const missing = capture(); delete missing.actionIdentity; assert.throws(() => captureInput(missing, 2), /action identity/);
});
test('policy-only eligibility retains pending recovery until genuinely fresh success', () => {
  const at = '2026-10-25T12:06:00.000Z'; let state = step(green(), { operation: 'assess', captures: [] }, at); const old = structuredClone(state);
  const policy = { operation: 'policy-revise', version: 1, previousDigest: null, maxAgeMs: 86400000, entities: fleetEntities.map(row => ({ entityId: row.id, scope: row.scope, maxAgeMs: 86400000 })), sourceRef: 'synthetic-owner', reason: 'Revise exact windows.' };
  state = step(state, policy, at); assert.deepEqual(state.entities.map(row => row.capture), old.entities.map(row => row.capture)); assert.deepEqual(state.alerts, old.alerts); assert.equal(state.entities[1].condition, 'healthy'); assert.equal(state.entities[1].recoveryPending.alertId, old.entities[1].alertId);
  state = step(state, { operation: 'assess', captures: [] }, at); assert.deepEqual(state.alerts, old.alerts);
  const wrapped = capture('protected', 'healthy', '2026-10-25T12:00:01.000Z'); wrapped.receipt.capturedAt = '2026-10-25T12:06:01.000Z';
  state = step(state, { operation: 'assess', captures: [wrapped] }, '2026-10-25T12:06:01.000Z'); assert.deepEqual(state.alerts, old.alerts);
  state = step(state, { operation: 'assess', captures: [capture('protected', 'healthy', '2026-10-25T12:06:02.000Z')] }, '2026-10-25T12:06:02.000Z'); assert.equal(state.alerts.at(-1).condition, 'recovered'); assert.equal(state.entities[1].recoveryPending, null);
});
test('explicit upgrade binds predecessor, preserves legacy alerts and invents no provenance', () => {
  const previous = legacy.steps.at(-1).state; const action = { operation: 'upgrade', semanticsVersion: 2, stateDigest: digest(previous), sourceRef: 'synthetic-owner', reason: 'Adopt explicit evidence semantics.' };
  assert.throws(() => fleetTransition(previous, { ...action, stateDigest: '0'.repeat(64) }, legacy.root, '2026-10-25T12:06:00.000Z'), /state digest/);
  const upgraded = fleetTransition(previous, action, legacy.root, '2026-10-25T12:06:00.000Z').state;
  assert.equal(upgraded.semanticsVersion, 2); assert.deepEqual(upgraded.alerts, previous.alerts); assert.deepEqual(upgraded.entities.map(row => row.capture), previous.entities.map(row => row.capture));
  assert.equal(upgraded.entities[2].condition, 'unknown'); assert.equal(upgraded.entities[2].issueKey, 'invocation-origin-unverified');
  assert.throws(() => fleetTransition(upgraded, action, legacy.root, '2026-10-25T12:06:00.000Z'), /already/);
  const view = fleetView([legacy.root, { type: 'fleet-step', hash: 'e'.repeat(64), parentHash: legacy.root.hash, rootHash: legacy.root.hash, state: previous }], legacy.root.responsibilityId, '2026-10-25T12:06:00.000Z');
  assert.equal(view.inventory[2].condition, 'unknown');
});

test('current inventory and captures require explicit occurrence and origin declarations', () => {
  const missing = { ...fleetEntities[2] }; delete missing.occurrenceId;
  assert.throws(() => actionInput({ operation: 'configure', semanticsVersion: 2, entities: [missing] }, 2), /occurrence identity/);
  assert.throws(() => step(green(), { operation: 'inventory', entities: [missing], sourceRef: 'owner', reason: 'Missing occurrence.' }), /occurrence identity/);
  assert.throws(() => step(green(), { operation: 'assess', captures: [capture('routine', 'healthy', fleetTime, { invocation: undefined })] }), /invocation origin/);
});

test('frozen legacy review preserves original bytes and replays every retained field', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/fleet-v1-review.json', import.meta.url)));
  assert.equal(digest(fixture), '99cac0ced49dc4b73ac0ca16e7fc4ab1c2641ca0110f00ef71547a8a24587352');
  validateReferences(fixture.records);
  const { cloud: retiredSummary, ...expectedReview } = fixture.expected;
  assert.deepEqual(retiredSummary, []);
  assert.deepEqual(replayReview(fixture.review, fixture.records), expectedReview);
});

test('policy eligibility remains actionable after every old alert is acknowledged', () => {
  const at = '2026-10-25T12:06:00.000Z'; let state = step(green(), { operation: 'assess', captures: [] }, at);
  state = step(state, { operation: 'policy-revise', version: 1, previousDigest: null, maxAgeMs: 86400000, entities: fleetEntities.map(row => ({ entityId: row.id, scope: row.scope, maxAgeMs: 86400000 })), sourceRef: 'owner', reason: 'Eligibility only.' }, at);
  for (const row of state.alerts) row.disposition = { sourceRef: 'owner', reason: 'Acknowledged old alert.', at };
  const view = fleetView([root, { type: 'fleet-step', hash: 'd'.repeat(64), parentHash: root.hash, rootHash: root.hash, state }], root.responsibilityId, at);
  assert.equal(view.needsAssessment, false); assert.equal(view.status, 'needs-attention');
});
