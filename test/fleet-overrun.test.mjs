import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetInitial, fleetTransition } from '../src/fleet-state.mjs';
import { actionInput } from '../src/fleet-schema.mjs';
import { fleetJob, fleetReceipt, fleetRoot, fleetTime } from '../verification/fleet-fixtures.mjs';

export function overrunFixture() {
  let state = fleetTransition(fleetInitial(fleetRoot), { operation: 'submit', job: fleetJob('measured-overrun', 'morning', { maxReads: 3, maxBytes: 131072 }) }, fleetRoot, fleetTime).state;
  state = fleetTransition(state, { operation: 'claim', ownerRef: 'fixture-parent' }, fleetRoot, fleetTime).state;
  const job = state.jobs[0];
  const action = { operation: 'resolve', jobKey: job.key, ticket: job.ticket, checkpoint: 0, outcome: 'blocked', usage: { reads: 2, bytes: 161853 }, receipt: fleetReceipt(), reason: 'Both observer calls returned. Observed workload may still run.', failure: { kind: 'read-only-known-overrun', sourceRef: 'measured-ended-proof', sha256: 'a'.repeat(64), reason: 'Measured response bytes exceed original cap.' } };
  return { state, action, at: '2026-10-25T12:06:00.000Z' };
}

test('ended measured overrun settles blocked with exact counts and immutable caps after expiry', () => {
  const { state, action, at } = overrunFixture();
  actionInput(action);
  const result = fleetTransition(state, action, fleetRoot, at);
  const job = result.state.jobs[0];
  assert.equal(result.outcome, 'blocked');
  assert.equal(job.usedReads, 2);
  assert.equal(job.usedBytes, 161853);
  assert.equal(job.input.maxReads, 3);
  assert.equal(job.input.maxBytes, 131072);
  assert.equal(job.byteAccounting.measuredTotalBytes, 161853);
  assert.equal(job.byteAccounting.budgetCompliance, 'exceeded');
  assert.equal(job.checkpoint, 0);
  assert.equal(fleetTransition(result.state, action, fleetRoot, at).outcome, 'coalesced');
  assert.equal(fleetTransition(result.state, { operation: 'claim', ownerRef: 'other' }, fleetRoot, at).ticket, null);
  const submitted = fleetTransition(result.state, { operation: 'submit', job: fleetJob('fresh-authorized-read') }, fleetRoot, at).state;
  assert.ok(fleetTransition(submitted, { operation: 'claim', ownerRef: 'other' }, fleetRoot, at).ticket);
});

test('overrun cannot loosen successful, uncertain, scope, checkpoint or monotone usage rules', () => {
  const { state, action, at } = overrunFixture();
  for (const outcome of ['completed', 'checkpoint', 'uncertain', 'known-unexecuted']) assert.throws(() => fleetTransition(state, { ...action, outcome }, fleetRoot, at));
  assert.throws(() => fleetTransition(state, { ...action, failure: undefined, outcome: 'completed', checkpoint: 1 }, fleetRoot, at), /budget/);
  assert.throws(() => fleetTransition(state, { ...action, operation: 'result' }, fleetRoot, at), /exact reconciliation/);
  for (const patch of [{ ticket: 'b'.repeat(64) }, { checkpoint: 1 }, { usage: { reads: 2, bytes: 131072 } }, { usage: { reads: 2, bytes: null } }, { usage: { reads: 2, bytes: 161853, knownBytesLowerBound: 1 } }, { receipt: { ...action.receipt, scope: { ...action.receipt.scope, resource: 'foreign' } } }]) assert.throws(() => fleetTransition(state, { ...action, ...patch }, fleetRoot, at));
  const mutating = structuredClone(state); mutating.jobs[0].input.kind = 'native-mutation';
  assert.throws(() => fleetTransition(mutating, action, fleetRoot, at), /read-only/);
  const previous = structuredClone(state); previous.jobs[0].attemptReads = 3; previous.jobs[0].usedReads = 3;
  assert.throws(() => fleetTransition(previous, action, fleetRoot, at), /monotone/);
  const blocked = fleetTransition(state, action, fleetRoot, at).state;
  assert.throws(() => fleetTransition(blocked, { ...action, reason: 'Different settlement' }, fleetRoot, at), /exact reconciliation/);
  assert.equal(blocked.jobs[0].ticket, action.ticket);
});
