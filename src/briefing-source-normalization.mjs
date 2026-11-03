import { canonical, digest } from './records.mjs';
import { strictJson } from './bounded-json.mjs';

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
export function projectBriefingPage(payload, projection, metadata) {
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
export function parseBriefingToolBytes(bytes) {
  const parsed = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  need(parsed?.isError === undefined || typeof parsed.isError === 'boolean', 'Tool error status must be boolean when supplied');
  need(parsed?.isError !== true, 'Provider tool error cannot establish complete acquisition');
  if (parsed.structuredContent !== undefined) return parsed.structuredContent;
  if (!Array.isArray(parsed.content)) return parsed;
  need(parsed.content.length === 1 && parsed.content[0].type === 'text', 'Tool response needs one supported exact JSON payload');
  return strictJson(parsed.content[0].text);
}

export function normalizeBriefingSource(acquisition, rawPages) {
  need(['gmail', 'outlook', 'calendar', 'tasks'].includes(acquisition?.role) && acquisition.environment === 'dot-cloud', 'Existing cloud briefing source required');
  const mail = ['gmail', 'outlook'].includes(acquisition.role);
  need(acquisition.surface === (acquisition.role === 'outlook' ? 'browser' : 'connector'), 'Exact source surface required');
  need(Array.isArray(rawPages) && rawPages.length > 0 && rawPages.length === acquisition.responses.length && rawPages.length === acquisition.reads && rawPages.length <= 100, 'Every attempted page requires exact retained bytes');
  need(acquisition.failure === null || ['partial-provider-coverage', 'read-budget-exhausted'].includes(acquisition.failure), 'Failed acquisition cannot normalize acquired items');
  const pages = rawPages.map((bytes, index) => {
    const retained = acquisition.responses[index];
    need((Buffer.isBuffer(bytes) || typeof bytes === 'string') && digest(bytes) === retained.raw.sha256 && Buffer.byteLength(bytes) === retained.raw.byteCount, 'Retained raw source bytes or extraction contract differ');
    const payload = parseBriefingToolBytes(Buffer.from(bytes));
    const projection = retained.raw.projection;
    const projected = projection == null ? payload : projectBriefingPage(payload, projection, retained.raw);
    need(same(projected, retained.response), 'Normalized projection differs from retained raw source');
    let page = projected;
    if (projection != null) {
      need(Object.hasOwn(projected, 'compilerSource'), 'Projected page requires retained exact compiler source witness');
      const source = projected.compilerSource;
      need(source && same(source.items, projected.items) && source.observedAt === projected.observedAt && source.complete === projected.complete, 'Compiler source witness differs from projected items, clock or coverage');
      page = { ...source, nextCursor: projected.nextCursor, unreadPreserved: projected.unreadPreserved };
    }
    const fields = ['observedAt', 'capturedAt', 'complete', 'paginationComplete', 'gaps', 'items', 'nextCursor', ...(mail ? ['adapter', 'account', 'surface', 'environment', 'inboxIds', 'expandedContextCount', 'unreadPreserved'] : ['window', 'resourceIds', 'acquiredResourceIds'])];
    need(page && Object.keys(page).length === fields.length && fields.every(key => Object.hasOwn(page, key)), 'Existing compiler source fields and explicit page evidence required');
    need(stamp(page.observedAt) && stamp(page.capturedAt) && page.observedAt <= page.capturedAt && stamp(retained.capturedAt) && page.capturedAt <= retained.capturedAt, 'Original source and capture clocks required without fallback');
    need(typeof page.complete === 'boolean' && typeof page.paginationComplete === 'boolean' && Array.isArray(page.gaps) && page.gaps.every(gap => typeof gap === 'string' && gap.length > 0) && Array.isArray(page.items), 'Explicit source coverage and items required');
    need(page.nextCursor === null || typeof page.nextCursor === 'string' && page.nextCursor.length > 0, 'Explicit page cursor required');
    if (mail) need(page.adapter === acquisition.role && page.account === acquisition.account && page.surface === acquisition.surface && page.environment === acquisition.environment && page.unreadPreserved === true && Number.isSafeInteger(page.expandedContextCount) && page.expandedContextCount >= 0, 'Exact mailbox identity, context count and unread preservation required');
    return page;
  });
  const first = pages[0];
  const inventory = mail ? ['inboxIds'] : ['window', 'resourceIds'];
  need(pages.every(page => inventory.every(key => same(page[key], first[key]))), 'Pages must bind the same full source inventory and window');
  need(pages.every((page, index) => index === 0 ? acquisition.responses[index].raw.cursor === null : acquisition.responses[index].raw.cursor === pages[index - 1].nextCursor && pages[index - 1].nextCursor !== null), 'Retained pages must form the exact acquired cursor chain');
  const cursors = pages.map(page => page.nextCursor).filter(cursor => cursor !== null);
  need(new Set(cursors).size === cursors.length, 'Repeated source cursor');
  const terminal = pages.at(-1).nextCursor === null;
  const declaredComplete = pages.every(page => page.complete);
  need(typeof acquisition.complete === 'boolean' && acquisition.complete === (terminal && declaredComplete), 'Acquisition coverage differs from retained pages');
  const source = { ...first, observedAt: pages.map(page => page.observedAt).sort()[0], capturedAt: pages.map(page => page.capturedAt).sort().at(-1), complete: declaredComplete, paginationComplete: terminal && pages.every(page => page.paginationComplete), gaps: [...new Set(pages.flatMap(page => page.gaps))], items: pages.flatMap(page => page.items) };
  delete source.nextCursor; delete source.unreadPreserved;
  if (mail) source.expandedContextCount = pages.reduce((sum, page) => sum + page.expandedContextCount, 0);
  else source.acquiredResourceIds = [...new Set(pages.flatMap(page => { need(Array.isArray(page.acquiredResourceIds), 'Explicit acquired resource inventory required'); return page.acquiredResourceIds; }))];
  if (acquisition.role === 'tasks') source.items = source.items.map(task => ({ ...task, ownerDismissed: task.ownerDismissed ?? null, manuallyMoved: task.manuallyMoved ?? null }));
  return source;
}
