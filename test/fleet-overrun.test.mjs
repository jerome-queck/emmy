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
