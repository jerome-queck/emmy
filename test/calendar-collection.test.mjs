import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCalendarSnapshot } from '../src/calendar-collection.mjs';
import { digest } from '../src/records.mjs';

const scope = { environment: 'synthetic-local', accountId: 'declared-account', window: { start: '2026-10-27T00:00:00+08:00', end: '2026-11-03T00:00:00+08:00', timeZone: 'Asia/Singapore' } };
const fixed = () => '2026-10-27T01:00:00.000Z';
const calendarList = '/calendar/v3/users/me/calendarList';
const taskLists = '/tasks/v1/users/@me/lists';
const events = id => `/calendar/v3/calendars/${encodeURIComponent(id)}/events`;
const tasks = id => `/tasks/v1/lists/${encodeURIComponent(id)}/tasks`;

function fixture(routes) {
  const calls = [];
  const request = async call => {
    calls.push(structuredClone(call));
    const key = `${call.path}|${call.query.pageToken ?? ''}`;
    assert.ok(Object.hasOwn(routes, key), `Unexpected request ${key}`);
    const response = routes[key];
    if (response instanceof Error) throw response;
    return structuredClone(response);
  };
  return { request, calls };
}

const route = (path, token = '') => `${path}|${token}`;
const run = (transport, options = {}) => collectCalendarSnapshot({ request: transport.request, scope, now: fixed, ...options });

test('discovers every calendar and task list and collects raw rows with unfiltered bounded queries', async () => {
  const rawTask = { id: 'z-task', title: 'Read whole source', notes: 'Keep  spaces\r\nUnicode π and <tags>\n', due: '2020-01-01T00:00:00.000Z', status: 'completed', hidden: true, deleted: false, assignmentInfo: { surfaceType: 'SPACE' } };
  const rawEvent = { id: 'z-event', eventType: 'workingLocation', status: 'cancelled', originalStartTime: { dateTime: '2026-10-27T10:00:00+08:00' }, recurringEventId: 'series', description: 'Raw\r\n  spacing', updated: '2021-01-01T00:00:00.000Z' };
  const calendarRows = [{ id: 'z/calendar', summary: 'Original', summaryOverride: 'Renamed', timeZone: 'Asia/Singapore', accessRole: 'owner', hidden: true }, { id: 'removed', deleted: true }];
  const transport = fixture({
    [route(calendarList)]: { items: calendarRows, nextPageToken: 'calendars-2' },
    [route(calendarList, 'calendars-2')]: { items: [{ id: 'a-new', summary: 'Newly discovered', timeZone: 'UTC', accessRole: 'reader' }] },
    [route(taskLists)]: { items: [{ id: 'z-list', title: 'Last' }], nextPageToken: 'lists-2' },
    [route(taskLists, 'lists-2')]: { items: [{ id: 'a-list', title: 'First' }] },
    [route(events('a-new'))]: {},
    [route(events('z/calendar'))]: { items: [rawEvent], nextPageToken: 'events-2' },
    [route(events('z/calendar'), 'events-2')]: { items: [{ id: 'a-event', eventType: 'focusTime', start: { date: '2026-10-27' }, end: { date: '2026-10-28' } }] },
    [route(tasks('a-list'))]: { items: [] },
    [route(tasks('z-list'))]: { items: [rawTask], nextPageToken: 'tasks-2' },
    [route(tasks('z-list'), 'tasks-2')]: { items: [{ id: 'a-task', deleted: true, status: 'needsAction' }] },
  });
  const snapshot = await run(transport);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.kind, 'calendar-register');
  assert.deepEqual(snapshot.scope, scope);
  assert.deepEqual(snapshot.calendars.map(row => row.id), ['a-new', 'z/calendar']);
  assert.deepEqual(snapshot.taskLists.map(row => row.id), ['a-list', 'z-list']);
  assert.deepEqual(snapshot.discovery.calendars.items, [
    { id: 'a-new', summary: 'Newly discovered', timeZone: 'UTC', accessRole: 'reader' },
    calendarRows[1], calendarRows[0],
  ]);
  assert.equal(snapshot.calendars[1].title, 'Renamed');
  assert.deepEqual(snapshot.calendars[1].events.map(row => row.id), ['a-event', 'z-event']);
  assert.deepEqual(snapshot.calendars[1].events[1], rawEvent);
  assert.deepEqual(snapshot.taskLists[1].tasks[1], rawTask);
  assert.equal(snapshot.discovery.calendars.pages[0].responseDigest, digest({ items: calendarRows, nextPageToken: 'calendars-2' }));
  assert.deepEqual(snapshot.discovery.calendars.pages.map(page => [page.requestToken, page.nextToken]), [[null, 'calendars-2'], ['calendars-2', null]]);
  for (const collection of [snapshot.discovery.calendars, snapshot.discovery.taskLists, ...snapshot.calendars.map(row => row.collection), ...snapshot.taskLists.map(row => row.collection)]) {
    assert.equal(collection.complete, true);
    assert.deepEqual(collection.gaps, []);
  }
  for (const call of transport.calls) {
    assert.deepEqual(Object.keys(call).sort(), ['path', 'query', 'service']);
    if (call.path === calendarList) assert.deepEqual(call.query, { maxResults: 250, showHidden: true, showDeleted: true, ...(call.query.pageToken ? { pageToken: call.query.pageToken } : {}) });
    else if (call.path === taskLists) assert.equal(call.query.maxResults, 1000);
    else if (call.service === 'calendar') {
      assert.deepEqual(call.query, { timeMin: scope.window.start, timeMax: scope.window.end, singleEvents: true, showDeleted: true, showHiddenInvitations: true, maxResults: 2500, ...(call.query.pageToken ? { pageToken: call.query.pageToken } : {}) });
    } else {
      assert.deepEqual(call.query, { maxResults: 100, showCompleted: true, showHidden: true, showDeleted: true, showAssigned: true, ...(call.query.pageToken ? { pageToken: call.query.pageToken } : {}) });
    }
  }
  for (const key of ['taskSchedules', 'mappings', 'sourceScopes', 'ownerDone']) assert.deepEqual(snapshot[key], []);
  assert.ok(!Object.hasOwn(snapshot.scope, 'authenticated'));
});

test('continues through empty pages at discovery and item queries', async () => {
  const transport = fixture({
    [route(calendarList)]: { nextPageToken: 'more-calendars' },
    [route(calendarList, 'more-calendars')]: { items: [{ id: 'cal' }] },
    [route(taskLists)]: { items: [], nextPageToken: 'more-lists' },
    [route(taskLists, 'more-lists')]: { items: [{ id: 'list' }] },
    [route(events('cal'))]: { items: [], nextPageToken: 'more-events' },
    [route(events('cal'), 'more-events')]: { items: [{ id: 'event' }] },
    [route(tasks('list'))]: { nextPageToken: 'more-tasks' },
    [route(tasks('list'), 'more-tasks')]: { items: [{ id: 'task' }] },
  });
  const snapshot = await run(transport);
  assert.equal(transport.calls.length, 8);
  assert.equal(snapshot.discovery.calendars.complete, true);
  assert.equal(snapshot.discovery.taskLists.complete, true);
  assert.equal(snapshot.calendars[0].collection.complete, true);
  assert.equal(snapshot.taskLists[0].collection.complete, true);
  assert.deepEqual(snapshot.calendars[0].events, [{ id: 'event' }]);
  assert.deepEqual(snapshot.taskLists[0].tasks, [{ id: 'task' }]);
});

for (const source of ['calendars', 'taskLists', 'events', 'tasks']) {
  test(`duplicate IDs keep the first raw row and refuse completeness for ${source}`, async () => {
    const path = source === 'calendars' ? calendarList : source === 'taskLists' ? taskLists : source === 'events' ? events('cal') : tasks('list');
    const transport = fixture({
      [route(calendarList)]: { items: source === 'events' ? [{ id: 'cal' }] : [] },
      [route(taskLists)]: { items: source === 'tasks' ? [{ id: 'list' }] : [] },
      [route(path)]: { items: [{ id: 'duplicate', title: 'first' }], nextPageToken: 'next' },
      [route(path, 'next')]: { items: [{ id: 'duplicate', title: 'conflicting' }] },
      ...(source === 'calendars' ? { [route(events('duplicate'))]: {} } : {}),
      ...(source === 'taskLists' ? { [route(tasks('duplicate'))]: {} } : {}),
    });
    const snapshot = await run(transport);
    const collection = source === 'calendars' || source === 'taskLists' ? snapshot.discovery[source] : source === 'events' ? snapshot.calendars[0].collection : snapshot.taskLists[0].collection;
    const items = source === 'calendars' || source === 'taskLists' ? collection.items : source === 'events' ? snapshot.calendars[0].events : snapshot.taskLists[0].tasks;
    assert.equal(collection.complete, false);
    assert.deepEqual(collection.gaps, ['duplicate-id']);
    assert.deepEqual(items, [{ id: 'duplicate', title: 'first' }]);
    assert.equal(collection.pages.length, 2);
  });
}

test('a repeating continuation cursor stops even when pages are empty', async () => {
  const transport = fixture({
    [route(calendarList)]: { items: [], nextPageToken: 'repeat' },
    [route(calendarList, 'repeat')]: { nextPageToken: 'repeat' },
    [route(taskLists)]: {},
  });
  const snapshot = await run(transport);
  assert.equal(snapshot.discovery.calendars.complete, false);
  assert.deepEqual(snapshot.discovery.calendars.gaps, ['cursor-loop']);
  assert.equal(snapshot.discovery.calendars.pages.length, 2);
  assert.equal(transport.calls.length, 3);
  assert.equal(snapshot.discovery.taskLists.complete, true);
});

test('partial source failure retains earlier rows and continues independent sources without provider error text', async () => {
  const secret = 'provider-message-with-sensitive-detail';
  const first = { id: 'retained', description: 'exact\r\nnotes', updated: '2001-01-01T00:00:00Z' };
  const transport = fixture({
    [route(calendarList)]: { items: [{ id: 'a-cal' }, { id: 'z-cal' }] },
    [route(taskLists)]: { items: [{ id: 'list' }] },
    [route(events('a-cal'))]: { items: [first], nextPageToken: 'next' },
    [route(events('a-cal'), 'next')]: new Error(secret),
    [route(events('z-cal'))]: { items: [{ id: 'independent' }] },
    [route(tasks('list'))]: { error: { message: secret, code: 403 } },
  });
  const snapshot = await run(transport);
  assert.equal(snapshot.calendars[0].collection.complete, false);
  assert.deepEqual(snapshot.calendars[0].collection.gaps, ['request-failed']);
  assert.deepEqual(snapshot.calendars[0].events, [first]);
  assert.equal(snapshot.calendars[0].collection.pages.length, 1);
  assert.equal(snapshot.calendars[1].collection.complete, true);
  assert.equal(snapshot.taskLists[0].collection.complete, false);
  assert.deepEqual(snapshot.taskLists[0].collection.gaps, ['request-failed']);
  assert.equal(snapshot.taskLists[0].collection.pages.length, 1);
  assert.ok(!JSON.stringify(snapshot).includes(secret));
});

for (const [body, gap] of [[null, 'invalid-page'], [[], 'invalid-page'], [{ items: {} }, 'invalid-page-items'], [{ items: [{ id: '' }, { id: 'kept' }] }, 'invalid-row'], [{ items: [{ id: 'kept' }], nextPageToken: 42 }, 'invalid-page-token']]) {
  test(`invalid page yields ${gap} and cannot certify discovery`, async () => {
    const transport = fixture({ [route(calendarList)]: body, [route(taskLists)]: {}, [route(events('kept'))]: {} });
    const snapshot = await run(transport);
    assert.equal(snapshot.discovery.calendars.complete, false);
    assert.deepEqual(snapshot.discovery.calendars.gaps, [gap]);
    assert.equal(snapshot.discovery.taskLists.complete, true);
    if (body?.items?.some?.(row => row.id === 'kept')) assert.equal(snapshot.discovery.calendars.items[0].id, 'kept');
  });
}

test('page and response-row bounds retain the bounded prefix and explicit gaps', async () => {
  const transport = fixture({
    [route(calendarList)]: { items: [{ id: 'cal' }], nextPageToken: 'unfetched' },
    [route(taskLists)]: { items: [{ id: 'list' }] },
    [route(events('cal'))]: { items: [{ id: 'event' }], nextPageToken: 'unfetched-events' },
    [route(tasks('list'))]: { items: Array.from({ length: 101 }, (_, index) => ({ id: `task-${String(index).padStart(3, '0')}` })) },
  });
  const snapshot = await run(transport, { maxPages: 1 });
  assert.deepEqual(snapshot.discovery.calendars.gaps, ['page-limit']);
  assert.deepEqual(snapshot.calendars[0].collection.gaps, ['page-limit']);
  assert.deepEqual(snapshot.taskLists[0].collection.gaps, ['row-limit']);
  assert.equal(snapshot.taskLists[0].tasks.length, 100);
  assert.ok(!snapshot.taskLists[0].tasks.some(row => row.id === 'task-100'));
  assert.equal(transport.calls.length, 4);
  assert.equal(snapshot.discovery.taskLists.complete, true);
});

test('retains source acquisition times and raw timestamp values without changing supplied scope', async () => {
  const input = structuredClone(scope);
  const rawBody = { items: [{ id: 'event', updated: '2000-01-01T00:00:00.000Z', description: 'original' }] };
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 27, 1, 0, tick++)).toISOString();
  const transport = fixture({ [route(calendarList)]: { items: [{ id: 'cal' }] }, [route(taskLists)]: { items: [{ id: 'list' }] }, [route(tasks('list'))]: {} });
  const request = async call => {
    if (call.path === events('cal')) return rawBody;
    if (call.path === tasks('list')) { rawBody.items[0].description = 'changed later'; input.accountId = 'changed later'; }
    return transport.request(call);
  };
  const snapshot = await collectCalendarSnapshot({ request, scope: input, now });
  assert.deepEqual(snapshot.scope, scope);
  assert.equal(snapshot.calendars[0].events[0].description, 'original');
  assert.equal(snapshot.calendars[0].events[0].updated, '2000-01-01T00:00:00.000Z');
  const first = snapshot.discovery.calendars;
  const last = snapshot.taskLists[0].collection;
  assert.ok(first.startedAt < first.pages[0].acquiredAt && first.pages[0].acquiredAt < first.completedAt);
  assert.ok(first.completedAt < last.startedAt && last.completedAt < snapshot.acquisition.completedAt);
  assert.notEqual(first.pages[0].acquiredAt, snapshot.acquisition.completedAt);
});

test('rejects invalid configuration before making a request', async () => {
  let calls = 0;
  const request = async () => { calls++; return {}; };
  for (const maxPages of [0, -1, 1.5, 1001, Infinity]) await assert.rejects(collectCalendarSnapshot({ request, scope, maxPages }), /maxPages/);
  for (const window of [
    { ...scope.window, end: scope.window.start },
    { ...scope.window, start: '2026-02-30T00:00:00Z' },
    { ...scope.window, start: '2026-10-27' },
    { ...scope.window, timeZone: 'invalid-zone' },
  ]) await assert.rejects(collectCalendarSnapshot({ request, scope: { ...scope, window } }), /scope.window/);
  assert.equal(calls, 0);
});
