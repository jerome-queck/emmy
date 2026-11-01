import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregate, automationReporting, improvementRecords, validateRecord, recordDigest, canonical } from '../src/automation-reporting.mjs';
const at = '2026-11-01T00:00:00Z';
const base = (kind, key, data, extra = {}) => ({ schemaVersion: 1, namespace: 'producer', automationId: 'daily', kind, key, revision: 0, previous: null, recordedAt: at, data, ...extra });
const automation = base('automation', 'definition', { name: 'Daily bounded review', enabled: true, schedule: 'daily declared', environment: 'local', nativeRef: 'fixture-native', model: 'declared', destination: 'existing private reports', freshChat: null, archiveOnSuccess: null, sourceRef: 'fixture', observedAt: at });
const occurrence = base('occurrence', 'slot', { scheduledFor: at, expiresAt: at });
const run = base('run', 'invocation', { occurrenceKey: 'slot', execution: 'completed', coverage: 'partial', report: null, evidenceRefs: ['fixture-ref'] });
const receipt = (kind, subject, state = 'verified') => base(kind, kind, { subject, state, evidenceRef: 'fixture-readback' });
const view = records => aggregate(records, { evaluatedAt: at });
async function fixture(fn) { const directory = await mkdtemp(join(await realpath(tmpdir()), 'emmy-report-')); try { await fn(directory); } finally { await rm(directory, { recursive: true, force: true }); } }

test('completed review retains partial coverage, absent report and pending delivery', () => {
  const result = view([automation, occurrence, run]);
  assert.equal(result.runs[0].execution, 'completed'); assert.equal(result.runs[0].evidenceCoverage, 'partial');
  assert.equal(result.runs[0].reportAvailability, 'missing'); assert.equal(result.runs[0].userDelivery, 'pending');
  assert.equal(result.runs[0].assurance, 'reported'); assert.equal(result.status, 'needs-attention');
  assert.equal(view([automation, occurrence]).occurrences[0].execution, 'not-inferred');
});
test('permutation, retries, conflicts, incomplete sync and late predecessors remain deterministic', () => {
  const first = [automation, occurrence, run]; assert.deepEqual(view(first), view([...first].reverse()));
  const changed = { ...run, data: { ...run.data, execution: 'failed' } };
  const conflict = view([...first, changed]); assert.ok(conflict.runs.every(item => item.conflict && item.execution === 'unknown'));
  assert.equal(conflict.occurrences[0].state, 'unknown');
  const late = { ...run, revision: 1, previous: recordDigest(run) };
  assert.equal(view([automation, occurrence, late]).runs[0].execution, 'unknown');
  assert.equal(view([automation, occurrence, late, run]).runs[0].execution, 'completed');
  assert.equal(aggregate(first, { evaluatedAt: at, complete: false }).runs[0].execution, 'unknown');
  assert.equal(view([...first, run]).scan.records, 3);
});
test('receipt claims require current exact subject, namespace, time and evidence', () => {
  const result = view([automation, occurrence, run, receipt('publication', recordDigest(run)), receipt('delivery', recordDigest(run))]);
  assert.equal(result.runs[0].publication, 'verified'); assert.equal(result.runs[0].userDelivery, 'verified');
  assert.equal(result.deliveries[0].assurance, 'reported');
  const divergent = { ...run, data: { ...run.data, coverage: 'unavailable' } };
  assert.equal(view([automation, occurrence, run, divergent, receipt('delivery', recordDigest(run))]).deliveries[0].state, 'unknown');
  const missing = receipt('delivery', 'f'.repeat(64)); assert.equal(view([automation, missing]).deliveries[0].state, 'unknown');
  const old = receipt('delivery', recordDigest(run)); old.recordedAt = '2026-10-31T23:59:59Z';
  assert.equal(view([automation, occurrence, run, old]).deliveries[0].state, 'unknown');
  assert.throws(() => validateRecord({ ...receipt('delivery', recordDigest(run)), data: { subject: recordDigest(run), state: 'verified', evidenceRef: null } }, at), /evidence/);
});
test('compact report adapter validates source contract and exact occurrence correlation', () => {
  const report = { schemaVersion: 1, kind: 'maintenance', scheduledFor: at, runId: run.key, provenance: 'scheduled', status: 'completed', coverage: 'partial', summary: 'Bounded review', findings: 0, evidenceRefs: ['fixture-ref'], sourceWindow: { start: '2026-10-31T00:00:00Z', end: at }, generatedAt: at };
  const reported = { ...run, data: { ...run.data, report } };
  assert.equal(view([automation, occurrence, reported]).runs[0].reportAvailability, 'available');
  const wrongSlot = { ...occurrence, data: { scheduledFor: '2026-10-31T00:00:00Z', expiresAt: at } };
  assert.equal(view([automation, wrongSlot, reported]).runs[0].execution, 'unknown');
  assert.throws(() => view([{ ...reported, data: { ...reported.data, report: { ...report, findings: -1 } } }]), /finding/);
});
test('stale records visible and measured telemetry remains separate from unavailable values', () => {
  assert.equal(view([{ ...automation, data: { ...automation.data, observedAt: '2020-01-01T00:00:00Z' } }]).automations[0].stale, true);
  const result = aggregate([automation, occurrence, run], { evaluatedAt: '2026-11-03T00:00:00Z' });
  assert.equal(result.status, 'needs-attention'); assert.equal(result.runs[0].stale, true);
  const measured = { ...run, data: { ...run.data, telemetry: { runtimeMs: 1250, inputTokens: null, outputTokens: null, sourceRef: 'measured-fixture-clock' } } };
  assert.equal(view([automation, occurrence, measured]).runs[0].data.telemetry.inputTokens, null);
});
test('atomic publication races converge, branches survive and dry-run has no writes', async () => fixture(async directory => {
  const execute = record => automationReporting({ action: 'publish-own-record', directory, namespace: 'producer', record }, { evaluatedAt: at });
  const before = await readdir(directory);
  await automationReporting({ action: 'dry-run', directory, namespace: 'producer', record: run }, { evaluatedAt: at });
  assert.deepEqual(await readdir(directory), before);
  const results = await Promise.all([execute(run), execute(run)]);
  assert.deepEqual(results.map(item => item.status).sort(), ['identical', 'published']);
  const bytes = await readFile(join(directory, 'producer', `${recordDigest(run)}.json`), 'utf8'); assert.equal(bytes, canonical(run) + '\n');
  await execute({ ...run, data: { ...run.data, execution: 'failed' } });
  const result = await automationReporting({ action: 'status', directory }, { evaluatedAt: at }); assert.equal(result.runs.length, 2);
  await assert.rejects(automationReporting({ action: 'publish-own-record', directory, namespace: 'other', record: run }, { evaluatedAt: at }), /own namespace/);
}));
test('corruption, stray entries, symlinks and partial temp bytes cannot grant completion', async () => fixture(async directory => {
  await mkdir(join(directory, 'producer')); await writeFile(join(directory, 'producer', '.pending-crash'), '{');
  await writeFile(join(directory, 'producer', `${recordDigest(run)}.json`), canonical(run));
  await writeFile(join(directory, 'producer', `${'f'.repeat(64)}.json`), '{');
  const result = await automationReporting({ action: 'status', directory }, { evaluatedAt: at });
  assert.equal(result.scan.complete, false); assert.equal(result.runs[0].execution, 'unknown');
  await symlink(directory, join(directory, 'alias'));
  await assert.rejects(automationReporting({ action: 'status', directory: join(directory, 'alias') }, { evaluatedAt: at }), /ordinary directories/);
}));
test('bounded namespace inventory reports incomplete rather than silently omitting', async () => fixture(async directory => {
  for (let i = 0; i < 201; i++) await mkdir(join(directory, `namespace-${i}`));
  const result = await automationReporting({ action: 'status', directory }, { evaluatedAt: at });
  assert.equal(result.scan.complete, false); assert.equal(result.status, 'needs-attention');
}));
test('terminal runs cannot regress; blocked and approval states remain explicit', async () => fixture(async directory => {
  const execute = record => automationReporting({ action: 'publish-own-record', directory, namespace: 'producer', record }, { evaluatedAt: at });
  await execute(run);
  for (const execution of ['running', 'blocked', 'pending-approval', 'failed', 'unknown']) {
    const regressed = { ...run, revision: 1, previous: recordDigest(run), data: { ...run.data, execution } };
    await assert.rejects(execute(regressed), /predecessor/);
    assert.equal(view([automation, occurrence, run, regressed]).runs[0].execution, 'unknown');
  }
  for (const execution of ['blocked', 'pending-approval']) {
    const blocked = { ...run, key: execution, data: { ...run.data, execution } };
    assert.equal(view([automation, occurrence, blocked]).runs[0].execution, execution);
  }
  const verified = receipt('publication', recordDigest(run)); await execute(verified);
  const regressed = { ...verified, revision: 1, previous: recordDigest(verified), data: { ...verified.data, state: 'accepted' } };
  await assert.rejects(execute(regressed), /predecessor/);
}));

test('new invocation retry keeps exact expected occurrence bytes', () => {
  const report = { schemaVersion: 1, kind: 'maintenance', scheduledFor: at, runId: 'attempt-1', provenance: 'scheduled', status: 'failed', coverage: 'partial', summary: 'Bounded', findings: 0, evidenceRefs: [], sourceWindow: { start: '2026-10-31T00:00:00Z', end: at }, generatedAt: '2026-11-01T00:01:00Z' };
  const first = improvementRecords(report, { namespace: 'producer', automationId: 'daily' });
  const second = improvementRecords({ ...report, runId: 'attempt-2', status: 'completed', generatedAt: '2026-11-01T00:02:00Z' }, { namespace: 'producer', automationId: 'daily' });
  assert.deepEqual(first[0], second[0]);
  const result = aggregate([automation, ...first, ...second], { evaluatedAt: '2026-11-01T00:02:00Z' });
  assert.equal(result.occurrences.length, 1); assert.equal(result.occurrences[0].conflict, false);
  assert.deepEqual(result.runs.map(run => run.execution).sort(), ['completed', 'failed']);
});
test('actual run clocks stay sourced and ordered; record time never becomes event time', () => {
  const bare = view([automation, occurrence, run]).runs[0];
  assert.equal(bare.actualTiming.startedAt, null); assert.equal(bare.actualTiming.endedAt, null);
  const timing = { startedAt: '2026-10-31T23:00:00Z', lastHeartbeatAt: null, endedAt: '2026-10-31T23:59:00Z', observedAt: at, sourceRef: 'native-turn-readback' };
  const timed = { ...run, data: { ...run.data, timing } };
  assert.deepEqual(view([automation, occurrence, timed]).runs[0].actualTiming, timing);
  assert.throws(() => view([{ ...timed, data: { ...timed.data, timing: { ...timing, lastHeartbeatAt: '2026-11-01T00:00:00Z' } } }]), /out of order/);
  assert.throws(() => view([{ ...timed, data: { ...timed.data, timing: { ...timing, endedAt: '2026-11-02T00:00:00Z' } } }]), /event timestamp/);
});
