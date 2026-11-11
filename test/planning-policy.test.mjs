import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPlanningPolicy, assessRoundedBooking } from '../src/planning-policy.mjs';
import { assessCalendarRegister } from '../src/calendar-register.mjs';
import { prepareAcademicOsTaskPlan, assessAcademicOsTaskResult } from '../src/academic-os-task-plan.mjs';
import { planningBundle, planningContext, nonTiming, nextRule, versionedNative, versionedApi, hash, at } from '../verification/planning-policy/fixtures.mjs';
import { bindRegister } from '../verification/calendar-register-fixtures.mjs';
import { calendarPolicyCases, calendarPolicyPositives } from '../verification/calendar-policy-fixtures.mjs';
import { academicOsPlanFixture } from '../verification/academic-os-plan-fixtures.mjs';

const assess = (bundle = planningBundle(), context = planningContext()) => assessPlanningPolicy(bundle, context);
const native = input => assessCalendarRegister(input.snapshot, bindRegister(input).request, input);
const api = input => prepareAcademicOsTaskPlan(input.intent, input.observation, input);

test('extracted fixed rounding matches historical arithmetic over the complete source-minute domain', () => {
  for (let actual = 1; actual <= 1440; actual++) for (const scheduled of new Set([1, 29, 30, 31, 59, 60, 90, 1440, Math.ceil(actual / 30) * 30])) {
    const result = assessRoundedBooking({ minimumMinutes: 30, incrementMinutes: 30 }, { actualDurationMinutes: actual, scheduledDurationMinutes: scheduled });
    assert.deepEqual(result.findings, [...(scheduled < 30 || scheduled % 30 !== 0 ? ['scheduled-block-increment'] : []), ...(scheduled !== Math.ceil(actual / 30) * 30 ? ['source-duration-mismatch'] : [])]);
    assert.equal(result.scheduledDurationMinutes, Math.ceil(actual / 30) * 30);
    assert.equal(result.roundingAllowanceMinutes, Math.ceil(actual / 30) * 30 - actual);
  }
});

test('native and API consume the same exact bundle without changing external wire associations', () => {
  const n = native(versionedNative()); const fixture = versionedApi(); const a = api(fixture);
  assert.equal(n.status, 'proposed'); assert.equal(a.status, 'api-plan-ready-reported');
  const nr = n.proposals[0].prepared.planningResolution; const ar = a.prepared.planningResolution;
  assert.equal(nr.policyDigest, ar.policyDigest); assert.deepEqual(nr.selected, ar.selected);
  assert.equal(n.proposals[0].sourceTiming.scheduledDurationMinutes, 60);
  const historical = api(academicOsPlanFixture('change', at));
  assert.deepEqual(a.prepared.apiPlan, historical.prepared.apiPlan);
  assert.equal(a.prepared.apiPlan.policyVersion, 'c'.repeat(64));
  assert.equal(a.prepared.intent.policyDigest, fixture.intent.policyDigest);
  const receipt = { attemptedAt: at, observedAt: at, evidenceRef: 'synthetic-original-response', report: { schemaVersion: 1, operationId: fixture.intent.operationId, outcome: 'applied', taskId: 'task-one', registerFresh: true } };
  assert.equal(assessAcademicOsTaskResult(a.prepared, receipt, { evaluatedAt: at }).status, 'api-applied-reported');
  const changed = structuredClone(a.prepared); changed.planningResolution.selected = []; const { preparedDigest, ...body } = changed; changed.preparedDigest = hash(body);
  assert.throws(() => assessAcademicOsTaskResult(changed, receipt, { evaluatedAt: at }), /rule selection/);
});

test('all API operations require exact nonapplicability evidence, never absent duration', () => {
  for (const name of ['create', 'change', 'complete']) for (const kind of ['module', 'research-project']) {
    const fixture = versionedApi(name, at, kind); assert.equal(api(fixture).status, 'api-plan-ready-reported');
    fixture.intent.timing = { kind: 'booking', actualDurationMinutes: 40, scheduledDurationMinutes: 60 }; assert.ok(api(fixture).findings.includes('planning-timing-unresolved'));
    delete fixture.intent.timing; assert.ok(api(fixture).findings.includes('planning-timing-unresolved'));
    fixture.intent.timing = nonTiming({ ...planningContext(), operation: name, operationId: 'another-operation' });
    assert.ok(api(fixture).findings.includes('planning-timing-unresolved'));
  }
});

test('scoped supersession replaces only the exact version within the successor window and source', () => {
  const bundle = planningBundle(); const next = nextRule(bundle, rule => { rule.scope.source = 'synthetic-source-file'; rule.effectiveFrom = at; rule.effectiveUntil = '2026-10-27T02:00:00Z'; });
  assert.deepEqual(assess(bundle).resolution.selected.map(row => row.revision), [2]);
  const other = planningContext(); other.source = 'other-source'; assert.deepEqual(assess(bundle, other).resolution.selected.map(row => row.revision), [1]);
  const later = planningContext('2026-10-28T00:00:00Z'); assert.deepEqual(assess(bundle, later).resolution.selected.map(row => row.revision), [1]);
  next.supersedes[0].digest = '0'.repeat(64); assert.ok(assess(bundle).findings.includes('planning-supersession-invalid'));
});

test('unsupported applicable predicates, unresolved windows/scopes and hard conflicts refuse both callers', () => {
  for (const [change, code] of [
    [bundle => { bundle.rules[0].predicate = 'future-unsupported'; }, 'planning-predicate-unsupported'],
    [bundle => { bundle.rules[0].scope = null; }, 'planning-scope-unresolved'],
    [bundle => { bundle.rules[0].effectiveUntil = null; }, 'planning-scope-unresolved'],
    [bundle => { const next = structuredClone(bundle.rules[0]); next.id = 'other-hard'; next.parameters.minimumMinutes = 90; bundle.rules.push(next); }, 'planning-hard-conflict'],
  ]) {
    const n = versionedNative(); change(n.request.policy.planning); n.snapshot.policy = structuredClone(n.request.policy);
    assert.ok(native(n).findings.some(row => row.code === code), code);
    const a = versionedApi(); change(a.intent.policy.planning); a.observation.policy = structuredClone(a.intent.policy);
    assert.ok(api(a).findings.includes(code), code);
  }
});

test('preferences and estimates do not replace the hard booking requirement', () => {
  for (const strength of ['preference', 'estimate']) {
    const bundle = planningBundle(); const advisory = structuredClone(bundle.rules[0]); advisory.id = 'advisory'; advisory.strength = strength; advisory.parameters.minimumMinutes = 90; advisory.priority = 999;
    bundle.rules.push(advisory); assert.deepEqual(assess(bundle).findings, []); assert.equal(assess(bundle).booking.scheduledDurationMinutes, 60);
    bundle.rules.shift(); assert.ok(assess(bundle).findings.includes('planning-booking-rule-required'));
  }
});


test('v2 preserves every existing semantic-policy refusal and positive control', () => {
  for (const [name, mutate, code] of calendarPolicyCases) {
    const input = versionedNative(); mutate(input);
    const result = native(input); assert.ok(result.findings.some(row => row.code === code), name);
  }
  for (const [name, mutate] of calendarPolicyPositives) {
    const input = versionedNative(); mutate(input);
    assert.equal(native(input).status, 'proposed', name);
  }
});

test('v2 API receipt refuses a rule window that expired before the reported attempt', () => {
  const fixture = versionedApi(); fixture.intent.policy.planning.rules[0].effectiveUntil = '2026-10-27T00:00:00.500Z'; fixture.observation.policy = structuredClone(fixture.intent.policy);
  const prepared = api(fixture).prepared; assert.ok(prepared);
  const later = '2026-10-27T00:00:01.000Z';
  const receipt = { attemptedAt: later, observedAt: later, evidenceRef: 'synthetic-expired-rule-response', report: { schemaVersion: 1, operationId: fixture.intent.operationId, outcome: 'applied', taskId: 'task-one', registerFresh: true } };
  const result = assessAcademicOsTaskResult(prepared, receipt, { evaluatedAt: later });
  assert.equal(result.status, 'reconcile-original-operation'); assert.ok(result.findings.includes('planning-policy-at-attempt-changed')); assert.deepEqual(result.prepared, prepared);
});
