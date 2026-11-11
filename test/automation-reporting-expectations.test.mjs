import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { aggregate, automationReporting, recordDigest } from '../src/automation-reporting.mjs';
import { reconcileExpectations } from '../src/automation-reporting-control.mjs';
import { sanitizeRecords } from '../src/automation-reporting-transport.mjs';
const at = '2026-11-01T00:00:00.000Z';
const slot = '2026-11-01T01:00:00.000Z';
const authority = { namespace: 'control', automationId: 'control' };
const capture = { actor: 'registration-control', targetNamespace: 'producer', targetAutomationId: 'daily', nativeRef: 'saved-job', enabled: true, rrule: 'FREQ=DAILY;BYHOUR=1;BYMINUTE=0', dtstart: null, timezone: 'UTC', timezoneSource: 'explicit-owner-zone', sourceKind: 'cloud-definition', sourceRef: 'selected-source-sha256', observedAt: at };
const root = fileURLToPath(new URL('../', import.meta.url));
async function fixture(fn) {
  const path = await mkdtemp(join(await import('node:fs/promises').then(fs => fs.realpath(tmpdir())), 'emmy-expect-view-'));
  try { const directory = join(path, 'store'); await mkdir(directory); await fn({ path, directory }); }
  finally { await rm(path, { recursive: true, force: true }); }
}
const request = directory => ({ directory, ...authority, captures: [capture], evaluatedAt: at });
const view = (records, evaluatedAt = at, extra = {}) => aggregate(records, { evaluatedAt, controlAuthority: authority, ...extra });
const envelope = (kind, key, data, recordedAt = at) => ({ schemaVersion: 1, namespace: 'producer', automationId: 'daily', kind, key, revision: 0, previous: null, recordedAt, data });
test('independent future expectation and observation grace never create execution failure', async () => fixture(async ({ directory }) => {
  const plan = await reconcileExpectations(request(directory));
  const expected = records => records.expectations.find(record => record.data.scheduledFor === slot);
  assert.equal(expected(view(plan.records)).state, 'expected');
  assert.equal(expected(view(plan.records, '2026-11-01T02:00:00.000Z')).state, 'expected');
  const gap = view(plan.records, '2026-11-01T02:00:00.001Z');
  assert.equal(expected(gap).state, 'observation-gap'); assert.equal(expected(gap).execution, 'not-inferred'); assert.deepEqual(gap.runs, []);
  assert.equal(expected(aggregate(plan.records, { evaluatedAt: at })).state, 'unknown');
  assert.equal(expected(view(plan.records, at, { complete: false })).state, 'unknown');
  assert.equal(expected(view(plan.records, '2026-11-03T00:00:00.001Z')).state, 'unknown');
}));
test('changed and disabled source withdraw future expectations while retaining original bytes', async () => fixture(async ({ directory }) => {
  const original = await reconcileExpectations({ ...request(directory), apply: true });
  const changed = await reconcileExpectations({ ...request(directory), captures: [{ ...capture, enabled: false, observedAt: '2026-11-01T00:30:00.000Z' }], evaluatedAt: '2026-11-01T00:30:00.000Z', apply: true });
  assert.ok(view([...original.records, ...changed.records], '2026-11-01T00:30:00.000Z').expectations.every(record => record.state === 'withdrawn' && record.execution === 'not-inferred'));
  for (const record of original.records) assert.deepEqual(JSON.parse(await readFile(join(directory, 'control', `${recordDigest(record)}.json`), 'utf8')), record);
  const regressed = { ...changed.records[0], revision: 2, previous: recordDigest(changed.records[0]), data: { ...changed.records[0].data, observedAt: at, effectiveAt: at } };
  await assert.rejects(automationReporting({ action: 'publish-own-record', directory, namespace: 'control', record: regressed }, { evaluatedAt: '2026-11-01T00:30:00.000Z' }), /predecessor/);
}));
test('exact scheduled reported run satisfies expectation; manual and different slots do not', async () => fixture(async ({ directory }) => {
  const plan = await reconcileExpectations(request(directory));
  const occurrence = envelope('occurrence', 'own-correlation', { scheduledFor: slot, expiresAt: slot });
  const report = { schemaVersion: 1, type: 'automation-outcome', runId: 'attempt', provenance: 'scheduled', scheduledFor: slot, status: 'running', coverage: 'partial', availability: 'available', summary: 'Actual run retained.', artifactLinks: [], sourceWindow: null, generatedAt: slot };
  const run = envelope('run', 'attempt', { occurrenceKey: occurrence.key, execution: 'running', coverage: 'partial', report, evidenceRefs: [] }, slot);
  const observed = view([...plan.records, occurrence, run], '2026-11-01T04:00:00.000Z');
  assert.equal(observed.expectations.find(record => record.data.scheduledFor === slot).state, 'observed'); assert.equal(observed.runs[0].execution, 'running');
  const early = { ...run, recordedAt: at, data: { ...run.data, report: null } };
  assert.equal(view([...plan.records, occurrence, early]).expectations.find(record => record.data.scheduledFor === slot).state, 'observed');
  const manual = { ...run, data: { ...run.data, occurrenceKey: null, report: { ...report, provenance: 'manual', scheduledFor: null } } };
  assert.equal(view([...plan.records, manual], '2026-11-01T04:00:00.000Z').expectations.find(record => record.data.scheduledFor === slot).state, 'observation-gap');
  const foreign = plan.records.map(record => ({ ...record, namespace: 'foreign' }));
  assert.ok(view(foreign).expectations.every(record => record.state === 'unknown'));
}));
test('real CLI plans/applies own control records and scoped reads retain read-only dependencies', async () => fixture(async ({ path, directory }) => {
  const config = join(path, 'capture.json'); await writeFile(config, JSON.stringify(request(directory)));
  const cli = args => {
    const result = spawnSync(process.execPath, [resolve(root, 'scripts/automation-reporting.mjs'), ...args], { cwd: root, encoding: 'utf8' });
    assert.ok([0, 3].includes(result.status), result.stderr || result.stdout); return JSON.parse(result.stdout).data;
  };
  const flags = ['expectations', '--directory', directory, '--namespace', 'control', '--file', config];
  assert.equal(cli(flags).applied, false); assert.deepEqual(await readdir(directory), []);
  assert.equal(cli([...flags, '--apply']).publishedRecords, 9);
  assert.equal(cli([...flags, '--apply']).publishedRecords, 0);
  assert.deepEqual(await readdir(directory), ['control']);
  const detail = cli(['inspect', '--directory', directory, '--namespace', 'producer', '--automation-id', 'daily', '--control-namespace', 'control', '--control-automation-id', 'control', '--as-of', at]);
  assert.equal(detail.expectations.length, 8); assert.ok(detail.expectations.every(record => record.state === 'expected'));
  assert.equal(detail.runs.length, 0); assert.equal(detail.scan.records, 0); assert.equal(detail.scan.dependencyRecords, 9);
  const history = (await automationReporting({ action: 'list', directory, namespace: 'control', limit: 200 }, { evaluatedAt: at })).items.map(({ id, ...record }) => record);
  const projected = sanitizeRecords(history, { namespace: 'control', evaluatedAt: at });
  assert.deepEqual(projected.records.map(recordDigest).sort(), history.map(recordDigest).sort());
}));
test('scoped reads retain identity-based conflicts even when all issue leaves are resolved', async () => fixture(async ({ directory }) => {
  const automation = envelope('automation', 'definition', { name: 'Disabled fixture', enabled: false, schedule: 'manual', environment: 'local', nativeRef: 'fixture', model: 'fixture', destination: 'fixture', freshChat: null, archiveOnSuccess: null, sourceRef: 'fixture', observedAt: at });
  const left = envelope('issue', 'same-issue', { title: 'First resolution', state: 'resolved', evidenceRefs: ['first-proof'] });
  const right = { ...left, data: { ...left.data, title: 'Conflicting resolution', evidenceRefs: ['other-proof'] } };
  for (const record of [automation, left, right]) await automationReporting({ action: 'publish-own-record', directory, namespace: 'producer', record }, { evaluatedAt: at });
  for (const scope of [{}, { namespace: 'producer' }, { namespace: 'producer', automationId: 'daily' }]) {
    const result = await automationReporting({ action: 'inspect', directory, ...scope }, { evaluatedAt: at });
    assert.equal(result.status, 'needs-attention'); assert.ok(result.findings.some(finding => finding.startsWith('conflict:'))); assert.ok(result.issues.every(record => record.conflict));
  }
}));
