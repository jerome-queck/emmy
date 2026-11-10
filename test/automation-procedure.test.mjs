import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { digest } from '../src/content.mjs';
import { planAutomation, automationProcedure } from '../src/automation-procedure.mjs';
import { assessAutomationReporting, reportingCanonical, validateAutomationArtifact } from '../src/automation-reporting.mjs';
import { assessBriefingReporting } from '../src/briefing-reporting.mjs';
import { automationProcedureFixture as procedure, automationConfigurationFixture, automationOutcomeFixture } from '../verification/automation-fixtures.mjs';
const at = '2026-11-03T01:00:00.000Z';
const pins = { procedureRef: 'synthetic-procedure-reference', configurationRef: 'synthetic-configuration-reference', procedureSha256: digest('procedure-original-bytes'), configurationSha256: digest('configuration-original-bytes') };
test('generic plans bind versioned procedures, source, scope, destination and private config without invocation', () => {
  const config = automationConfigurationFixture(); const first = planAutomation(procedure, config, pins);
  assert.deepEqual(planAutomation(procedure, config, pins), first);
  assert.equal(first.effectsAuthorized, false); assert.equal(first.nativeCreation, 'not-performed'); assert.equal(first.context, 'fresh-objective-required');
  assert.equal(planAutomation(procedure, { ...config, sources: [], budgets: { reads: 0, bytes: 0 } }, pins).budgets.reads, 0);
  assert.equal(first.promptDigest, digest(first.prompt)); assert.ok(!first.prompt.includes('threshold'));
  for (const changed of [{ ...config, budgets: { reads: 3, bytes: 8192 } }, { ...config, report: { ...config.report, destination: 'different-parent' } }, { ...config, parameters: { threshold: 4 } }]) assert.notEqual(planAutomation(procedure, changed, pins).planDigest, first.planDigest);
  for (const changed of [{ ...config, procedureDigest: digest('different') }, { ...config, budgets: { reads: Infinity, bytes: 1 } }, { ...config, report: { ...config.report, destination: '' } }, { ...config, sources: [...config.sources, ...config.sources] }, { ...config, schemaVersion: 2 }]) assert.throws(() => planAutomation(procedure, changed, pins));
  const duplicate = { ...procedure, steps: [...procedure.steps, procedure.steps[0]] };
  assert.throws(() => planAutomation(duplicate, { ...config, procedureDigest: digest(duplicate) }, pins));
});
test('generic CLI reads exact pinned files, prepares the existing report format and never scans unrelated history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emmy-automation-'));
  try {
    const save = async (name, value) => { const path = join(directory, name); const bytes = typeof value === 'string' ? value : JSON.stringify(value); await writeFile(path, bytes); return { path, sha256: digest(bytes) }; };
    const p = await save('procedure.json', procedure); const c = await save('configuration.json', automationConfigurationFixture());
    const planRequest = { action: 'plan', procedure: p, configuration: c };
    const plan = await automationProcedure(planRequest); const input = automationOutcomeFixture(plan.reportEvidenceRefs, at);
    const produced = await automationProcedure({ ...planRequest, action: 'report', input }, { now: at });
    assert.deepEqual(produced.artifacts, assessAutomationReporting(input).artifacts);
    assert.deepEqual(assessAutomationReporting(input), assessBriefingReporting(input));
    assert.equal(produced.publication, 'unverified'); assert.equal(produced.delivery, 'unverified');
    const artifact = produced.artifacts.find(value => value.record.kind === 'run'); const a = await save('exact-outcome.json', artifact.bytes);
    assert.notEqual(a.sha256, artifact.id);
    const request = { ...planRequest, action: 'read', artifact: a, recordId: artifact.id, maxAgeSeconds: 604800 };
    await save('unrelated-malformed-history.json', 'not-json'); const before = await readdir(directory);
    const selected = await automationProcedure(request, { now: at }); assert.equal(selected.status, 'available'); assert.deepEqual(selected.record, artifact.record);
    const cliPath = fileURLToPath(new URL('../scripts/agent.mjs', import.meta.url));
    const run = async (value, name) => { const saved = await save(name, value); const before = await readdir(directory); const result = spawnSync(process.execPath, [cliPath, 'automation', '--file', saved.path], { encoding: 'utf8' }); assert.deepEqual(await readdir(directory), before); return result; };
    const planned = await run(planRequest, 'plan-request.json'); assert.equal(planned.status, 0, planned.stderr); assert.equal(JSON.parse(planned.stdout).data.planDigest, plan.planDigest); assert.ok(JSON.parse(planned.stdout).data.prompt.includes(p.path)); assert.ok(JSON.parse(planned.stdout).data.prompt.includes(c.path));
    const cliAt = new Date().toISOString();
    const fresh = await automationProcedure({ ...planRequest, action: 'report', input: automationOutcomeFixture(plan.reportEvidenceRefs, cliAt) }, { now: cliAt });
    const freshArtifact = fresh.artifacts.find(value => value.record.kind === 'run'); const freshFile = await save('fresh-outcome.json', freshArtifact.bytes);
    const read = await run({ ...request, artifact: freshFile, recordId: freshArtifact.id }, 'read-request.json'); assert.equal(read.status, 0, read.stdout);
    assert.equal(JSON.parse(read.stdout).data.record.kind, 'run');
    assert.equal((await run({ ...planRequest, configuration: { ...c, sha256: digest('changed') } }, 'invalid-request.json')).status, 2);
    const wrong = automationOutcomeFixture([], at); await assert.rejects(automationProcedure({ ...planRequest, action: 'report', input: wrong }, { now: at }), /bind exact/);
    await assert.rejects(automationProcedure({ ...request, recordId: a.sha256 }, { now: at }), /digest differ/);
    await assert.rejects(automationProcedure({ ...request, artifact: { ...a, sha256: digest('wrong') } }, { now: at }), /bytes changed/);
    const link = join(directory, 'link.json'); await symlink(a.path, link); await assert.rejects(automationProcedure({ ...request, artifact: { ...a, path: link } }, { now: at }), /ordinary file/);
    const stale = await automationProcedure({ ...request, maxAgeSeconds: 0 }, { now: '2026-11-03T01:00:00.001Z' }); assert.equal(stale.status, 'stale');
    assert.deepEqual(await readFile(a.path), Buffer.from(artifact.bytes)); assert.ok(before.includes('unrelated-malformed-history.json'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const timing = { startedAt: '2026-11-03T00:00:00.000Z', lastHeartbeatAt: null, endedAt: '2026-11-03T00:30:00.000Z', observedAt: '2026-11-03T00:30:00.000Z', sourceRef: 'synthetic-clock' };
const telemetry = { runtimeMs: 1800000, inputTokens: null, outputTokens: 0, sourceRef: 'synthetic-meter' };
const runArtifact = record => ({ id: digest(reportingCanonical(record)), bytes: `${reportingCanonical(record)}\n` });
const publication = artifact => ({ action: 'publication', parentId: 'synthetic-parent', artifact, attempt: { state: 'not-started', nativeId: null }, readback: null });
const outcome = extra => ({ ...automationOutcomeFixture([], at), ...extra });
const runRecord = input => assessAutomationReporting(input).artifacts.find(artifact => artifact.record.kind === 'run').record;
const invalidMetadata = [
  ['negative runtime', { telemetry: { ...telemetry, runtimeMs: -1 } }, /Measured telemetry/],
  ['fractional tokens', { telemetry: { ...telemetry, inputTokens: 0.5 } }, /Measured telemetry/],
  ['unsafe tokens', { telemetry: { ...telemetry, outputTokens: Number.MAX_SAFE_INTEGER + 1 } }, /Measured telemetry/],
  ['missing telemetry member', { telemetry: { runtimeMs: 0, inputTokens: null, sourceRef: 'synthetic-meter' } }, /Expected members/],
  ['extra timing member', { timing: { ...timing, extra: true } }, /Expected members/],
  ['future observation', { timing: { ...timing, observedAt: '2099-01-01T00:00:00.000Z' } }, /Actual timing evidence/],
  ['future endpoint', { timing: { ...timing, endedAt: at } }, /Actual timing evidence/],
  ['reversed timing', { timing: { ...timing, startedAt: timing.endedAt, endedAt: timing.startedAt } }, /Actual timing order/],
  ['invalid timing clock', { timing: { ...timing, startedAt: 'invalid-clock' } }, /Actual timing evidence/],
  ['empty timing source', { timing: { ...timing, sourceRef: '' } }, /Actual timing evidence/],
  ['null timing object', { timing: null }, /Expected members/],
  ['null telemetry object', { telemetry: null }, /Expected members/]
];
for (const [name, change, error] of invalidMetadata) test(`report ingestion rejects ${name} in publication and predecessors`, () => {
  const record = runRecord(outcome()); Object.assign(record.data, change);
  const artifact = runArtifact(record);
  assert.throws(() => validateAutomationArtifact(artifact), error);
  assert.throws(() => assessAutomationReporting(publication(artifact)), error);
  assert.throws(() => assessAutomationReporting(outcome({ predecessorChain: [record] })), error);
});
for (const execution of ['unknown', 'running', 'blocked', 'pending-approval']) test(`report ingestion rejects non-null ${execution} report`, () => {
  const record = runRecord(outcome()); record.data.execution = execution; record.data.report.status = execution;
  const artifact = runArtifact(record);
  assert.throws(() => validateAutomationArtifact(artifact), /terminal/);
  assert.throws(() => assessAutomationReporting(publication(artifact)), /terminal/);
  assert.throws(() => assessAutomationReporting(outcome({ predecessorChain: [record] })), /terminal/);
});
test('valid optional evidence and historical null reports retain exact wire bytes', () => {
  const base = outcome();
  const scheduledFor = '2026-11-03T02:00:00.000Z';
  const binding = { scheduledFor, occurrenceKey: `slot-${digest(reportingCanonical([base.namespace, base.automationId, scheduledFor]))}`, observationDueAt: '2026-11-03T03:00:00.000Z', nominalSlotEvidenceRef: 'synthetic-slot', observedAt: at, validThrough: '2026-11-04T00:00:00.000Z' };
  for (const input of [base, outcome({ execution: 'running' }), outcome({ origin: 'scheduled', binding }), outcome({ timing, telemetry }), outcome({ timing: { ...timing, startedAt: null, endedAt: null }, telemetry: { ...telemetry, runtimeMs: null, outputTokens: null } })]) {
    const record = runRecord(input); const artifact = runArtifact(record);
    assert.deepEqual(validateAutomationArtifact(artifact), record);
    assert.equal(assessAutomationReporting(publication(artifact)).state, 'prepared-only');
    assert.equal(runArtifact(validateAutomationArtifact(artifact)).bytes, artifact.bytes);
    if (record.data.report === null && record.data.execution === 'completed') assert.throws(() => assessAutomationReporting({ ...input, predecessorChain: [record] }), /Retrospective attachment/);
    else assert.equal(assessAutomationReporting({ ...input, predecessorChain: [record] }).artifacts.at(-1).record.revision, 1);
  }
});
test('generic CLI refuses coerced revisions and malformed canonical report evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emmy-automation-validation-'));
  try {
    const save = async (name, value) => { const path = join(directory, name); const bytes = typeof value === 'string' ? value : JSON.stringify(value); await writeFile(path, bytes); return { path, sha256: digest(bytes) }; };
    const configuration = automationConfigurationFixture();
    const request = { action: 'plan', procedure: await save('procedure.json', procedure), configuration: await save('configuration.json', configuration) };
    const plan = await automationProcedure(request);
    const cliPath = fileURLToPath(new URL('../scripts/agent.mjs', import.meta.url));
    const cli = async value => { const file = await save('request.json', value); return spawnSync(process.execPath, [cliPath, 'automation', '--file', file.path], { encoding: 'utf8' }); };
    for (const revision of [[configuration.source.revision], null, 123]) {
      const result = await cli({ ...request, configuration: await save('invalid-configuration.json', { ...configuration, source: { ...configuration.source, revision } }) });
      assert.equal(result.status, 2, result.stdout); assert.match(result.stdout, /Exact source release/);
    }
    const input = automationOutcomeFixture(plan.reportEvidenceRefs, at);
    for (const [name, change, error] of [...invalidMetadata, ['running report', { execution: 'running' }, /terminal/]]) {
      const record = runRecord(input); Object.assign(record.data, change); if (name === 'running report') record.data.report.status = 'running';
      const artifact = runArtifact(record);
      const result = await cli({ ...request, action: 'read', artifact: await save('artifact.json', artifact.bytes), recordId: artifact.id, maxAgeSeconds: 315360000 });
      assert.equal(result.status, 2, `${name}: ${result.stdout}`); assert.match(result.stdout, error);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
