import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { automationReporting, aggregate, recordDigest, canonical } from '../src/automation-reporting.mjs';
import { sanitizeRecords, transportAutomationReporting } from '../src/automation-reporting-transport.mjs';
const execute = promisify(execFile);
const at = '2026-10-31T00:00:00Z';
const namespace = 'producer';
const base = (kind, key, data, extra = {}) => ({ schemaVersion: 1, namespace, automationId: 'daily', kind, key, revision: 0, previous: null, recordedAt: at, data, ...extra });
const automation = base('automation', 'definition', { name: 'Daily bounded review', enabled: true, schedule: 'daily declared', environment: 'local', nativeRef: 'fixture-native', model: 'declared', destination: 'private reports', freshChat: true, archiveOnSuccess: null, sourceRef: '/Users/private/native.json', observedAt: at });
const report = { schemaVersion: 1, type: 'automation-outcome', scheduledFor: null, runId: 'invocation', provenance: 'manual', status: 'completed', coverage: 'partial', summary: 'Review completed with partial evidence.', availability: 'available', artifactLinks: [], sourceWindow: { start: '2026-10-30T00:00:00Z', end: at }, generatedAt: at };
const run = base('run', report.runId, { occurrenceKey: null, execution: report.status, coverage: report.coverage, report, evidenceRefs: ['/Users/private/raw.json'], timing: { startedAt: '2026-10-30T23:59:00Z', lastHeartbeatAt: at, endedAt: at, observedAt: at, sourceRef: '/Users/private/timing.json' }, telemetry: { runtimeMs: 60000, inputTokens: null, outputTokens: 123, sourceRef: '/Users/private/telemetry.json' } });
const options = { namespace, evaluatedAt: at };
async function fixture(fn) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'emmy-transport-'));
  const sourceDirectory = join(root, 'source'); const directory = join(root, 'target');
  await mkdir(sourceDirectory); await mkdir(directory); await mkdir(join(directory, namespace));
  try { await fn({ root, sourceDirectory, directory, namespace }); } finally { await rm(root, { recursive: true, force: true }); }
}
async function seed(directory, records) { for (const record of records) await automationReporting({ action: 'publish-own-record', directory, namespace, record }, { evaluatedAt: at }); }
const transport = request => transportAutomationReporting(request, { evaluatedAt: at });
const cli = request => execute(process.execPath, [resolve('scripts/automation-reporting-transport.mjs'), '--source-directory', request.sourceDirectory, '--directory', request.directory, '--namespace', namespace, ...(request.dryRun ? ['--dry-run'] : []), ...(request.mappingCursor ? ['--mapping-cursor', request.mappingCursor] : [])]);

test('projection preserves identity, original clocks, partial coverage and telemetry without mutating source', () => {
  const revision = { ...run, revision: 1, previous: recordDigest(run), recordedAt: '2026-10-31T00:00:01Z' };
  const issue = base('issue', 'review-gap', { title: 'Incomplete source coverage', state: 'open', evidenceRefs: ['/Users/private/gap.json'] });
  const receipts = ['publication', 'delivery'].map(kind => base(kind, kind, { subject: recordDigest(revision), state: 'verified', evidenceRef: 'private-readback' }, { recordedAt: revision.recordedAt }));
  const records = [automation, run, revision, issue, ...receipts]; const before = canonical(records);
  const result = sanitizeRecords(records, { namespace, evaluatedAt: revision.recordedAt });
  assert.equal(canonical(records), before);
  assert.deepEqual(result, sanitizeRecords([...records].reverse(), { namespace, evaluatedAt: revision.recordedAt }));
  assert.deepEqual(result.skipped, { publication: 1, delivery: 1 });
  const projected = result.records.find(record => record.kind === 'run' && record.revision === 1);
  for (const field of ['namespace', 'automationId', 'kind', 'key', 'revision', 'recordedAt']) assert.equal(projected[field], revision[field]);
  assert.equal(projected.previous, result.mapping.find(item => item.sourceDigest === recordDigest(run)).targetDigest);
  assert.deepEqual(projected.data.timing, { ...run.data.timing, sourceRef: `sha256:${recordDigest(run.data.timing.sourceRef)}` });
  assert.deepEqual(projected.data.telemetry, { ...run.data.telemetry, sourceRef: `sha256:${recordDigest(run.data.telemetry.sourceRef)}` });
  assert.equal(projected.data.report.type, 'automation-outcome');
  for (const field of ['summary', 'status', 'coverage', 'provenance', 'scheduledFor', 'sourceWindow', 'generatedAt']) assert.deepEqual(projected.data.report[field], report[field]);
  assert.deepEqual(projected.data.evidenceRefs, [`source-record-sha256:${recordDigest(revision)}`]);
  assert.equal(projected.data.coverage, 'partial'); assert.ok(!canonical(result.records).includes('/Users/'));
  const view = aggregate(result.records, { evaluatedAt: revision.recordedAt });
  assert.equal(view.runs[0].publication, 'pending'); assert.equal(view.runs[0].userDelivery, 'pending');
});

test('generic reports retain safe artifact links', () => {
  const generic = { schemaVersion: 1, type: 'automation-outcome', runId: run.key, provenance: 'manual', scheduledFor: null, status: 'completed', coverage: 'partial', availability: 'available', summary: 'Export complete', artifactLinks: [{ label: 'Private report', url: 'https://drive.google.com/file/d/synthetic/view' }], sourceWindow: report.sourceWindow, generatedAt: at };
  const value = sanitizeRecords([automation, { ...run, data: { ...run.data, report: generic } }], options);
  assert.deepEqual(value.records.find(record => record.kind === 'run').data.report, generic);
});

test('conflict branches survive; missing ancestry, identity mutation and credentials are refused', () => {
  const conflict = { ...run, data: { ...run.data, evidenceRefs: ['different'] } };
  const branched = sanitizeRecords([run, conflict], options);
  assert.equal(branched.records.length, 2);
  assert.ok(aggregate(branched.records, { evaluatedAt: at }).runs.every(record => record.conflict && record.execution === 'unknown'));
  const revision = { ...run, revision: 1, previous: recordDigest(run) };
  assert.throws(() => sanitizeRecords([revision], options), /invalid/i);
  assert.throws(() => sanitizeRecords([run, { ...revision, key: 'changed' }], options), /identity|invalid/i);
  assert.throws(() => sanitizeRecords([{ ...run, data: { ...run.data, evidenceRefs: ['Bearer abcdefghijklmnopqrstuvwxyz'] } }], options), /Credential/);
  assert.throws(() => sanitizeRecords([automation], {}), /namespace/);
});

test('real CLI dry-run writes nothing, retries converge and original fallback bytes remain', async () => fixture(async request => {
  const revision = { ...run, revision: 1, previous: recordDigest(run) };
  await seed(request.sourceDirectory, [automation, run, revision]);
  const sourceFiles = await readdir(join(request.sourceDirectory, namespace));
  const originals = await Promise.all(sourceFiles.map(file => readFile(join(request.sourceDirectory, namespace, file), 'utf8')));
  const dry = JSON.parse((await cli({ ...request, dryRun: true })).stdout).data;
  assert.equal(dry.status, 'dry-run'); assert.equal(dry.mapping.length, 3); assert.deepEqual(await readdir(join(request.directory, namespace)), []);
  const first = JSON.parse((await cli(request)).stdout).data;
  assert.equal(first.publication, 'pending-remote-verification'); assert.equal(first.userDelivery, 'pending');
  assert.deepEqual(first.resultCounts, { published: 3 }); assert.equal(first.results, undefined);
  const second = JSON.parse((await cli(request)).stdout).data;
  assert.deepEqual(second.resultCounts, { identical: 3 }); assert.equal(second.writes, false);
  assert.deepEqual(await Promise.all(sourceFiles.map(file => readFile(join(request.sourceDirectory, namespace, file), 'utf8'))), originals);
  assert.equal((await readdir(join(request.directory, namespace))).length, 3);
}));

test('unsafe text anywhere in projection prevents all publication', async () => fixture(async request => {
  const unsafe = { ...run, data: { ...run.data, report: { ...report, summary: 'Private /Users/private/report.json' } } };
  await seed(request.sourceDirectory, [automation, unsafe]);
  await assert.rejects(cli(request), error => error.code === 2 && /Private path/.test(error.stdout));
  assert.deepEqual(await readdir(join(request.directory, namespace)), []);
  const oversized = { ...run, data: { ...run.data, report: { ...report, summary: 'x'.repeat(601) } } };
  assert.throws(() => sanitizeRecords([automation, oversized], options), /compact outcome|600/);
  assert.throws(() => sanitizeRecords([{ ...automation, data: { ...automation.data, nativeRef: '/Users/private/native' } }], options), /Private path/);
}));

test('corruption and symlink directories refuse; valid target branches remain visible', async () => fixture(async request => {
  await seed(request.sourceDirectory, [automation, run]);
  await writeFile(join(request.sourceDirectory, namespace, `${'f'.repeat(64)}.json`), '{');
  await assert.rejects(transport(request), /Incomplete/); assert.deepEqual(await readdir(join(request.directory, namespace)), []);
  await rm(join(request.sourceDirectory, namespace, `${'f'.repeat(64)}.json`));
  const alias = join(request.root, 'alias'); await symlink(request.directory, alias);
  await assert.rejects(transport({ ...request, directory: alias }), /ordinary|Symlink/);
  const projected = sanitizeRecords([automation, run], options).records;
  const targetRun = projected.find(record => record.kind === 'run');
  await seed(request.directory, [{ ...targetRun, data: { ...targetRun.data, evidenceRefs: ['different'] } }]);
  const before = await readdir(join(request.directory, namespace));
  await transport(request);
  const view = await automationReporting({ action: 'inspect', directory: request.directory, namespace }, { evaluatedAt: at });
  assert.equal(before.length, 1); assert.equal(view.runs.length, 2);
  assert.ok(view.runs.every(record => record.conflict && record.execution === 'unknown'));
}));

test('all historical records beyond one page are copied', async () => fixture(async request => {
  const issues = Array.from({ length: 201 }, (_, index) => base('issue', `gap-${index}`, { title: 'Bounded gap', state: 'open', evidenceRefs: ['private evidence'] }));
  await seed(request.sourceDirectory, [automation, ...issues]);
  const result = await transport(request); assert.equal(result.records, 202); assert.equal(result.mapping.length, 202);
  assert.equal((await readdir(join(request.directory, namespace))).length, 202);
}));

test('scheduled improvement projection preserves original occurrence and report source window', () => {
  const occurrence = base('occurrence', 'slot', { scheduledFor: at, expiresAt: at });
  const improvement = { schemaVersion: 1, kind: 'maintenance', scheduledFor: at, runId: run.key, provenance: 'scheduled', status: 'completed', coverage: 'partial', summary: 'Partial review', findings: 0, evidenceRefs: ['/Users/private/report'], sourceWindow: report.sourceWindow, generatedAt: at };
  const scheduled = { ...run, data: { ...run.data, occurrenceKey: 'slot', report: improvement } };
  const projected = sanitizeRecords([automation, occurrence, scheduled], options).records.find(record => record.kind === 'run');
  assert.equal(projected.data.report.type, 'automation-outcome');
  for (const field of ['summary', 'status', 'coverage', 'provenance', 'scheduledFor', 'sourceWindow', 'generatedAt']) assert.deepEqual(projected.data.report[field], improvement[field]);
  const manual = { ...scheduled, data: { ...scheduled.data, occurrenceKey: null, report: { ...improvement, provenance: 'manual' } } };
  const manualProjection = sanitizeRecords([automation, manual], options);
  const manualRun = manualProjection.records.find(record => record.kind === 'run');
  assert.equal(manualRun.data.occurrenceKey, null); assert.equal(manualRun.data.report.scheduledFor, null);
  assert.equal(manualRun.data.report.generatedAt, at); assert.deepEqual(manualRun.data.report.sourceWindow, improvement.sourceWindow);
  assert.equal(manualProjection.records.some(record => record.kind === 'occurrence'), false);
  assert.deepEqual(manualProjection.normalizations.manualNominalSlotOmittedSourceRetained, [{ sourceDigest: recordDigest(manual), originalScheduledFor: at }]);
  assert.equal(manual.data.report.scheduledFor, at);
});

test('credential-bearing raw source bytes refuse CLI publication and remain unchanged', async () => fixture(async request => {
  await mkdir(join(request.sourceDirectory, namespace));
  const unsafe = { ...run, data: { ...run.data, evidenceRefs: ['Bearer abcdefghijklmnopqrstuvwxyz'] } };
  const bytes = canonical(unsafe) + '\n';
  const file = join(request.sourceDirectory, namespace, `${recordDigest(unsafe)}.json`);
  await writeFile(file, bytes);
  await assert.rejects(cli(request), error => error.code === 2 && /Incomplete/.test(error.stdout));
  assert.deepEqual(await readdir(join(request.directory, namespace)), []); assert.equal(await readFile(file, 'utf8'), bytes);
}));

test('new source contradiction changes an already published green run to explicit target conflict', async () => fixture(async request => {
  await seed(request.sourceDirectory, [automation, run]);
  await transport(request);
  const before = await automationReporting({ action: 'inspect', directory: request.directory, namespace }, { evaluatedAt: at });
  assert.equal(before.runs[0].execution, 'completed');
  const divergent = { ...run, data: { ...run.data, evidenceRefs: ['contrary-source-evidence'] } };
  await seed(request.sourceDirectory, [divergent]);
  const sourceFiles = await readdir(join(request.sourceDirectory, namespace));
  const sourceBytes = await Promise.all(sourceFiles.map(file => readFile(join(request.sourceDirectory, namespace, file), 'utf8')));
  const result = await transport(request); assert.equal(result.records, 3);
  assert.deepEqual(result.conflicts, { sourceCurrentRecords: 2, projectedTargetCurrentRecords: 2 });
  const after = await automationReporting({ action: 'inspect', directory: request.directory, namespace }, { evaluatedAt: at });
  assert.equal(after.runs.length, 2); assert.ok(after.runs.every(record => record.conflict && record.execution === 'unknown'));
  assert.deepEqual(await Promise.all(sourceFiles.map(file => readFile(join(request.sourceDirectory, namespace, file), 'utf8'))), sourceBytes);
}));

test('source report kind contradictions cannot collapse after generic projection', async () => fixture(async request => {
  const legacy = { schemaVersion: 1, kind: 'maintenance', scheduledFor: at, runId: run.key, provenance: 'manual', status: 'completed', coverage: 'partial', summary: 'Same compact summary', findings: 0, evidenceRefs: ['same'], sourceWindow: report.sourceWindow, generatedAt: at };
  const first = { ...run, data: { ...run.data, report: legacy } };
  const second = { ...first, data: { ...first.data, report: { ...legacy, kind: 'suggestions' } } };
  await seed(request.sourceDirectory, [automation, first]); await transport(request);
  await seed(request.sourceDirectory, [second]);
  const result = await transport(request);
  const mapping = result.mapping.filter(item => [recordDigest(first), recordDigest(second)].includes(item.sourceDigest));
  assert.equal(new Set(mapping.map(item => item.targetDigest)).size, 2);
  const view = await automationReporting({ action: 'inspect', directory: request.directory, namespace }, { evaluatedAt: at });
  assert.equal(view.runs.length, 2); assert.ok(view.runs.every(item => item.conflict && item.execution === 'unknown'));
}));

test('real CLI bounds mapping and normalization output and pages by source digest', async () => fixture(async request => {
  const runs = Array.from({ length: 61 }, (_, index) => {
    const key = `legacy-${index}`;
    const legacy = { schemaVersion: 1, kind: 'maintenance', scheduledFor: at, runId: key, provenance: 'manual', status: 'completed', coverage: 'partial', summary: 'Bounded summary', findings: 0, evidenceRefs: ['fixture'], sourceWindow: report.sourceWindow, generatedAt: at };
    return { ...run, key, data: { ...run.data, report: legacy } };
  });
  await seed(request.sourceDirectory, [automation, ...runs]);
  const first = JSON.parse((await cli({ ...request, dryRun: true })).stdout).data;
  assert.equal(first.mapping.length, 50); assert.equal(first.mappingPage.total, 62); assert.equal(first.mappingPage.shown, 50); assert.ok(first.mappingPage.nextCursor);
  assert.equal(first.normalizations.manualNominalSlotOmittedSourceRetained.length, 50); assert.equal(first.normalizationPage.total, 61); assert.ok(first.normalizationPage.nextCursor);
  assert.deepEqual(first.resultCounts, {}); assert.equal(first.results, undefined);
  const second = JSON.parse((await cli({ ...request, dryRun: true, mappingCursor: first.mappingPage.nextCursor })).stdout).data;
  assert.equal(second.mapping.length, 12); assert.equal(second.mappingPage.nextCursor, null);
  assert.equal(new Set([...first.mapping, ...second.mapping].map(item => item.sourceDigest)).size, 62);
  const normalizationSecond = JSON.parse((await cli({ ...request, dryRun: true, mappingCursor: first.normalizationPage.nextCursor })).stdout).data;
  assert.equal(normalizationSecond.normalizations.manualNominalSlotOmittedSourceRetained.length, 11); assert.equal(normalizationSecond.normalizationPage.nextCursor, null);
  assert.deepEqual(await readdir(join(request.directory, namespace)), []);
}));

test('conflicting occurrence definitions preserve all claims and reader correlation stays unknown', async () => fixture(async request => {
  const first = base('occurrence', 'slot', { scheduledFor: at, expiresAt: at });
  const second = { ...first, data: { scheduledFor: '2026-10-30T23:00:00Z', expiresAt: at } };
  const scheduled = { ...run, data: { ...run.data, occurrenceKey: 'slot', report: { ...report, provenance: 'scheduled', scheduledFor: at } } };
  await seed(request.sourceDirectory, [automation, first, scheduled]); await transport(request);
  await seed(request.sourceDirectory, [second]); await transport(request);
  const view = await automationReporting({ action: 'inspect', directory: request.directory, namespace }, { evaluatedAt: at });
  assert.equal(view.occurrences.length, 2); assert.ok(view.occurrences.every(item => item.conflict));
  assert.equal(view.runs[0].execution, 'unknown'); assert.equal(view.runs[0].valid, false);
  assert.equal((await readdir(join(request.directory, namespace))).length, 4);
}));

test('real CLI refuses equivalent source and target aliases without changing fallback bytes', async () => fixture(async request => {
  const issue = base('issue', 'private-gap', { title: 'Bounded source gap', state: 'open', evidenceRefs: ['/Users/private/evidence.json'] });
  await seed(request.sourceDirectory, [automation, issue]);
  const beforeNames = await readdir(join(request.sourceDirectory, namespace));
  const beforeBytes = await Promise.all(beforeNames.map(file => readFile(join(request.sourceDirectory, namespace, file), 'utf8')));
  const aliases = [request.sourceDirectory, request.sourceDirectory + '/', request.sourceDirectory + '/./', request.sourceDirectory.replace('/source', '//source')];
  for (const directory of aliases) {
    await assert.rejects(cli({ ...request, directory }), error => error.code === 2 && /must differ/.test(error.stdout));
    assert.deepEqual(await readdir(join(request.sourceDirectory, namespace)), beforeNames);
    assert.deepEqual(await Promise.all(beforeNames.map(file => readFile(join(request.sourceDirectory, namespace, file), 'utf8'))), beforeBytes);
  }
}));
test('missing synced namespace refuses before any provisioning or record writes',async()=>fixture(async request=>{
  await seed(request.sourceDirectory,[automation,run]);await rm(join(request.directory,namespace),{recursive:true});
  await assert.rejects(transport(request),error=>error.code==='ENOENT');assert.deepEqual(await readdir(request.directory),[]);
}));
