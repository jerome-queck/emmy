import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, realpath, writeFile, readFile, readdir, rm, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { improvementReport } from '../src/improvement-report.mjs';
import { terminalReport } from '../verification/token-review-fixtures.mjs';
const evaluatedAt = '2026-10-29T04:00:00Z';
async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'improvement-report-test-'))); t.after(() => rm(directory, { recursive: true, force: true }));
  const run = request => improvementReport({ directory, ...request }, { evaluatedAt });
  const read = { action: 'read', kind: 'maintenance', scheduledFor: '2026-10-29T03:00:00Z', maxAgeSeconds: 86400, provenance: 'scheduled', minimumSourceEnd: terminalReport().sourceWindow.end };
  return { directory, run, read };
}
function cli(file, env = {}) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, ['scripts/improvement-report.mjs', '--file', file], { env: { ...process.env, ...env } }); let stdout = ''; child.stdout.on('data', bytes => { stdout += bytes; }); child.on('error', reject); child.on('close', code => resolve({ code, ...JSON.parse(stdout) })); }); }
test('concurrent real-process claims across all jobs have exactly one holder and exact-token release', async t => {
  const { directory, run } = await fixture(t); const files = await Promise.all(['maintenance', 'suggestions', 'token-optimisation'].map(async (kind, i) => { const file = join(directory, `request-${i}.json`); await writeFile(file, JSON.stringify({ action: 'claim', directory, kind, runId: `run-${i}` })); return file; }));
  const results = await Promise.all(files.map(cli)); assert.equal(results.filter(row => row.data.status === 'claimed').length, 1); assert.equal(results.filter(row => row.data.status === 'held').length, 2);
  const owner = results.find(row => row.data.status === 'claimed').data.ownerToken;
  await assert.rejects(run({ action: 'release', ownerToken: '00000000-0000-0000-0000-000000000000' }), /mismatch/);
  assert.equal((await run({ action: 'claim', kind: 'maintenance', runId: 'later' })).status, 'held');
  assert.equal((await run({ action: 'release', ownerToken: owner })).status, 'released');
  const fresh = await run({ action: 'claim', kind: 'suggestions', runId: 'new' }); assert.equal(fresh.status, 'claimed');
  await assert.rejects(run({ action: 'release', ownerToken: owner }), /mismatch/);
  assert.equal((await run({ action: 'release', ownerToken: fresh.ownerToken })).status, 'released');
});
test('immutable slots permit exact duplicate, preserve conflicts, and keep manual provenance separate', async t => {
  const { directory, run, read } = await fixture(t); const report = terminalReport();
  assert.equal((await run(read)).status, 'missing');
  const first = await run({ action: 'publish', report }); assert.equal(first.status, 'published'); assert.equal((await run({ action: 'publish', report })).status, 'identical');
  const bytes = await readFile(join(directory, `${first.slot}.json`), 'utf8');
  assert.equal((await run({ action: 'publish', report: { ...report, runId: 'second', findings: 1 } })).status, 'conflict');
  assert.equal(await readFile(join(directory, `${first.slot}.json`), 'utf8'), bytes); assert.equal((await readdir(directory)).filter(name => name.startsWith('conflict-')).length, 2);
  assert.equal((await run(read)).status, 'conflict');
  const other = { ...report, kind: 'suggestions', provenance: 'manual' }; await run({ action: 'publish', report: other }); assert.equal((await run({ ...read, kind: 'suggestions' })).status, 'missing');
});
test('read distinguishes empty, findings, failed, skipped, stale, future and incomplete evidence without mutations', async t => {
  const { directory, run, read } = await fixture(t);
  for (const [index, patch, expected] of [[0, {}, 'completed-empty'], [1, { findings: 2 }, 'completed-findings'], [2, { status: 'failed' }, 'failed'], [3, { coverage: 'partial' }, 'partial'], [4, { coverage: 'unavailable' }, 'partial'], [5, { evidenceRefs: [] }, 'partial'], [6, { sourceWindow: { start: '2026-10-26T00:00:00Z', end: '2026-10-27T00:00:00Z' } }, 'stale'], [7, { generatedAt: '2026-10-29T04:00:00Z', provenance: 'manual', scheduledFor: '2026-10-29T05:00:00Z' }, 'future'], [8, { status: 'skipped' }, 'skipped']]) {
    const report = { ...terminalReport(), scheduledFor: `2026-10-29T03:00:0${index}Z`, ...patch }; await run({ action: 'publish', report });
    const before = await readdir(directory); const bytes = await Promise.all(before.map(name => readFile(join(directory, name))));
    assert.equal((await run({ ...read, scheduledFor: report.scheduledFor, minimumSourceEnd: report.sourceWindow.end, provenance: report.provenance })).status, expected);
    assert.deepEqual(await readdir(directory), before); assert.deepEqual(await Promise.all(before.map(name => readFile(join(directory, name)))), bytes);
  }
});
test('guard orphan, malformed reports, oversized files, traversal and symlinks fail closed', async t => {
  const { directory, run, read } = await fixture(t); await mkdir(join(directory, 'guard')); assert.equal((await run({ action: 'claim', kind: 'maintenance', runId: 'orphan' })).status, 'held');
  await assert.rejects(run({ action: 'release', ownerToken: '00000000-0000-0000-0000-000000000000' }));
  for (const patch of [{ summary: 'x'.repeat(1601) }, { generatedAt: '2026-10-29T02:59:59Z' }, { generatedAt: '2026-10-29T05:00:00Z' }, { sourceWindow: { start: 'bad', end: 'bad' } }, { evidenceRefs: Array(21).fill('a') }]) await assert.rejects(run({ action: 'publish', report: { ...terminalReport(), ...patch } }));
  await assert.rejects(improvementReport({ ...read, directory: `${directory}/../${directory.split('/').at(-1)}` }));
  const link = join(directory, 'linked'); await symlink(directory, link); await assert.rejects(improvementReport({ ...read, directory: link }));
  const published = await run({ action: 'publish', report: terminalReport() }); const slot = join(directory, `${published.slot}.json`); await rm(slot); await symlink(join(directory, 'unrelated'), slot); await writeFile(join(directory, 'unrelated'), 'retained'); await assert.rejects(run(read)); assert.equal(await readFile(join(directory, 'unrelated'), 'utf8'), 'retained');
  const request = join(directory, 'oversized.json'); await writeFile(request, ' '.repeat(32769)); assert.equal((await cli(request)).code, 2);
});
test('original source end gates freshness and minimum coverage while wider gap windows remain eligible', async t => {
  const { run, read } = await fixture(t);
  await run({ action: 'publish', report: terminalReport() });
  assert.equal((await run({ ...read, minimumSourceEnd: '2026-10-29T01:00:00Z' })).status, 'partial');
  assert.equal((await run({ ...read, maxAgeSeconds: 3600 })).status, 'stale');
  assert.equal((await run({ ...read, minimumSourceEnd: '2026-10-28T23:00:00Z' })).status, 'completed-empty');
});
test('handover keeps successful bounded execution separate from evidence coverage for every report kind', async t => {
  const { directory, run, read } = await fixture(t);
  for (const kind of ['maintenance', 'suggestions', 'token-optimisation', 'project-chat-cleanup', 'weekly-upkeep', 'lifecycle-check']) {
    const value = { ...terminalReport(), kind, coverage: 'partial' };
    await run({ action: 'publish', report: value });
    const first = await run({ ...read, kind }); const slotBytes = await readFile(join(directory, `${first.slot}.json`));
    assert.equal(first.status, 'partial'); assert.equal(first.handover.execution, 'completed'); assert.equal(first.handover.evidenceCoverage, 'partial');
    assert.equal(first.handover.reportAvailability, 'available'); assert.equal(first.handover.parentReceipt, 'parent-owned'); assert.equal(first.handover.userDelivery, 'parent-owned');
    const later = await improvementReport({ directory, ...read, kind }, { evaluatedAt: '2026-10-29T04:01:00Z' });
    assert.equal(later.handover.snapshotDigest, first.handover.snapshotDigest);
    const equivalent = await run({ ...read, kind, scheduledFor: '2026-10-29T03:00:00.000Z', minimumSourceEnd: '2026-10-29T00:00:00.000Z' });
    assert.equal(equivalent.handover.snapshotDigest, first.handover.snapshotDigest);
    assert.deepEqual(await readFile(join(directory, `${first.slot}.json`)), slotBytes);
    assert.notEqual((await run({ ...read, kind, maxAgeSeconds: 0 })).handover.snapshotDigest, first.handover.snapshotDigest);
  }
});
test('missing, failed and conflicting snapshots remain visible under repeated reads without writes', async t => {
  const { directory, run, read } = await fixture(t);
  const missing = await run(read); assert.equal(missing.handover.execution, 'unknown'); assert.equal(missing.handover.reportAvailability, 'missing');
  await run({ action: 'publish', report: { ...terminalReport(), status: 'failed' } });
  const failed = await run(read); assert.equal(failed.handover.execution, 'failed'); assert.notEqual(failed.handover.snapshotDigest, missing.handover.snapshotDigest);
  await run({ action: 'publish', report: terminalReport() });
  const disputed = await run(read); assert.equal(disputed.handover.execution, 'conflicting'); assert.equal(disputed.handover.reportAvailability, 'conflict'); assert.notEqual(disputed.handover.snapshotDigest, failed.handover.snapshotDigest);
  const names = await readdir(directory); const bytes = await Promise.all(names.map(name => readFile(join(directory, name))));
  assert.deepEqual((await run(read)).handover, disputed.handover);
  assert.deepEqual(await readdir(directory), names); assert.deepEqual(await Promise.all(names.map(name => readFile(join(directory, name)))), bytes);
});
test('early native cleanup completion cannot publish before its expected slot; later adaptation retains source times', async t => {
  const { directory } = await fixture(t);
  const scheduledFor = '2026-10-30T21:00:00Z'; const completedAt = '2026-10-30T20:59:48Z';
  const value = { ...terminalReport(completedAt), kind: 'project-chat-cleanup', scheduledFor, coverage: 'partial', sourceWindow: { start: '2026-10-30T20:58:42Z', end: completedAt } };
  await assert.rejects(improvementReport({ action: 'publish', directory, report: value }, { evaluatedAt: completedAt }), /predate/);
  const adapted = { ...value, generatedAt: '2026-10-30T22:00:00Z', summary: 'Later derived handover of retained early native completion; not original producer publication.' };
  await improvementReport({ action: 'publish', directory, report: adapted }, { evaluatedAt: adapted.generatedAt });
  const read = await improvementReport({ action: 'read', directory, kind: value.kind, scheduledFor, provenance: 'scheduled', minimumSourceEnd: completedAt, maxAgeSeconds: 43200 }, { evaluatedAt: adapted.generatedAt });
  assert.equal(read.handover.execution, 'completed'); assert.equal(read.handover.evidenceCoverage, 'partial'); assert.equal(read.report.sourceWindow.end, completedAt); assert.equal(read.report.generatedAt, adapted.generatedAt);
});
test('duplicate request and retained JSON keys are refused', async t => {
  const { directory, run, read } = await fixture(t); const request = join(directory, 'duplicate.json');
  await writeFile(request, JSON.stringify({ directory, ...read }).replace('"action":"read"', '"action":"read","action":"read"')); assert.equal((await cli(request)).code, 2);
  const result = await run({ action: 'publish', report: terminalReport() });
  await writeFile(join(directory, `${result.slot}.json`), JSON.stringify(terminalReport()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')); await assert.rejects(run(read), /Duplicate/);
});
test('equivalent UTC timestamp spellings share one immutable occurrence slot', async t => {
  const { run, read } = await fixture(t); const report = terminalReport();
  const first = await run({ action: 'publish', report });
  assert.equal((await run({ ...read, scheduledFor: '2026-10-29T03:00:00.000Z' })).status, 'completed-empty');
  assert.equal((await run({ action: 'publish', report })).status, 'identical');
  const spelling = await run({ action: 'publish', report: { ...report, scheduledFor: '2026-10-29T03:00:00.000Z' } });
  assert.equal(spelling.status, 'conflict'); assert.equal(spelling.slot, first.slot);
  const changed = await run({ action: 'publish', report: { ...report, scheduledFor: '2026-10-29T03:00:00.000Z', summary: 'Different second body.' } });
  assert.equal(changed.status, 'conflict'); assert.equal(changed.slot, first.slot);
  assert.equal((await run({ ...read, scheduledFor: '2026-10-29T03:00:00.000Z' })).report.scheduledFor, report.scheduledFor);
});

test('contradictory publication degrades reads and retains both reports through exact repeats', async t => {
  const { directory, run, read } = await fixture(t); const original = terminalReport();
  const first = await run({ action: 'publish', report: original });
  const candidate = { ...original, status: 'failed', coverage: 'partial', summary: 'The review failed.' };
  assert.equal((await run({ action: 'publish', report: candidate })).status, 'conflict');
  const before = await readdir(directory); const bytes = await Promise.all(before.map(name => readFile(join(directory, name))));
  const result = await run(read); assert.equal(result.status, 'conflict'); assert.deepEqual(result.report, original); assert.deepEqual(result.conflictingReport, candidate);
  assert.deepEqual(await readdir(directory), before); assert.deepEqual(await Promise.all(before.map(name => readFile(join(directory, name)))), bytes);
  assert.deepEqual(JSON.parse(await readFile(join(directory, `${first.slot}.json`))), original);
  assert.equal((await run({ action: 'publish', report: original })).status, 'identical');
  assert.equal((await run({ action: 'publish', report: candidate })).status, 'conflict');
  assert.equal((await run(read)).status, 'conflict');
});

test('concurrent contradictory real-process publications retain the first dispute and all candidates', async t => {
  const { directory, run, read } = await fixture(t); const original = terminalReport();
  const first = await run({ action: 'publish', report: original });
  const candidates = Array.from({ length: 4 }, (_, i) => ({ ...original, runId: `contradiction-${i}`, status: 'failed', coverage: 'partial' }));
  const files = await Promise.all(candidates.map(async (report, i) => { const file = join(directory, `candidate-${i}.json`); await writeFile(file, JSON.stringify({ action: 'publish', directory, report })); return file; }));
  const results = await Promise.all(files.map(file => cli(file)));
  assert.ok(results.every(result => result.code === 3 && result.data.status === 'conflict'));
  const disputed = await run(read); assert.equal(disputed.status, 'conflict'); assert.ok(candidates.some(value => value.runId === disputed.conflictingReport.runId));
  const marker = await readFile(join(directory, `conflict-${first.slot}.json`));
  for (const candidate of candidates) assert.equal((await run({ action: 'publish', report: candidate })).status, 'conflict');
  assert.deepEqual(await readFile(join(directory, `conflict-${first.slot}.json`)), marker);
  const retained = (await readdir(directory)).filter(name => name.startsWith(`conflict-${first.slot}-`)); assert.equal(retained.length, candidates.length);
  assert.deepEqual(JSON.parse(await readFile(join(directory, `${first.slot}.json`))), original);
});
test('malformed, oversized, nonregular, symlink and wrong-slot markers fail closed on read and conflicting publish', async t => {
  const { directory, run, read } = await fixture(t); const original = terminalReport();
  const first = await run({ action: 'publish', report: original }); const marker = join(directory, `conflict-${first.slot}.json`);
  const candidate = { ...original, status: 'failed' };
  for (const body of ['{', ' '.repeat(16385), JSON.stringify(original), JSON.stringify({ ...candidate, provenance: 'manual' }), JSON.stringify(candidate).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')]) {
    await writeFile(marker, body); await assert.rejects(run(read)); await assert.rejects(run({ action: 'publish', report: candidate })); await rm(marker);
  }
  await mkdir(marker); await assert.rejects(run(read)); await assert.rejects(run({ action: 'publish', report: candidate })); await rm(marker, { recursive: true });
  const target = join(directory, 'unrelated'); await writeFile(target, JSON.stringify(candidate)); await symlink(target, marker);
  await assert.rejects(run(read)); await assert.rejects(run({ action: 'publish', report: candidate })); assert.deepEqual(JSON.parse(await readFile(target)), candidate);
});
test('interruption immediately after atomic marker publication cannot restore a healthy read', async t => {
  const { directory, run, read } = await fixture(t); const original = terminalReport(); const first = await run({ action: 'publish', report: original });
  const candidate = { ...original, status: 'failed', coverage: 'partial' }; const file = join(directory, 'request.json'); await writeFile(file, JSON.stringify({ action: 'publish', directory, report: candidate }));
  const preload = join(directory, 'interrupt.mjs');
  await writeFile(preload, `import fs from 'node:fs/promises'; import { syncBuiltinESMExports } from 'node:module'; const link = fs.link; fs.link = async (source, target) => { await link(source, target); if (target.endsWith('conflict-${first.slot}.json')) process.exit(97); }; syncBuiltinESMExports();`);
  const result = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['--import', preload, 'scripts/improvement-report.mjs', '--file', file]); child.on('error', reject); child.on('close', resolve); });
  assert.equal(result, 97); assert.deepEqual(JSON.parse(await readFile(join(directory, `conflict-${first.slot}.json`))), candidate);
  assert.equal((await readdir(directory)).filter(name => name.startsWith(`conflict-${first.slot}-`)).length, 0);
  assert.equal((await run(read)).status, 'conflict'); assert.deepEqual(JSON.parse(await readFile(join(directory, `${first.slot}.json`))), original);
});
test('bounded reads ignore unrelated malformed history and retain provenance separation after a dispute', async t => {
  const { directory, run, read } = await fixture(t); const original = terminalReport();
  await run({ action: 'publish', report: original }); await run({ action: 'publish', report: { ...original, status: 'failed' } });
  await writeFile(join(directory, 'conflict-unrelated.json'), ' '.repeat(20000));
  assert.equal((await run(read)).status, 'conflict'); assert.equal((await run({ ...read, provenance: 'manual' })).status, 'missing');
  const manual = { ...original, provenance: 'manual' }; await run({ action: 'publish', report: manual }); assert.equal((await run({ ...read, provenance: 'manual' })).status, 'completed-empty');
});
