import { canonical, digest, timestamp } from './records.mjs';

const pageLimit = 1000;
const sizes = { calendars: 250, events: 2500, taskLists: 1000, tasks: 100 };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = value => typeof value === 'string' && value.trim().length > 0;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const byId = (left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

function json(value, ancestors = new Set(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth > 100 || (!Array.isArray(value) && !object(value)) || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every(entry => json(entry, ancestors, depth + 1));
  ancestors.delete(value);
  return valid;
}

function instant(value) {
  if (typeof value !== 'string') return false;
  const parts = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!parts || +parts[2] > 23 || +parts[3] > 59 || +parts[4] > 59 || parts[5] !== 'Z' && (+parts[6] > 14 || +parts[7] > 59 || +parts[6] === 14 && +parts[7] !== 0) || !Number.isFinite(Date.parse(value))) return false;
  const day = new Date(`${parts[1]}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === parts[1];
}

function validateScope(scope) {
  requireValue(object(scope) && text(scope.environment) && text(scope.accountId) && object(scope.window) && json(scope), 'scope must declare an environment, accountId and window');
  const { start, end, timeZone } = scope.window;
  requireValue(instant(start) && instant(end) && Date.parse(start) < Date.parse(end), 'scope.window must have bounded, ordered offset-bearing instants');
  requireValue(text(timeZone) && !/^[+-]/.test(timeZone), 'scope.window.timeZone must be a named time zone');
  try { new Intl.DateTimeFormat('en', { timeZone }); }
  catch { throw new Error('scope.window.timeZone must be a named time zone'); }
}

async function collectPages({ request, service, path, query, maxPages, now }) {
  const result = { complete: false, startedAt: now(), completedAt: null, pages: [], gaps: [], items: [] };
  const ids = new Set();
  const tokens = new Set();
  let token = null;
  const gap = name => { if (!result.gaps.includes(name)) result.gaps.push(name); };
  for (let page = 0; page < maxPages; page++) {
    const pageQuery = { ...query, ...(token === null ? {} : { pageToken: token }) };
    let body;
    try { body = await request({ service, path, query: { ...pageQuery } }); }
    catch { gap('request-failed'); break; }
    const acquiredAt = now();
    if (!json(body)) { gap('invalid-page'); break; }
    body = structuredClone(body);
    const next = object(body) && body.nextPageToken !== undefined ? body.nextPageToken : null;
    result.pages.push({ requestToken: token, nextToken: typeof next === 'string' ? next : null, responseDigest: digest(canonical(body)), acquiredAt, query: pageQuery });
    if (!object(body)) { gap('invalid-page'); break; }
    if (Object.hasOwn(body, 'error')) { gap('request-failed'); break; }
    if (body.items !== undefined && !Array.isArray(body.items)) { gap('invalid-page-items'); break; }
    const rows = body.items ?? [];
    if (rows.length > query.maxResults) gap('row-limit');
    for (const row of rows.slice(0, query.maxResults)) {
      if (!object(row) || !text(row.id)) { gap('invalid-row'); continue; }
      if (ids.has(row.id)) { gap('duplicate-id'); continue; }
      ids.add(row.id);
      result.items.push(row);
    }
    if (next !== null && !text(next)) { gap('invalid-page-token'); break; }
    if (rows.length > query.maxResults) break;
    if (next === null) { result.complete = result.gaps.length === 0; break; }
    if (tokens.has(next)) { gap('cursor-loop'); break; }
    tokens.add(next);
    token = next;
    if (page === maxPages - 1) gap('page-limit');
  }
  result.items.sort(byId);
  result.completedAt = now();
  return result;
}

export async function collectCalendarSnapshot({ request, scope, now = () => new Date().toISOString(), maxPages = pageLimit }) {
  requireValue(typeof request === 'function', 'request must be an injected read-only transport');
  requireValue(typeof now === 'function', 'now must be a clock function');
  requireValue(Number.isSafeInteger(maxPages) && maxPages >= 1 && maxPages <= pageLimit, `maxPages must be an integer from 1 to ${pageLimit}`);
  validateScope(scope);
  const clock = () => timestamp(now(), 'acquisition timestamp');
  const declaredScope = structuredClone(scope);
  const startedAt = clock();
  const collect = (service, path, query) => collectPages({ request, service, path, query, maxPages, now: clock });
  const calendars = await collect('calendar', '/calendar/v3/users/me/calendarList', { maxResults: sizes.calendars, showHidden: true, showDeleted: true });
  const taskLists = await collect('tasks', '/tasks/v1/users/@me/lists', { maxResults: sizes.taskLists });
  const snapshot = {
    schemaVersion: 1,
    kind: 'calendar-register',
    scope: declaredScope,
    acquisition: { startedAt, completedAt: null },
    discovery: { calendars, taskLists },
    calendars: [],
    taskLists: [],
    taskSchedules: [],
    mappings: [],
    sourceScopes: [],
    ownerDone: [],
  };
  for (const calendar of calendars.items.filter(row => row.deleted !== true)) {
    const { items: events, ...collection } = await collect('calendar', `/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`, {
      timeMin: declaredScope.window.start,
      timeMax: declaredScope.window.end,
      singleEvents: true,
      showDeleted: true,
      showHiddenInvitations: true,
      maxResults: sizes.events,
    });
    snapshot.calendars.push({ id: calendar.id, title: calendar.summaryOverride ?? calendar.summary ?? '', timeZone: calendar.timeZone ?? null, accessRole: calendar.accessRole ?? null, collection, events });
  }
  for (const taskList of taskLists.items) {
    const { items: tasks, ...collection } = await collect('tasks', `/tasks/v1/lists/${encodeURIComponent(taskList.id)}/tasks`, {
      maxResults: sizes.tasks,
      showCompleted: true,
      showHidden: true,
      showDeleted: true,
      showAssigned: true,
    });
    snapshot.taskLists.push({ id: taskList.id, title: taskList.title ?? '', collection, tasks });
  }
  snapshot.acquisition.completedAt = clock();
  return snapshot;
}
