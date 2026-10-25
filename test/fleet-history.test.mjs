import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetHistory, fleetInitial, fleetTransition } from '../src/fleet-state.mjs';
import { digest } from '../src/records.mjs';
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
  state = fleetTransition(state, archive({ stateDigest: digest(state), jobKeys: state.jobs.map(row => row.key) }), fleetRoot, fleetTime).state;
  assert.equal(state.jobs.length, 0); assert.equal(original.jobs.length, 64);
  assert.equal(fleetTransition(state, { operation: 'submit', job: fleetJob('read-64') }, fleetRoot, fleetTime, null, { jobs: new Map(), runs: new Map(), sends: new Set() }).outcome, 'retained');
});

const historyOf = state => {
  const head = { type: 'fleet-step', hash: digest(state), rootHash: fleetRoot.hash, parentHash: fleetRoot.hash, state };
  return fleetHistory([fleetRoot, head], head);
};
test('archived job identities coalesce or reject conflicts and exact results without reactivation', () => {
  const original = complete(fleetInitial(fleetRoot), 'old-job'); const job = original.jobs[0]; const history = historyOf(original);
  const state = fleetTransition(original, archive({ stateDigest: digest(original), jobKeys: [job.key] }), fleetRoot, fleetTime).state;
  const step = action => fleetTransition(state, action, fleetRoot, fleetTime, null, history);
  assert.equal(step({ operation: 'submit', job: fleetJob('old-job') }).outcome, 'coalesced');
  assert.equal(step({ operation: 'submit', job: fleetJob('old-job') }).state.jobs.length, 0);
  assert.throws(() => step({ operation: 'submit', job: fleetJob('old-job', 'heavy') }), /Conflicting/);
  assert.equal(step({ operation: 'result', jobKey: job.key, ticket: job.ticket, checkpoint: 1, outcome: 'completed', receipt: fleetReceipt(), usage: { reads: 1, bytes: 64 } }).outcome, 'coalesced');
  assert.throws(() => step({ operation: 'result', jobKey: job.key, ticket: job.ticket, checkpoint: 1, outcome: 'completed', receipt: fleetReceipt(), usage: { reads: 1, bytes: 65 } }), /immutable/);
  assert.throws(() => fleetTransition(state, { operation: 'submit', job: fleetJob('another') }, fleetRoot, fleetTime), /verified ancestry/);
});
test('queued, attempted, uncertain, failed and dependent work cannot archive', () => {
  const completed = complete(fleetInitial(fleetRoot), 'read-one'); const key = completed.jobs[0].key;
  for (const status of ['queued', 'attempted', 'uncertain', 'retry-wait', 'dead', 'blocked']) {
    const state = structuredClone(completed); state.jobs[0].status = status;
    assert.throws(() => fleetTransition(state, archive({ stateDigest: digest(state), jobKeys: [key] }), fleetRoot, fleetTime), /completed work/);
  }
  const state = structuredClone(completed); state.morningRuns = [{ id: 'active', sources: [{ capture: { jobKey: key } }] }];
  assert.throws(() => fleetTransition(state, archive({ stateDigest: digest(state), jobKeys: [key] }), fleetRoot, fleetTime), /dependencies/);
  assert.throws(() => fleetTransition(completed, archive({ stateDigest: digest('wrong'), jobKeys: [key] }), fleetRoot, fleetTime), /state digest/);
});
test('repeated byte pressure is reclaimed explicitly while current correction and original state survive', () => {
  let state = fleetInitial(fleetRoot); const prior = [];
  for (let crossing = 0; crossing < 3; crossing++) {
    let reached = false;
    for (let i = 0; i < 300; i++) {
      try { state = fleetTransition(state, { operation: 'correct', entityId: 'protected', sourceRef: `synthetic-${crossing}-${i}`, reason: 'x'.repeat(4096) }, fleetRoot, fleetTime).state; }
      catch (error) { assert.match(error.message, /byte bound/); reached = true; break; }
    }
    assert.equal(reached, true); prior.push(structuredClone(state)); const latest = state.entities[1].corrections.at(-1);
    state = fleetTransition(state, archive({ stateDigest: digest(state), entityIds: ['protected'] }), fleetRoot, fleetTime).state;
    assert.deepEqual(state.entities[1].corrections, [latest]); assert.ok(Buffer.byteLength(JSON.stringify(state)) < 20000);
  }
  assert.ok(prior.every(state => state.entities[1].corrections.length > 200));
});

import { morningAssessments, morningEntities, morningOpen, morningRoot } from '../verification/morning-fixtures.mjs';
test('forty daily runs and 240 acquisitions continue with old run and job identities retained in ancestry', () => {
  let state = fleetInitial(morningRoot); const records = [morningRoot]; let head = morningRoot; let firstOpen; let firstJob;
  const step = (action, at) => {
    const result = fleetTransition(state, action, morningRoot, at, null, state.archived ? fleetHistory(records, head) : null);
    state = result.state; head = { type: 'fleet-step', hash: digest({ action, at, parent: head.hash, state }), rootHash: morningRoot.hash, parentHash: head.hash, state }; records.push(head); return result;
  };
  for (let n = 0; n < 40; n++) {
    const at = new Date(Date.parse('2026-10-25T01:00:00.000Z') + n * 86400000).toISOString(); const day = at.slice(0, 10);
    const command = { ...morningOpen, runId: day, day }; if (!firstOpen) firstOpen = command;
    step({ operation: 'morning', command }, at);
    const start = new Date(Date.parse(`${day}T00:00:00.000Z`) - 28800000).toISOString(); const window = { start, end: new Date(Date.parse(start) + 86400000).toISOString() };
    for (const entity of morningEntities) {
      const input = { ...fleetJob(`read-${entity.id}`), kind: 'briefing-source-read', occurrence: day, entityIds: [entity.id] }; if (!firstJob) firstJob = input;
      step({ operation: 'submit', job: input }, at); const ticket = step({ operation: 'claim', ownerRef: 'synthetic' }, at).ticket;
      const receipt = { ...fleetReceipt(), observedAt: at, capturedAt: at, scope: entity.scope };
      step({ operation: 'result', jobKey: ticket.key, ticket: ticket.ticket, checkpoint: 1, outcome: 'completed', receipt, usage: { reads: 1, bytes: 64 } }, at);
      step({ operation: 'morning', command: { step: 'source', runId: day, sourceId: entity.id, jobKey: ticket.key, receipt, paginationComplete: true, cached: false, resourceIds: entity.id === 'calendar-inventory' ? ['calendar'] : entity.id === 'task-inventory' ? ['tasks'] : [], messageIds: [], window: ['calendar', 'tasks'].includes(entity.id) ? window : null } }, at);
    }
    const commandStep = (name, fields = {}) => step({ operation: 'morning', command: { step: name, runId: day, ...fields } }, at);
    commandStep('seal', morningAssessments(at, window)); const bodyDigest = state.morningRuns[0].sealed.bodyDigest;
    commandStep('send-intent', { sendRef: `send-${day}`, bodyDigest });
    commandStep('send-ack', { sendRef: `send-${day}`, bodyDigest, deliveredBodyDigest: bodyDigest, nativeId: `native-${day}`, readbackRef: `readback-${day}`, scope: morningOpen.delivery.scope, acquiredAt: at });
    commandStep('summary'); commandStep('edit-gap', { sourceRef: 'synthetic-gap', reason: 'Synthetic fixture explicitly records unsupported edit.' });
    const original = structuredClone(state);
    step(archive({ stateDigest: digest(state), runIds: [day], jobKeys: state.jobs.map(job => job.key) }), at);
    assert.equal(state.morningRuns.length, 0); assert.equal(state.jobs.length, 0); assert.equal(original.morningRuns.length, 1);
  }
  const at = '2026-12-05T01:00:00.000Z';
  assert.equal(step({ operation: 'morning', command: firstOpen }, at).outcome, 'coalesced');
  assert.equal(step({ operation: 'submit', job: firstJob }, at).outcome, 'coalesced'); assert.equal(state.jobs.length, 0);
  assert.throws(() => step({ operation: 'morning', command: { ...firstOpen, ownerRef: 'changed' } }, at), /Conflicting archived/);
});
