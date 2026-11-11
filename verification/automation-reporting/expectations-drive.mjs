import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const save = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const replace = (source, before, after) => { assert.equal(source.split(before).length, 2, `Expected one expectation mutation anchor ${before}`); return source.replace(before, after); };
const dependencies = ['bounded-json.mjs', 'improvement-report.mjs', 'reporting-privacy.mjs', 'automation-reporting-outcome.mjs', 'automation-reporting-expectations.mjs'];
export const expectationMutants = [
  ['authority', 'AuthoritySafe'], ['slot', 'ConfiguredSlotSafe'], ['target', 'TargetSafe'], ['owner', 'OwnerSafe'], ['dependency', 'DependencySafe'], ['complete', 'CompleteSafe'], ['withdrawal', 'WithdrawalSafe'], ['fresh', 'FreshSafe'], ['exact', 'ExactSlotSafe'], ['manual', 'ManualExcluded'], ['infer-success', 'NeverInferSuccess'], ['infer-failure', 'GraceNeverFailure'],
];
export async function driveExpectationProjection(root, evidence) {
  await mkdir(evidence, { recursive: true });
  const source = await readFile(join(root, 'src/automation-reporting.mjs'), 'utf8');
  const projection = source.slice(source.indexOf('function projectControlExpectations('), source.indexOf('async function scan('));
  assert.ok(projection.startsWith('function projectControlExpectations('));
  const prepare = async (mutation, label) => {
    const directory = join(evidence, label ?? mutation ?? 'baseline'); await mkdir(directory);
    let changed = projection;
    if (mutation === 'authority') changed = replace(changed, 'knownControl && configuredSlot &&', 'configuredSlot &&');
    if (mutation === 'slot') changed = replace(changed, 'knownControl && configuredSlot &&', 'knownControl &&');
    if (mutation === 'target') changed = replace(changed, ' && registration.data.targetNamespace === data.targetNamespace && registration.data.targetAutomationId === data.targetAutomationId', '');
    if (mutation === 'owner') changed = replace(changed, ' && registration.namespace === record.namespace && registration.automationId === record.automationId', '');
    if (mutation === 'dependency') changed = replace(changed, 'const original = byDigest.get(data.registration);', "const original = [...byDigest.values()].find(item => item.kind === 'registration' && item.revision === 0 && item.namespace === record.namespace && item.automationId === record.automationId && item.data.targetNamespace === data.targetNamespace && item.data.targetAutomationId === data.targetAutomationId);");
    if (mutation === 'complete') changed = replace(changed, 'complete && record && record.valid && !record.conflict', 'record && record.valid && !record.conflict');
    if (mutation === 'withdrawal') changed = replace(changed, 'latest && latest.data.enabled && latest.data.fingerprint === data.fingerprint', 'latest');
    if (mutation === 'fresh') changed = replace(changed, 'latest && Date.parse(evaluatedAt) - Date.parse(latest.data.observedAt) <= latest.data.sourceMaxAgeSeconds * 1000', 'latest');
    if (mutation === 'exact') changed = replace(changed, ' && Date.parse(ownOccurrence.data.scheduledFor) === Date.parse(data.scheduledFor)', '');
    if (mutation === 'manual') changed = replace(changed, "run.data.report?.provenance !== 'manual' && ownOccurrence && Date.parse(ownOccurrence.data.scheduledFor) === Date.parse(data.scheduledFor)", "run.data.report?.provenance === 'manual'");
    if (mutation === 'infer-success') changed = replace(changed, "execution: 'not-inferred'", "execution: 'completed'");
    if (mutation === 'infer-failure') changed = replace(changed, "execution: 'not-inferred'", "execution: Date.parse(evaluatedAt) > Date.parse(data.observationDueAt) ? 'failed' : 'not-inferred'");
    const path = join(directory, 'automation-reporting.mjs'); await writeFile(path, replace(source, projection, changed));
    for (const dependency of dependencies) await writeFile(join(directory, dependency), await readFile(join(root, 'src', dependency)));
    return { directory, api: await import(pathToFileURL(path)), domain: await import(pathToFileURL(join(directory, 'automation-reporting-expectations.mjs'))) };
  };
  const trial = async (mutation, label) => {
    const { directory, api, domain } = await prepare(mutation, label);
    const clock = '2026-11-01T03:00:00Z'; const initial = '2026-11-01T00:00:00Z'; const slot = '2026-11-01T01:00:00Z'; const due = '2026-11-01T02:00:00Z';
    const envelope = { schemaVersion: 2, namespace: 'control', automationId: 'control', revision: 0, previous: null, recordedAt: initial };
    const registration = (patch = {}, envelopePatch = {}) => {
      const data = { actor: 'registration-control', targetNamespace: 'target', targetAutomationId: 'target', nativeRef: 'synthetic:native', enabled: true, rrule: 'FREQ=DAILY;BYHOUR=1;BYMINUTE=0', dtstart: null, timezone: 'UTC', timezoneSource: 'synthetic:owner', sourceKind: 'owner-explicit', sourceRef: 'synthetic:source', observedAt: initial, effectiveAt: initial, observationGraceSeconds: 3600, sourceMaxAgeSeconds: 172800, ...patch };
      data.fingerprint = domain.registrationFingerprint(data);
      return { ...envelope, kind: 'registration', key: domain.registrationKey(data.targetNamespace, data.targetAutomationId), ...envelopePatch, data };
    };
    const original = registration();
    const expectation = (reg = original, patch = {}) => {
      const data = { actor: 'registration-control', registration: api.recordDigest(reg), targetNamespace: 'target', targetAutomationId: 'target', fingerprint: reg.data.fingerprint, scheduledFor: slot, observationDueAt: due, ...patch };
      return { ...envelope, kind: 'expectation', key: domain.expectationKey(data), data };
    };
    const exp = expectation();
    const inspect = (records = [original, exp], options = {}) => api.aggregate(records, { evaluatedAt: clock, controlAuthority: { namespace: 'control', automationId: 'control' }, ...options }).expectations[0];
    const run = (provenance = 'scheduled', scheduledFor = slot, execution = 'running') => {
      const occurrence = { schemaVersion: 1, namespace: 'target', automationId: 'target', kind: 'occurrence', key: 'slot', revision: 0, previous: null, recordedAt: clock, data: { scheduledFor, expiresAt: scheduledFor } };
      const record = { ...occurrence, kind: 'run', key: 'run', data: { occurrenceKey: provenance === 'scheduled' ? 'slot' : null, execution, coverage: 'partial', evidenceRefs: ['synthetic:run'], report: { schemaVersion: 1, type: 'automation-outcome', runId: 'run', provenance, scheduledFor: provenance === 'scheduled' ? scheduledFor : null, status: execution, coverage: 'partial', availability: 'unavailable', summary: 'Synthetic outcome', artifactLinks: [], sourceWindow: null, generatedAt: clock } } };
      return provenance === 'scheduled' ? [occurrence, record] : [record];
    };
    const foreignTarget = registration({ targetNamespace: 'other', targetAutomationId: 'other' });
    const foreignOwner = registration({}, { namespace: 'other', automationId: 'other' });
    const revision = patch => registration({ ...patch, observedAt: '2026-11-01T00:30:00Z', effectiveAt: '2026-11-01T00:30:00Z' }, { revision: 1, previous: api.recordDigest(original), recordedAt: '2026-11-01T00:30:00Z' });
    const results = {
      authority: inspect(undefined, { controlAuthority: null }),
      slot: inspect([original, expectation(original, { scheduledFor: '2026-11-01T01:01:00Z', observationDueAt: '2026-11-01T02:01:00Z' })]),
      target: inspect([foreignTarget, expectation(foreignTarget)]),
      owner: inspect([foreignOwner, expectation(foreignOwner)]),
      dependency: inspect([original, expectation(original, { registration: 'f'.repeat(64) })]),
      complete: inspect(undefined, { complete: false }),
      withdrawal: inspect([original, revision({ enabled: false }), exp]),
      edited: inspect([original, revision({ rrule: 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0' }), exp]),
      fresh: inspect(undefined, { evaluatedAt: '2026-11-04T03:00:00Z' }),
      exact: inspect([original, exp, ...run('scheduled', '2026-11-01T01:01:00Z')]),
      manual: inspect([original, exp, ...run('manual')]),
      'infer-success': inspect(), 'infer-failure': inspect(),
    };
    const expectedStates = { authority: 'unknown', slot: 'unknown', target: 'unknown', owner: 'unknown', dependency: 'unknown', complete: 'unknown', withdrawal: 'withdrawn', edited: 'withdrawn', fresh: 'unknown', exact: 'observation-gap', manual: 'observation-gap' };
    for (const [name, expected] of Object.entries(expectedStates)) {
      const mutated = mutation === name || name === 'edited' && mutation === 'withdrawal';
      assert.equal(results[name].state, mutated ? ['authority', 'slot', 'target', 'owner', 'dependency', 'complete', 'withdrawal', 'fresh', 'edited'].includes(name) ? 'observation-gap' : 'observed' : expected, `Designated actual-source witness ${name}`);
    }
    for (const [name, result] of Object.entries(results)) assert.equal(result.execution, mutation === 'infer-success' ? 'completed' : mutation === 'infer-failure' ? 'failed' : 'not-inferred', `No inferred execution ${name}`);
    assert.equal(inspect(undefined, { evaluatedAt: due }).state, 'expected');
    assert.equal(inspect(undefined, { evaluatedAt: '2026-11-03T00:00:00Z' }).sourceFreshness, 'within-configured-age');
    assert.equal(inspect(undefined, { evaluatedAt: '2026-11-03T00:00:00.001Z' }).sourceFreshness, mutation === 'fresh' ? 'within-configured-age' : 'stale-or-unavailable');
    const observed = inspect([original, exp, ...run()]); assert.equal(observed.state, mutation === 'manual' ? 'observation-gap' : 'observed');
    assert.equal(observed.execution, mutation === 'infer-success' ? 'completed' : mutation === 'infer-failure' ? 'failed' : 'not-inferred');
    const actual = api.aggregate([original, exp, ...run()], { evaluatedAt: clock }); assert.equal(actual.runs[0].execution, 'running');
    const historicalEdit = registration({ rrule: 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0', observedAt: '2026-11-01T01:30:00Z', effectiveAt: '2026-11-01T01:30:00Z' }, { revision: 1, previous: api.recordDigest(original), recordedAt: '2026-11-01T01:30:00Z' });
    assert.equal(inspect([original, historicalEdit, exp]).state, mutation === 'withdrawal' ? 'observation-gap' : 'unknown');
    assert.equal(inspect([original, revision({ enabled: false }), revision({ rrule: 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0' }), exp]).state, 'unknown');
    assert.equal(inspect([exp]).state, 'unknown');
    assert.equal(inspect([original, exp, run()[1]]).state, 'observation-gap');
    const invalidBound = run(); invalidBound[1].data.report.scheduledFor = '2026-11-01T01:01:00Z';
    assert.equal(inspect([original, exp, ...invalidBound]).state, mutation === 'manual' ? 'observation-gap' : 'unknown');
    const early = run(); early[1].data.report = null;
    assert.equal(inspect([original, exp, ...early]).state, mutation === 'manual' ? 'observation-gap' : 'observed');
    const earlyProjection = api.aggregate([original, exp, ...early], { evaluatedAt: clock, controlAuthority: { namespace: 'control', automationId: 'control' } });
    assert.equal(earlyProjection.runs[0].execution, 'running');
    assert.equal(earlyProjection.runs[0].reportAvailability, 'missing');
    const refreshed = registration({ observedAt: '2026-11-03T00:00:00Z', effectiveAt: '2026-11-03T00:00:00Z' }, { revision: 1, previous: api.recordDigest(original), recordedAt: '2026-11-03T00:00:00Z' });
    assert.equal(inspect([original, refreshed, exp], { evaluatedAt: '2026-11-04T00:00:00Z' }).sourceFreshness, 'within-configured-age');
    const notBefore = { ...exp, recordedAt: slot }; assert.throws(() => api.validateRecord(notBefore, clock), /Expectation must precede/);
    assert.throws(() => domain.validateControlRecord({ ...original, data: { ...original.data, fingerprint: 'f'.repeat(64) } }), /fingerprint/);
    await save(join(directory, 'witness.json'), { mutation: mutation ?? 'none', results, observed, runningAfterGrace: actual.runs[0].execution, schemaControls: ['expectation-strictly-before-slot', 'registration-fingerprint'], dependencyControls: ['historical-edit-unknown', 'conflicted-latest-unknown', 'absent-original-unknown', 'unbound-candidate-excluded', 'unusable-bound-candidate-unknown', 'early-null-report-observed', 'fresh-observation-same-fingerprint'] });
    return { mutation: mutation ?? 'none', property: expectationMutants.find(([name]) => name === mutation)?.[1] ?? 'baseline', states: Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.state])), execution: results['infer-failure'].execution };
  };
  const baseline = await trial(); const mutants = [];
  for (const [mutation] of expectationMutants) mutants.push(await trial(mutation));
  const restored = await trial(undefined, 'restored');
  assert.deepEqual(restored, baseline);
  return { baseline, mutants, restored };
}
