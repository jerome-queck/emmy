import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { recordDigest } from '../src/automation-reporting.mjs';

export async function driveAutomationReporting({ run, scenario, evidenceDir, report }) {
  const retained = join(evidenceDir, 'automation-reporting');
  const directory = join(retained, 'store'); await mkdir(directory, { recursive: true });
  const at = new Date().toISOString(); let sequence = 0;
  const call = async (request, expected = 0) => {
    const file = join(retained, `request-${++sequence}.json`);
    await writeFile(file, JSON.stringify({ directory, ...request }));
    return run(['reporting', '--file', file], expected);
  };
  const envelope = (kind, key, data) => ({ schemaVersion: 1, namespace: 'fixture', automationId: 'review', kind, key, revision: 0, previous: null, recordedAt: at, data });
  const record = envelope('run', 'attempt-one', { occurrenceKey: null, execution: 'completed', coverage: 'partial', report: null, evidenceRefs: ['synthetic-original-source'] });
  assert.equal((await call({ action: 'dry-run', namespace: 'fixture', record })).writes, false);
  assert.deepEqual(await readdir(directory), []);
  const original = await call({ action: 'publish-own-record', namespace: 'fixture', record });
  assert.equal(original.status, 'published');
  assert.equal((await call({ action: 'publish-own-record', namespace: 'fixture', record })).status, 'identical');
  await call({ action: 'publish-own-record', namespace: 'foreign', record }, 2);
  const first = await call({ action: 'status' }, 3);
  assert.equal(first.runs[0].execution, 'completed'); assert.equal(first.runs[0].evidenceCoverage, 'partial'); assert.equal(first.runs[0].userDelivery, 'pending');
  const conflicting = { ...record, data: { ...record.data, execution: 'failed' } };
  await call({ action: 'publish-own-record', namespace: 'fixture', record: conflicting });
  const disputed = await call({ action: 'reconcile' }, 3);
  assert.ok(disputed.runs.every(value => value.execution === 'unknown' && value.conflict));
  assert.equal((await call({ action: 'list', limit: 1 }, 3)).items.length, 1);
  const path = join(directory, 'fixture', `${recordDigest(record)}.json`);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), record);
  const bytes = '{'; await writeFile(join(directory, 'fixture', `${'f'.repeat(64)}.json`), bytes);
  const corrupt = await call({ action: 'diagnose' }, 3);
  assert.equal(corrupt.scan.complete, false); assert.ok(corrupt.runs.every(value => value.execution === 'unknown'));
  report.automationReporting = { retained, original: path, originalDigest: recordDigest(record), synthetic: true };
  scenario('automation-reporting', 'Fresh CLI processes retain immutable own records, no-write dry-run, duplicate retry, coverage distinct from completed execution, conflict branches and corrupt sync without replaying workloads.');
}
