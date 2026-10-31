import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAcademicOsPlanningCatalog, acquireAcademicOsTaskPlan, validateAcademicOsPlanningCatalog, discoverAcademicOsPlanningAuthorizations, revalidateAcademicOsTaskPlan } from '../src/academic-os-planning.mjs';
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
    const { operationId: omitted, ...selector } = input.request;
    const discovered = discoverAcademicOsPlanningAuthorizations(catalog, selector, { evaluatedAt: now });
    assert.equal(discovered.authorizations.length, 1);
    input.request.operationId = discovered.authorizations[0].operationId;
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


test('publication refuses semantic title drift and two creates for one occurrence', () => {
  for (const name of ['create', 'change']) {
    const input = fixture(name); input.catalogInput.authorizations[0].operation.title = 'Unrelated title';
    assert.throws(() => build(input.catalogInput), /Source label/);
  }
  const input = fixture('create');
  input.catalogInput.authorizations.push({ ...structuredClone(input.catalogInput.authorizations[0]), operationId: 'second-create-operation' });
  assert.throws(() => build(input.catalogInput), /uniquely authorized/);
});


test('discovery supplies stable eligible selectors and cannot cross target/list boundaries', () => {
  const input = fixture(); const catalog = build(input.catalogInput);
  const selector = { target: input.request.target, listId: input.request.listId, taskId: input.request.taskId };
  const discovered = discoverAcademicOsPlanningAuthorizations(catalog, selector, { evaluatedAt: now });
  assert.equal(discovered.authorizations[0].operationId, input.request.operationId);
  assert.equal(discovered.authorizations[0].taskId, input.request.taskId);
  assert.deepEqual(discoverAcademicOsPlanningAuthorizations(catalog, { ...selector, taskId: 'foreign' }, { evaluatedAt: now }).authorizations, []);
  assert.throws(() => discoverAcademicOsPlanningAuthorizations(catalog, { ...selector, listId: 'foreign' }, { evaluatedAt: now }));
});

test('final revalidation refuses a policy revision during backup and never replaces the stored packet', () => {
  const input = fixture(); const catalog = build(input.catalogInput);
  const { prepared } = acquire(catalog, input);
  const before = canonical(prepared);
  const revalidate = (current, observation = input.observation) => revalidateAcademicOsTaskPlan(current, prepared, observation, { evaluatedAt: now });
  const valid = revalidate(catalog);
  assert.equal(valid.status, 'api-plan-current-reported');
  assert.equal(valid.call, null);
  assert.deepEqual(valid.prepared, prepared);
  const revised = structuredClone(input.catalogInput); revised.authorizations[0].authorityRef += '-new-revision-during-backup';
  assert.deepEqual(revalidate(build(revised)).findings, ['current-cloud-planning-revision-mismatch']);
  assert.equal(revalidate(build(revised)).call, null);
  const drift = structuredClone(input.observation); drift.result.report.execution.expectedSnapshot = '9'.repeat(64); drift.result.report.register.providerSnapshot = '9'.repeat(64);
  assert.ok(revalidate(catalog, drift).findings.includes('original-api-snapshot-mismatch'));
  assert.equal(canonical(prepared), before);
  const tampered = structuredClone(prepared); tampered.apiPlan.operation.taskId = 'foreign';
  assert.throws(() => revalidateAcademicOsTaskPlan(catalog, tampered, input.observation, { evaluatedAt: now }), /Changed|invalid/);
});

test('fresher reads cannot renew original prepared expiry and policy change does not erase uncertain recovery', () => {
  const input = fixture(); input.observation.result.report.register.observedAt = new Date(Date.parse(now) - 59000).toISOString();
  const catalog = build(input.catalogInput); const { prepared } = acquire(catalog, input);
  const later = new Date(Date.parse(now) + 2000).toISOString();
  input.observation.result.report.register.observedAt = later; input.observation.capturedAt = later;
  assert.deepEqual(revalidateAcademicOsTaskPlan(catalog, prepared, input.observation, { evaluatedAt: later }).findings, ['original-prepared-packet-expired']);
  const unknown = assessAcademicOsTaskResult(prepared, { attemptedAt: now, observedAt: now, evidenceRef: 'synthetic-lost-before-policy-change', transportError: 'lost' }, { evaluatedAt: later });
  assert.equal(unknown.status, 'reconcile-original-operation');
  assert.equal(unknown.call, null);
  assert.deepEqual(unknown.prepared, prepared);
});


test('consumed effect identity survives policy and operation ID rotation', () => {
  const input = fixture('create');
  const original = acquire(build(input.catalogInput), input);
  input.catalogInput.authorizations[0].authorityRef += '-new-policy';
  input.catalogInput.authorizations[0].operationId = 'rotated-operation-id';
  input.request.operationId = 'rotated-operation-id';
  const rotated = acquire(build(input.catalogInput), input);
  assert.notEqual(rotated.policyVersion, original.policyVersion);
  assert.notEqual(rotated.prepared.intent.operationDigest, original.prepared.intent.operationDigest);
  assert.equal(rotated.prepared.intent.effectKey, original.prepared.intent.effectKey);
});
