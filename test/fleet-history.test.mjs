import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetInitial, fleetTransition } from '../src/fleet-state.mjs';
import { fleetRoot, fleetJob, fleetTime, fleetReceipt } from '../verification/fleet-fixtures.mjs';

const archive = fields => ({ operation: 'archive', sourceRef: 'synthetic-owner', reason: 'Explicit bounded projection archival; retain journal bytes.', ...fields });
const complete = (state, id) => {
  state = fleetTransition(state, { operation: 'submit', job: fleetJob(id) }, fleetRoot, fleetTime).state;
  state = fleetTransition(state, { operation: 'claim', ownerRef: 'fixture' }, fleetRoot, fleetTime).state;
  const job = state.jobs.find(row => row.status === 'attempted');
  return fleetTransition(state, { operation: 'result', jobKey: job.key, ticket: job.ticket, checkpoint: 1, outcome: 'completed', receipt: fleetReceipt(), usage: { reads: 1, bytes: 64 } }, fleetRoot, fleetTime).state;
};
test('explicit archival frees lifetime job capacity without erasing original snapshot', () => {
  let state = fleetInitial(fleetRoot);
  for (let i = 0; i < 64; i++) state = complete(state, `read-${i}`);
  assert.equal(fleetTransition(state, { operation: 'submit', job: fleetJob('read-64') }, fleetRoot, fleetTime).outcome, 'backpressure');
  const original = structuredClone(state);
  state = fleetTransition(state, archive({ jobKeys: state.jobs.map(row => row.key) }), fleetRoot, fleetTime).state;
  assert.equal(state.jobs.length, 0); assert.equal(original.jobs.length, 64);
  assert.equal(fleetTransition(state, { operation: 'submit', job: fleetJob('read-64') }, fleetRoot, fleetTime).outcome, 'retained');
});
