import { test } from 'node:test';
import assert from 'node:assert/strict';
import { morningFixture, morningItem, morningAssessments, morningAt } from '../verification/morning-fixtures.mjs';
import { morningV3Open, morningV3Plan } from '../verification/morning-v3-fixtures.mjs';
import { preparePolicyBriefing } from '../src/briefing-plan.mjs';

const observation = (basis = 'current-read-start') => ({ observedAt: basis === 'current-read-start' ? null : morningAt, capturedAt: basis === 'current-read-start' ? null : morningAt, collectorObservation: { basis, startedAt: morningAt, endedAt: morningAt } });
function fixture() {
  const result = morningFixture({ open: morningV3Open });
  result.command('review', { items: [morningItem(), morningItem('outlook')] }); return result;
}
function observe(result, value = observation()) {
  for (const source of result.run.sources.filter(source => ['calendar', 'calendar-inventory'].includes(source.role))) result.command('source', { ...source.capture, jobKey: null, receipt: { ...source.capture.receipt, sourceRef: `${source.id}-original-observation` }, acquisition: { provenance: 'ordinary-authorized', ownerRef: result.run.ownerRef, collectionRef: `${source.id}-original-observation` }, providerObservation: structuredClone(value) });
}
function packet(result, value = observation()) {
  const accepted = morningV3Plan(result.run); Object.assign(accepted.input.calendar, value); accepted.result = preparePolicyBriefing(accepted.input); return accepted;
}
test('Calendar original observation seals through same v3 owner and discloses unknown provider clocks', () => {
  for (const basis of ['current-read-start', 'original-provider-clock']) {
    const result = fixture(); const value = observation(basis); observe(result, value);
    const accepted = packet(result, value);
    result.command('seal', { ...morningAssessments(), deterministic: accepted });
    assert.deepEqual(result.run.sealed.deterministic.input.calendar.collectorObservation, value.collectorObservation);
    if (basis === 'current-read-start') { assert.equal(result.run.sealed.deterministic.result.coverage, 'partial'); assert.match(result.run.sealed.body, /provider snapshot clocks unknown/); }
  }
});
test('Calendar original metadata cannot be omitted, rewritten, mixed or borrowed by legacy/mail sources', () => {
  for (const change of ['omit', 'basis', 'clock', 'start']) {
    const result = fixture(); observe(result); const accepted = packet(result);
    if (change === 'omit') { delete accepted.input.calendar.collectorObservation; accepted.input.calendar.observedAt = morningAt; accepted.input.calendar.capturedAt = morningAt; }
    if (change === 'basis') { accepted.input.calendar.collectorObservation.basis = 'original-provider-clock'; accepted.input.calendar.observedAt = morningAt; accepted.input.calendar.capturedAt = morningAt; }
    if (change === 'clock') { accepted.input.calendar.observedAt = morningAt; accepted.input.calendar.capturedAt = morningAt; }
    if (change === 'start') accepted.input.calendar.collectorObservation.startedAt = '2026-10-25T00:59:59.999Z';
    assert.throws(() => { accepted.result = preparePolicyBriefing(accepted.input); result.command('seal', { ...morningAssessments(), deterministic: accepted }); }, /observation|clocks|metadata/);
  }
  const mixed = fixture(); const source = mixed.run.sources.find(source => source.role === 'calendar'); mixed.command('source', { ...source.capture, jobKey: null, receipt: { ...source.capture.receipt, sourceRef: 'distinct-calendar' }, acquisition: { provenance: 'ordinary-authorized', ownerRef: mixed.run.ownerRef, collectionRef: 'distinct-calendar' }, providerObservation: observation() });
  assert.throws(() => mixed.command('seal', { ...morningAssessments(), deterministic: packet(mixed) }), /Exact retained/);
  for (const result of [fixture(), morningFixture()]) {
    const source = result.run.sources.find(source => source.role === (result.run.policyVersion === 3 ? 'gmail' : 'calendar'));
    assert.throws(() => result.command('source', { ...source.capture, providerObservation: observation() }), /requires v3 Calendar/);
  }
});
test('fresh wrapper cannot refresh old original Calendar clocks or rewind observations', () => {
  const result = fixture(); const source = result.run.sources.find(source => source.role === 'calendar');
  const stale = observation(); stale.collectorObservation.startedAt = '2026-10-25T00:00:00.000Z';
  assert.throws(() => result.command('source', { ...source.capture, providerObservation: stale }), /fresh source time/);
  observe(result);
  const rewind = observation(); rewind.collectorObservation.startedAt = '2026-10-25T00:59:59.999Z';
  assert.throws(() => result.command('source', { ...source.capture, providerObservation: rewind }), /fresh source time|cannot rewind/);
});
test('same Calendar acquisition cannot strip or alter retained provider observation', () => {
  const result = fixture(); observe(result);
  for (const source of result.run.sources.filter(source => ['calendar', 'calendar-inventory'].includes(source.role))) {
    const stripped = structuredClone(source.capture); delete stripped.providerObservation;
    assert.throws(() => result.command('source', stripped), /cannot rewrite original/);
    const changed = structuredClone(source.capture); changed.providerObservation = observation('original-provider-clock');
    assert.throws(() => result.command('source', changed), /cannot rewrite original/);
    const next = { ...changed, receipt: { ...changed.receipt, sourceRef: `${source.id}-later-provider` }, acquisition: { ...changed.acquisition, collectionRef: `${source.id}-later-provider` } };
    result.command('source', next);
    assert.throws(() => result.command('source', stripped), /cannot rewrite original/);
  }
});
