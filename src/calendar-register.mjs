import { canonical, digest } from './records.mjs';

const fail = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 16384;
const array = value => Array.isArray(value) && value.length <= 100000;
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) && +value.slice(11, 13) < 24 && +value.slice(14, 16) < 60 && +value.slice(17, 19) < 60 && validDate(value.slice(0, 10));
const identityKey = identity => canonical(identity);
const same = (left, right) => canonical(left) === canonical(right);
const ms = value => Date.parse(value);
const iso = value => new Date(value).toISOString();
const fresh = (at, now, age) => stamp(at) && ms(at) <= ms(now) && ms(now) - ms(at) <= age;
const hash = value => digest(canonical(value));
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const clipped = (span, window) => ({ start: Math.max(span.start, window.start), end: Math.min(span.end, window.end) });
const mealTitle = title => /\b(?:breakfast|brunch|lunch|dinner|supper|meal(?:s)?)\b/iu.test(title);
const sourceLabel = (title, label) => [...title.matchAll(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu'))].some(match => !/[\p{L}\p{N}]/u.test(title[match.index - 1] ?? '') && !/[\p{L}\p{N}]/u.test(title[match.index + label.length] ?? ''));
const nativeIdentity = (snapshot, kind, containerId, nativeId) => ({ environment: snapshot.scope.environment, accountId: snapshot.scope.accountId, containerKind: kind, containerId, nativeId });

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function zone(value) {
  if (!text(value) || /^[+-]/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}
function span(value) { return object(value) && stamp(value.start) && stamp(value.end) && ms(value.start) < ms(value.end); }
function windowShape(value) { return span(value) && zone(value.timeZone); }
function exactIdentity(value) {
  return object(value) && same(Object.keys(value).sort(), ['accountId', 'containerId', 'containerKind', 'environment', 'nativeId']) && ['environment', 'accountId', 'containerId', 'nativeId'].every(key => text(value[key])) && ['calendar', 'task-list'].includes(value.containerKind);
}
function fieldsOnly(value, allowed, label) {
  fail(object(value) && Object.keys(value).every(key => allowed.includes(key)), `${label}: unsupported field`);
}

function localParts(instant, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant)).filter(part => part.type !== 'literal').map(part => [part.type, +part.value]));
}
function localDate(instant, timeZone) {
  const parts = localParts(instant, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
function wallClockMatches(instant, timeZone) {
  if (!stamp(instant) || !zone(timeZone)) return false;
  const p = localParts(ms(instant), timeZone);
  return localDate(ms(instant), timeZone) === instant.slice(0, 10) && p.hour === +instant.slice(11, 13) && p.minute === +instant.slice(14, 16) && p.second === +instant.slice(17, 19);
}
function midnight(date, timeZone) {
  fail(validDate(date) && zone(timeZone), 'Unreadable all-day date or source zone');
  const wanted = Date.parse(`${date}T00:00:00Z`);
  let candidate = wanted;
  for (let iteration = 0; iteration < 5; iteration++) {
    const p = localParts(candidate, timeZone);
    const delta = wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (!delta) return candidate;
    candidate += delta;
  }
  throw new Error('Unsupported all-day midnight transition');
}
function eventSpan(event, timeZone) {
  if (event.endTimeUnspecified === true) return null;
  if (event.start?.date !== undefined || event.end?.date !== undefined) {
    if (!validDate(event.start?.date) || !validDate(event.end?.date) || event.start.date >= event.end.date) return null;
    try { return { start: midnight(event.start.date, timeZone), end: midnight(event.end.date, timeZone) }; } catch { return null; }
  }
  if (!stamp(event.start?.dateTime) || !stamp(event.end?.dateTime) || ms(event.start.dateTime) >= ms(event.end.dateTime)) return null;
  for (const endpoint of [event.start, event.end]) {
    if (endpoint.timeZone !== undefined && !zone(endpoint.timeZone)) return null;
    if (endpoint.timeZone !== undefined && !wallClockMatches(endpoint.dateTime, endpoint.timeZone)) return null;
  }
  return { start: ms(event.start.dateTime), end: ms(event.end.dateTime) };
}

export function calendarSnapshotDigest(snapshot) { return hash(snapshot); }

export function validateCalendarSnapshot(snapshot) {
  fail(object(snapshot) && snapshot.schemaVersion === 1 && snapshot.kind === 'calendar-register', 'Unsupported calendar register schema');
  fail(object(snapshot.scope) && text(snapshot.scope.environment) && text(snapshot.scope.accountId) && windowShape(snapshot.scope.window), 'Invalid register scope');
  fail(stamp(snapshot.acquisition?.startedAt) && stamp(snapshot.acquisition?.completedAt) && ms(snapshot.acquisition.startedAt) <= ms(snapshot.acquisition.completedAt), 'Invalid acquisition bounds');
  fail(object(snapshot.discovery) && array(snapshot.calendars) && array(snapshot.taskLists), 'Missing provider discovery');
  for (const kind of ['calendars', 'taskLists']) {
    const discovery = snapshot.discovery[kind];
    fail(object(discovery) && typeof discovery.complete === 'boolean' && array(discovery.pages) && array(discovery.gaps), 'Invalid discovery coverage');
    fail(new Set(snapshot[kind].map(row => row.id)).size === snapshot[kind].length, 'Duplicate container identity');
    for (const row of snapshot[kind]) {
      fail(text(row.id) && text(row.title || '(untitled)') && object(row.collection) && typeof row.collection.complete === 'boolean' && array(row.collection.pages) && array(row.collection.gaps), 'Invalid collection');
      const items = row[kind === 'calendars' ? 'events' : 'tasks'];
      fail(array(items) && items.every(item => object(item) && text(item.id)) && new Set(items.map(item => item.id)).size === items.length, 'Duplicate or invalid native identity');
    }
  }
  for (const name of ['taskSchedules', 'mappings', 'sourceScopes', 'ownerDone']) fail(array(snapshot[name]), `Missing ${name}`);
  return snapshot;
}

export function validateCalendarRequest(request) {
  fieldsOnly(request, ['schemaVersion', 'snapshotDigest', 'window', 'workingIntervals', 'maxEvidenceAgeMs', 'mealPolicy', 'protectedIdentities', 'taskSchedules', 'mappings', 'sources', 'ownerDone', 'operations', 'attempts', 'history', 'visualReview'], 'request');
  fail(request.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(request.snapshotDigest) && windowShape(request.window), 'Invalid request binding or window');
  fail(Number.isSafeInteger(request.maxEvidenceAgeMs) && request.maxEvidenceAgeMs > 0 && request.maxEvidenceAgeMs <= 86400000, 'Evidence age must be 1 ms to 24 hours');
  fail(request.mealPolicy === 'protect-all', 'All meals must be protected');
  fail(array(request.workingIntervals) && request.workingIntervals.every(span), 'Invalid working intervals');
  for (const name of ['protectedIdentities', 'taskSchedules', 'mappings', 'sources', 'ownerDone', 'operations', 'attempts']) fail(array(request[name]) && request[name].length <= 2000, `Missing or excessive request ${name}`);
  fail(request.protectedIdentities.every(exactIdentity), 'Invalid protected identity');
  fail(object(request.history) && typeof request.history.complete === 'boolean' && stamp(request.history.completeThrough) && text(request.history.evidenceRef), 'Retained owner-done and attempt history coverage is required');
  for (const row of request.taskSchedules) {
    fieldsOnly(row, ['identity', 'taskDigest', 'observedAt', 'evidenceRef', 'window', 'complete', 'recurrenceCovered', 'intervals'], 'task schedule');
    fail(exactIdentity(row.identity) && row.identity.containerKind === 'task-list' && /^[a-f0-9]{64}$/.test(row.taskDigest) && stamp(row.observedAt) && text(row.evidenceRef) && windowShape(row.window) && typeof row.complete === 'boolean' && typeof row.recurrenceCovered === 'boolean' && array(row.intervals) && row.intervals.every(span), 'Invalid exact-ID native schedule readback');
  }
  for (const row of request.mappings) fail(exactIdentity(row.taskIdentity) && exactIdentity(row.eventIdentity) && row.taskIdentity.containerKind === 'task-list' && row.eventIdentity.containerKind === 'calendar' && text(row.evidenceRef) && stamp(row.observedAt) && /^[a-f0-9]{64}$/.test(row.taskDigest) && /^[a-f0-9]{64}$/.test(row.eventDigest), 'Invalid native projection mapping');
  for (const row of request.ownerDone) fail(exactIdentity(row.identity) && text(row.evidenceRef) && stamp(row.observedAt), 'Invalid owner-done evidence');
  for (const source of request.sources) {
    fieldsOnly(source, ['id', 'identity', 'name', 'reference', 'range', 'kind', 'actualDurationMinutes', 'dependsOn', 'completed'], 'source');
    fail(text(source.id) && exactIdentity(source.identity) && text(source.name) && text(source.reference) && text(source.range) && ['timed-attempt', 'correction', 'whole-source', 'ongoing-research'].includes(source.kind) && Number.isSafeInteger(source.actualDurationMinutes) && source.actualDurationMinutes > 0 && source.actualDurationMinutes <= 1440 && array(source.dependsOn) && source.dependsOn.every(text) && typeof source.completed === 'boolean', 'Invalid explicit source scope');
  }
  fail(new Set(request.sources.map(row => row.id)).size === request.sources.length, 'Duplicate source ID');
  for (const operation of request.operations) {
    fieldsOnly(operation, ['id', 'identity', 'baselineDigest', 'transport', 'changes', 'sourceId'], 'operation');
    fail(text(operation.id) && exactIdentity(operation.identity) && /^[a-f0-9]{64}$/.test(operation.baselineDigest) && ['academic-os-mcp', 'google-tasks-rest', 'google-calendar-rest', 'calendar-native-ui'].includes(operation.transport) && (operation.sourceId === null || text(operation.sourceId)), 'Invalid operation');
    fieldsOnly(operation.changes, ['title', 'date', 'start', 'end', 'durationMinutes', 'timeZone', 'completed'], 'operation changes');
    fail(Object.keys(operation.changes).length > 0, 'Empty operation');
    for (const [field, value] of Object.entries(operation.changes)) {
      fail(field === 'title' ? text(value) : field === 'date' ? value === null || validDate(value) : ['start', 'end'].includes(field) ? stamp(value) : field === 'timeZone' ? zone(value) : field === 'completed' ? typeof value === 'boolean' : Number.isSafeInteger(value) && value > 0 && value <= 1440, `Invalid change ${field}`);
    }
  }
  fail(new Set(request.operations.map(row => row.id)).size === request.operations.length && new Set(request.operations.map(row => identityKey(row.identity))).size === request.operations.length, 'Duplicate operation or target');
  for (const attempt of request.attempts) {
    fieldsOnly(attempt, ['effectKey', 'operationDigest', 'identity', 'state', 'attemptedAt', 'evidenceRef', 'prepared', 'resolution'], 'attempt');
    fail(/^[a-f0-9]{64}$/.test(attempt.effectKey) && /^[a-f0-9]{64}$/.test(attempt.operationDigest) && exactIdentity(attempt.identity) && ['intent', 'uncertain', 'saved', 'failed', 'denied', 'consumed'].includes(attempt.state) && stamp(attempt.attemptedAt) && text(attempt.evidenceRef), 'Invalid retained attempt');
    if (attempt.resolution !== undefined) fail(object(attempt.resolution) && ['saved', 'no-effect'].includes(attempt.resolution.kind) && text(attempt.resolution.evidenceRef) && /^[a-f0-9]{64}$/.test(attempt.resolution.snapshotDigest), 'Invalid effect resolution');
    const prepared = attempt.prepared;
    fieldsOnly(prepared, ['snapshotDigest', 'operation', 'baseline', 'capturedAt', 'intentDigest'], 'prepared attempt');
    fail(object(prepared) && /^[a-f0-9]{64}$/.test(prepared.snapshotDigest) && object(prepared.operation) && object(prepared.baseline) && object(prepared.baseline.native) && array(prepared.baseline.intervals) && prepared.baseline.intervals.every(span), 'Retained attempt requires its exact prepared operation and before-state');
    fail(stamp(prepared.capturedAt) && ms(prepared.capturedAt) <= ms(attempt.attemptedAt) && /^[a-f0-9]{64}$/.test(prepared.intentDigest), 'Attempt precedes its prepared before-state');
    validateCalendarRequest({ ...request, operations: [prepared.operation], attempts: [] });
    fail(same(prepared.operation.identity, attempt.identity) && prepared.baseline.native.id === attempt.identity.nativeId && prepared.operation.baselineDigest === hash(prepared.baseline) && attempt.operationDigest === hash({ schemaVersion: 1, ...prepared }) && attempt.effectKey === hash({ identity: prepared.operation.identity, changes: prepared.operation.changes, sourceId: prepared.operation.sourceId }), 'Retained attempt digest or before-state mismatch');
  }
  return request;
}

function union(intervals) {
  const result = [];
  for (const entry of [...intervals].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const prior = result.at(-1);
    if (prior && entry.start <= prior.end) prior.end = Math.max(prior.end, entry.end);
    else result.push({ start: entry.start, end: entry.end });
  }
  return result;
}
function complement(work, blocked) {
  const result = [];
  for (const window of union(work)) {
    let cursor = window.start;
    for (const blocker of blocked) {
      if (blocker.end <= cursor || blocker.start >= window.end) continue;
      if (blocker.start > cursor) result.push({ start: cursor, end: blocker.start });
      cursor = Math.max(cursor, blocker.end);
    }
    if (cursor < window.end) result.push({ start: cursor, end: window.end });
  }
  return result;
}
const renderedIntervals = entries => entries.map(entry => ({ start: iso(entry.start), end: iso(entry.end), durationMinutes: (entry.end - entry.start) / 60000 }));
function coversWindow(outer, inner) { return windowShape(outer) && outer.timeZone === inner.timeZone && ms(outer.start) <= ms(inner.start) && ms(outer.end) >= ms(inner.end); }

export function assessCalendarRegister(snapshot, request, { evaluatedAt }) {
  validateCalendarSnapshot(snapshot); validateCalendarRequest(request); fail(stamp(evaluatedAt), 'Invalid evaluation time');
  const snapshotDigest = calendarSnapshotDigest(snapshot);
  const intentDigest = hash({ ...request, attempts: [] });
  const findings = [];
  const add = (code, target = null) => { if (!findings.some(row => row.code === code && same(row.target, target))) findings.push({ code, target }); };
  const age = request.maxEvidenceAgeMs;
  const window = { start: ms(request.window.start), end: ms(request.window.end) };
  const rows = new Map(); const blockers = []; const scheduleById = new Map();
  if (snapshotDigest !== request.snapshotDigest) add('snapshot-digest-mismatch');
  if (!coversWindow(snapshot.scope.window, request.window)) add('unknown-window-coverage');
  if (!fresh(snapshot.acquisition.startedAt, evaluatedAt, age) || !fresh(snapshot.acquisition.completedAt, evaluatedAt, age)) add('stale-snapshot');
  if (!request.history.complete || !fresh(request.history.completeThrough, evaluatedAt, age) || ms(request.history.completeThrough) < ms(snapshot.acquisition.completedAt)) add('retained-history-incomplete');
  if (request.attempts.some(attempt => ms(attempt.attemptedAt) > ms(evaluatedAt))) add('future-attempt');
  const pageQueries = (collection, kind, containerId = null) => {
    if (!collection.complete || collection.gaps.length || collection.pages.length === 0) add('partial-collection', `${kind}/${containerId ?? 'discovery'}`);
    const tokens = new Set();
    for (const [index, page] of collection.pages.entries()) {
      if (!object(page) || !fresh(page.acquiredAt, evaluatedAt, age) || ms(page.acquiredAt) < ms(snapshot.acquisition.startedAt) || ms(page.acquiredAt) > ms(snapshot.acquisition.completedAt)) add('stale-source-page', `${kind}/${containerId}`);
      if (!object(page.query) || !/^[a-f0-9]{64}$/.test(page.responseDigest ?? '') || page.requestToken !== (index === 0 ? null : collection.pages[index - 1].nextToken) || page.nextToken !== null && (!text(page.nextToken) || tokens.has(page.nextToken))) add('invalid-page-chain', `${kind}/${containerId}`);
      tokens.add(page.nextToken);
      const q = page.query ?? {};
      const allowedQuery = containerId === null ? kind === 'calendars' ? ['maxResults', 'showHidden', 'showDeleted', 'pageToken'] : ['maxResults', 'pageToken'] : kind === 'taskLists' ? ['maxResults', 'showCompleted', 'showDeleted', 'showHidden', 'showAssigned', 'pageToken'] : ['maxResults', 'timeMin', 'timeMax', 'singleEvents', 'showDeleted', 'showHiddenInvitations', 'pageToken'];
      const correct = Object.keys(q).every(key => allowedQuery.includes(key)) && (containerId === null ? kind === 'calendars' ? q.showHidden === true && q.showDeleted === true : true : kind === 'taskLists' ? q.showCompleted === true && q.showDeleted === true && q.showHidden === true && q.showAssigned === true : q.singleEvents === true && q.showDeleted === true && q.showHiddenInvitations === true && q.timeMin === snapshot.scope.window.start && q.timeMax === snapshot.scope.window.end);
      if (!correct) add('query-coverage-mismatch', `${kind}/${containerId}`);
    }
    if (collection.pages.at(-1)?.nextToken !== null) add('pagination-not-exhausted', `${kind}/${containerId}`);
  };
  for (const kind of ['calendars', 'taskLists']) {
    pageQueries(snapshot.discovery[kind], kind);
    const discovered = snapshot.discovery[kind].items;
    if (!array(discovered) || discovered.filter(row => !row.deleted).some(row => !snapshot[kind].some(container => container.id === row.id)) || snapshot[kind].some(container => !discovered.some(row => row.id === container.id && !row.deleted))) add('container-discovery-mismatch', kind);
    for (const container of snapshot[kind]) {
      pageQueries(container.collection, kind, container.id);
      for (const native of container[kind === 'calendars' ? 'events' : 'tasks']) {
        const identity = nativeIdentity(snapshot, kind === 'calendars' ? 'calendar' : 'task-list', container.id, native.id);
        const row = { identity, native, nativeDigest: hash(native), container, kind: kind === 'calendars' ? 'event' : 'task', intervals: [] };
        rows.set(identityKey(identity), row);
        if (kind === 'calendars') {
          if (native.status === 'cancelled') continue;
          const timing = eventSpan(native, container.timeZone);
          const protectedMeal = mealTitle(native.summary ?? '') || request.protectedIdentities.some(id => same(id, identity));
          const busy = native.transparency !== 'transparent' || protectedMeal;
          if (native.recurrence !== undefined) add('unexpanded-recurrence', identity);
          if (busy && timing === null) add('unreadable-blocking-event', identity);
          if (timing !== null) {
            row.intervals.push(timing);
            if (busy && overlaps(timing, window)) blockers.push({ ...clipped(timing, window), identity, reason: protectedMeal ? 'protected-meal-or-commitment' : 'busy-event' });
          }
        }
      }
    }
  }
  for (const identity of request.protectedIdentities) if (!rows.has(identityKey(identity))) add('protected-identity-missing', identity);
  const ownerDone = [...snapshot.ownerDone, ...request.ownerDone];
  for (const evidence of ownerDone) {
    if (!exactIdentity(evidence.identity) || !text(evidence.evidenceRef) || !stamp(evidence.observedAt) || ms(evidence.observedAt) > ms(evaluatedAt)) add('invalid-owner-done', evidence.identity ?? null);
  }
  for (const evidence of [...snapshot.taskSchedules, ...request.taskSchedules]) {
    const key = identityKey(evidence.identity); const row = rows.get(key);
    if (scheduleById.has(key)) add('duplicate-task-schedule', evidence.identity);
    scheduleById.set(key, evidence);
    if (!row || row.kind !== 'task' || evidence.taskDigest !== row.nativeDigest || !fresh(evidence.observedAt, evaluatedAt, age) || !coversWindow(evidence.window, request.window) || evidence.complete !== true || evidence.recurrenceCovered !== true || !text(evidence.evidenceRef) || !array(evidence.intervals) || !evidence.intervals.every(span)) { add('task-schedule-unverified', evidence.identity); continue; }
    row.intervals = evidence.intervals.map(entry => ({ start: ms(entry.start), end: ms(entry.end) }));
    for (const interval of row.intervals) if (overlaps(interval, window)) blockers.push({ ...clipped(interval, window), identity: row.identity, reason: 'native-task-schedule' });
  }
  for (const row of rows.values()) {
    if (row.kind !== 'task' || row.native.deleted === true || row.native.status === 'completed' || ownerDone.some(entry => same(entry.identity, row.identity))) continue;
    if (!['needsAction', 'completed'].includes(row.native.status)) add('unknown-task-status', row.identity);
    if (!scheduleById.has(identityKey(row.identity))) add('unknown-task-timing', row.identity);
  }
  const mappedTasks = new Set(); const mappedEvents = new Set();
  for (const mapping of [...snapshot.mappings, ...request.mappings]) {
    const taskKey = identityKey(mapping.taskIdentity); const eventKey = identityKey(mapping.eventIdentity);
    const task = rows.get(taskKey); const event = rows.get(eventKey);
    if (mappedTasks.has(taskKey) || mappedEvents.has(eventKey)) add('duplicate-projection', mapping.taskIdentity);
    mappedTasks.add(taskKey); mappedEvents.add(eventKey);
    if (!task || !event || task.kind !== 'task' || event.kind !== 'event' || task.nativeDigest !== mapping.taskDigest || event.nativeDigest !== mapping.eventDigest || !fresh(mapping.observedAt, evaluatedAt, age) || !text(mapping.evidenceRef)) add('projection-mapping-unverified', mapping.taskIdentity);
    else if (!same(task.intervals, event.intervals)) add('projection-schedule-mismatch', mapping.taskIdentity);
  }
  const work = request.workingIntervals.map(entry => ({ start: ms(entry.start), end: ms(entry.end) }));
  if (work.some(entry => entry.start < window.start || entry.end > window.end)) add('working-interval-outside-window');
  const blockingUnion = union(blockers);
  const availabilityCodes = new Set(findings.map(entry => canonical(entry)));
  const availabilityComplete = findings.length === 0;
  const freeIntervals = availabilityComplete ? complement(work, blockingUnion) : null;
  const sources = new Map(request.sources.map(row => [row.id, row]));
  const sourceVisits = new Set(); const sourceStack = new Set();
  const visit = id => {
    if (sourceStack.has(id)) { add('source-dependency-cycle', id); return; }
    if (sourceVisits.has(id)) return;
    const source = sources.get(id); if (!source) { add('missing-source-dependency', id); return; }
    sourceStack.add(id); source.dependsOn.forEach(visit); sourceStack.delete(id); sourceVisits.add(id);
  };
  request.sources.forEach(source => visit(source.id));
  const visual = request.visualReview;
  const visualCurrent = object(visual) && visual.snapshotDigest === snapshotDigest && fresh(visual.observedAt, evaluatedAt, age) && text(visual.evidenceRef) && coversWindow(visual.window, request.window) && visual.mealsProtected === true && visual.numericCompared === true;
  if (!visualCurrent) add('visual-calendar-review-required');
  const proposals = []; const proposedIntervals = [];
  for (const operation of request.operations) {
    const codes = []; const refuse = code => { if (!codes.includes(code)) codes.push(code); };
    const row = rows.get(identityKey(operation.identity));
    const baseline = row ? { native: row.native, intervals: row.intervals.map(entry => ({ start: iso(entry.start), end: iso(entry.end) })) } : null;
    const baselineDigest = baseline === null ? null : hash(baseline);
    const changes = operation.changes;
    const scheduled = ['start', 'end', 'durationMinutes', 'timeZone'].some(key => key in changes);
    const effectKey = hash({ identity: operation.identity, changes, sourceId: operation.sourceId });
    const capturedAt = iso(Math.max(ms(snapshot.acquisition.completedAt), ms(scheduleById.get(identityKey(operation.identity))?.observedAt) || 0));
    const prepared = { snapshotDigest, operation, baseline, capturedAt, intentDigest };
    const operationDigest = hash({ schemaVersion: 1, ...prepared });
    if (!availabilityComplete) refuse('availability-unverified');
    if (!visualCurrent) refuse('visual-calendar-review-required');
    if (!row) refuse('wrong-native-identity');
    if (row && operation.baselineDigest !== baselineDigest) refuse('baseline-mismatch');
    if (row && (row.native.deleted || row.native.status === 'completed' || row.native.status === 'cancelled' || ownerDone.some(entry => same(entry.identity, operation.identity)))) refuse('terminal-or-owner-done');
    if (changes.completed === false) refuse('reopening-not-supported');
    const task = operation.identity.containerKind === 'task-list';
    const supported = task ? operation.transport === 'google-calendar-rest' ? [] : operation.transport === 'calendar-native-ui' ? ['title', 'date', 'start', 'end', 'durationMinutes', 'timeZone', 'completed'] : ['title', 'date', 'completed'] : ['google-calendar-rest', 'calendar-native-ui'].includes(operation.transport) ? ['title', 'date', 'start', 'end', 'durationMinutes', 'timeZone'] : [];
    if (Object.keys(changes).some(key => !supported.includes(key))) refuse('unsupported-provider-operation');
    if (task && scheduled && row?.intervals.length > 1) refuse('recurring-task-operation-unsupported');
    if (task && !scheduled && 'date' in changes && row?.intervals.length > 0) refuse('date-only-timed-task-unsupported');
    let proposed = null;
    if (scheduled) {
      if (!span(changes) || !zone(changes.timeZone) || !Number.isSafeInteger(changes.durationMinutes) || (ms(changes.end) - ms(changes.start)) / 60000 !== changes.durationMinutes) refuse('end-time-duration-mismatch');
      else {
        if (changes.durationMinutes < 30 || changes.durationMinutes % 30 !== 0) refuse('scheduled-block-increment');
        proposed = { start: ms(changes.start), end: ms(changes.end) };
        if (!validDate(changes.date) || localDate(proposed.start, changes.timeZone) !== changes.date || changes.timeZone !== request.window.timeZone || !wallClockMatches(changes.start, changes.timeZone) || !wallClockMatches(changes.end, changes.timeZone)) refuse('schedule-date-zone-mismatch');
        if (!work.some(entry => proposed.start >= entry.start && proposed.end <= entry.end)) refuse('outside-working-interval');
        for (const blocker of blockers) if (!same(blocker.identity, operation.identity) && overlaps(proposed, blocker)) refuse('overlap');
        for (const prior of proposedIntervals) if (overlaps(proposed, prior.interval)) { refuse('proposed-overlap'); prior.codes.push('proposed-overlap'); }
      }
    }
    const source = operation.sourceId === null ? null : sources.get(operation.sourceId);
    if ((scheduled || 'title' in changes) && !source) refuse('explicit-source-required');
    if (source) {
      if (!same(source.identity, operation.identity)) refuse('source-native-identity-mismatch');
      if (source.completed) refuse('source-already-completed');
      const resultingTitle = changes.title ?? row?.native.title ?? row?.native.summary ?? '';
      if (!sourceLabel(resultingTitle, source.name)) refuse('source-scope-missing-from-title');
      if (scheduled && changes.durationMinutes !== Math.ceil(source.actualDurationMinutes / 30) * 30) refuse('source-duration-mismatch');
      for (const dependency of source.dependsOn) {
        const dependencySource = sources.get(dependency);
        if (!dependencySource || dependencySource.completed !== true) {
          const dependencyOperation = request.operations.find(entry => entry.sourceId === dependency);
          if (!dependencyOperation || !stamp(dependencyOperation.changes.end) || !proposed || ms(dependencyOperation.changes.end) > proposed.start) refuse('source-dependency-unmet');
        }
      }
      if (source.kind === 'correction' && !source.dependsOn.some(id => sources.get(id)?.kind === 'timed-attempt')) refuse('correction-attempt-dependency-required');
    }
    let alreadySaved = false;
    for (const attempt of request.attempts.filter(entry => entry.effectKey === effectKey || same(entry.identity, operation.identity) && ['intent', 'uncertain', 'failed'].includes(entry.state))) {
      if (['denied', 'consumed'].includes(attempt.state)) { refuse('terminal-attempt'); continue; }
      const resolution = attempt.resolution;
      const scheduleAfter = row?.kind === 'event' || changes.completed === true || ms(scheduleById.get(identityKey(operation.identity))?.observedAt) > ms(attempt.attemptedAt);
      const after = row && ms(snapshot.acquisition.startedAt) > ms(attempt.attemptedAt) && availabilityComplete && scheduleAfter && resolution?.snapshotDigest === snapshotDigest && text(resolution.evidenceRef) && same(attempt.prepared.operation.changes, changes) && attempt.effectKey === effectKey;
      const mutableNativeKeys = ['etag', 'updated', ...('title' in changes ? [task ? 'title' : 'summary'] : []), ...('date' in changes ? ['due'] : []), ...('completed' in changes ? ['status', 'completed', 'hidden'] : []), ...(!task && scheduled ? ['start', 'end'] : [])];
      const protectedNative = value => Object.fromEntries(Object.entries(value).filter(([key]) => !mutableNativeKeys.includes(key)));
      const savedMatches = row && Object.entries(changes).every(([key, value]) => key === 'title' ? (task ? row.native.title : row.native.summary) === value : key === 'completed' ? (row.native.status === 'completed') === value : key === 'date' ? scheduled ? row.intervals.some(entry => localDate(entry.start, changes.timeZone) === value) && (!task || row.native.due?.slice(0, 10) === value) : (row.native.due?.slice(0, 10) ?? null) === value : key === 'timeZone' ? true : key === 'durationMinutes' ? row.intervals.some(entry => (entry.end - entry.start) / 60000 === value) : row.intervals.some(entry => entry[key] === ms(value)));
      const protectedIntervalsMatch = scheduled ? row?.intervals.length === 1 && row.intervals[0].start === ms(changes.start) && row.intervals[0].end === ms(changes.end) : changes.completed === true || same(attempt.prepared.baseline.intervals, baseline?.intervals);
      if (after && resolution.kind === 'saved' && savedMatches && protectedIntervalsMatch && same(protectedNative(attempt.prepared.baseline.native), protectedNative(row.native))) alreadySaved = true;
      else if (!(after && resolution.kind === 'no-effect' && hash(attempt.prepared.baseline) === baselineDigest && operation.baselineDigest === baselineDigest)) refuse('reconcile-uncertain-effect');
    }
    if (alreadySaved) {
      const index = codes.indexOf('baseline-mismatch'); if (index >= 0) codes.splice(index, 1);
      if (changes.completed === true) { const terminal = codes.indexOf('terminal-or-owner-done'); if (terminal >= 0 && !ownerDone.some(entry => same(entry.identity, operation.identity))) codes.splice(terminal, 1); }
    }
    const proposal = { id: operation.id, identity: operation.identity, baselineDigest, baseline, effectKey, operationDigest, prepared, sourceId: operation.sourceId, sourceTiming: source ? { kind: source.kind, actualDurationMinutes: source.actualDurationMinutes, scheduledDurationMinutes: Math.ceil(source.actualDurationMinutes / 30) * 30, roundingAllowanceMinutes: Math.ceil(source.actualDurationMinutes / 30) * 30 - source.actualDurationMinutes } : null, transport: operation.transport, changes, status: codes.length ? 'blocked' : alreadySaved ? 'already-saved' : 'proposed', findings: codes, execution: 'none' };
    proposals.push(proposal); if (proposed) proposedIntervals.push({ interval: proposed, codes: proposal.findings });
  }
  for (let pass = 0; pass <= proposals.length; pass++) {
    let changed = false;
    for (const proposal of proposals) {
      const source = sources.get(proposal.sourceId);
      const dependentBlocked = source?.dependsOn.some(id => sources.get(id)?.completed !== true && !proposals.some(other => other.sourceId === id && ['proposed', 'already-saved'].includes(other.status) && other.findings.length === 0));
      if (dependentBlocked && !proposal.findings.includes('source-dependency-unmet')) { proposal.findings.push('source-dependency-unmet'); changed = true; }
      if (proposal.findings.length) proposal.status = 'blocked';
    }
    if (!changed) break;
  }
  if (findings.some(entry => !availabilityCodes.has(canonical(entry)) && entry.code !== 'visual-calendar-review-required')) for (const proposal of proposals) { proposal.status = 'blocked'; proposal.findings.push('global-source-or-evidence-gap'); }
  for (const proposal of proposals) for (const code of proposal.findings) add(code, proposal.id);
  const sortedFindings = findings.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return { schemaVersion: 1, ruleVersion: 1, status: sortedFindings.length ? 'needs-evidence-or-revision' : 'proposed', execution: 'none', assurance: 'derived-provider-register-with-declared-supplements', evaluatedAt, snapshotDigest, intentDigest, availability: { complete: availabilityComplete, blockers: blockers.sort((a, b) => a.start - b.start || identityKey(a.identity).localeCompare(identityKey(b.identity))).map(entry => ({ ...entry, start: iso(entry.start), end: iso(entry.end) })), blockedIntervals: renderedIntervals(blockingUnion), freeIntervals: freeIntervals === null ? null : renderedIntervals(freeIntervals), findings: sortedFindings.filter(entry => availabilityCodes.has(canonical(entry))) }, visualReview: visualCurrent ? 'reported-current' : 'required', baselines: [...rows.values()].map(row => ({ identity: row.identity, nativeDigest: row.nativeDigest, baselineDigest: hash({ native: row.native, intervals: row.intervals.map(entry => ({ start: iso(entry.start), end: iso(entry.end) })) }) })).sort((a, b) => identityKey(a.identity).localeCompare(identityKey(b.identity))), proposals, findings: sortedFindings, next: ['Retain the plan and each exact operation intent in the existing private responsibility evidence before any separately authorized native action.', 'Immediately before one action, refresh the entire affected window and compare its snapshot digest, exact native ID and protected baseline. Replan after any change.', 'After Save, close, reload and reopen the same native Task. Compare title, date, start, end, duration and type independently. Verify the Calendar projection and native Task separately.', 'Retain the first outcome. A lost response, interrupted write or mismatched end time stays uncertain. Reconcile by same-ID readback and complete post-attempt discovery before retry.', 'Perform visual Calendar review of the actual saved window and compare numeric intervals. Report proposed, attempted, saved and verified counts separately.'], limits: ['Provider collection is not atomic. New user changes require refresh before action.', 'Tasks REST cannot expose native scheduled times, duration, deadline or recurrence. Missing readbacks keep availability unknown.', 'CalendarList covers listed calendars, not every potentially accessible calendar. Historical deleted resources may have disappeared from Google.', 'Supplements, account scope, owner intent and visual evidence remain reported. This command grants no authority, writes no provider and enforces no external executor.'] };
}
