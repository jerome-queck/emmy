import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { driveAutomationReporting } from '../verification/automation-reporting/drive.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, '.local/verification', `reporting-harness-${randomUUID()}`);
await mkdir(evidence, { recursive: true });
const original = await readFile(join(root, 'verification/automation-reporting/drive.mjs'), 'utf8');
const edit = (source, before, after) => { assert.equal(source.split(before).length, 2); return source.replace(before, after); };
async function variant(name, changes) {
  let source = original; for (const [before, after] of changes) source = edit(source, before, after);
  const file = join(evidence, `${name}.mjs`); await writeFile(file, source);
  return (await import(pathToFileURL(file))).driveAutomationReporting;
}
async function retained(name) {
  const directory = join(evidence, name, 'baseline-publication');
  const processResult = JSON.parse(await readFile(join(directory, 'process.json')));
  assert.ok(Number.isSafeInteger(processResult.pid));
  assert.throws(() => process.kill(processResult.pid, 0), error => error.code === 'ESRCH', 'Owned child must be gone after cleanup');
  return { directory, processResult };
}
test('forced GC keeps live checkpoint handles; all ordinary source witnesses restore', async () => {
  const result = await driveAutomationReporting(root, join(evidence, 'baseline'));
  assert.equal(result.mutants.length, 7); assert.equal(result.baseline.length, 3); assert.equal(result.restored.length, 3);
  const marker = JSON.parse(await readFile(join(evidence, 'baseline/baseline-publication/marker.json')));
  assert.equal(marker.gcStressed, true); assert.ok(marker.fd >= 0);
});
test('primary marker disagreement survives successful owned cleanup', async () => {
  const run = await variant('primary-driver', [['pid: process.pid, gcStressed', 'pid: process.pid + 1, gcStressed']]);
  await assert.rejects(run(root, join(evidence, 'primary')), error => error instanceof AggregateError && error.message.includes('Primary failure'));
  const { directory, processResult } = await retained('primary'); const failure = JSON.parse(await readFile(join(directory, 'failure.json')));
  assert.equal(processResult.signal, 'SIGKILL'); assert.equal(failure.primary.name, 'AssertionError'); assert.equal(failure.cleanup, null);
});
test('unexpected child exception fails strict SIGKILL assertion and cannot count as mutant', async () => {
  const run = await variant('cleanup-driver', [
    ['await new Promise(() => {});', "throw new Error('synthetic checkpoint failure');"],
    ["assert.ok(checkpoint, 'Writer must reach actual open-before-write boundary');", "assert.ok(checkpoint, 'Writer must reach actual open-before-write boundary'); await completion;"],
  ]);
  await assert.rejects(run(root, join(evidence, 'cleanup')), error => error instanceof AggregateError && error.message.includes('Cleanup failure'));
  const { directory, processResult } = await retained('cleanup'); const failure = JSON.parse(await readFile(join(directory, 'failure.json')));
  assert.equal(processResult.signal, null); assert.equal(processResult.code, 1); assert.match(processResult.output, /synthetic checkpoint failure/);
  assert.equal(failure.primary, null); assert.match(failure.cleanup.message, /SIGKILL/);
});
test('evidence-write failure joins the primary error instead of replacing it', async () => {
  const run = await variant('retention-driver', [
    ['pid: process.pid, gcStressed', 'pid: process.pid + 1, gcStressed'],
    ['let retentionError;', "await mkdir(join(trial.directory, 'failure.json')); let retentionError;"],
  ]);
  await assert.rejects(run(root, join(evidence, 'retention')), error => error instanceof AggregateError && error.errors.some(item => item.name === 'AssertionError') && error.errors.some(item => item.code === 'EISDIR') && error.message.includes('Evidence retention failure'));
  const { processResult } = await retained('retention'); assert.equal(processResult.signal, 'SIGKILL');
});
