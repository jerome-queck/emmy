import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireBriefingPlanSource } from '../src/briefing-cloud-caller.mjs';
import { normalizeBriefingSource } from '../src/briefing-source-normalization.mjs';
import { digest } from '../src/records.mjs';
import { plan, at } from './fixtures/briefing-policy.mjs';

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'briefing-normalization-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let ordinal = 0;
  const adapters = { policy: plan().policy, now: () => at, async completeAcquisition() {},
    async retainRaw(bytes, metadata) { const sourceRef = join(directory, `${ordinal++}.json`); await writeFile(sourceRef, bytes, { flag: 'wx' }); return { ...metadata, sourceRef }; },
    readRaw: ref => readFile(ref.sourceRef) };
  async function acquire(role, pages, extra = {}) {
    let index = 0;
    return acquireBriefingPlanSource({ schemaVersion: 1, role, account: role === 'outlook' ? 'school@example.test' : 'primary@example.test', environment: 'dot-cloud', surface: role === 'outlook' ? 'browser' : 'connector', maxReads: pages.length, maxBytes: 1048576 }, { ...adapters, async read() { const value = pages[index++]; return { raw: JSON.stringify({ structuredContent: value }), value }; }, ...extra });
  }
  const page = (source, extra = {}) => ({ ...source, ...(source.adapter ? { unreadPreserved: true } : {}), nextCursor: null, ...extra });
  async function compile(input) {
    const file = join(directory, `request-${ordinal++}.json`); await writeFile(file, JSON.stringify({ action: 'prepare', input }));
    const called = spawnSync(process.execPath, [resolve('scripts/agent.mjs'), 'daily-briefing', '--file', file], { encoding: 'utf8' });
    return { status: called.status, result: JSON.parse(called.stdout).data, stdout: called.stdout };
  }
  return { directory, adapters, acquire, page, compile };
}

test('actual caller raw retention normalizes four existing source contracts into real CLI compiler', async t => {
  const { acquire, page, compile } = await setup(t); const input = plan();
  const originals = structuredClone(input);
  for (const role of ['gmail', 'outlook', 'calendar', 'tasks']) {
    const source = ['gmail', 'outlook'].includes(role) ? input.mail.find(row => row.adapter === role) : input[role];
    const normalized = await acquire(role, [page(source)]);
    assert.deepEqual(normalized.source, source);
    if (source.adapter) input.mail[input.mail.indexOf(source)] = normalized.source; else input[role] = normalized.source;
  }
  const called = await compile(input); const direct = await compile(originals);
  assert.equal(called.status, direct.status); assert.deepEqual(called.result, direct.result);
  assert.equal(called.result.inputDigest, digest(input));
});

test('unknown overlays stay null through caller and compiler, future do-dates stay distinct from deadlines', async t => {
  const { acquire, page, compile } = await setup(t); const input = plan();
  const task = { nativeId: 'unknown', listId: 'tasks-1', title: 'Unknown overlay', status: 'needsAction', doDate: input.day, deadline: null };
  input.tasks.items = [task, { ...task, nativeId: 'future', title: 'Future study', ownerDismissed: false, manuallyMoved: false, doDate: '2026-11-05' }, { ...task, nativeId: 'deadline', title: 'Real deadline', ownerDismissed: false, manuallyMoved: false, doDate: '2026-11-05', deadline: '2026-11-05T00:00:00.000Z' }];
  input.tasks = (await acquire('tasks', [page(input.tasks)])).source;
  assert.equal(input.tasks.items[0].ownerDismissed, null); assert.equal(input.tasks.items[0].manuallyMoved, null);
  const called = await compile(input); assert.equal(called.status, 3, called.stdout);
  assert.doesNotMatch(called.result.body, /Unknown overlay|Future study/); assert.match(called.result.body, /Real deadline.*Study do-date.*Deadline/);
  assert.ok(called.result.gaps.includes('Task dismissal or move status unknown'));
});

test('partial first page, original clocks and gaps survive complete terminal page', async t => {
  const { acquire, page, compile } = await setup(t); const input = plan();
  const first = page(input.tasks, { complete: false, gaps: ['original gap'], observedAt: '2026-11-02T23:59:00.000Z', nextCursor: 'second' });
  const second = page(input.tasks);
  const normalized = await acquire('tasks', [first, second]);
  assert.equal(normalized.acquisition.complete, false); assert.equal(normalized.source.complete, false);
  assert.equal(normalized.source.observedAt, first.observedAt); assert.deepEqual(normalized.source.gaps, ['original gap']);
  input.tasks = normalized.source; const called = await compile(input); assert.equal(called.status, 3); assert.ok(called.result.gaps.includes('tasks acquisition incomplete'));
});

test('divergent structured values and changed retained bytes cannot normalize', async t => {
  const { acquire, page } = await setup(t); const source = plan().tasks;
  await assert.rejects(acquire('tasks', [page(source)], { async read() { return { raw: JSON.stringify(page(source)), value: { ...page(source), items: ['invented'] } }; } }), /Failed acquisition/);
  await assert.rejects(acquire('tasks', [page(source)], { async readRaw() { return Buffer.from(JSON.stringify(page(source, { complete: false }))); } }), /raw source bytes/);
  const normalized = await acquire('tasks', [page(source)]);
  normalized.acquisition.responses[0].response.complete = false;
  await assert.rejects((async () => normalizeBriefingSource(normalized.acquisition, [await readFile(normalized.acquisition.responses[0].raw.sourceRef)]))(), /projection differs/);
});

test('missing unknown coverage, clocks, context and source identities refuse without defaults', async t => {
  const { acquire, page, compile } = await setup(t);
  for (const key of ['complete', 'paginationComplete', 'observedAt', 'capturedAt']) {
    for (const value of [undefined, null, 'false', 0]) {
      const source = page(plan().tasks); if (value === undefined) delete source[key]; else source[key] = value;
      await assert.rejects(acquire('tasks', [source]), /Failed acquisition|source fields|clocks|coverage/);
    }
  }
  await assert.rejects(acquire('gmail', [page(plan().mail[0], { account: 'other@example.test' })]), /mailbox identity/);
  await assert.rejects(acquire('outlook', [page(plan().mail[1], { unreadPreserved: null })]), /Failed acquisition/);
  const input = plan(); delete input.mail[0].items[0].context.safeUnreadInspection;
  input.mail[0] = (await acquire('gmail', [page(input.mail[0])])).source;
  assert.equal((await compile(input)).status, 2);
});

test('inventory/window changes, malformed context counts and unbound cursor chains refuse', async t => {
  const { acquire, page } = await setup(t); const source = plan().tasks;
  await assert.rejects(acquire('tasks', [page(source, { nextCursor: 'second' }), page(source, { resourceIds: ['other'] })]), /same full source inventory/);
  const normalized = await acquire('tasks', [page(source)]);
  normalized.acquisition.responses[0].raw.cursor = 'unbound';
  assert.throws(() => normalizeBriefingSource(normalized.acquisition, [JSON.stringify({ structuredContent: page(source) })]), /cursor chain/);
  await assert.rejects(acquire('gmail', [page(plan().mail[0], { expandedContextCount: null })]), /context count/);
});

test('existing mail projection reaches compiler only with exact retained compiler-source witness', async t => {
  const { acquire, compile } = await setup(t); const input = plan();
  for (const role of ['gmail', 'outlook']) {
    const source = input.mail.find(row => row.adapter === role);
    const projection = { contract: role === 'gmail' ? 'gmail-readonly-page-v1' : 'outlook-ui-page-v1', itemsPointer: '/capture/items', observedAtPointer: '/capture/observedAt', completePointer: '/capture/complete', cursorPointer: '/cursor', unreadBeforePointer: '/before', unreadAfterPointer: '/after', sourcePointer: '/capture' };
    const raw = JSON.stringify({ structuredContent: { capture: source, cursor: null, before: true, after: true } });
    const result = await acquire(role, [null], { async read() { return { raw, projection }; } });
    assert.deepEqual(result.source, source);
    input.mail[input.mail.indexOf(source)] = result.source;
    const missing = { ...projection }; delete missing.sourcePointer;
    await assert.rejects(acquire(role, [null], { async read() { return { raw, projection: missing }; } }), /compiler source witness/);
    await assert.rejects(acquire(role, [null], { async read() { return { raw, projection: { ...projection, itemsPointer: '/other' } }; } }), /Failed acquisition/);
  }
  const called = await compile(input); assert.equal(called.result.inputDigest, digest(input));
});
