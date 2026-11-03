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

async function exchange(t, role, source, items, itemFields, surface = 'connector') {
  const { directory, compile } = await setup(t);
  const { briefingCloudReadRequest, acquireCapturedBriefingSource } = await import('../src/briefing-cloud-exchange.mjs');
  const request = { schemaVersion: 1, role, account: 'primary@example.test', environment: 'dot-cloud', surface, maxReads: 1, maxBytes: 1048576 };
  const metadata = { ...source }; delete metadata.items;
  const payload = { rows: items, cursor: null };
  const observation = Buffer.from(JSON.stringify(metadata));
  const raw = Buffer.from(JSON.stringify({ structuredContent: payload }));
  const path = join(directory, 'original.raw'); await writeFile(path, raw);
  const projection = { contract: 'compiler-fields-v1', observationBytes: observation.toString('base64'), observationSha256: digest(observation), sourceFields: Object.fromEntries(Object.keys(metadata).map(key => [key, `/observation/${key}`])), itemsPointer: '/provider/rows', cursorPointer: '/provider/cursor', itemFields };
  const manifest = { schemaVersion: 1, request, captures: [{ readRequest: briefingCloudReadRequest(request), path, sha256: digest(raw), byteCount: raw.length, projection }] };
  const run = async (value = manifest) => acquireCapturedBriefingSource(value, { directory: join(directory, 'retained'), policy: plan().policy, now: () => at });
  return { manifest, run, compile, raw, path, directory };
}

test('cloud file exchange projects documented Calendar date fields through actual caller and CLI without shifting days', async t => {
  const input = plan();
  const fields = { nativeId: '/id', calendarId: '/calendarId', iCalUID: '/iCalUID', start: '/start/date', end: '/end/date', allDay: '/observation/allDay', title: '/summary', status: '/status', taskId: '/observation/taskId', timeZone: '/observation/calendarTimeZone' };
  const event = { id: 'date-only', calendarId: 'calendar-1', iCalUID: 'date@example.test', start: { date: '2026-11-03' }, end: { date: '2026-11-04' }, summary: 'Source date holiday', status: 'confirmed', observation: { allDay: true, taskId: null, calendarTimeZone: 'Asia/Singapore' } };
  const x = await exchange(t, 'calendar', input.calendar, [event], fields);
  const result = await x.run(); input.calendar = result.source;
  assert.equal(input.calendar.items[0].start, '2026-11-03'); assert.equal(input.calendar.items[0].end, '2026-11-04');
  assert.equal(input.calendar.items[0].timeZone, 'Asia/Singapore');
  const called = await x.compile(input); assert.equal(called.status, 3, called.stdout); assert.match(called.result.body, /All day Source date holiday/);
  input.calendar.items[0].end = '2026-11-03'; input.calendar.items[0].start = '2026-11-02';
  assert.doesNotMatch((await x.compile(input)).result.body, /Source date holiday/);
  for (const zone of [null, '', '+08:00', 'Invalid/Zone', 'America/Los_Angeles', 'UTC']) {
    input.calendar.items[0] = { ...result.source.items[0], timeZone: zone };
    assert.equal((await x.compile(input)).status, 2);
  }
  input.calendar.items[0] = { ...result.source.items[0], start: '2026-02-30' };
  assert.equal((await x.compile(input)).status, 2);
  await writeFile(x.path, Buffer.from('changed'));
  await assert.rejects(x.run(), /Failed acquisition/);
  assert.equal((await readFile(result.acquisition.responses[0].raw.sourceRef)).equals(x.raw), true);
});

test('cloud browser Task observations retain unknown overlays through file exchange and actual CLI', async t => {
  const input = plan();
  const task = { id: 'task-ui', list: 'tasks-1', name: 'Browser observed task', state: 'needsAction', date: input.day, deadline: null };
  const fields = { nativeId: '/id', listId: '/list', title: '/name', status: '/state', doDate: '/date', deadline: '/deadline' };
  const x = await exchange(t, 'tasks', input.tasks, [task], fields, 'browser');
  const result = await x.run(); input.tasks = result.source;
  assert.equal(result.acquisition.surface, 'browser'); assert.equal(input.tasks.items[0].ownerDismissed, null); assert.equal(input.tasks.items[0].manuallyMoved, null);
  const called = await x.compile(input); assert.equal(called.status, 3); assert.ok(called.result.gaps.includes('Task dismissal or move status unknown')); assert.doesNotMatch(called.result.body, /Browser observed task/);
  const wrong = structuredClone(x.manifest); wrong.captures[0].readRequest.request.surface = 'connector';
  await assert.rejects(x.run(wrong), /Failed acquisition/);
  const missing = structuredClone(x.manifest); missing.captures[0].projection.itemFields.status = '/absent';
  await assert.rejects(x.run(missing), /Failed acquisition/);
  const extra = structuredClone(x.manifest); extra.captures.push(extra.captures[0]);
  await assert.rejects(x.run(extra), /Unconsumed/);
});

test('generic projections require exact clocks, complete coverage and byte-correlated metadata', async t => {
  const input = plan(); input.tasks.complete = false; input.tasks.gaps = ['Source inventory incomplete'];
  const x = await exchange(t, 'tasks', input.tasks, [], null, 'browser');
  const result = await x.run(); assert.equal(result.acquisition.complete, false); assert.equal(result.source.complete, false); assert.deepEqual(result.source.gaps, input.tasks.gaps);
  const changed = structuredClone(result.acquisition); changed.responses[0].response.complete = true;
  assert.throws(() => normalizeBriefingSource(changed, [x.raw]), /projection differs/);
  const absent = structuredClone(x.manifest); absent.captures[0].projection.sourceFields.observedAt = '/missing-clock';
  await assert.rejects(x.run(absent), /Failed acquisition/);
  const sidecar = structuredClone(x.manifest); sidecar.captures[0].projection.observationBytes = Buffer.from(JSON.stringify({ ...input.tasks, complete: true })).toString('base64');
  await assert.rejects(x.run(sidecar), /Failed acquisition/);
  const oversized = structuredClone(x.manifest); oversized.captures[0].byteCount = 1;
  await assert.rejects(x.run(oversized), /Failed acquisition/);
  const file = join(x.directory, 'manifest.json'); await writeFile(file, JSON.stringify(x.manifest));
  const child = spawnSync(process.execPath, [resolve('scripts/briefing-cloud-exchange.mjs'), 'acquire', file, join(x.directory, 'cli-retained')], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).source.observedAt, at); assert.equal(JSON.parse(child.stdout).source.complete, false);
  const manifest = structuredClone(x.manifest); manifest.captures[0].sha256 = '0'.repeat(64);
  await assert.rejects(x.run(manifest), /Failed acquisition/);
});

async function flatCalendarExchange(t, events, change = value => value) {
  const { directory, compile } = await setup(t);
  const { briefingCloudReadRequest, acquireCapturedBriefingSource } = await import('../src/briefing-cloud-exchange.mjs');
  const input = plan(), source = { ...input.calendar }; delete source.items;
  const request = { schemaVersion: 1, role: 'calendar', account: 'primary@example.test', environment: 'dot-cloud', surface: 'connector', requestedCalendarId: 'calendar-1', resourceIds: source.resourceIds, window: source.window, maxReads: 1, maxBytes: 1048576 };
  const observation = change({ source, requestedCalendarId: 'calendar-1', provenance: { environment: 'dot-cloud', surface: 'connector', tool: 'calendar.search', sourceRef: 'synthetic-calendar-read-1' }, nextCursor: null });
  const sidecar = Buffer.from(JSON.stringify(observation));
  const raw = Buffer.from(JSON.stringify({ content: [{ type: 'text', text: 'Original provider block retained verbatim.' }], structuredContent: { events } }));
  const path = join(directory, 'flat.raw'); await writeFile(path, raw);
  const projection = { contract: 'calendar-search-flat-v1', observationBytes: sidecar.toString('base64'), observationSha256: digest(sidecar) };
  const manifest = { schemaVersion: 1, request, captures: [{ readRequest: briefingCloudReadRequest(request), path, sha256: digest(raw), byteCount: raw.length, projection }] };
  const run = (value = manifest) => acquireCapturedBriefingSource(value, { directory: join(directory, 'retained-flat'), policy: input.policy, now: () => at });
  return { run, manifest, input, compile, raw, sidecar, observation };
}
const flatEvent = (extra = {}) => ({ id: 'flat-1', summary: 'Midnight unknown', status: 'confirmed', start: '2026-11-03T00:00:00+08:00', end: '2026-11-04T00:00:00+08:00', recurring_event_id: null, original_start_time: null, ...extra });

test('reported flat Calendar shape keeps midnight and missing native metadata unknown with independent raw/sidecar pins', async t => {
  const x = await flatCalendarExchange(t, [flatEvent()]); const result = await x.run();
  const event = result.source.items[0];
  assert.equal(event.allDay, null); assert.equal(event.taskId, null); assert.equal(event.timeZone, null); assert.equal(event.calendarId, 'calendar-1');
  assert.equal(event.start, '2026-11-02T16:00:00.000Z');
  const retained = result.acquisition.responses[0].raw;
  assert.equal((await readFile(retained.sourceRef)).equals(x.raw), true);
  assert.equal(retained.projection.observationSha256, digest(x.sidecar));
  assert.equal(Buffer.from(retained.projection.observationBytes, 'base64').equals(x.sidecar), true);
  x.input.calendar = result.source;
  const called = await x.compile(x.input); assert.equal(called.status, 3, called.stdout);
  assert.match(called.result.body, /Timing type unknown Midnight unknown/); assert.doesNotMatch(called.result.body, /All day Midnight unknown|00:00 Midnight unknown/);
  for (const gap of ['Calendar all-day type unknown', 'Calendar native Task linkage unknown', 'Calendar source timezone unknown']) assert.ok(called.result.gaps.some(value => value.includes(gap)));
  const repeated = await x.run(); assert.deepEqual(repeated.source, result.source);
  const replay = structuredClone(result.acquisition); replay.responses[0].response.items[0].allDay = true;
  assert.throws(() => normalizeBriefingSource(replay, [x.raw]), /projection differs/);
  const changed = structuredClone(x.manifest); changed.captures[0].projection.observationBytes = Buffer.from(JSON.stringify({ ...x.observation, requestedCalendarId: 'other' })).toString('base64');
  await assert.rejects(x.run(changed), /Failed acquisition/);
});

test('flat Calendar preserves moved recurrence identities and cancelled occurrences without confusing native Tasks', async t => {
  const events = [flatEvent({ id: 'moved', summary: 'Moved recurrence', recurring_event_id: 'series', original_start_time: '2026-11-03T09:00:00+08:00', start: '2026-11-03T10:00:00+08:00', end: '2026-11-03T11:00:00+08:00' }), flatEvent({ id: 'cancelled', summary: 'Cancelled recurrence', status: 'cancelled', recurring_event_id: 'series', original_start_time: '2026-11-03T12:00:00+08:00' })];
  const x = await flatCalendarExchange(t, events); const result = await x.run();
  assert.equal(result.source.items[0].recurringEventId, 'series'); assert.equal(result.source.items[0].originalStartTime, '2026-11-03T01:00:00.000Z');
  assert.equal(result.source.items[1].status, 'cancelled'); assert.equal(result.source.items[0].taskId, null);
  x.input.tasks.items.push({ nativeId: 'moved', listId: 'tasks-1', title: 'Completed native Task', status: 'completed', ownerDismissed: false, manuallyMoved: false, doDate: x.input.day, deadline: null });
  x.input.calendar = result.source; const called = await x.compile(x.input);
  assert.equal(called.status, 3, called.stdout); assert.match(called.result.body, /Moved recurrence/); assert.doesNotMatch(called.result.body, /Cancelled recurrence|Completed native Task/);
  x.input.calendar.items.push({ ...result.source.items[0], nativeId: 'duplicate', start: '2026-11-03T03:00:00.000Z' });
  assert.equal((await x.compile(x.input)).status, 2);
});

test('flat Calendar rejects missing provenance, scope, clocks and invented metadata', async t => {
  const bound = await flatCalendarExchange(t, [flatEvent()]);
  const crossed = structuredClone(bound.manifest); crossed.request.requestedCalendarId = 'other';
  const { briefingCloudReadRequest } = await import('../src/briefing-cloud-exchange.mjs');
  crossed.captures[0].readRequest = briefingCloudReadRequest(crossed.request);
  await assert.rejects(bound.run(crossed), /Failed acquisition/);
  for (const change of [o => ({ ...o, requestedCalendarId: 'other' }), o => ({ ...o, provenance: null }), o => ({ ...o, source: { ...o.source, observedAt: null } }), o => ({ ...o, source: { ...o.source, acquiredResourceIds: ['other'] } }), o => ({ ...o, source: { ...o.source, window: { ...o.source.window, start: at } } }), o => ({ ...o, nextCursor: undefined })]) {
    const x = await flatCalendarExchange(t, [flatEvent()], change); await assert.rejects(x.run(), /Failed acquisition/);
  }
  for (const extra of [{ taskId: 'invented' }, { allDay: true }, { timeZone: 'Asia/Singapore' }, { start: '2026-11-03' }, { start: '2026-11-03T00:00:00' }, { start: '2026-02-30T00:00:00Z' }, { original_start_time: at }, { recurring_event_id: 'series' }]) {
    const x = await flatCalendarExchange(t, [flatEvent(extra)]); await assert.rejects(x.run(), /Failed acquisition/);
  }
});

test('flat Calendar retains partial coverage and original source clock without replay refresh', async t => {
  const x = await flatCalendarExchange(t, [flatEvent()], o => ({ ...o, source: { ...o.source, complete: false, paginationComplete: false, observedAt: '2026-11-02T23:50:00.000Z', gaps: ['Provider selected inventory only'] } }));
  const result = await x.run(); assert.equal(result.source.complete, false); assert.equal(result.source.paginationComplete, false); assert.equal(result.source.observedAt, '2026-11-02T23:50:00.000Z'); assert.equal(result.acquisition.complete, false);
  x.input.calendar = result.source; const called = await x.compile(x.input);
  assert.ok(called.result.gaps.includes('calendar acquisition incomplete')); assert.ok(called.result.gaps.includes('calendar original source stale')); assert.ok(called.result.gaps.includes('calendar: Provider selected inventory only'));
});
