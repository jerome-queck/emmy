import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { executeBriefing } from '../src/briefing-core.mjs';
import { plan } from './fixtures/briefing-policy.mjs';

test('daily CLI uses the portable policy compiler without creating artifact slots', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'daily-compiler-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'request.json'); const input = plan();
  await writeFile(file, JSON.stringify({ action: 'prepare', input }));
  const invoke = () => spawnSync(process.execPath, [resolve('scripts/agent.mjs'), 'daily-briefing', '--file', file, '--home', join(directory, 'home')], { encoding: 'utf8' });
  const before = await readdir(directory); const first = invoke(); assert.equal(first.status, 3, first.stdout);
  const actual = JSON.parse(first.stdout).data; assert.deepEqual(actual, executeBriefing({ action: 'prepare', input }, { now: new Date().toISOString() }));
  assert.equal(JSON.parse(invoke().stdout).data.bodyDigest, actual.bodyDigest);
  assert.deepEqual(await readdir(directory), before);
  for (const request of [{ action: 'prepare', input: { ...input, asOf: '9999-11-03T01:00:00.000Z', day: '9999-11-03' } }, { action: 'prepare', input: {} }]) {
    await writeFile(file, JSON.stringify(request)); const refused = invoke(); assert.equal(refused.status, 2); assert.equal(JSON.parse(refused.stdout).ok, false);
  }
  for (const raw of [Buffer.from([255]), '{"action":"foundation","input":{},"action":"foundation"}']) {
    await writeFile(file, raw); const refused = invoke(); assert.equal(refused.status, 2); assert.equal(JSON.parse(refused.stdout).ok, false);
    assert.deepEqual(await readFile(file), Buffer.from(raw)); assert.deepEqual(await readdir(directory), before);
  }
});

test('retired v1 compile/read refuse and preserve original artifacts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'daily-retirement-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = join(directory, 'historical.json'); const original = Buffer.from('exact old artifact, completion and native identities retained'); await writeFile(artifact, original);
  const file = join(directory, 'request.json');
  const identity = { day: '2026-11-03', provenance: 'manual', scheduledFor: null }; const asOf = '2026-11-03T01:00:00.000Z';
  const sources = [];
  for (const role of ['gmail', 'outlook', 'calendar', 'tasks']) {
    const source = { schemaVersion: 1, role, account: `${role}@example.invalid`, surface: role === 'outlook' ? 'browser' : 'connector', observedAt: asOf, capturedAt: asOf, complete: true, gaps: [], ...(['gmail', 'outlook'].includes(role) ? { inboxIds: [], items: [] } : { window: { start: '2026-11-02T16:00:00.000Z', end: '2026-11-03T16:00:00.000Z' }, containerIds: [], containers: [] }) };
    const path = join(directory, `${role}.json`); const raw = JSON.stringify(source); await writeFile(path, raw);
    sources.push({ role, artifact: { path, sha256: createHash('sha256').update(raw).digest('hex') } });
  }
  const legacyInput = { schemaVersion: 1, identity, asOf, policy: null, sources };
  for (const request of [{ action: 'compile', directory, input: legacyInput }, { action: 'read', directory, identity, maxAgeSeconds: 300 }, { action: 'compile', input: {} }, { action: 'read', input: {} }]) {
    await writeFile(file, JSON.stringify(request)); const before = await readdir(directory);
    const result = spawnSync(process.execPath, [resolve('scripts/agent.mjs'), 'daily-briefing', '--file', file], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).ok, false);
    assert.deepEqual(await readFile(artifact), original); assert.deepEqual(await readdir(directory), before);
  }
});
