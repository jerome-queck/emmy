import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dependencies = ['reporting-representation.mjs', 'bounded-json.mjs', 'improvement-report.mjs', 'reporting-privacy.mjs', 'automation-reporting-outcome.mjs', 'automation-reporting-expectations.mjs'];
const replace = (source, before, after) => { assert.equal(source.split(before).length, 2, `Expected exactly one unbound mutation anchor ${before}`); return source.replace(before, after); };
export const unboundMutants = [ ['clocks', 'OriginalClockSafe'], ['basis', 'RetrospectiveBasisSafe'], ['metadata', 'RetrospectiveMetadataSafe'], ['immutable', 'AttachedReportImmutable'], ['representation', 'UnboundRepresentationSafe'] ];
const clone = value => structuredClone(value);
export async function driveUnboundOutcome(root, evidence) {
  await mkdir(evidence, { recursive: true });
  const source = await readFile(join(root, 'src/automation-reporting.mjs'), 'utf8');
  const trial = async (mutation, label = mutation ?? 'baseline') => {
    const directory = join(evidence, label); await mkdir(directory);
    let changed = source;
    if (mutation === 'clocks') {
      changed = replace(changed, 'outcomeSourceTimes(record.data.report)', '[record.data.report.generatedAt]');
      changed = replace(changed, 'const originalTimes = outcomeSourceTimes(report);', 'const originalTimes = outcomeSourceTimes(report).length ? [report.generatedAt] : [];');
    }
    if (mutation === 'basis') changed = replace(changed, "return metadataStable && prior === null && ['completed', 'failed', 'skipped'].includes(previous.data.execution) && report.generation.basedOn === record.previous && report.sourceEvidence.recordedAt === previous.recordedAt && [report.sourceEvidence.observedAt, report.sourceWindow?.end].every(time => time === null || time === undefined || Date.parse(time) <= Date.parse(previous.recordedAt));", 'return metadataStable;');
    if (mutation === 'metadata') changed = replace(changed, 'const metadataStable = record.data.coverage === previous.data.coverage && canonical(record.data.timing ?? null) === canonical(previous.data.timing ?? null) && canonical(record.data.telemetry ?? null) === canonical(previous.data.telemetry ?? null);', 'const metadataStable = true;');
    if (mutation === 'immutable' || mutation === 'representation') {
      changed = replace(changed, 'if (!retrospective(report)) return false;', 'if (!retrospective(report)) return retrospective(prior);');
      changed = replace(changed, 'metadataStable && canonical(report) === canonical(prior)', mutation === 'immutable' ? 'metadataStable' : 'metadataStable && report.summary === prior.summary');
    }
    const path = join(directory, 'automation-reporting.mjs'); await writeFile(path, changed);
    for (const name of dependencies) await writeFile(join(directory, name), await readFile(join(root, 'src', name)));
    const api = await import(pathToFileURL(path));
    const old = '2020-01-01T04:11:30.000Z', now = '2020-01-03T04:12:00Z';
    const prior = { schemaVersion: 1, namespace: 'synthetic', automationId: 'synthetic', kind: 'run', key: 'early-run', revision: 0, previous: null, recordedAt: old, data: { occurrenceKey: null, execution: 'completed', coverage: 'complete', report: null, evidenceRefs: ['synthetic:retained'] } };
    const report = { schemaVersion: 2, type: 'automation-outcome', runId: prior.key, provenance: 'scheduled-unbound', scheduledFor: null, status: 'completed', coverage: 'complete', availability: 'available', summary: 'Synthetic score 420. Original observation unknown.', artifactLinks: [], sourceWindow: null, generatedAt: now, sourceEvidence: { observedAt: null, recordedAt: old }, generation: { mode: 'retrospective', attestedBy: 'synthetic-reporter', basedOn: api.recordDigest(prior) } };
    const attached = { ...clone(prior), revision: 1, previous: api.recordDigest(prior), recordedAt: now, data: { ...clone(prior.data), report } };
    const view = records => api.aggregate(records, { evaluatedAt: now, maxAgeSeconds: 86400 }).runs[0];
    const valid = record => view([prior, record]).valid;
    assert.equal(valid(attached), true, 'Valid exact immediate terminal attachment');
    const originalClock = view([prior, attached]);
    assert.equal(originalClock.stale, mutation === 'clocks' ? false : true, 'Designated source-clock laundering witness');
    assert.equal(originalClock.sourceFreshness, mutation === 'clocks' ? 'within-configured-age' : 'stale', 'Designated fresh wrapper cannot refresh original source');
    const unknown = clone(attached); unknown.revision = 0; unknown.previous = null; unknown.data.report.generation = { mode: 'producer', attestedBy: 'synthetic-reporter', basedOn: null }; unknown.data.report.sourceEvidence.recordedAt = null;
    const unknownProjection = view([unknown]);
    assert.equal(unknownProjection.sourceFreshness, 'unknown', 'No source clocks never fresh');
    const boundary = clone(unknown); boundary.data.report.sourceEvidence.recordedAt = '2020-01-02T04:12:00Z';
    assert.equal(view([boundary]).sourceFreshness, 'within-configured-age', 'Exact age equality fresh');
    boundary.data.report.sourceEvidence.recordedAt = '2020-01-02T04:11:59.999Z';
    assert.equal(view([boundary]).sourceFreshness, mutation === 'clocks' ? 'within-configured-age' : 'stale', 'One millisecond beyond source age stale');
    const originalWindow = clone(unknown); originalWindow.data.report.sourceWindow = { start: '2020-01-01T04:06:08Z', end: '2020-01-01T04:10:00Z' };
    assert.equal(view([originalWindow]).sourceFreshness, mutation === 'clocks' ? 'within-configured-age' : 'stale', 'Old original window survives fresh generation');
    const wrongBasis = clone(attached); wrongBasis.data.report.generation.basedOn = 'f'.repeat(64);
    assert.equal(valid(wrongBasis), mutation === 'basis', 'Designated invalid retrospective basis accepted');
    const wrongOriginal = clone(attached); wrongOriginal.data.report.sourceEvidence.recordedAt = now;
    assert.equal(valid(wrongOriginal), mutation === 'basis', 'Original retained clock cannot become wrapper clock');
    const nonterminal = clone(prior); nonterminal.data.execution = 'running';
    const premature = clone(attached); premature.previous = api.recordDigest(nonterminal); premature.data.report.generation.basedOn = premature.previous;
    assert.equal(view([nonterminal, premature]).valid, mutation === 'basis', 'Retrospective requires terminal basis');
    const lateWindow = clone(attached); lateWindow.data.report.sourceWindow = { start: old, end: now };
    assert.equal(valid(lateWindow), mutation === 'basis', 'Window cannot be observed after retained basis');
    const changedCoverage = clone(attached); changedCoverage.data.coverage = 'partial'; changedCoverage.data.report.coverage = 'partial';
    assert.equal(valid(changedCoverage), mutation === 'metadata', 'Retrospective coverage preserved');
    const wrongTiming = clone(attached); wrongTiming.data.timing = { startedAt: '2020-01-01T04:06:08Z', lastHeartbeatAt: null, endedAt: null, observedAt: old, sourceRef: 'synthetic:unjustified-timing' };
    assert.equal(valid(wrongTiming), mutation === 'metadata', 'Designated immutable timing witness');
    const wrongTelemetry = clone(attached); wrongTelemetry.data.telemetry = { runtimeMs: 1, inputTokens: null, outputTokens: null, sourceRef: 'synthetic:unjustified-telemetry' };
    assert.equal(valid(wrongTelemetry), mutation === 'metadata', 'Retrospective cannot invent telemetry');
    const next = patch => ({ ...clone(attached), revision: 2, previous: api.recordDigest(attached), data: { ...clone(attached.data), report: { ...clone(report), ...patch } } });
    assert.equal(view([prior, attached, next({})]).valid, true, 'Identical attachment carry');
    const changedContent = next({ summary: 'Replacement synthetic content' });
    assert.equal(view([prior, attached, changedContent]).valid, mutation === 'immutable', 'Designated report replacement witness');
    const modeFlip = next({ generation: { mode: 'producer', attestedBy: 'synthetic-reporter', basedOn: null } });
    assert.equal(view([prior, attached, modeFlip]).valid, mutation === 'immutable' || mutation === 'representation', 'Mode flip cannot replace attachment');
    const manual = next({ schemaVersion: 1, provenance: 'manual' }); delete manual.data.report.sourceEvidence; delete manual.data.report.generation;
    const relabelled = view([prior, attached, manual]);
    assert.equal(relabelled.valid, mutation === 'immutable' || mutation === 'representation', 'Designated manual relabel/version downgrade accepted');
    const regression = clone(attached); regression.data.execution = 'running'; regression.data.report.status = 'running';
    assert.equal(valid(regression), false, 'Terminal execution preserved');
    const result = { mutation: mutation ?? 'none', originalClock: { stale: originalClock.stale, sourceFreshness: originalClock.sourceFreshness }, wrongBasisAccepted: valid(wrongBasis), changedTimingAccepted: valid(wrongTiming), changedContentAccepted: view([prior, attached, changedContent]).valid, manualRelabelAccepted: relabelled.valid, sourceUnknown: unknownProjection.sourceFreshness };
    await writeFile(join(directory, 'witness.json'), `${JSON.stringify({ ...result, inputs: { prior, attached, wrongBasis, wrongTiming, manual }, observed: { originalClock, wrongBasis: view([prior, wrongBasis]), changedTiming: view([prior, wrongTiming]), manualRelabel: relabelled } }, null, 2)}\n`);
    return result;
  };
  const baseline = await trial(); const mutants = [];
  for (const [name] of unboundMutants) mutants.push(await trial(name));
  const restored = await trial(undefined, 'restored'); assert.deepEqual(restored, baseline);
  return { baseline, mutants, restored };
}
