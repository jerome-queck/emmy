import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareAcademicOsTaskPlan, assessAcademicOsTaskResult } from '../src/academic-os-task-plan.mjs';
import { academicOsPlanFixture } from '../verification/academic-os-plan-fixtures.mjs';

const now = '2026-10-28T00:00:00.000Z';
const fixture = (name, kind) => academicOsPlanFixture(name, now, kind);
const prepare = input => prepareAcademicOsTaskPlan(input.intent, input.observation, { evaluatedAt: input.evaluatedAt });
const receipt = (prepared, outcome = 'applied', taskId = 'task-one') => ({ attemptedAt: now, observedAt: now, evidenceRef: 'synthetic-original-result', report: { schemaVersion: 1, operationId: prepared.intent.operationId, outcome, taskId, registerFresh: outcome === 'applied' }, isError: outcome !== 'applied' });
const assess = (prepared, reply) => assessAcademicOsTaskResult(prepared, reply, { evaluatedAt: now });

test('current API proposals require retained semantic association and current policy baseline', () => {
  for (const name of ['create', 'change', 'complete']) for (const mutate of [
    input => { delete input.intent.policy; },
    input => { delete input.observation.policy; },
    input => { input.intent.source.name = 'Worksheet Q5'; if (name !== 'complete') input.intent.operation.title = 'Module Worksheet Q5'; },
    input => { input.intent.policy.ownerRules = []; input.observation.policy.ownerRules.push({ oldRule: true }); },
    input => { input.intent.source.occurrenceId = 'other-assignment'; },
  ]) {
    const input = fixture(name); mutate(input);
    const result = prepare(input); assert.equal(result.status, 'return-to-cloud'); assert.equal(result.call, null);
  }
});
test('API corrections require the original timed attempt and permit its completed exact occurrence', () => {
  for (const kind of [null, 'whole-source', 'timed-attempt']) {
    const input = fixture('create'); input.intent.source.kind = 'correction';
    const occurrence = input.intent.policy.occurrences[0]; occurrence.kind = 'correction';
    if (kind) { occurrence.predecessors = ['original-attempt']; input.intent.policy.occurrences.push({ ...occurrence, id: 'original-attempt', kind, predecessors: [], state: 'completed' }); }
    input.observation.policy = structuredClone(input.intent.policy);
    const result = prepare(input);
    assert.equal(result.status, kind === 'timed-attempt' ? 'api-plan-ready-reported' : 'return-to-cloud');
  }
});

test('module and research create/change/complete emit only literal task-plan/1 fields and preserve associations', () => {
  for (const kind of ['module', 'research-project']) for (const name of ['create', 'change', 'complete']) {
    const input = fixture(name, kind);
    const result = prepare(input);
    assert.equal(result.status, 'api-plan-ready-reported');
    const expected = { schemaVersion: 1, operationId: input.intent.operationId, target: input.intent.target, listId: 'list-one', expectedSnapshot: 'a'.repeat(64), operation: name === 'create' ? input.intent.operation : name === 'change' ? { name, title: input.intent.operation.title, taskId: 'task-one' } : { name, taskId: 'task-one' }, ...(name === 'create' ? { sourceOccurrenceId: 'source-one-occurrence-one' } : {}), policyVersion: 'c'.repeat(64) };
    assert.deepEqual(result.prepared.apiPlan, expected);
    assert.deepEqual(JSON.parse(result.call.arguments.plan_json), expected);
    assert.deepEqual(result.prepared.intent, input.intent);
    assert.equal(result.call.tool, 'tasks_apply_plan');
    assert.equal(result.execution, 'none');
    assert.equal(result.nativeVerified, false);
    assert.equal(JSON.stringify(result).includes('synthetic-private-note-not-for-plan-output'), false);
    assert.equal(JSON.stringify(result).includes('Unpushed local draft'), false);
    assert.deepEqual(result.completedEffectKeys, []);
    const replay = prepare(input);
    assert.deepEqual(replay, result);
    input.intent.operation.name = 'bad';
    assert.equal(result.prepared.apiPlan.operation.name, name);
  }
});

test('read protocol, original token, exact target/list/account and verified generation are independent guards', () => {
  for (const mutate of [
    x => { delete x.observation.result.report.execution; },
    x => { x.observation.result.report.execution.expectedSnapshot = x.intent.nativeSnapshotDigest; },
    x => { x.observation.result.report.register.providerSnapshot = '3'.repeat(64); },
    x => { x.observation.result.report.execution.target = { ...x.intent.target, title: 'Other module' }; },
    x => { x.observation.result.report.register.listId = 'wrong-list'; },
    x => { x.observation.accountId = 'other@example.test'; },
    x => { x.observation.result.report.register.generation = 'not-a-generation'; },
    x => { x.observation.result.report.outcome = 'stale'; x.observation.result.report.register.freshness = 'stale'; x.observation.result.report.register.receipt = { lastSuccess: { providerSnapshot: x.intent.expectedSnapshot } }; },
  ]) {
    const input = fixture('change'); mutate(input);
    const result = prepare(input);
    assert.equal(result.status, 'return-to-cloud'); assert.equal(result.call, null);
  }
});

test('existing tasks require exactly one original open API row without title identity guessing or status defaulting', () => {
  for (const mutate of [
    x => { x.observation.result.report.tasks[1].taskId = 'other-id'; },
    x => { x.observation.result.report.tasks.push(structuredClone(x.observation.result.report.tasks[1])); },
    x => { x.observation.result.report.tasks[1].title = 'Owner renamed source'; },
    ...['completed', 'cancelled', 'needsAction', undefined].map(status => x => { x.observation.result.report.tasks[1].status = status; }),
  ]) {
    const input = fixture('complete'); mutate(input);
    const result = prepare(input); assert.equal(result.status, 'return-to-cloud'); assert.equal(result.call, null);
  }
});

test('closed API intents reject dates, timing, notes, cancellation, combined effects and invalid provenance', () => {
  for (const mutate of [
    x => { x.intent.operation.doDate = '2026-10-28'; }, x => { x.intent.operation.notes = ''; },
    x => { x.intent.operation.description = ''; }, x => { x.intent.timing = {}; },
    x => { x.intent.operation.name = 'cancel'; }, x => { x.intent.operation.completed = true; },
    x => { x.intent.operation.provenance = { claim: 'research-only' }; },
    x => { delete x.intent.identity.sourceOccurrenceId; }, x => { x.intent.ownerApproved = true; },
  ]) {
    const input = fixture('create'); mutate(input); assert.throws(() => prepare(input));
  }
});

test('freshness uses original read and intent clocks, never a new capture or evaluation time', () => {
  const input = fixture('change');
  assert.equal(prepare(input).prepared.validUntil, '2026-10-28T00:00:59.000Z');
  for (const mutate of [
    x => { x.observation.result.report.register.observedAt = '2026-10-27T23:58:00.000Z'; },
    x => { x.intent.issuedAt = '2026-10-27T23:58:00.000Z'; },
    x => { x.observation.result.report.register.observedAt = '2026-10-28T00:01:00.000Z'; },
    x => { x.intent.issuedAt = '2026-10-28T00:01:00.000Z'; },
    x => { x.observation.capturedAt = '2026-10-28T00:01:00.000Z'; },
  ]) { const x = fixture('change'); mutate(x); assert.equal(prepare(x).status, 'return-to-cloud'); }
  const later = prepareAcademicOsTaskPlan(input.intent, input.observation, { evaluatedAt: '2026-10-28T00:00:10.000Z' });
  assert.equal(later.prepared.validUntil, prepare(input).prepared.validUntil);
});

test('API applied remains API-only reported evidence and cannot populate native receipts or effects', () => {
  for (const name of ['create', 'change', 'complete']) {
    const prepared = prepare(fixture(name)).prepared;
    const output = assess(prepared, receipt(prepared));
    assert.equal(output.status, 'api-applied-reported'); assert.equal(output.call, null);
    assert.equal(output.nativeVerified, false); assert.deepEqual(output.completedEffectKeys, []);
    assert.deepEqual(output.prepared, prepared); assert.equal(output.reportEvidence.taskId, 'task-one');
  }
});

test('conflicts preserve fixed operation/token while failed, uncertain and unknown outcomes never authorize resend', () => {
  const prepared = prepare(fixture('create')).prepared;
  for (const [outcome, expected] of [['conflict', 'return-to-cloud'], ['uncertain', 'reconcile-original-operation'], ['failed', 'reconcile-original-operation'], ['future-outcome', 'reconcile-original-operation']]) {
    const response = receipt(prepared, outcome, null); response.report.code = 'operation-id-reused';
    const result = assess(prepared, response);
    assert.equal(result.status, expected); assert.equal(result.call, null);
    assert.deepEqual(result.prepared, prepared); assert.equal(result.reportEvidence.code, 'operation-id-reused');
    if (outcome === 'uncertain') assert.ok(result.findings.includes('unknown-create-outcome'));
  }
  const migration = receipt(prepared, 'conflict', null); migration.report = { schemaVersion: 1, outcome: 'conflict', code: 'exact-plan-required' };
  assert.equal(assess(prepared, migration).status, 'reconcile-original-operation');
  const transport = { attemptedAt: now, observedAt: now, evidenceRef: 'synthetic-lost-save', transportError: 'connection closed after send' };
  assert.equal(assess(prepared, transport).status, 'reconcile-original-operation');
});

test('wrong-ID, uncorrelated, expired or contradictory applied replies cannot count as API success', () => {
  const prepared = prepare(fixture('change')).prepared;
  for (const mutate of [
    x => { x.report.taskId = 'wrong-task'; }, x => { x.report.operationId = 'wrong-operation'; },
    x => { x.report.registerFresh = false; }, x => { x.report.taskId = null; },
    x => { x.report.code = 'unknown-create-outcome'; },
    x => { x.isError = true; }, x => { x.attemptedAt = '2026-10-27T23:59:59.000Z'; },
  ]) { const reply = receipt(prepared); mutate(reply); assert.equal(assess(prepared, reply).status, 'reconcile-original-operation'); }
  const expired = receipt(prepared); expired.attemptedAt = '2026-10-28T00:01:00.000Z'; expired.observedAt = expired.attemptedAt;
  assert.equal(assessAcademicOsTaskResult(prepared, expired, { evaluatedAt: expired.observedAt }).status, 'reconcile-original-operation');
  const changed = structuredClone(prepared); changed.apiPlan.expectedSnapshot = '3'.repeat(64);
  assert.throws(() => assess(changed, receipt(prepared)), /Changed or invalid/);
});

test('actual MCP text envelopes parse without inventing report wrappers or ignoring contradictory errors', () => {
  const input = fixture('change');
  const mcp = (report, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(report) }], isError });
  input.observation.result = mcp(input.observation.result.report);
  const ready = prepare(input); assert.equal(ready.status, 'api-plan-ready-reported');
  const reply = receipt(ready.prepared); const report = reply.report; delete reply.report; delete reply.isError;
  reply.result = mcp(report);
  assert.equal(assess(ready.prepared, reply).status, 'api-applied-reported');
  reply.result.isError = true;
  assert.equal(assess(ready.prepared, reply).status, 'reconcile-original-operation');
  reply.isError = false;
  assert.equal(assess(ready.prepared, reply).status, 'reconcile-original-operation');
  for (const bad of [{ content: [{ type: 'text', text: '{broken' }], isError: false }, { content: [{ type: 'text', text: '{"schemaVersion":1,"schemaVersion":1}' }], isError: false }, { content: [{ type: 'text', text: JSON.stringify(report) }, { type: 'text', text: '{}' }], isError: false }, { error: { code: -32602, message: 'Invalid argument' } }]) {
    input.observation.result = bad; assert.equal(prepare(input).status, 'return-to-cloud');
    reply.result = bad; delete reply.isError; assert.equal(assess(ready.prepared, reply).status, 'reconcile-original-operation');
  }
});
