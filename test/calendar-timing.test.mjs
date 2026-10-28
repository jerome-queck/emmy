import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarLocalClock, prepareCalendarTiming, assessCalendarTimingReadback } from '../src/calendar-timing.mjs';
import { canonicalTimingFor, syntheticTimingTarget, syntheticZoneObservation, syntheticTimingReceipt } from '../verification/calendar-timing-fixtures.mjs';
import { registerIdentity } from '../verification/calendar-register-fixtures.mjs';

const now = '2026-10-28T00:00:00.000Z';
function fixture(targetInterface = 'calendar-task-editor', start = '2026-10-28T11:00:00+08:00', end = '2026-10-28T12:00:00+08:00') {
  const operation = { identity: registerIdentity(), changes: { start, end, durationMinutes: 60, timeZone: 'Asia/Singapore' } };
  const canonical = canonicalTimingFor(operation);
  const target = syntheticTimingTarget(operation, targetInterface);
  const observation = syntheticZoneObservation(target, now);
  return { canonical, target, observation };
}
const prepare = ({ canonical, target, observation }, options = {}) => prepareCalendarTiming(canonical, target, observation, { evaluatedAt: now, maxEvidenceAgeMs: 60000, ...options });

test('Calendar SGT and verified standalone Bangkok render the same canonical instant', () => {
  for (const [route, expected] of [['calendar-task-editor', '11:00'], ['standalone-tasks-editor', '10:00']]) {
    const value = fixture(route); const before = structuredClone(value.canonical);
    const first = prepare(value).prepared; const second = prepare(value).prepared;
    assert.equal(first.editorInput.start.time, expected);
    assert.deepEqual(first.canonical, before); assert.deepEqual(value.canonical, before);
    assert.deepEqual(first, second); assert.ok(Object.isFrozen(first.canonical.interval));
    assert.throws(() => prepareCalendarTiming(first, value.target, value.observation, { evaluatedAt: now, maxEvidenceAgeMs: 60000 }), /closed shape/);
    assert.throws(() => { first.canonical.interval.start = 'changed'; }, TypeError);
  }
});

test('Intl conversion preserves month, year and leap-day rollover', () => {
  for (const [start, end, expected] of [
    ['2026-11-01T00:30:00+08:00', '2026-11-01T01:30:00+08:00', '2026-10-31'],
    ['2027-01-01T00:30:00+08:00', '2027-01-01T01:30:00+08:00', '2026-12-31'],
    ['2028-03-01T00:30:00+08:00', '2028-03-01T01:30:00+08:00', '2028-02-29'],
  ]) {
    const output = prepare(fixture('standalone-tasks-editor', start, end)).prepared;
    assert.deepEqual(output.editorInput.start, { date: expected, time: '23:30' });
    assert.equal(output.editorInput.end.time, '00:30');
    assert.equal(output.editorInput.end.date, start.slice(0, 10));
    assert.equal(output.editorInput.durationMinutes, 60);
  }
});

test('zone proof binds account, interface, actual input zone and execution epoch', () => {
  for (const mutate of [
    value => { value.observation.accountId = 'different@example.test'; },
    value => { value.observation.targetInterface = 'calendar-task-editor'; },
    value => { value.observation.inputTimeZone = 'Asia/Singapore'; },
    value => { value.observation.executionEnvironment.id = 'different-computer'; },
    value => { value.observation.executionEnvironment.epoch = 'restarted'; },
    value => { value.observation.systemTimeZone = 'Asia/Singapore'; },
    value => { value.observation.roundTripEvidenceRef = null; },
  ]) { const value = fixture('standalone-tasks-editor'); mutate(value); assert.equal(prepare(value).status, 'return-to-cloud'); }
});

test('unsupported zones, Mac or connector compensation and Calendar Bangkok fail closed', () => {
  for (const mutate of [
    value => { value.target.executionEnvironment.kind = 'connected-mac'; },
    value => { value.target.targetInterface = 'connector'; },
    value => { value.target.targetInterface = 'calendar-task-editor'; },
    value => { value.target.inputTimeZone = 'America/New_York'; },
    value => { value.canonical.sourceInterface = 'standalone-tasks-editor'; },
    value => { value.canonical.timeZone = 'Asia/Bangkok'; },
  ]) { const value = fixture('standalone-tasks-editor'); mutate(value); assert.equal(prepare(value).status, 'return-to-cloud'); }
  const value = fixture(); value.target.offsetMinutes = -60;
  assert.throws(() => prepare(value), /closed shape/);
});

test('actual observation time controls freshness and original expiry cannot be renewed', () => {
  const value = fixture();
  assert.ok(prepare(value, { evaluatedAt: '2026-10-28T00:01:00.001Z' }).findings.includes('stale-zone-observation'));
  assert.ok(prepare(value, { evaluatedAt: '2026-10-27T23:59:59.999Z' }).findings.includes('future-zone-observation'));
  assert.ok(prepare(value, { after: now }).findings.includes('fresh-zone-observation-required'));
  const prepared = prepare(value, { evaluatedAt: '2026-10-28T00:00:30.000Z' }).prepared;
  assert.equal(prepared.validUntil, '2026-10-28T00:01:00.000Z');
  const receipt = syntheticTimingReceipt(prepared, '2026-10-28T00:01:02.000Z');
  assert.ok(assessCalendarTimingReadback(prepared, receipt, { evaluatedAt: receipt.readback.observedAt, attemptedAt: '2026-10-28T00:01:01.000Z' }).findings.includes('timing-preparation-expired'));
});

test('readback requires original digest, exact submitted inputs and independent Calendar SGT interval', () => {
  const prepared = prepare(fixture('standalone-tasks-editor')).prepared;
  const receipt = syntheticTimingReceipt(prepared, '2026-10-28T00:00:02.000Z');
  const options = { evaluatedAt: '2026-10-28T00:00:03.000Z', attemptedAt: '2026-10-28T00:00:01.000Z' };
  assert.equal(assessCalendarTimingReadback(prepared, receipt, options).status, 'timing-verified-reported');
  for (const mutate of [
    value => { value.preparedDigest = 'a'.repeat(64); },
    value => { value.submittedInput.start.time = '09:00'; },
    value => { value.readback.start.time = '10:00'; },
    value => { value.readback.durationMinutes = 30; },
    value => { value.readback.timeZone = 'Asia/Bangkok'; },
    value => { value.readback.targetInterface = 'standalone-tasks-editor'; },
    value => { value.readback.executionEnvironment.epoch = 'changed'; },
    value => { value.readback.accountId = 'other@example.test'; },
    value => { value.readback.nativeIdentity.nativeId = 'other-task'; },
    value => { value.readback.observedAt = options.attemptedAt; },
    value => { value.readback.observedAt = '2026-10-28T00:00:04.000Z'; },
  ]) {
    const changed = structuredClone(receipt); mutate(changed);
    const result = assessCalendarTimingReadback(prepared, changed, options);
    assert.equal(result.status, 'return-to-cloud'); assert.deepEqual(result.completedEffectKeys, []);
  }
});

test('stable Calendar projection alone cannot substitute for native Task identity', () => {
  const prepared = prepare(fixture()).prepared;
  const receipt = syntheticTimingReceipt(prepared, '2026-10-28T00:00:02.000Z');
  const options = { evaluatedAt: '2026-10-28T00:00:03.000Z', attemptedAt: '2026-10-28T00:00:01.000Z' };
  receipt.readback.nativeIdentity = null; receipt.readback.projectionId = 'stable-calendar-projection';
  assert.ok(assessCalendarTimingReadback(prepared, receipt, options).findings.includes('exact-native-task-readback-required'));
  receipt.readback.mapping = { nativeIdentity: prepared.canonical.identity, projectionId: receipt.readback.projectionId, observedAt: receipt.readback.observedAt, evidenceRef: 'synthetic-reported-exact-native-mapping' };
  assert.equal(assessCalendarTimingReadback(prepared, receipt, options).status, 'timing-verified-reported');
  receipt.readback.mapping.observedAt = now;
  assert.equal(assessCalendarTimingReadback(prepared, receipt, options).status, 'return-to-cloud');
  receipt.readback.nativeIdentity = prepared.canonical.identity;
  receipt.readback.mapping.observedAt = receipt.readback.observedAt;
  receipt.readback.mapping.nativeIdentity = { ...prepared.canonical.identity, nativeId: 'contradictory-native-task' };
  assert.ok(assessCalendarTimingReadback(prepared, receipt, options).findings.includes('projection-mapping-conflict'));
});

test('readback freshness is independent from saved receipt and final phase cutoff', () => {
  const prepared = prepare(fixture()).prepared;
  const receipt = syntheticTimingReceipt(prepared, '2026-10-28T00:00:02.000Z');
  assert.ok(assessCalendarTimingReadback(prepared, receipt, { evaluatedAt: '2026-10-28T00:00:04.000Z', attemptedAt: '2026-10-28T00:00:01.000Z', after: '2026-10-28T00:00:03.000Z' }).findings.includes('fresh-calendar-readback-required'));
  assert.ok(assessCalendarTimingReadback(prepared, receipt, { evaluatedAt: '2026-10-28T00:01:03.000Z', attemptedAt: '2026-10-28T00:00:01.000Z' }).findings.includes('fresh-calendar-readback-required'));
});

test('readback and mapping age may tighten but cannot widen original preparation', () => {
  const prepared = prepare(fixture()).prepared;
  const receipt = syntheticTimingReceipt(prepared, '2026-10-28T00:00:02.000Z');
  const options = { evaluatedAt: '2026-10-28T00:00:03.000Z', attemptedAt: '2026-10-28T00:00:01.000Z' };
  assert.equal(assessCalendarTimingReadback(prepared, receipt, options).status, 'timing-verified-reported');
  assert.ok(assessCalendarTimingReadback(prepared, receipt, { ...options, maxEvidenceAgeMs: 500 }).findings.includes('fresh-calendar-readback-required'));
  receipt.readback.observedAt = options.evaluatedAt;
  receipt.readback.mapping = { nativeIdentity: prepared.canonical.identity, projectionId: 'projection', observedAt: '2026-10-28T00:00:02.000Z', evidenceRef: 'synthetic-mapping' };
  receipt.readback.projectionId = 'projection';
  assert.ok(assessCalendarTimingReadback(prepared, receipt, { ...options, maxEvidenceAgeMs: 500 }).findings.includes('projection-mapping-conflict'));
  for (const maxEvidenceAgeMs of [0, -1, 60001]) assert.throws(() => assessCalendarTimingReadback(prepared, receipt, { ...options, maxEvidenceAgeMs }), /cannot widen/);
});

test('invalid dates, unaligned intervals and changed prepared shapes are rejected', () => {
  for (const [start, end] of [['2026-02-30T11:00:00+08:00', '2026-02-30T12:00:00+08:00'], ['2026-10-28T24:00:00+08:00', '2026-10-29T01:00:00+08:00'], ['2026-10-28T11:00:01+08:00', '2026-10-28T12:00:01+08:00']]) assert.throws(() => prepare(fixture('calendar-task-editor', start, end)), /Invalid/);
  assert.throws(() => calendarLocalClock('2026-10-28T11:00:00Z', 'America/New_York'), /Supported/);
  const prepared = structuredClone(prepare(fixture()).prepared); prepared.editorInput.start.time = '10:00';
  assert.throws(() => assessCalendarTimingReadback(prepared, syntheticTimingReceipt(prepared, '2026-10-28T00:00:02.000Z'), { evaluatedAt: '2026-10-28T00:00:03.000Z', attemptedAt: '2026-10-28T00:00:01.000Z' }), /Changed original/);
});
