import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAcademicOsPlanningCatalog, acquireAcademicOsTaskPlan, validateAcademicOsPlanningCatalog } from '../src/academic-os-planning.mjs';
import { assessAcademicOsTaskResult } from '../src/academic-os-task-plan.mjs';
import { canonical, digest } from '../src/records.mjs';
import { academicOsPlanningFixture } from '../verification/academic-os-planning-fixtures.mjs';

const now = '2026-10-31T12:00:00.000Z';
const fixture = (name, kind) => academicOsPlanningFixture(now, name, kind);
const build = input => buildAcademicOsPlanningCatalog(input, { evaluatedAt: now });
const acquire = (catalog, input) => acquireAcademicOsTaskPlan(catalog, input.request, input.observation, { evaluatedAt: now });

test('real caller obtains exact module and research plans from cloud catalog without supplying policy values', () => {
  for (const kind of ['module', 'research-project']) for (const name of ['complete', 'create', 'change']) {
    const input = fixture(name, kind);
    const before = canonical(input);
    const catalog = build(input.catalogInput);
    assert.equal(catalog.policyVersion, digest(canonical(input.catalogInput)));
    const result = acquire(catalog, input);
    assert.equal(result.status, 'api-plan-ready-reported');
    assert.equal(result.prepared.apiPlan.policyVersion, catalog.policyVersion);
    assert.equal(result.prepared.intent.authorityRef, input.catalogInput.authorizations[0].authorityRef);
    assert.equal(result.prepared.intent.expectedSnapshot, input.observation.result.report.execution.expectedSnapshot);
    assert.equal(result.prepared.intent.issuedAt, input.catalogInput.policy.assignments[0].observedAt);
    assert.equal(result.execution, 'none');
    assert.equal(canonical(input), before);
    assert.deepEqual(JSON.parse(result.call.arguments.plan_json), result.prepared.apiPlan);
  }
});

test('source approval, particular completion authority and complete scoped review are separate requirements', () => {
  for (const mutate of [
    x => { x.issuer = 'local-caller'; },
    x => { x.coverage.complete = false; },
    x => { x.coverage.gaps = ['owner history missing']; },
    x => { x.authorizations = []; },
    x => { delete x.authorizations[0].authorityRef; },
    x => { x.authorizations[0].taskId = 'foreign-task'; },
    x => { x.authorizations[0].source.reference = 'unrelated-policy'; },
    x => { x.policy.occurrences[0].state = 'completed'; },
    x => { x.authorizations[0].operation = { name: 'reopen' }; },
    x => { x.authorizations[0].baseline.status = 'completed'; },
    x => { x.policy.ownerRules.push({ id: 'keep-open', identity: x.policy.bindings[0].identity, occurrenceId: x.policy.occurrences[0].id, changes: { completed: false }, observedAt: x.issuedAt, evidenceRef: 'synthetic-owner-do-not-complete', supersedes: null }); },
  ]) {
    const input = fixture(); mutate(input.catalogInput);
    assert.throws(() => build(input.catalogInput));
  }
});

test('current policy versions bind scope, source, operation authority and revisions; fabricated text is refused', () => {
  const input = fixture();
  const original = build(input.catalogInput);
  for (const mutate of [
    x => { x.sourceRef += '-revision'; },
    x => { x.authorizations[0].authorityRef += '-revision'; },
    x => { x.policy.assignments[0].evidenceRef += '-revision'; },
  ]) {
    const edited = structuredClone(original); mutate(edited);
    assert.throws(() => acquire(edited, input), /version/);
    delete edited.policyVersion;
    assert.notEqual(build(edited).policyVersion, original.policyVersion);
  }
  const fabricated = { ...original, policyVersion: 'fixture-policy' };
  assert.throws(() => validateAcademicOsPlanningCatalog(fabricated, { evaluatedAt: now }), /version/);
});

test('acquisition cannot borrow a foreign target, exact identity or caller policy', () => {
  for (const mutate of [
    x => { x.request.taskId = 'same-title-other-native-task'; },
    x => { x.request.target.title = 'Other module'; },
    x => { x.request.operationId = 'not-authorized'; },
    x => { x.request.listId = 'other-list'; },
    x => { x.request.policyVersion = 'c'.repeat(64); },
    x => { x.observation.policy = x.catalogInput.policy; },
  ]) {
    const input = fixture(); const catalog = build(input.catalogInput); mutate(input);
    assert.throws(() => acquire(catalog, input));
  }
});

test('export and repeated acquisition cannot renew source, owner or official-read clocks', () => {
  const input = fixture(); const catalog = build(input.catalogInput);
  const later = new Date(Date.parse(now) + 60001).toISOString();
  assert.throws(() => validateAcademicOsPlanningCatalog(catalog, { evaluatedAt: later }), /Expired|Stale/);
  input.catalogInput.policy.assignments[0].observedAt = new Date(Date.parse(now) - 60001).toISOString();
  assert.throws(() => build(input.catalogInput), /Stale/);
  const expired = fixture(); expired.catalogInput.authorizations[0].validUntil = now;
  assert.throws(() => build(expired.catalogInput), /Expired/);
  const fresh = fixture(); const current = build(fresh.catalogInput);
  fresh.observation.result.report.tasks[1].status = 'completed';
  assert.equal(acquire(current, fresh).call, null);
  const changed = fixture(); changed.observation.result.report.tasks[1].title += ' edited';
  assert.equal(acquire(current, changed).call, null);
});

test('acquired original packet retains uncertainty and does not turn a lost response into another write', () => {
  const input = fixture(); const result = acquire(build(input.catalogInput), input);
  const receipt = { attemptedAt: now, observedAt: now, evidenceRef: 'synthetic-lost-response', transportError: 'connection closed' };
  const assessment = assessAcademicOsTaskResult(result.prepared, receipt, { evaluatedAt: now });
  assert.equal(assessment.status, 'reconcile-original-operation');
  assert.equal(assessment.call, null);
  assert.deepEqual(assessment.prepared, result.prepared);
});
