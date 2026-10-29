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
function cli(file) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, ['scripts/improvement-report.mjs', '--file', file]); let stdout = ''; child.stdout.on('data', bytes => { stdout += bytes; }); child.on('error', reject); child.on('close', code => resolve({ code, ...JSON.parse(stdout) })); }); }
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
  assert.equal(await readFile(join(directory, `${first.slot}.json`), 'utf8'), bytes); assert.equal((await readdir(directory)).filter(name => name.startsWith('conflict-')).length, 1);
  assert.equal((await run(read)).status, 'completed-empty');
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
test('duplicate request and retained JSON keys are refused', async t => {
  const { directory, run, read } = await fixture(t); const request = join(directory, 'duplicate.json');
  await writeFile(request, JSON.stringify({ directory, ...read }).replace('"action":"read"', '"action":"read","action":"read"')); assert.equal((await cli(request)).code, 2);
  const result = await run({ action: 'publish', report: terminalReport() });
  await writeFile(join(directory, `${result.slot}.json`), JSON.stringify(terminalReport()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')); await assert.rejects(run(read), /Duplicate/);
});
