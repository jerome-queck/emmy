import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetInitial, fleetTransition, captureCondition, fleetView } from '../src/fleet-state.mjs';
import { signinDecision } from '../src/signin.mjs';
import { actionInput } from '../src/fleet-schema.mjs';
import { strictJson } from '../src/bounded-json.mjs';
import { fleetCapture, fleetEntities, fleetJob, fleetReceipt, fleetRoot, fleetTime } from '../verification/fleet-fixtures.mjs';

const healthy = () => fleetTransition(fleetInitial(fleetRoot), { operation: 'assess', captures: fleetEntities.map(row => fleetCapture(row.id)) }, fleetRoot, fleetTime).state;
test('fresh failures remain distinct; source age, coverage and monitor failure cannot borrow green', () => {
  const state = healthy(); const row = state.entities[1];
  for (const code of ['login-expired', 'denied-action', 'unavailable-tool', 'timeout', 'resource-pressure', 'monitoring-failed', 'workflow-failed', 'suspended', 'unknown', 'pending']) assert.equal(captureCondition(row, fleetCapture('protected', code), state, {}, fleetTime).condition, code);
  assert.equal(captureCondition(row, fleetCapture(), state, { maxAgeMs: 10 }, '2026-10-25T12:00:00.011Z').condition, 'stale-source');
  assert.equal(captureCondition(row, fleetCapture('protected', 'healthy', fleetTime, { receipt: fleetReceipt('protected', fleetTime, { coverage: { complete: false, gaps: ['missing page'] } }) }), state, { maxAgeMs: 1000 }, fleetTime).condition, 'unknown');
  state.entities[0].capture = fleetCapture('monitor', 'monitoring-failed');
  assert.equal(captureCondition(row, fleetCapture(), state, { maxAgeMs: 1000 }, fleetTime).issueKey, 'monitor-unavailable');
});
test('unchanged failures coalesce; exact dismissal persists and recurrence reopens', () => {
  let state = healthy(); assert.equal(state.alerts.length, 0);
  const fail = at => ({ operation: 'assess', captures: [fleetCapture('protected', 'login-expired', at)] });
  state = fleetTransition(state, fail('2026-10-25T12:00:01.000Z'), fleetRoot, '2026-10-25T12:00:01.000Z').state;
  const id = state.alerts[0].id;
  state = fleetTransition(state, fail('2026-10-25T12:00:02.000Z'), fleetRoot, '2026-10-25T12:00:02.000Z').state; assert.equal(state.alerts.length, 1);
  state = fleetTransition(state, { operation: 'dismiss', alertId: id, sourceRef: 'owner correction', reason: 'Dismiss this exact old episode.' }, fleetRoot, '2026-10-25T12:00:02.000Z').state;
  assert.ok(state.alerts[0].disposition); assert.equal(state.entities[1].condition, 'login-expired');
  state = fleetTransition(state, { operation: 'assess', captures: [fleetCapture('protected', 'healthy', '2026-10-25T12:00:03.000Z')] }, fleetRoot, '2026-10-25T12:00:03.000Z').state;
  assert.equal(state.alerts.at(-1).condition, 'recovered');
  state = fleetTransition(state, fail('2026-10-25T12:00:04.000Z'), fleetRoot, '2026-10-25T12:00:04.000Z').state;
  assert.equal(state.alerts.length, 3); assert.notEqual(state.alerts.at(-1).id, id);
});
test('parent reads commit admission; uncertain attempts block duplicates and require exact receipts', () => {
  let state = healthy(); const submit = { operation: 'submit', job: fleetJob() };
  state = fleetTransition(state, submit, fleetRoot, fleetTime).state;
  state = fleetTransition(state, submit, fleetRoot, fleetTime).state; assert.equal(state.jobs.length, 1);
  assert.throws(() => fleetTransition(state, { ...submit, job: fleetJob('read-one', 'heavy') }, fleetRoot, fleetTime), /Conflicting request/);
  const claimed = fleetTransition(state, { operation: 'claim', ownerRef: 'fixture-parent' }, fleetRoot, fleetTime); state = claimed.state; assert.ok(claimed.ticket);
  const job = state.jobs[0]; const late = '2026-10-25T12:05:00.001Z';
  const expired = fleetTransition(state, { operation: 'assess', captures: [] }, fleetRoot, late).state;
  assert.equal(expired.jobs[0].status, 'uncertain');
  assert.equal(fleetTransition(expired, { operation: 'claim', ownerRef: 'other' }, fleetRoot, late).ticket, null);
  const result = { operation: 'result', jobKey: job.key, ticket: job.ticket, checkpoint: 1, outcome: 'completed', usage: { reads: 1, bytes: 4096 }, receipt: fleetReceipt('protected', fleetTime) };
  assert.throws(() => fleetTransition(expired, result, fleetRoot, late), /exact reconciliation/);
  const resolved = fleetTransition(expired, { ...result, operation: 'resolve', reason: 'Inspected actual retained parent read.' }, fleetRoot, late).state;
  assert.equal(resolved.jobs[0].status, 'completed');
  assert.equal(fleetTransition(resolved, { ...result, operation: 'resolve', reason: 'Inspected actual retained parent read.' }, fleetRoot, late).outcome, 'coalesced');
  assert.equal(fleetTransition(resolved, submit, fleetRoot, late).state.jobs.length, 1);
});
test('completed runs need actual outcome and delivery; disabled and missed monitoring are loud', () => {
  const state = healthy(); const row = state.entities[2];
  for (const [overrides, issue] of [[{ enabled: false }, 'disabled-run'], [{ runRef: undefined }, 'missed-run'], [{ outcomeRef: undefined }, 'outcome-missing'], [{ deliveryRef: undefined }, 'delivery-unverified']]) assert.equal(captureCondition(row, fleetCapture('routine', 'healthy', fleetTime, overrides), state, { maxAgeMs: 1000 }, fleetTime).issueKey, issue);
  assert.equal(captureCondition(row, fleetCapture('routine', 'healthy', fleetTime, { runDueAt: '2026-10-25T10:00:00.000Z' }), state, { maxAgeMs: 1000 }, fleetTime).issueKey, 'missed-run');
});
test('inventory revisions stay in one controller and preserve exact scope and freshness', () => {
  const action = { operation: 'inventory', entities: [{ ...fleetEntities[1], maxAgeMs: 1000 }], sourceRef: 'current-owner-source', reason: 'Tighten the same protected account.' };
  const revised = fleetTransition(healthy(), action, fleetRoot, fleetTime).state; assert.equal(revised.entities[1].expected.maxAgeMs, 1000); assert.equal(revised.entities[1].corrections.length, 1);
  assert.throws(() => fleetTransition(healthy(), { ...action, entities: [{ ...fleetEntities[1], scope: { ...fleetEntities[1].scope, account: 'other' } }] }, fleetRoot, fleetTime), /rebind/);
  assert.throws(() => fleetTransition(healthy(), { ...action, entities: [{ ...fleetEntities[1], maxAgeMs: 300001 }] }, fleetRoot, fleetTime), /freshness/);
});
test('message send and separate readback are distinct; uncertain sends never replay automatically', () => {
  let state = fleetTransition(healthy(), { operation: 'assess', captures: [fleetCapture('protected', 'denied-action', '2026-10-25T12:00:01.000Z')] }, fleetRoot, '2026-10-25T12:00:01.000Z').state;
  const action = { operation: 'send-intent', alertId: state.alerts[0].id, bodyDigest: 'a'.repeat(64), sendRef: 'parent-send' };
  state = fleetTransition(state, action, fleetRoot, fleetTime).state; assert.equal(state.alerts[0].delivery, 'uncertain');
  assert.throws(() => fleetTransition(state, action, fleetRoot, fleetTime), /already attempted/);
  assert.throws(() => fleetTransition(state, { ...action, operation: 'send-ack', readbackRef: 'parent-send' }, fleetRoot, fleetTime), /readback/);
  state = fleetTransition(state, { ...action, operation: 'send-ack', readbackRef: 'separate-parent-readback' }, fleetRoot, fleetTime).state; assert.equal(state.alerts[0].delivery, 'delivered');
});
test('strict boundaries reject duplicate keys, secrets, unsupported work and recursive monitors', () => {
  assert.throws(() => strictJson('{"a":1,"a":2}'), /Duplicate/);
  assert.throws(() => strictJson('{"__proto__":{}}'), /unsafe/);
  assert.throws(() => actionInput({ operation: 'submit', job: { ...fleetJob(), command: 'hidden shell' } }), /fields/);
  assert.throws(() => actionInput({ operation: 'submit', job: fleetJob(), captures: [{ password: 'synthetic-unused-secret-field' }] }), /fields/);
  assert.throws(() => actionInput({ operation: 'configure', entities: [{ ...fleetEntities[0], monitorId: 'other' }] }), /monitor/);
  assert.throws(() => signinDecision({ password: 'synthetic-never-a-real-secret' }, fleetTime), /fields/);
  const signin = { schemaVersion: 1, service: 'fixture', account: 'owner', provider: 'fixture', environment: 'fixture', surface: 'browser', sourceRef: 'fixture', observedAt: fleetTime, state: 'password', secureForm: true };
  assert.throws(() => signinDecision({ ...signin, denial: { password: 'synthetic-unused-secret' } }, fleetTime), /Denial metadata/);
  assert.throws(() => signinDecision({ ...signin, mfa: { password: 'synthetic-unused-secret' } }, fleetTime), /MFA metadata/);
  assert.throws(() => signinDecision({ ...signin, observedAt: '2026-10-25T10:00:00.000Z', state: 'denied', denial: { password: 'synthetic-stale-secret-field' } }, fleetTime), /fields/);
  assert.throws(() => signinDecision({ ...signin, observedAt: '2026-10-25T10:00:00.000Z', state: 'mfa', mfa: { password: 'synthetic-stale-secret-field' } }, fleetTime), /MFA handoff/);
});
test('successful acquisitions stay inside the ticket interval; delayed reconciliation does not refresh old work', () => {
  let state = fleetTransition(healthy(), { operation: 'submit', job: fleetJob() }, fleetRoot, fleetTime).state;
  state = fleetTransition(state, { operation: 'claim', ownerRef: 'fixture-parent' }, fleetRoot, fleetTime).state;
  const job = state.jobs[0]; const late = '2026-10-25T12:05:00.001Z';
  const result = { operation: 'resolve', jobKey: job.key, ticket: job.ticket, checkpoint: 1, outcome: 'completed', reason: 'Inspect original receipt.', usage: { reads: 1, bytes: 4096 }, receipt: fleetReceipt('protected', late) };
  assert.throws(() => fleetTransition(state, result, fleetRoot, late), /after the ticket deadline/);
  const oldSource = fleetReceipt('protected', fleetTime, { observedAt: '2026-10-25T11:00:00.000Z' });
  assert.equal(fleetTransition(state, { ...result, receipt: oldSource }, fleetRoot, late).state.jobs[0].status, 'completed');
  const noEffect = { ...result, checkpoint: 0, outcome: 'known-unexecuted', usage: { reads: 0, bytes: 32 } };
  assert.equal(fleetTransition(state, noEffect, fleetRoot, late).state.jobs[0].status, 'retry-wait');
});
test('sign-in chooses secure form, matching one-use OTP, scoped retry and protected account verification', () => {
  const input = { schemaVersion: 1, service: 'fixture-service', account: 'fixture-owner', provider: 'fixture-provider', environment: 'fixture-parent', surface: 'browser', sourceRef: 'fixture-current-login', observedAt: fleetTime, state: 'password', secureForm: true, authHandoff: true };
  assert.equal(signinDecision(input, fleetTime).status, 'secure-form-needed');
  assert.equal(signinDecision({ ...input, state: 'mfa', mfa: 'otp', issuingService: 'other' }, fleetTime).status, 'issuer-mismatch-stop');
  assert.equal(signinDecision({ ...input, state: 'mfa', mfa: 'otp', loginService: input.service, issuingService: input.service }, fleetTime).status, 'current-otp-needed');
  assert.equal(signinDecision({ ...input, state: 'mfa', mfa: 'otp', loginService: input.provider, issuingService: input.provider }, fleetTime).status, 'current-otp-needed');
  assert.equal(signinDecision({ ...input, state: 'authenticated', protectedContent: true, protectedAccount: 'another-account' }, fleetTime).status, 'verification-needed');
  const recovered = signinDecision({ ...input, state: 'authenticated', protectedContent: true, protectedAccount: input.account }, fleetTime); assert.equal(recovered.status, 'recovered'); assert.equal(recovered.otherSurface, 'unverified');
  const denied = { ...input, state: 'denied', denial: { sourceRef: 'exact-denial', scope: 'mail-read', knownUnexecuted: true, persistent: false } };
  assert.equal(signinDecision(denied, fleetTime).status, 'denied-stop');
  const retry = { count: 0, authorizationRef: 'fresh-owner-scope', scope: 'mail-read', materialChange: 'Owner explicitly allowed the missing read scope.' };
  assert.equal(signinDecision({ ...denied, retry }, fleetTime).status, 'one-bounded-retry');
  assert.equal(signinDecision({ ...denied, retry: { ...retry, count: 1 } }, fleetTime).status, 'denied-stop');
  assert.equal(signinDecision({ ...denied, denial: { ...denied.denial, persistent: true }, retry }, fleetTime).status, 'denied-stop');
});
