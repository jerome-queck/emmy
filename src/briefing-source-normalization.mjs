import { canonical, digest } from './records.mjs';
import { strictJson } from './bounded-json.mjs';
import { calendarObservationClock } from './briefing-observation.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => canonical(a) === canonical(b);
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 2000;
const extract = (object, path) => {
  need(typeof path === 'string' && (path === '' || path.startsWith('/')), 'Exact JSON extraction pointer required');
  let value = object;
  for (const key of path === '' ? [] : path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))) { need(!['__proto__', 'constructor', 'prototype'].includes(key) && value && Object.hasOwn(value, key), 'Missing provider extraction field'); value = value[key]; }
  return value;
};
function observationSidecar(projection) {
  need(typeof projection.observationBytes === 'string' && /^[a-f0-9]{64}$/.test(projection.observationSha256 ?? ''), 'Exact observation sidecar bytes and external hash required');
  const bytes = Buffer.from(projection.observationBytes, 'base64');
  need(bytes.toString('base64') === projection.observationBytes && bytes.length <= 4194304 && digest(bytes) === projection.observationSha256, 'Observation sidecar identity differs');
  return strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function calendarInstant(value) {
  need(typeof value === 'string' && /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toISOString().slice(0, 10) === value.slice(0, 10), 'Calendar instant requires explicit offset and valid source date');
  return new Date(value).toISOString();
}
function calendarCursor(payload) {
  const cursor = payload.next_page_token;
  need(cursor === null || text(cursor), 'Calendar next_page_token must be null or nonempty text');
  return cursor;
}
function flatCalendarPage(payload, projection, metadata) {
  const observation = observationSidecar(projection);
  const request = metadata.sourceRequest;
  const { source, requestedCalendarId, provenance, nextCursor } = observation;
  need(request?.role === 'calendar' && request.environment === 'dot-cloud' && request.surface === 'connector' && text(requestedCalendarId) && request.requestedCalendarId === requestedCalendarId && request.resourceIds?.includes(requestedCalendarId), 'Calendar sidecar must bind exact requested calendar');
  need(provenance?.environment === request.environment && provenance.surface === request.surface && text(provenance.tool) && text(provenance.sourceRef), 'Calendar source provenance required');
  need(source && same(source.resourceIds, request.resourceIds) && same(source.window, request.window) && same(source.acquiredResourceIds, [requestedCalendarId]), 'Calendar sidecar inventory/window differs from request');
  if (Object.hasOwn(source, 'collectorObservation')) calendarObservationClock(source, metadata.capturedAt);
  need(Array.isArray(payload.events) && Array.isArray(source.gaps) && (nextCursor === null || text(nextCursor)), 'Calendar events and explicit observation coverage required');
  const paginationUnknown = !Object.hasOwn(payload, 'next_page_token');
  if (paginationUnknown) need(nextCursor === null && source.complete === false && source.paginationComplete === false, 'Absent Calendar next_page_token requires explicit partial unknown pagination');
  else need(nextCursor === calendarCursor(payload), 'Calendar sidecar cursor differs from raw next_page_token');
  const items = payload.events.map(event => {
    need(event && text(event.id) && text(event.summary) && ['confirmed', 'cancelled'].includes(event.status) && typeof event.start === 'string' && typeof event.end === 'string', 'Flat Calendar occurrence fields required');
    need(['allDay', 'calendarId', 'taskId', 'timezone', 'timeZone', 'iCalUID'].every(key => !Object.hasOwn(event, key)), 'Flat Calendar contract cannot discard extra identity or timing evidence');
    const recurringEventId = event.recurring_event_id ?? null, originalStartTime = event.original_start_time ?? null;
    need((recurringEventId === null && originalStartTime === null) || text(recurringEventId) && typeof originalStartTime === 'string', 'Paired Calendar recurrence identity required');
    return { nativeId: event.id, calendarId: requestedCalendarId, iCalUID: null, start: calendarInstant(event.start), end: calendarInstant(event.end), allDay: null, title: event.summary, status: event.status, taskId: null, timeZone: null, recurringEventId, originalStartTime: originalStartTime === null ? null : calendarInstant(originalStartTime) };
  });
  return { ...source, items, gaps: [...new Set([...source.gaps, ...(source.collectorObservation?.basis === 'current-read-start' ? ['Calendar provider snapshot clocks unknown; collector current-read-start observation only'] : []), ...(paginationUnknown ? ['Calendar pagination unknown: raw next_page_token absent'] : []), ...(items.length ? ['Calendar all-day type unknown', 'Calendar native Task linkage unknown', 'Calendar source timezone unknown'] : [])])], nextCursor };
}
export function projectBriefingPage(payload, projection, metadata) {
  if (projection?.contract === 'calendar-search-flat-v1') return flatCalendarPage(payload, projection, metadata);
  if (projection?.contract === 'compiler-fields-v1') {
    const provider = payload;
    if (projection.observationBytes !== undefined) {
      need(typeof projection.cursorPointer === 'string' && projection.cursorPointer.startsWith('/provider/'), 'Page cursor must come from raw provider bytes');
      payload = { provider, observation: observationSidecar(projection) };
    }
    const fields = (object, mapping) => {
      need(mapping && typeof mapping === 'object' && !Array.isArray(mapping), 'Explicit field pointer map required');
      return Object.fromEntries(Object.entries(mapping).map(([key, pointer]) => {
        need(!['__proto__', 'constructor', 'prototype'].includes(key), 'Unsafe output field');
        return [key, extract(object, pointer)];
      }));
    };
    const source = fields(payload, projection.sourceFields);
    const items = extract(payload, projection.itemsPointer);
    need(Array.isArray(items), 'Exact provider item array required');
    source.items = projection.itemFields ? items.map(item => fields(item, projection.itemFields)) : items;
    const nextCursor = extract(payload, projection.cursorPointer);
    need(nextCursor === null || text(nextCursor), 'Explicit provider page cursor required');
    if (Object.hasOwn(provider, 'next_page_token')) need(calendarCursor(provider) === nextCursor, 'Projected cursor differs from raw next_page_token');
    if (Object.hasOwn(provider, 'nextCursor')) need(provider.nextCursor === nextCursor, 'Projected cursor differs from raw compiler source cursor');
    if (Object.hasOwn(source, 'nextCursor')) need(source.nextCursor === nextCursor, 'Compiler source cursor differs from raw provider cursor');
    return { ...source, nextCursor };
  }
  need(projection && ['gmail-readonly-page-v1', 'outlook-ui-page-v1'].includes(projection.contract), 'Supported source extraction contract required');
  const items = extract(payload, projection.itemsPointer); const cursor = extract(payload, projection.cursorPointer);
  need(Array.isArray(items) && (cursor === null || text(cursor)), 'Provider items and explicit terminal cursor required');
  const sourceClock = projection.observedAtPointer === null ? null : extract(payload, projection.observedAtPointer);
  const observedAt = sourceClock ?? metadata.startedAt;
  need(stamp(observedAt), 'Actual source clock or declared current read-start observation required');
  let unreadPreserved;
  if (projection.contract === 'gmail-readonly-page-v1') { need(metadata.role === 'gmail', 'Read-only Gmail contract cannot normalize another adapter'); unreadPreserved = true; }
  else { need(metadata.role === 'outlook', 'Outlook UI contract cannot normalize another adapter'); const before = extract(payload, projection.unreadBeforePointer); const after = extract(payload, projection.unreadAfterPointer); need(typeof before === 'boolean' && typeof after === 'boolean', 'Explicit boolean Outlook unread evidence required'); unreadPreserved = before === after; }
  const complete = projection.completePointer ? extract(payload, projection.completePointer) : payload.complete;
  need(typeof complete === 'boolean', 'Explicit provider coverage must be boolean');
  return { items, nextCursor: cursor, observedAt, observationBasis: sourceClock === null ? 'current-read-start' : 'original-provider-clock', complete, unreadPreserved, ...(projection.sourcePointer === undefined ? {} : { compilerSource: extract(payload, projection.sourcePointer) }) };
}
function providerSuccess(payload, depth = 0) {
  need(depth <= 8, 'Tool response wrapper nesting exceeds supported bound');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  need(payload.isError === undefined || typeof payload.isError === 'boolean', 'Tool error status must be boolean when supplied');
  need(payload.isError !== true, 'Provider tool error cannot establish complete acquisition');
  need(!(typeof payload.error === 'string' && payload.error.length > 0 || payload.error && typeof payload.error === 'object'), 'Provider error payload cannot establish complete acquisition');
  if (payload.structuredContent !== undefined) providerSuccess(payload.structuredContent, depth + 1);
  if (Array.isArray(payload.content)) for (const block of payload.content) {
    if (block?.type !== 'text' || typeof block.text !== 'string') continue;
    let value;
    try { value = strictJson(block.text); } catch { continue; }
    providerSuccess(value, depth + 1);
  }
}
export function parseBriefingToolBytes(bytes) {
  let payload = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  providerSuccess(payload);
  for (let depth = 0; depth <= 8; depth++) {
    need(payload && typeof payload === 'object' && !Array.isArray(payload), 'Tool response requires a JSON object');
    if (payload.structuredContent !== undefined) { payload = payload.structuredContent; continue; }
    if (!Array.isArray(payload.content)) return payload;
    need(payload.content.length === 1 && payload.content[0].type === 'text', 'Tool response needs one supported exact JSON payload');
    payload = strictJson(payload.content[0].text);
  }
  throw new Error('Tool response wrapper nesting exceeds supported bound');
}

export function normalizeBriefingSource(acquisition, rawPages) {
  need(['gmail', 'outlook', 'calendar', 'tasks'].includes(acquisition?.role) && acquisition.environment === 'dot-cloud', 'Existing cloud briefing source required');
  const mail = ['gmail', 'outlook'].includes(acquisition.role);
  need((acquisition.role === 'tasks' ? ['browser', 'connector'] : [acquisition.role === 'outlook' ? 'browser' : 'connector']).includes(acquisition.surface), 'Exact source surface required');
  need(acquisition.failure === null || ['partial-provider-coverage', 'read-budget-exhausted'].includes(acquisition.failure), 'Failed acquisition cannot normalize acquired items');
  need(Array.isArray(rawPages) && rawPages.length > 0 && rawPages.length === acquisition.responses.length && rawPages.length === acquisition.reads && rawPages.length <= 100, 'Every attempted page requires exact retained bytes');
  const pages = rawPages.map((bytes, index) => {
    const retained = acquisition.responses[index];
    need((Buffer.isBuffer(bytes) || typeof bytes === 'string') && digest(bytes) === retained.raw.sha256 && Buffer.byteLength(bytes) === retained.raw.byteCount, 'Retained raw source bytes or extraction contract differ');
    const payload = parseBriefingToolBytes(Buffer.from(bytes));
    const projection = retained.raw.projection;
    const projected = projection == null ? payload : projectBriefingPage(payload, projection, retained.raw);
    need(same(projected, retained.response), 'Normalized projection differs from retained raw source');
    let page = projected;
    if (projection != null && !['compiler-fields-v1', 'calendar-search-flat-v1'].includes(projection.contract)) {
      need(Object.hasOwn(projected, 'compilerSource'), 'Projected page requires retained exact compiler source witness');
      const source = projected.compilerSource;
      if (source && Object.hasOwn(source, 'nextCursor')) need(source.nextCursor === projected.nextCursor, 'Compiler source cursor differs from projected provider cursor');
      need(source && same(source.items, projected.items) && source.observedAt === projected.observedAt && source.complete === projected.complete, 'Compiler source witness differs from projected items, clock or coverage');
      page = { ...source, nextCursor: projected.nextCursor, unreadPreserved: projected.unreadPreserved };
    }
    const collector = Object.hasOwn(page, 'collectorObservation');
    need(!collector || acquisition.role === 'calendar', 'Collector observation is Calendar-only');
    const fields = ['observedAt', 'capturedAt', 'complete', 'paginationComplete', 'gaps', 'items', 'nextCursor', ...(collector ? ['collectorObservation'] : []), ...(mail ? ['adapter', 'account', 'surface', 'environment', 'inboxIds', 'expandedContextCount', 'unreadPreserved'] : ['window', 'resourceIds', 'acquiredResourceIds'])];
    need(page && Object.keys(page).length === fields.length && fields.every(key => Object.hasOwn(page, key)), 'Existing compiler source fields and explicit page evidence required');
    if (collector) calendarObservationClock(page, retained.capturedAt);
    else need(stamp(page.observedAt) && stamp(page.capturedAt) && page.observedAt <= page.capturedAt && stamp(retained.capturedAt) && page.capturedAt <= retained.capturedAt, 'Original source and capture clocks required without fallback');
    need(typeof page.complete === 'boolean' && typeof page.paginationComplete === 'boolean' && Array.isArray(page.gaps) && page.gaps.every(gap => typeof gap === 'string' && gap.length > 0) && Array.isArray(page.items), 'Explicit source coverage and items required');
    need(page.nextCursor === null || typeof page.nextCursor === 'string' && page.nextCursor.length > 0, 'Explicit page cursor required');
    if (mail) need(page.adapter === acquisition.role && page.account === acquisition.account && page.surface === acquisition.surface && page.environment === acquisition.environment && page.unreadPreserved === true && Number.isSafeInteger(page.expandedContextCount) && page.expandedContextCount >= 0, 'Exact mailbox identity, context count and unread preservation required');
    return page;
  });
  const first = pages[0];
  need(pages.every(page => Object.hasOwn(page, 'collectorObservation') === Object.hasOwn(first, 'collectorObservation') && page.collectorObservation?.basis === first.collectorObservation?.basis), 'Calendar pages must retain one explicit observation basis');
  const inventory = mail ? ['inboxIds'] : ['window', 'resourceIds'];
  need(pages.every(page => inventory.every(key => same(page[key], first[key]))), 'Pages must bind the same full source inventory and window');
  need(pages.every((page, index) => index === 0 ? acquisition.responses[index].raw.cursor === null : acquisition.responses[index].raw.cursor === pages[index - 1].nextCursor && pages[index - 1].nextCursor !== null), 'Retained pages must form the exact acquired cursor chain');
  const cursors = pages.map(page => page.nextCursor).filter(cursor => cursor !== null);
  need(new Set(cursors).size === cursors.length, 'Repeated source cursor');
  const terminal = pages.at(-1).nextCursor === null;
  const declaredComplete = pages.every(page => page.complete);
  need(typeof acquisition.complete === 'boolean' && acquisition.complete === (terminal && declaredComplete), 'Acquisition coverage differs from retained pages');
  const source = { ...first, observedAt: first.observedAt === null ? null : pages.map(page => page.observedAt).sort()[0], capturedAt: first.capturedAt === null ? null : pages.map(page => page.capturedAt).sort().at(-1), complete: declaredComplete, paginationComplete: terminal && pages.every(page => page.paginationComplete), gaps: [...new Set(pages.flatMap(page => page.gaps))], items: pages.flatMap(page => page.items) };
  if (first.collectorObservation) source.collectorObservation = { basis: first.collectorObservation.basis, startedAt: pages.map(page => page.collectorObservation.startedAt).sort()[0], endedAt: pages.map(page => page.collectorObservation.endedAt).sort().at(-1) };
  delete source.nextCursor; delete source.unreadPreserved;
  if (mail) source.expandedContextCount = pages.reduce((sum, page) => sum + page.expandedContextCount, 0);
  else source.acquiredResourceIds = [...new Set(pages.flatMap(page => { need(Array.isArray(page.acquiredResourceIds), 'Explicit acquired resource inventory required'); return page.acquiredResourceIds; }))];
  if (acquisition.role === 'tasks') source.items = source.items.map(task => ({ ...task, ownerDismissed: task.ownerDismissed ?? null, manuallyMoved: task.manuallyMoved ?? null }));
  return source;
}
