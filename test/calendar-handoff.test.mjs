import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessCalendarHandoff } from '../src/calendar-handoff.mjs';
import { assessCalendarRegister } from '../src/calendar-register.mjs';
import { parseDefinition } from '../src/records.mjs';
import { effectKey } from '../src/work.mjs';
import { declareRegisterPolicy, bindRegister, refreshRegisterEvidence, registerHash } from '../verification/calendar-register-fixtures.mjs';
import { timingRegisterFixture as registerFixture, syntheticTimingPacket, syntheticTimingReceipt } from '../verification/calendar-timing-fixtures.mjs';

const policyDigest = 'a'.repeat(64);
const coordinationDefinitionHash = 'b'.repeat(64);
const packet = stage => ({ schemaVersion: 1, stage, executor: stage === 'preflight' ? 'local-executor' : 'dot-cloud', policyDigest, coordinationDefinitionHash });
const rawRun = (input, value) => assessCalendarHandoff(input.snapshot, input.request, value, { evaluatedAt: input.evaluatedAt });
const run = (input, value) => {
  const packet = { ...value, timing: value.timing ?? syntheticTimingPacket(input, value.plan) };
  packet.receipts = value.receipts?.map(receipt => {
    const prepared = value.preflights?.find(row => row.preflightDigest === receipt.preflightDigest)?.timing;
    return receipt.outcome === 'verified' && prepared && !receipt.timing ? { ...receipt, timing: syntheticTimingReceipt(prepared, receipt.observedAt) } : receipt;
  });
  if (value.receipts === undefined) delete packet.receipts;
  return rawRun(input, packet);
};
function prepared() {
  const input = registerFixture();
  const plan = run(input, packet('plan')).plan;
  input.evaluatedAt = '2026-10-27T00:00:01.000Z'; refreshRegisterEvidence(input);
  input.request.visualReview.observedAt = input.evaluatedAt;
  return { input, plan, value: { ...packet('preflight'), plan, operationDigest: plan.operations[0].operationDigest } };
}
function saved() {
  const { input, plan, value } = prepared(); const row = plan.operations[0];
  const preflight = run(input, value).preflight;
  const attemptedAt = '2026-10-27T00:00:02.000Z';
  input.request.attempts = [{ identity: row.prepared.operation.identity, effectKey: row.effectKey, operationDigest: row.operationDigest, prepared: structuredClone(row.prepared), state: 'intent', attemptedAt, evidenceRef: 'original-intent' }];
  input.request.taskSchedules[0].intervals = [{ start: row.prepared.operation.changes.start, end: row.prepared.operation.changes.end }];
  input.evaluatedAt = '2026-10-27T00:00:04.000Z'; refreshRegisterEvidence(input);
  input.request.visualReview.observedAt = input.evaluatedAt;
  input.request.attempts[0].resolution = { kind: 'saved', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'saved-fields-reopened-same-id' };
  const receipt = { planDigest: plan.planDigest, operationDigest: row.operationDigest, preflightDigest: preflight.preflightDigest, identity: row.prepared.operation.identity, itemType: 'task', outcome: 'verified', attemptedAt, observedAt: '2026-10-27T00:00:03.000Z', completedEffectKeys: [row.effectKey], evidenceRef: 'same-id-local-reopen' };
  return { input, plan, receipt, value: { ...packet('accept'), plan, preflights: [preflight], receipts: [receipt] } };
}

test('calendar planning requires explicit dot-cloud while legacy defaults and effects stay stable', async () => {
  const original = JSON.parse(await readFile(new URL('../examples/responsibility.json', import.meta.url), 'utf8'));
  const legacy = structuredClone(original); delete legacy.target.executor;
  assert.equal(parseDefinition(legacy).target.executor, 'local-codex');
  assert.equal(effectKey(parseDefinition(legacy)), effectKey(parseDefinition(original)));
  const coordination = { ...legacy, workClass: 'coordination' };
  assert.equal(parseDefinition(coordination).target.executor, 'local-codex');
  assert.equal(effectKey(parseDefinition(coordination)), effectKey(parseDefinition(original)));
  for (const executor of [undefined, 'local-codex', 'local-work', 'codex-cloud']) {
    const value = structuredClone(original); value.workClass = 'calendar-planning';
    if (executor === undefined) delete value.target.executor; else value.target.executor = executor;
    assert.throws(() => parseDefinition(value), /explicit target.executor dot-cloud/);
  }
  const cloud = structuredClone(original); cloud.workClass = 'calendar-planning'; cloud.target.executor = 'dot-cloud';
  assert.equal(parseDefinition(cloud).target.executor, 'dot-cloud');
});

test('cloud plan uses original prepared operations while fresh local preflight has a new snapshot digest', () => {
  const { input, plan, value } = prepared();
  assert.notEqual(input.request.snapshotDigest, plan.snapshotDigest);
  const result = run(input, value);
  assert.equal(result.status, 'preflight-ready'); assert.equal(result.execution, 'none');
  assert.deepEqual(result.plan, plan);
  assert.equal(plan.operations[0].prepared.operation.identity.environment, 'synthetic');
  assert.throws(() => run(input, { ...value, executor: 'dot-cloud' }), /local executor only preflights/);
});

test('local date, field, identity, representation, context and policy changes return to cloud', () => {
  for (const mutate of [input => { input.request.operations[0].changes.date = '2026-10-28'; }, input => { input.request.operations[0].changes.title += ' changed'; }, input => { input.request.operations[0].identity.nativeId = 'wrong'; }, input => { input.request.operations[0].identity.containerKind = 'calendar'; }, input => { input.request.sources[0].range = 'changed source'; }]) {
    const { input, value } = prepared(); mutate(input); bindRegister(input);
    assert.equal(run(input, value).status, 'return-to-cloud');
  }
  const { input, value } = prepared(); value.policyDigest = 'c'.repeat(64);
  assert.ok(run(input, value).findings.includes('policy-or-context-changed'));
});

test('stale evidence and preflight captured before cloud plan cannot authorize implementation', () => {
  const { input, value } = prepared(); input.evaluatedAt = '2026-10-27T00:02:00.000Z';
  assert.equal(run(input, value).status, 'return-to-cloud');
  const original = registerFixture(); const plan = run(original, packet('plan')).plan;
  const output = run(original, { ...packet('preflight'), plan, operationDigest: plan.operations[0].operationDigest });
  assert.ok(output.findings.includes('preflight-predates-plan'));
});

test('root requires fresh final whole-window same-ID readbacks rather than worker done', () => {
  const { input, value } = saved();
  assert.equal(run(input, value).status, 'accepted-reported');
  input.request.attempts = [];
  assert.equal(run(input, value).status, 'return-to-cloud');
  const next = saved(); next.input.snapshot.acquisition.startedAt = next.receipt.observedAt; bindRegister(next.input);
  next.input.request.attempts[0].resolution.snapshotDigest = next.input.request.snapshotDigest;
  assert.ok(run(next.input, next.value).findings.includes('fresh-final-window-review-required'));
});

test('local failure reports preserve exact target and partial verified effects', () => {
  for (const outcome of ['failed', 'denied', 'pending', 'uncertain']) {
    const { input, value, receipt } = saved();
    value.receipts.push({ ...receipt, outcome, observedAt: '2026-10-27T00:00:03.500Z', evidenceRef: `local-${outcome}`, reason: 'Original provider/UI failure, retained without inferred retry.' });
    const result = run(input, value);
    assert.equal(result.status, 'return-to-cloud');
    assert.deepEqual(result.reports.at(-1).target, receipt.identity);
    assert.deepEqual(result.reports.at(-1).completedEffectKeys, receipt.completedEffectKeys);
    assert.equal(result.reports.at(-1).outcome, outcome);
    assert.equal(result.reports.at(-1).operationId, 'move-one');
  }
});

test('uncertainty stays retained after saved reconciliation and prevents an unresolved retry', () => {
  const { input, value, receipt } = saved();
  input.request.attempts[0].state = 'uncertain'; input.request.attempts[0].evidenceRef = 'first-uncertain';
  const uncertain = { ...receipt, outcome: 'uncertain', observedAt: '2026-10-27T00:00:02.500Z', evidenceRef: 'first-uncertain', completedEffectKeys: [], reason: 'Save response interrupted' };
  assert.ok(run(input, value).findings.includes('original-uncertain-receipt-missing'));
  value.receipts.unshift(uncertain);
  assert.equal(run(input, value).status, 'accepted-reported');
  delete input.request.attempts[0].resolution;
  assert.equal(run(input, { ...value, stage: 'preflight', executor: 'local-executor', operationDigest: value.plan.operations[0].operationDigest }).status, 'return-to-cloud');
  value.receipts[1].itemType = 'event';
  assert.ok(run(input, value).findings.includes('receipt-target-or-type-changed'));
});

test('a two-operation batch retains partial effects and requires fresh serial preflights', () => {
  const input = registerFixture();
  const task = { ...input.snapshot.taskLists[0].tasks[0], id: 'task-two', title: 'Module Paper B attempt', etag: 'second-etag' };
  const identity = { ...input.request.operations[0].identity, nativeId: task.id };
  input.snapshot.taskLists[0].tasks.push(task);
  input.request.taskSchedules.push({ ...structuredClone(input.request.taskSchedules[0]), identity, taskDigest: registerHash(task) });
  input.request.sources.push({ ...structuredClone(input.request.sources[0]), id: 'paper-two', occurrenceId: 'paper-two', assignmentId: 'paper-b', identity, name: 'Paper B attempt' });
  input.request.operations.push({ ...structuredClone(input.request.operations[0]), id: 'move-two', identity, sourceId: 'paper-two', baselineDigest: registerHash({ native: task, intervals: [] }), changes: { ...input.request.operations[0].changes, title: task.title, start: '2026-10-27T19:00:00+08:00', end: '2026-10-27T20:00:00+08:00' } });
  declareRegisterPolicy(input);
  const plan = run(input, packet('plan')).plan; assert.equal(plan.operations.length, 2);
  const first = plan.operations[0]; const second = plan.operations[1];
  input.evaluatedAt = '2026-10-27T00:00:01.000Z'; refreshRegisterEvidence(input);
  input.request.visualReview.observedAt = input.evaluatedAt;
  const firstPreflight = run(input, { ...packet('preflight'), plan, operationDigest: first.operationDigest }).preflight;
  const earlySecond = run(input, { ...packet('preflight'), plan, operationDigest: second.operationDigest }).preflight;
  const oldInputLater = structuredClone(input); oldInputLater.evaluatedAt = '2026-10-27T00:00:04.000Z';
  const delayedSecond = run(oldInputLater, { ...packet('preflight'), plan, operationDigest: second.operationDigest }).preflight;
  assert.equal(delayedSecond.evidenceOldestAt, '2026-10-27T00:00:01.000Z');
  const attemptedAt = '2026-10-27T00:00:02.000Z';
  input.request.attempts = [{ identity: first.prepared.operation.identity, effectKey: first.effectKey, operationDigest: first.operationDigest, prepared: first.prepared, state: 'intent', attemptedAt, evidenceRef: 'first-intent' }];
  input.request.taskSchedules[0].intervals = [{ start: first.prepared.operation.changes.start, end: first.prepared.operation.changes.end }];
  input.evaluatedAt = '2026-10-27T00:00:04.000Z'; refreshRegisterEvidence(input); input.request.visualReview.observedAt = input.evaluatedAt;
  input.request.attempts[0].resolution = { kind: 'saved', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'first-same-id-reopen' };
  const firstReceipt = { planDigest: plan.planDigest, operationDigest: first.operationDigest, preflightDigest: firstPreflight.preflightDigest, identity: first.prepared.operation.identity, itemType: 'task', outcome: 'verified', attemptedAt, observedAt: '2026-10-27T00:00:03.000Z', completedEffectKeys: [first.effectKey], evidenceRef: 'first-reopened' };
  const secondPreflight = run(input, { ...packet('preflight'), plan, operationDigest: second.operationDigest, preflights: [firstPreflight], receipts: [firstReceipt] });
  assert.equal(secondPreflight.status, 'preflight-ready');
  const old = structuredClone(input); old.evaluatedAt = '2026-10-27T00:00:02.500Z'; refreshRegisterEvidence(old);
  old.evaluatedAt = input.evaluatedAt; old.request.visualReview.observedAt = '2026-10-27T00:00:02.500Z'; old.request.attempts[0].resolution.snapshotDigest = old.request.snapshotDigest;
  const stale = run(old, { ...packet('preflight'), plan, operationDigest: second.operationDigest, preflights: [firstPreflight], receipts: [firstReceipt] });
  assert.ok(stale.findings.includes('fresh-preflight-window-required')); assert.ok(stale.findings.includes('fresh-preflight-native-readback-required'));
  const secondReceipt = { ...firstReceipt, operationDigest: second.operationDigest, preflightDigest: secondPreflight.preflight.preflightDigest, identity: second.prepared.operation.identity, outcome: 'uncertain', attemptedAt: '2026-10-27T00:00:05.000Z', observedAt: '2026-10-27T00:00:05.500Z', evidenceRef: 'second-interrupted', reason: 'Second save interrupted' };
  input.evaluatedAt = '2026-10-27T00:00:06.000Z'; refreshRegisterEvidence(input); input.request.visualReview.observedAt = input.evaluatedAt;
  input.request.attempts[0].resolution.snapshotDigest = input.request.snapshotDigest;
  const result = run(input, { ...packet('accept'), plan, preflights: [firstPreflight, secondPreflight.preflight], receipts: [firstReceipt, secondReceipt] });
  assert.equal(result.status, 'return-to-cloud');
  assert.deepEqual(result.assessment.proposals.map(row => row.status), ['already-saved', 'proposed']);
  assert.deepEqual(result.reports[1].completedEffectKeys, [first.effectKey]);
  assert.equal(result.reports[1].target.nativeId, 'task-two');
  const complete = structuredClone(input);
  complete.request.taskSchedules[1].intervals = [{ start: second.prepared.operation.changes.start, end: second.prepared.operation.changes.end }];
  complete.request.attempts.push({ identity: second.prepared.operation.identity, effectKey: second.effectKey, operationDigest: second.operationDigest, prepared: second.prepared, state: 'intent', attemptedAt: secondReceipt.attemptedAt, evidenceRef: 'second-intent' });
  complete.evaluatedAt = '2026-10-27T00:00:07.000Z'; refreshRegisterEvidence(complete); complete.request.visualReview.observedAt = complete.evaluatedAt;
  for (const attempt of complete.request.attempts) attempt.resolution = { kind: 'saved', snapshotDigest: complete.request.snapshotDigest, evidenceRef: 'fresh-same-id-root-readback' };
  const verifiedSecond = { ...secondReceipt, outcome: 'verified', observedAt: '2026-10-27T00:00:06.000Z', completedEffectKeys: [first.effectKey, second.effectKey], reason: null };
  const acceptedPacket = { ...packet('accept'), plan, preflights: [firstPreflight, secondPreflight.preflight], receipts: [firstReceipt, verifiedSecond] };
  assert.equal(run(complete, acceptedPacket).status, 'accepted-reported');
  const presigned = structuredClone(acceptedPacket); presigned.preflights[1] = earlySecond; presigned.receipts[1].preflightDigest = earlySecond.preflightDigest;
  assert.ok(run(complete, presigned).findings.includes('preflight-predates-prior-local-effect'));
  const renewedOldInput = structuredClone(acceptedPacket); renewedOldInput.preflights[1] = delayedSecond; renewedOldInput.receipts[1].preflightDigest = delayedSecond.preflightDigest;
  assert.ok(run(complete, renewedOldInput).findings.includes('preflight-predates-prior-local-effect'));
  const futureCount = structuredClone(acceptedPacket); futureCount.receipts[0].completedEffectKeys.push(second.effectKey);
  assert.ok(run(complete, futureCount).findings.includes('completed-effect-not-yet-verified'));
  complete.request.attempts[0].state = 'uncertain'; complete.request.attempts[0].evidenceRef = 'first-uncertain';
  complete.evaluatedAt = '2026-10-27T00:00:09.000Z'; refreshRegisterEvidence(complete); complete.request.visualReview.observedAt = complete.evaluatedAt;
  for (const attempt of complete.request.attempts) attempt.resolution.snapshotDigest = complete.request.snapshotDigest;
  const unresolved = structuredClone(acceptedPacket);
  unresolved.receipts = [{ ...firstReceipt, outcome: 'uncertain', observedAt: '2026-10-27T00:00:02.500Z', completedEffectKeys: [], evidenceRef: 'first-uncertain', reason: 'First outcome unresolved' }, verifiedSecond, { ...firstReceipt, observedAt: '2026-10-27T00:00:08.000Z' }];
  assert.ok(run(complete, unresolved).findings.includes('unresolved-prior-effect-before-attempt'));
});

test('local evidence age can tighten but cannot widen the cloud plan ceiling', () => {
  const tight = prepared(); tight.input.request.maxEvidenceAgeMs = 1000;
  assert.equal(run(tight.input, tight.value).status, 'preflight-ready');
  const old = prepared(); old.input.request.maxEvidenceAgeMs = 86400000; old.input.evaluatedAt = '2026-10-27T00:02:00.000Z';
  assert.ok(run(old.input, old.value).findings.includes('evidence-age-widened'));
});

test('native timing supplements must be acquired in the current preflight and final phase', () => {
  const before = prepared(); before.input.request.taskSchedules[0].observedAt = '2026-10-26T23:59:59.000Z';
  assert.ok(run(before.input, before.value).findings.includes('fresh-preflight-native-readback-required'));
  const after = saved(); after.input.request.taskSchedules[0].observedAt = '2026-10-27T00:00:02.100Z';
  assert.ok(run(after.input, after.value).findings.includes('fresh-final-native-readback-required'));
});

test('an uncertain outcome permits same-attempt reconciliation rather than a second local write', () => {
  const { input, value, receipt } = saved();
  input.request.attempts[0].state = 'uncertain'; input.request.attempts[0].evidenceRef = 'first-uncertain';
  value.receipts.unshift({ ...receipt, outcome: 'uncertain', observedAt: '2026-10-27T00:00:02.500Z', evidenceRef: 'first-uncertain', completedEffectKeys: [], reason: 'Original interrupted save' });
  value.receipts[1].attemptedAt = '2026-10-27T00:00:02.750Z';
  const result = run(input, value);
  assert.ok(result.findings.includes('new-local-attempt-requires-cloud-plan'));
  assert.ok(result.findings.includes('original-before-state-attempt-required'));
});

test('acceptance requires the retained successful preflight and refuses reapplication of a reported effect', () => {
  const noProof = saved(); noProof.value.preflights = [];
  assert.ok(run(noProof.input, noProof.value).findings.includes('successful-preflight-required'));
  const prior = saved(); prior.input.request.attempts = []; prior.input.request.taskSchedules[0].intervals = [];
  prior.value.receipts[0].completedEffectKeys = [];
  const result = run(prior.input, { ...prior.value, stage: 'preflight', executor: 'local-executor', operationDigest: prior.plan.operations[0].operationDigest });
  assert.ok(result.findings.includes('preflight-not-unapplied'));
});

test('preflight expiry comes from original evidence age rather than the later evaluation clock', () => {
  const initial = prepared(); initial.input.evaluatedAt = '2026-10-27T00:01:00.000Z';
  const proof = run(initial.input, initial.value).preflight;
  assert.equal(proof.evidenceOldestAt, '2026-10-27T00:00:01.000Z');
  assert.equal(proof.validUntil, '2026-10-27T00:01:01.000Z');
  const final = saved(); final.value.preflights = [proof]; final.receipt.preflightDigest = proof.preflightDigest;
  final.receipt.attemptedAt = '2026-10-27T00:01:40.000Z'; final.receipt.observedAt = '2026-10-27T00:01:41.000Z';
  final.input.request.attempts[0].attemptedAt = final.receipt.attemptedAt;
  final.input.evaluatedAt = '2026-10-27T00:01:42.000Z'; refreshRegisterEvidence(final.input); final.input.request.visualReview.observedAt = final.input.evaluatedAt;
  final.input.request.attempts[0].resolution.snapshotDigest = final.input.request.snapshotDigest;
  assert.ok(run(final.input, final.value).findings.includes('successful-preflight-required'));
});

test('timed handoffs require a timing contract at plan, preflight and legacy acceptance', () => {
  const initial = registerFixture();
  assert.ok(rawRun(initial, packet('plan')).findings.includes('timing-contract-required'));
  const before = prepared();
  assert.ok(rawRun(before.input, before.value).findings.includes('timing-contract-required'));
  const final = saved();
  const legacy = structuredClone(final.value);
  delete legacy.plan.timing;
  const { planDigest, ...planBody } = legacy.plan;
  legacy.plan.planDigest = registerHash(planBody);
  for (const preflight of legacy.preflights) {
    delete preflight.timing; preflight.planDigest = legacy.plan.planDigest;
    const { preflightDigest, ...preflightBody } = preflight;
    preflight.preflightDigest = registerHash(preflightBody);
  }
  for (const receipt of legacy.receipts) { receipt.planDigest = legacy.plan.planDigest; receipt.preflightDigest = legacy.preflights[0].preflightDigest; }
  const output = rawRun(final.input, legacy);
  assert.equal(output.status, 'return-to-cloud');
  assert.ok(output.findings.includes('timing-contract-required'));
  assert.deepEqual(output.reports[0].completedEffectKeys, []);
});

test('immutable target selectors and fresh account/interface/zone observations bind every phase', () => {
  const before = prepared();
  const timing = syntheticTimingPacket(before.input, before.plan);
  for (const mutate of [
    value => { value.targets[0].target.targetInterface = 'standalone-tasks-editor'; },
    value => { value.observations[0].zoneObservation.executionEnvironment.epoch = 'changed-epoch'; },
    value => { value.observations[0].zoneObservation.inputTimeZone = 'Asia/Bangkok'; },
    value => { value.observations[0].zoneObservation.accountId = 'other@example.test'; },
    value => { value.observations[0].zoneObservation.observedAt = before.plan.issuedAt; },
    value => { value.observations[0].zoneObservation.observedAt = '2026-10-27T00:00:02.000Z'; },
  ]) {
    const changed = structuredClone(timing); mutate(changed);
    assert.equal(rawRun(before.input, { ...before.value, timing: changed }).status, 'return-to-cloud');
  }
  const final = saved();
  const finalTiming = syntheticTimingPacket(final.input, final.plan);
  finalTiming.observations[0].zoneObservation.observedAt = final.receipt.observedAt;
  assert.ok(run(final.input, { ...final.value, timing: finalTiming }).findings.includes('fresh-zone-observation-required'));
});

test('timing mismatch or projection-only receipt returns no verified receipt effects', () => {
  for (const mutate of [
    value => { value.preparedDigest = 'f'.repeat(64); },
    value => { value.submittedInput.start.time = '16:00'; },
    value => { value.readback.start.time = '16:00'; },
    value => { value.readback.timeZone = 'Asia/Bangkok'; },
    value => { value.readback.nativeIdentity = null; value.readback.projectionId = 'stable-projection'; },
    value => { value.readback.nativeIdentity.nativeId = 'different-native-task'; },
  ]) {
    const final = saved();
    final.receipt.timing = syntheticTimingReceipt(final.value.preflights[0].timing, final.receipt.observedAt);
    mutate(final.receipt.timing);
    const result = run(final.input, final.value);
    assert.equal(result.status, 'return-to-cloud'); assert.deepEqual(result.reports[0].completedEffectKeys, []);
  }
});

test('root timing readback must be independently fresh after all receipts', () => {
  const final = saved(); const timing = syntheticTimingPacket(final.input, final.plan);
  timing.observations[0].readback.observedAt = final.receipt.observedAt;
  assert.ok(run(final.input, { ...final.value, timing }).findings.includes('fresh-calendar-readback-required'));
  timing.observations[0].readback.observedAt = final.input.evaluatedAt;
  timing.observations[0].readback.end.time = '17:00';
  assert.ok(run(final.input, { ...final.value, timing }).findings.includes('calendar-sgt-interval-mismatch'));
});

test('root tightened age applies to final timing readback without changing original receipt expiry', () => {
  const final = saved(); final.input.request.maxEvidenceAgeMs = 500;
  const timing = syntheticTimingPacket(final.input, final.plan);
  timing.observations[0].readback.observedAt = '2026-10-27T00:00:03.250Z';
  assert.ok(run(final.input, { ...final.value, timing }).findings.includes('fresh-calendar-readback-required'));
  timing.observations[0].readback.observedAt = final.input.evaluatedAt;
  assert.equal(run(final.input, { ...final.value, timing }).status, 'accepted-reported');
});

test('date-only edits require complete canonical timing while untimed title edits keep legacy behavior', () => {
  for (const changes of [{ date: '2026-10-27' }, { timeZone: 'Asia/Singapore' }]) {
    const input = registerFixture(); input.request.operations[0].changes = changes; bindRegister(input);
    assert.ok(rawRun(input, packet('plan')).findings.includes('complete-canonical-timing-required'));
  }
  const input = registerFixture();
  input.request.operations[0].changes = { title: input.snapshot.taskLists[0].tasks[0].title }; bindRegister(input);
  const plan = rawRun(input, packet('plan')).plan;
  assert.ok(plan); assert.equal(plan.timing, undefined);
  input.evaluatedAt = '2026-10-27T00:00:01.000Z'; refreshRegisterEvidence(input); input.request.visualReview.observedAt = input.evaluatedAt;
  const row = plan.operations[0];
  const preflight = rawRun(input, { ...packet('preflight'), plan, operationDigest: row.operationDigest }).preflight;
  assert.ok(preflight); assert.equal(preflight.timing, undefined);
  const attemptedAt = '2026-10-27T00:00:02.000Z';
  input.request.attempts = [{ identity: row.prepared.operation.identity, effectKey: row.effectKey, operationDigest: row.operationDigest, prepared: row.prepared, state: 'intent', attemptedAt, evidenceRef: 'untimed-original-intent' }];
  input.evaluatedAt = '2026-10-27T00:00:04.000Z'; refreshRegisterEvidence(input); input.request.visualReview.observedAt = input.evaluatedAt;
  input.request.attempts[0].resolution = { kind: 'saved', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'untimed-same-id-readback' };
  const receipt = { planDigest: plan.planDigest, operationDigest: row.operationDigest, preflightDigest: preflight.preflightDigest, identity: row.prepared.operation.identity, itemType: 'task', outcome: 'verified', attemptedAt, observedAt: '2026-10-27T00:00:03.000Z', completedEffectKeys: [row.effectKey], evidenceRef: 'untimed-verified' };
  assert.equal(rawRun(input, { ...packet('accept'), plan, preflights: [preflight], receipts: [receipt] }).status, 'accepted-reported');
});

test('SGT conflict planning refuses a newly occupied canonical slot', () => {
  const input = registerFixture();
  const changes = input.request.operations[0].changes;
  input.snapshot.calendars[0].events.push({ id: 'sgt-conflict', summary: 'Owner conflict', status: 'confirmed', start: { dateTime: changes.start, timeZone: 'Asia/Singapore' }, end: { dateTime: changes.end, timeZone: 'Asia/Singapore' } });
  bindRegister(input);
  const result = run(input, packet('plan'));
  assert.equal(result.status, 'return-to-cloud'); assert.ok(result.assessment.proposals[0].findings.includes('overlap'));
});

test('a valid Event timing proposal cannot bypass the supported Task editor routes', () => {
  const input = registerFixture();
  const event = input.snapshot.calendars[0].events[0];
  const identity = { ...input.request.operations[0].identity, containerKind: 'calendar', containerId: 'calendar-one', nativeId: event.id };
  input.request.operations[0].identity = identity;
  input.request.operations[0].baselineDigest = registerHash({ native: event, intervals: [{ start: new Date(event.start.dateTime).toISOString(), end: new Date(event.end.dateTime).toISOString() }] });
  input.request.sources[0].identity = identity;
  declareRegisterPolicy(input);
  const rule = { id: 'event-owner-replan', identity, occurrenceId: input.request.sources[0].occurrenceId, changes: { start: input.request.operations[0].changes.start, end: input.request.operations[0].changes.end }, observedAt: input.snapshot.acquisition.completedAt, evidenceRef: 'synthetic-owner-replan', supersedes: null };
  input.request.policy.ownerRules.push(rule); input.snapshot.policy = structuredClone(input.request.policy); bindRegister(input);
  assert.equal(assessCalendarRegister(input.snapshot, input.request, { evaluatedAt: input.evaluatedAt }).status, 'proposed');
  const result = rawRun(input, packet('plan'));
  assert.equal(result.status, 'return-to-cloud'); assert.ok(result.findings.includes('unsupported-timing-interface'));
});
