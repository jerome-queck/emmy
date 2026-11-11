import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, writeFile, rm, stat, symlink, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonical, recordDigest } from '../src/automation-reporting.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const time = '2026-01-01T00:00:00Z';
function record() {
  return { schemaVersion: 1, namespace: 'own', automationId: 'daily', kind: 'run', key: 'run-one', revision: 0, previous: null, recordedAt: time, data: { occurrenceKey: null, execution: 'blocked', coverage: 'partial', report: { schemaVersion: 1, type: 'automation-outcome', runId: 'run-one', provenance: 'manual', scheduledFor: null, status: 'blocked', coverage: 'partial', availability: 'available', summary: 'Waiting for source evidence.', artifactLinks: [], sourceWindow: null, generatedAt: time }, evidenceRefs: [], timing: { startedAt: null, lastHeartbeatAt: null, endedAt: null, observedAt: time, sourceRef: 'observed-source' }, telemetry: { runtimeMs: null, inputTokens: null, outputTokens: null, sourceRef: 'unavailable' } } };
}

test('cloud bundle executes outside repository with exact product validation and safe output', async () => {
  const build = spawnSync(process.execPath, ['scripts/build-reporting-cloud.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'emmy-cloud-'));
  try {
    const executable = join(directory, 'cloud.mjs');
    await copyFile(join(root, '.local/reporting-cloud/automation-reporting-cloud-v1.mjs'), executable);
    const input = join(directory, 'input.json'); const output = join(directory, 'canonical.json');
    const run = (command, extra = []) => spawnSync(process.execPath, [executable, command, '--namespace', 'own', '--automation-id', 'daily', '--file', command === 'verify' ? output : input, ...(command === 'verify' ? ['--id', recordDigest(record())] : ['--to', output]), ...extra], { cwd: directory, encoding: 'utf8' });
    const prepare = async value => { await writeFile(input, typeof value === 'string' ? value : JSON.stringify(value)); return run('prepare'); };
    assert.equal(spawnSync(process.execPath, [executable, '--help'], { cwd: directory }).status, 0);
    const first = await prepare(record()); assert.equal(first.status, 0, first.stderr);
    const result = JSON.parse(first.stdout);
    assert.equal(result.id, recordDigest(record()));
    const bytes = await readFile(output);
    assert.equal(bytes.toString(), canonical(record()) + '\n');
    assert.equal(result.byteSha256, hash(bytes)); assert.equal(result.bytes, bytes.length);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.equal(result.nativePublication, 'pending'); assert.match(result.validation, /ancestry requires namespace history/);
    assert.equal(JSON.parse(run('prepare').stdout).output, 'identical');
    assert.equal(run('verify').status, 0);
    const wrongDigest = spawnSync(process.execPath, [executable, 'verify', '--namespace', 'own', '--automation-id', 'daily', '--file', output, '--id', '0'.repeat(64)], { cwd: directory, encoding: 'utf8' });
    assert.equal(wrongDigest.status, 1); assert.match(wrongDigest.stderr, /digest mismatch/);
    const originalBytes = await readFile(output);
    await writeFile(output, canonical(record()));
    assert.equal(run('verify').status, 1);
    await writeFile(output, originalBytes);
    const different = record(); different.key = 'different'; different.data.report.runId = 'different';
    assert.equal((await prepare(different)).status, 1);
    assert.deepEqual(await readFile(output), originalBytes);
    const cases = [
      ['duplicate key', JSON.stringify(record()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')],
      ['wrong namespace', { ...record(), namespace: 'someone-else' }],
      ['future recorded time', { ...record(), recordedAt: '2999-01-01T00:00:00Z' }],
      ['unknown field', { ...record(), deliveryVerified: true }],
      ['privacy path', { ...record(), key: '/Users/private/report' }],
      ['privacy account', { ...record(), key: 'person@example.com' }],
      ['credential', { ...record(), key: 'Bearer abcdefghijklmnopqrst' }],
      ['oversize', ' '.repeat(32770)],
      ['invalid JSON string', '{\"secret\":\"/Users/private/raw\\x\"}'],
      ['state mismatch', { ...record(), data: { ...record().data, execution: 'unknown' } }],
      ['timing order', { ...record(), data: { ...record().data, timing: { ...record().data.timing, startedAt: time, endedAt: '2025-01-01T00:00:00Z' } } }],
      ['timing future', { ...record(), data: { ...record().data, timing: { ...record().data.timing, observedAt: '2026-01-01T00:00:01Z' } } }],
      ['telemetry fabricated string', { ...record(), data: { ...record().data, telemetry: { ...record().data.telemetry, runtimeMs: 'unknown' } } }],
    ];
    for (const [label, value] of cases) { const attempt = await prepare(value); assert.equal(attempt.status, 1, label); assert.deepEqual(await readFile(output), originalBytes, label); }
    await rm(output);
    const unknown = record(); unknown.data.execution = 'unknown'; unknown.data.report.status = 'unknown'; unknown.data.report.availability = 'unavailable'; unknown.data.report.summary = '';
    assert.equal((await prepare(unknown)).status, 0);
    await rm(output);
    const legacy = record(); legacy.data.execution = 'completed';
    legacy.data.report = { schemaVersion: 1, kind: 'maintenance', scheduledFor: time, runId: legacy.key, provenance: 'manual', status: 'completed', coverage: 'partial', summary: 'Bounded source review.', findings: 0, evidenceRefs: [], sourceWindow: { start: '2025-12-31T00:00:00Z', end: time }, generatedAt: time };
    assert.equal((await prepare(legacy)).status, 0);
    await rm(output);
    const target = join(directory, 'target.json'); await writeFile(target, 'unchanged'); await symlink(target, output);
    assert.equal((await prepare(record())).status, 1); assert.equal(await readFile(target, 'utf8'), 'unchanged');
    await rm(output);
    const ordinary = join(directory, 'ordinary'); await mkdir(ordinary); const alias = join(directory, 'alias'); await symlink(ordinary, alias);
    await writeFile(input, JSON.stringify(record()));
    const badAncestor = spawnSync(process.execPath, [executable, 'prepare', '--namespace', 'own', '--automation-id', 'daily', '--file', input, '--to', join(alias, 'record.json')], { cwd: directory, encoding: 'utf8' });
    assert.equal(badAncestor.status, 1); assert.match(badAncestor.stderr, /ancestry/);
    const source = await readFile(executable, 'utf8');
    assert.equal(source.includes(root), false); assert.equal(source.includes('/Volumes/fixture-volume/'), false); assert.equal(source.includes('/Users/example-owner'), false);
    assert.equal(/^import .*from ['"]\.\//m.test(source), false);
    const manifest = JSON.parse(await readFile(join(root, '.local/reporting-cloud/manifest.json'), 'utf8'));
    assert.equal(manifest.sha256, hash(Buffer.from(source))); assert.equal(manifest.bytes, Buffer.byteLength(source));
    for (const entry of manifest.sources) { const actual = await readFile(join(root, entry.path)); assert.equal(entry.sha256, hash(actual)); assert.equal(entry.bytes, actual.length); assert.match(entry.commit, /^[a-f0-9]{40}$/); }
    const schema = await readFile(join(root, 'schemas/automation-reporting-v1.schema.json'));
    assert.equal(manifest.schema.sha256, hash(schema));
    assert.deepEqual(await readFile(join(root, '.local/reporting-cloud/automation-reporting-v1.schema.json')), schema);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
