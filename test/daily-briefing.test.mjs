import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dailyFixture } from '../verification/daily-briefing-fixtures.mjs';
import { compileDailyBriefing, dailyBriefing } from '../src/daily-briefing.mjs';
const now = '2026-11-03T01:00:00.000Z';
async function fixture(t) { const directory = await realpath(await mkdtemp(join(tmpdir(), 'daily-briefing-'))); t.after(() => rm(directory, { recursive: true, force: true })); return { directory, ...await dailyFixture(directory, now) }; }
async function changeSource(f, role, mutate) { const ref = f.input.sources.find(row => row.role === role); const source = JSON.parse(await readFile(ref.artifact.path)); mutate(source); ref.artifact = await f.save(`${role}.json`, source); }
test('exact occurrence publication is deterministic, duplicate safe, direct and held', async t => {
  const f = await fixture(t); const request = { action: 'compile', directory: f.directory, input: f.input };
  const first = await dailyBriefing(request, { now }); assert.equal(first.status, 'published');
  assert.equal((await dailyBriefing(request, { now })).status, 'identical');
  await writeFile(join(f.directory, 'unrelated-malformed.json'), 'not JSON');
  const read = { action: 'read', directory: f.directory, identity: f.input.identity, maxAgeSeconds: 300 };
  const before = await readdir(f.directory); const result = await dailyBriefing(read, { now }); assert.equal(result.status, 'available'); assert.equal(result.result.effectsAuthorized, false); assert.equal(result.delivery, 'unverified'); assert.equal(result.result.execution, 'compiled-only'); assert.match(result.result.body, /Complete saved owner policy missing/); assert.deepEqual(await readdir(f.directory), before);
  assert.equal((await dailyBriefing(read, { now: '2026-11-03T01:05:00.001Z' })).status, 'stale');
  const original = await readFile(first.path); await changeSource(f, 'gmail', source => { source.items[0].judgment.reason = 'Changed proposed plan'; });
  assert.equal((await dailyBriefing(request, { now })).status, 'conflict'); assert.deepEqual(await readFile(first.path), original); assert.equal((await dailyBriefing(read, { now })).status, 'conflict');
});
test('missing Inbox reviews, resources, stale sources and unsafe context stay explicit', async t => {
  const f = await fixture(t);
  await changeSource(f, 'gmail', source => { source.inboxIds.push('omitted'); source.items[0].judgment.action = 'trash'; source.items[0].context.unreadPreserved = false; });
  await changeSource(f, 'calendar', source => { source.containerIds.push('missing-calendar'); source.observedAt = '2026-11-03T00:00:00.000Z'; });
  const { result } = await compileDailyBriefing(f.input, { now }); assert.equal(result.coverage, 'partial'); assert.match(result.gaps.join('|'), /Inbox IDs lack full review/); assert.match(result.gaps.join('|'), /resources not acquired/); assert.match(result.gaps.join('|'), /stale original source/); assert.match(result.body, /Keep; review held/); assert.doesNotMatch(result.body, /Recoverable Trash proposed/); assert.equal(result.effectsAuthorized, false);
});
test('wrong adapter, future clocks, changed bytes, duplicate IDs and malformed judgments refuse', async t => {
  for (const mutation of [source => { source.surface = 'connector'; }, source => { source.observedAt = '2026-11-03T02:00:00.000Z'; }, source => { source.inboxIds.push(source.inboxIds[0]); }, source => { source.items[0].judgment.action = 'purge'; }, source => { source.items[0].nativeId = 'outside-inventory'; }]) {
    const f = await fixture(t); await changeSource(f, 'outlook', mutation); await assert.rejects(compileDailyBriefing(f.input, { now }));
  }
  const f = await fixture(t); await writeFile(f.input.sources[0].artifact.path, '{}'); await assert.rejects(compileDailyBriefing(f.input, { now }), /bytes changed/);
});
test('origin and policy bytes cannot grant execution or recreate missing policy', async t => {
  const f = await fixture(t); f.input.policy = await f.save('policy.json', { complete: true, permission: 'purge' });
  const { result } = await compileDailyBriefing(f.input, { now }); assert.equal(result.effectsAuthorized, false); assert.match(result.gates[0], /independent semantic comparison/);
  f.input.identity.provenance = 'scheduled'; await assert.rejects(compileDailyBriefing(f.input, { now }));
  f.input.identity.scheduledFor = now; assert.equal((await compileDailyBriefing(f.input, { now })).result.identity.provenance, 'scheduled');
  f.input.identity.day = '2026-11-02'; await assert.rejects(compileDailyBriefing(f.input, { now }));
});
test('self-consistent digests cannot admit malformed retained coverage or missing holds', async t => {
  const { createHash } = await import('node:crypto');
  const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  for (const mutate of [value => { value.sources = []; }, value => { value.coverage = 'invented-status'; }, value => { value.gaps = 'malformed'; }, value => { value.gates = []; }, value => { value.sources[0].ageMs = 1; }]) {
    const f = await fixture(t); const published = await dailyBriefing({ action: 'compile', directory: f.directory, input: f.input }, { now });
    const value = JSON.parse(await readFile(published.path)); mutate(value); delete value.artifactDigest; value.artifactDigest = createHash('sha256').update(canonical(value)).digest('hex'); await writeFile(published.path, JSON.stringify(value));
    await assert.rejects(dailyBriefing({ action: 'read', directory: f.directory, identity: f.input.identity, maxAgeSeconds: 300 }, { now }));
  }
});
test('maximum-length source gaps remain readable after report prefixes', async t => {
  const f = await fixture(t); await changeSource(f, 'gmail', source => { source.gaps = ['x'.repeat(2000)]; });
  assert.equal((await dailyBriefing({ action: 'compile', directory: f.directory, input: f.input }, { now })).status, 'published');
  assert.equal((await dailyBriefing({ action: 'read', directory: f.directory, identity: f.input.identity, maxAgeSeconds: 300 }, { now })).status, 'partial');
});
