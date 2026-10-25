import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { canonical, digest } from './records.mjs';

const fields = ['type', 'title', 'date', 'start', 'end', 'durationMinutes', 'timeZone', 'deadline', 'completed', 'recurrence', 'notes'];
const scheduleFields = ['date', 'start', 'end', 'durationMinutes', 'timeZone'];
const limit = 2 * 1024 * 1024;
const requireValue = (condition, path, message) => { if (!condition) throw new Error(`${path}: ${message}`); };
const string = (value, path) => requireValue(typeof value === 'string', path, 'must be text');
const text = (value, path) => { string(value, path); requireValue(value.trim().length > 0, path, 'must be nonempty text'); };
const boolean = (value, path) => requireValue(typeof value === 'boolean', path, 'must be Boolean');
const number = (value, path, minimum = 0) => requireValue(Number.isSafeInteger(value) && value >= minimum, path, `must be a safe integer >= ${minimum}`);
const choice = (value, choices, path) => requireValue(choices.includes(value), path, 'unsupported value');
const hash = (value, path) => requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), path, 'must be a SHA-256 digest');
function shape(value, path, required, optional = []) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'must be an object');
  for (const key of required) requireValue(Object.hasOwn(value, key), `${path}/${key}`, 'is required');
  for (const key of Object.keys(value)) requireValue(required.includes(key) || optional.includes(key), `${path}/${key}`, 'unknown member');
}
function list(value, path, validate = text, unique = false) {
  requireValue(Array.isArray(value) && value.length <= 2000, path, 'must be an array of at most 2000 entries');
  value.forEach((entry, index) => validate(entry, `${path}/${index}`));
  if (unique) requireValue(new Set(value.map(entry => canonical(entry))).size === value.length, path, 'duplicate entries');
}
function date(value, path) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, path, 'must be a real local date');
}
function instant(value, path) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value), path, 'must be an offset-bearing instant');
  date(value.slice(0, 10), path);
  const parts = value.match(/T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(Z|([+-])(\d{2}):(\d{2}))$/);
  requireValue(+parts[1] < 24 && +parts[2] < 60 && +parts[3] < 60 && (parts[4] === 'Z' || +parts[6] <= 14 && +parts[7] < 60 && (+parts[6] !== 14 || +parts[7] === 0)) && Number.isFinite(Date.parse(value)), path, 'must be a real offset-bearing instant');
}
function zone(value, path) {
  text(value, path); requireValue(!/^[+-]/.test(value), path, 'must be a named IANA time zone');
  try { new Intl.DateTimeFormat('en', { timeZone: value }); } catch { throw new Error(`${path}: must be an IANA time zone`); }
}
function identity(value, path) {
  shape(value, path, ['environment', 'accountId', 'containerKind', 'containerId', 'nativeId']);
  for (const key of ['environment', 'accountId', 'containerId', 'nativeId']) text(value[key], `${path}/${key}`);
  choice(value.containerKind, ['task-list', 'calendar'], `${path}/containerKind`);
}
function target(value, path) {
  shape(value, path, ['environment', 'accountId', 'taskListIds', 'calendarIds']);
  text(value.environment, `${path}/environment`); text(value.accountId, `${path}/accountId`);
  list(value.taskListIds, `${path}/taskListIds`, text, true); list(value.calendarIds, `${path}/calendarIds`, text, true);
}
function window(value, path) {
  shape(value, path, ['start', 'end', 'timeZone']);
  instant(value.start, `${path}/start`); instant(value.end, `${path}/end`); zone(value.timeZone, `${path}/timeZone`);
  requireValue(Date.parse(value.start) < Date.parse(value.end), path, 'end must follow start');
}
function fieldValue(value, field, path) {
  if (value === null && !['type', 'title', 'completed', 'notes'].includes(field)) return;
  switch (field) {
    case 'notes': case 'title': string(value, path); break;
    case 'type': choice(value, ['task', 'event'], path); break;
    case 'completed': boolean(value, path); break;
    case 'date': date(value, path); break;
    case 'start': case 'end': instant(value, path); break;
    case 'durationMinutes': number(value, path, 1); break;
    case 'timeZone': zone(value, path); break;
    case 'deadline':
      shape(value, path, ['kind', 'value']); choice(value.kind, ['date', 'instant'], `${path}/kind`);
      (value.kind === 'date' ? date : instant)(value.value, `${path}/value`); break;
    case 'recurrence':
      shape(value, path, ['kind'], ['frequency', 'interval', 'until', 'raw']); choice(value.kind, ['rule', 'unsupported'], `${path}/kind`);
      if (value.kind === 'unsupported') { text(value.raw, `${path}/raw`); requireValue(Object.keys(value).length === 2, path, 'unsupported recurrence retains only raw text'); }
      else {
        choice(value.frequency, ['daily', 'weekly', 'monthly'], `${path}/frequency`); number(value.interval, `${path}/interval`, 1);
        if (value.until !== undefined && value.until !== null) date(value.until, `${path}/until`);
        requireValue(!Object.hasOwn(value, 'raw'), path, 'rule has no raw member');
      }
      break;
  }
}
function fieldMap(value, path, captured = false) {
  shape(value, path, [], fields);
  for (const [field, entry] of Object.entries(value)) {
    const fieldPath = `${path}/${field}`;
    if (!captured) { fieldValue(entry, field, fieldPath); continue; }
    shape(entry, fieldPath, ['origin', 'raw', 'value'], ['extraction']);
    choice(entry.origin, ['saved-field', 'label', 'popup', 'editor-draft', 'acknowledgement', 'unreadable'], `${fieldPath}/origin`); string(entry.raw, `${fieldPath}/raw`);
    if (!(entry.origin === 'unreadable' && entry.value === null)) fieldValue(entry.value, field, `${fieldPath}/value`);
    if (entry.extraction !== undefined) {
      shape(entry.extraction, `${fieldPath}/extraction`, ['start', 'end']);
      number(entry.extraction.start, fieldPath); number(entry.extraction.end, fieldPath);
      requireValue(typeof entry.value === 'string' && entry.extraction.start <= entry.extraction.end && entry.extraction.end <= entry.raw.length && entry.raw.slice(entry.extraction.start, entry.extraction.end) === entry.value, fieldPath, 'extraction must equal the exact UTF-16 slice');
    } else if (typeof entry.value === 'string') requireValue(entry.raw === entry.value, fieldPath, 'raw text must equal the string value without extraction');
  }
}
function identified(entries, path, validate) {
  list(entries, path, (value, itemPath) => { validate(value, itemPath); text(value.id, `${itemPath}/id`); });
  requireValue(new Set(entries.map(value => value.id)).size === entries.length, path, 'duplicate IDs');
}
function validateInput(input) {
  shape(input, '', ['schemaVersion', 'intent', 'plan', 'inventories', 'readbacks', 'attempts', 'history', 'clocks'], ['clockResolution']);
  requireValue(input.schemaVersion === 1, '/schemaVersion', 'unsupported schema');
  const intent = input.intent;
  shape(intent, '/intent', ['revision', 'acquiredAt', 'ownerInstruction', 'target', 'window', 'maxEvidenceAgeMs', 'items', 'sources', 'budgets', 'morningRequirements', 'eventConstraints'], ['buffers', 'allowedDeliverables', 'requestedDeliverables']);
  text(intent.revision, '/intent/revision'); instant(intent.acquiredAt, '/intent/acquiredAt'); text(intent.ownerInstruction, '/intent/ownerInstruction'); target(intent.target, '/intent/target'); window(intent.window, '/intent/window'); number(intent.maxEvidenceAgeMs, '/intent/maxEvidenceAgeMs', 1);
  list(intent.items, '/intent/items', (item, path) => { shape(item, path, ['key', 'identity', 'expected', 'authorizedFields']); text(item.key, `${path}/key`); identity(item.identity, `${path}/identity`); fieldMap(item.expected, `${path}/expected`); list(item.authorizedFields, `${path}/authorizedFields`, (field, fieldPath) => choice(field, fields, fieldPath), true); });
  requireValue(new Set(intent.items.map(item => item.key)).size === intent.items.length, '/intent/items', 'duplicate item keys');
  requireValue(new Set(intent.items.map(item => canonical(item.identity))).size === intent.items.length, '/intent/items', 'duplicate intended native identities');
  list(intent.sources, '/intent/sources', (source, path) => {
    shape(source, path, ['sourceId', 'name', 'kind', 'instruction'], ['requiredMinutes', 'requiredSessions']); text(source.sourceId, `${path}/sourceId`); text(source.name, `${path}/name`); text(source.instruction, `${path}/instruction`); choice(source.kind, ['whole-source', 'ongoing-research'], `${path}/kind`);
    requireValue(source.requiredMinutes !== undefined || source.requiredSessions !== undefined, path, 'requires a declared minimum');
    if (source.requiredMinutes !== undefined) number(source.requiredMinutes, `${path}/requiredMinutes`, 1);
    if (source.requiredSessions !== undefined) number(source.requiredSessions, `${path}/requiredSessions`, 1);
  });
  requireValue(new Set(intent.sources.map(source => source.sourceId)).size === intent.sources.length, '/intent/sources', 'duplicate sources');
  list(intent.budgets, '/intent/budgets', (budget, path) => { shape(budget, path, ['scope', 'key', 'maxMinutes']); choice(budget.scope, ['day', 'source', 'campaign'], `${path}/scope`); text(budget.key, `${path}/key`); number(budget.maxMinutes, `${path}/maxMinutes`); if (budget.scope === 'day') date(budget.key, `${path}/key`); });
  list(intent.morningRequirements, '/intent/morningRequirements', (morning, path) => { shape(morning, path, ['date', 'start', 'end', 'minMinutes']); date(morning.date, `${path}/date`); instant(morning.start, `${path}/start`); instant(morning.end, `${path}/end`); number(morning.minMinutes, `${path}/minMinutes`, 1); requireValue(Date.parse(morning.start) < Date.parse(morning.end), path, 'end must follow start'); });
  list(intent.eventConstraints, '/intent/eventConstraints', (event, path) => { shape(event, path, ['identity', 'mandatory', 'instruction']); identity(event.identity, `${path}/identity`); boolean(event.mandatory, `${path}/mandatory`); text(event.instruction, `${path}/instruction`); });
  if (intent.buffers !== undefined) { shape(intent.buffers, '/intent/buffers', ['beforeMinutes', 'afterMinutes']); number(intent.buffers.beforeMinutes, '/intent/buffers/beforeMinutes'); number(intent.buffers.afterMinutes, '/intent/buffers/afterMinutes'); }
  for (const name of ['allowedDeliverables', 'requestedDeliverables']) if (intent[name] !== undefined) list(intent[name], `/intent/${name}`, text, true);
  identified(input.inventories, '/inventories', (inventory, path) => {
    shape(inventory, path, ['id', 'target', 'window', 'acquiredAt', 'attribution', 'taskLists', 'calendars']); target(inventory.target, `${path}/target`); window(inventory.window, `${path}/window`); instant(inventory.acquiredAt, `${path}/acquiredAt`); text(inventory.attribution, `${path}/attribution`);
    for (const name of ['taskLists', 'calendars']) list(inventory[name], `${path}/${name}`, (row, rowPath) => {
      shape(row, rowPath, ['containerId', 'available', 'complete', 'gaps', 'cursorExhausted', 'coverage', 'items']); text(row.containerId, `${rowPath}/containerId`); for (const flag of ['available', 'complete', 'cursorExhausted']) boolean(row[flag], `${rowPath}/${flag}`); list(row.gaps, `${rowPath}/gaps`);
      shape(row.coverage, `${rowPath}/coverage`, name === 'taskLists' ? ['timed', 'untimed', 'allStatuses', 'synthetic'] : ['allDay', 'transparency']); for (const [flag, value] of Object.entries(row.coverage)) boolean(value, `${rowPath}/coverage/${flag}`);
      list(row.items, `${rowPath}/items`, (item, itemPath) => {
        shape(item, itemPath, ['identity', 'type', 'title', 'synthetic', 'completed', 'status', 'interval', 'raw'], ['transparency', 'campaignKey']); identity(item.identity, `${itemPath}/identity`); choice(item.type, ['task', 'event'], `${itemPath}/type`); string(item.title, `${itemPath}/title`); boolean(item.synthetic, `${itemPath}/synthetic`); boolean(item.completed, `${itemPath}/completed`); text(item.status, `${itemPath}/status`); string(item.raw, `${itemPath}/raw`);
        if (item.type === 'event') choice(item.transparency, ['busy', 'transparent', 'unknown'], `${itemPath}/transparency`); else requireValue(item.transparency === undefined, itemPath, 'Task has no Event transparency');
        if (item.campaignKey !== undefined) text(item.campaignKey, `${itemPath}/campaignKey`);
        if (item.interval !== null) { shape(item.interval, `${itemPath}/interval`, ['start', 'end', 'timeZone', 'allDay']); instant(item.interval.start, `${itemPath}/interval/start`); instant(item.interval.end, `${itemPath}/interval/end`); zone(item.interval.timeZone, `${itemPath}/interval/timeZone`); boolean(item.interval.allDay, `${itemPath}/interval/allDay`); requireValue(Date.parse(item.interval.start) < Date.parse(item.interval.end), itemPath, 'interval end must follow start'); }
      });
    });
  });
  identified(input.readbacks, '/readbacks', (readback, path) => {
    shape(readback, path, ['id', 'identity', 'acquiredAt', 'attribution', 'forOperation', 'sequence', 'fields'], ['supersedes']); identity(readback.identity, `${path}/identity`); instant(readback.acquiredAt, `${path}/acquiredAt`); text(readback.attribution, `${path}/attribution`); if (readback.forOperation !== null) text(readback.forOperation, `${path}/forOperation`); fieldMap(readback.fields, `${path}/fields`, true);
    shape(readback.sequence, `${path}/sequence`, ['closedAt', 'reloadedAt', 'reopenedAt'], ['savedAt']);
    const times = ['savedAt', 'closedAt', 'reloadedAt', 'reopenedAt'].filter(key => readback.sequence[key] != null);
    for (const key of times) instant(readback.sequence[key], `${path}/sequence/${key}`);
    const ordered = [...times.map(key => Date.parse(readback.sequence[key])), Date.parse(readback.acquiredAt)];
    requireValue(ordered.every((value, index) => index === 0 || value >= ordered[index - 1]), `${path}/sequence`, 'impossible persistence order');
    requireValue(readback.forOperation !== null || !Object.hasOwn(readback.sequence, 'savedAt'), path, 'baseline must not fabricate a save');
    if (readback.supersedes !== undefined) { shape(readback.supersedes, `${path}/supersedes`, ['readbackId', 'fields']); text(readback.supersedes.readbackId, path); list(readback.supersedes.fields, `${path}/supersedes/fields`, (field, fieldPath) => choice(field, fields, fieldPath), true); requireValue(readback.supersedes.fields.length > 0, path, 'empty supersession scope'); }
  });
  identified(input.attempts, '/attempts', (attempt, path) => {
    shape(attempt, path, ['id', 'operationId', 'effectScope', 'identity', 'attemptedAt', 'outcome', 'raw'], ['intentDigest', 'planDigest', 'retryOf', 'resolution']); text(attempt.operationId, `${path}/operationId`); text(attempt.effectScope, `${path}/effectScope`); if (attempt.identity !== null) identity(attempt.identity, `${path}/identity`); instant(attempt.attemptedAt, `${path}/attemptedAt`); choice(attempt.outcome, ['saved', 'failed', 'uncertain', 'denied', 'consumed'], `${path}/outcome`); text(attempt.raw, `${path}/raw`);
    for (const name of ['intentDigest', 'planDigest']) if (attempt[name] !== undefined) hash(attempt[name], `${path}/${name}`);
    if (attempt.retryOf !== undefined) text(attempt.retryOf, `${path}/retryOf`);
    if (attempt.resolution !== undefined) { shape(attempt.resolution, `${path}/resolution`, ['kind', 'readbackIds', 'inventoryId', 'raw']); choice(attempt.resolution.kind, ['saved', 'no-effect'], `${path}/resolution/kind`); list(attempt.resolution.readbackIds, `${path}/resolution/readbackIds`, text, true); text(attempt.resolution.inventoryId, path); text(attempt.resolution.raw, path); }
  });
  const history = input.history;
  shape(history, '/history', ['corrections', 'completeThrough', 'complete', 'gaps'], ['aggregateReports']); instant(history.completeThrough, '/history/completeThrough'); boolean(history.complete, '/history/complete'); list(history.gaps, '/history/gaps');
  identified(history.corrections, '/history/corrections', (correction, path) => { shape(correction, path, ['id', 'revision', 'acquiredAt', 'raw', 'itemKeys', 'fields']); text(correction.revision, path); instant(correction.acquiredAt, path); text(correction.raw, path); list(correction.itemKeys, `${path}/itemKeys`, text, true); list(correction.fields, `${path}/fields`, (field, fieldPath) => choice(field, fields, fieldPath), true); });
  if (history.aggregateReports !== undefined) list(history.aggregateReports, '/history/aggregateReports', (aggregate, path) => { shape(aggregate, path, ['outcome', 'count', 'attemptIds', 'raw']); choice(aggregate.outcome, ['saved', 'failed', 'uncertain', 'denied', 'consumed'], path); number(aggregate.count, path); list(aggregate.attemptIds, path, text, true); text(aggregate.raw, path); });
  identified(input.clocks, '/clocks', (clock, path) => { shape(clock, path, ['id', 'identity', 'surface', 'raw', 'acquiredAt', 'timeZone', 'offset', 'instant']); identity(clock.identity, `${path}/identity`); text(clock.surface, path); text(clock.raw, path); instant(clock.acquiredAt, path); if (clock.timeZone !== null) zone(clock.timeZone, path); if (clock.offset !== null) instant(`2000-01-01T00:00:00${clock.offset}`, `${path}/offset`); if (clock.instant !== null) instant(clock.instant, path); });
  if (input.clockResolution !== undefined) { const resolution = input.clockResolution; shape(resolution, '/clockResolution', ['clockIds', 'source', 'raw', 'acquiredAt', 'settledInstant', 'timeZone']); list(resolution.clockIds, '/clockResolution/clockIds', text, true); choice(resolution.source, ['owner', 'native'], '/clockResolution/source'); text(resolution.raw, '/clockResolution/raw'); instant(resolution.acquiredAt, '/clockResolution/acquiredAt'); instant(resolution.settledInstant, '/clockResolution/settledInstant'); zone(resolution.timeZone, '/clockResolution/timeZone'); }
  if (input.plan !== null) {
    const plan = input.plan; shape(plan, '/plan', ['intentDigest', 'inventoryIds', 'allocations', 'queuedChanges'], ['digest']); hash(plan.intentDigest, '/plan/intentDigest'); if (plan.digest !== undefined) hash(plan.digest, '/plan/digest'); list(plan.inventoryIds, '/plan/inventoryIds', text, true);
    list(plan.allocations, '/plan/allocations', (allocation, path) => { shape(allocation, path, ['itemKey', 'identity', 'sourceId', 'sourceKind', 'start', 'end']); text(allocation.itemKey, path); identity(allocation.identity, `${path}/identity`); text(allocation.sourceId, path); choice(allocation.sourceKind, ['whole-source', 'ongoing-research'], path); instant(allocation.start, path); instant(allocation.end, path); });
    requireValue(new Set(plan.allocations.map(allocation => allocation.itemKey)).size === plan.allocations.length, '/plan/allocations', 'duplicate item allocations');
    identified(plan.queuedChanges, '/plan/queuedChanges', (change, path) => {
      shape(change, path, ['id', 'identity', 'action', 'fields', 'sourceId', 'intentDigest', 'planDigest', 'baselineReadbackId', 'baselineDigest', 'inventoryDigests'], ['operationDigest']); identity(change.identity, `${path}/identity`); choice(change.action, ['move', 'resize', 'update', 'remove-date'], path); fieldMap(change.fields, `${path}/fields`); if (change.sourceId !== null) text(change.sourceId, path); for (const name of ['intentDigest', 'planDigest']) hash(change[name], `${path}/${name}`); if (change.baselineDigest !== null) hash(change.baselineDigest, `${path}/baselineDigest`); if (change.baselineReadbackId !== null) text(change.baselineReadbackId, `${path}/baselineReadbackId`);
      shape(change.inventoryDigests, `${path}/inventoryDigests`, [], plan.inventoryIds); for (const value of Object.values(change.inventoryDigests)) hash(value, path); if (change.operationDigest !== undefined) hash(change.operationDigest, `${path}/operationDigest`);
    });
  }
  const readbacks = new Map(input.readbacks.map(readback => [readback.id, readback])); const attempts = new Map(input.attempts.map(attempt => [attempt.id, attempt]));
  const references = (ids, entries, path) => ids.forEach(id => requireValue(entries.some(entry => entry.id === id), path, `dangling reference ${id}`));
  if (input.plan !== null) { references(input.plan.inventoryIds, input.inventories, '/plan/inventoryIds'); references(input.plan.queuedChanges.map(change => change.baselineReadbackId).filter(id => id !== null), input.readbacks, '/plan/queuedChanges'); }
  for (const readback of input.readbacks) {
    if (readback.forOperation !== null) requireValue(input.attempts.some(attempt => attempt.operationId === readback.forOperation), '/readbacks/forOperation', 'operation has no retained attempt');
    if (readback.supersedes) {
      const prior = readbacks.get(readback.supersedes.readbackId);
      requireValue(prior && prior.id !== readback.id && canonical(prior.identity) === canonical(readback.identity) && Date.parse(prior.acquiredAt) < Date.parse(readback.acquiredAt), '/readbacks/supersedes', 'requires an earlier same-identity readback');
      for (const field of readback.supersedes.fields) requireValue(Object.hasOwn(prior.fields, field) && Object.hasOwn(readback.fields, field), '/readbacks/supersedes/fields', 'field absent from supersession');
    }
  }
  for (const attempt of input.attempts) {
    if (attempt.retryOf !== undefined) requireValue(attempts.has(attempt.retryOf) && Date.parse(attempts.get(attempt.retryOf).attemptedAt) <= Date.parse(attempt.attemptedAt) && attempt.retryOf !== attempt.id, '/attempts/retryOf', 'requires an earlier attempt');
    if (attempt.resolution) { references(attempt.resolution.readbackIds, input.readbacks, '/attempts/resolution/readbackIds'); references([attempt.resolution.inventoryId], input.inventories, '/attempts/resolution/inventoryId'); }
  }
  for (const aggregate of history.aggregateReports ?? []) references(aggregate.attemptIds, input.attempts, '/history/aggregateReports');
  if (input.clockResolution) references(input.clockResolution.clockIds, input.clocks, '/clockResolution/clockIds');
  return input;
}

const sameIdentity = (left, right) => canonical(left) === canonical(right);
const sameField = (field, left, right) => ['start', 'end'].includes(field) && left !== null && right !== null ? Date.parse(left) === Date.parse(right) : canonical(left) === canonical(right);
const inTarget = (id, scope) => id.environment === scope.environment && id.accountId === scope.accountId && (id.containerKind === 'task-list' ? scope.taskListIds : scope.calendarIds).includes(id.containerId);
const minutes = interval => (Date.parse(interval.end) - Date.parse(interval.start)) / 60000;
const milliseconds = value => typeof value === 'number' ? value : Date.parse(value);
const overlap = (left, right) => milliseconds(left.start) < milliseconds(right.end) && milliseconds(right.start) < milliseconds(left.end);
function localParts(value, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}
function localDate(value, timeZone) { const parts = localParts(value, timeZone); return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`; }
function localDay(date, timeZone) {
  const anchor = Date.parse(`${date}T12:00:00Z`);
  const boundary = after => {
    let low = anchor - 2 * 86400000; let high = anchor + 2 * 86400000;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (after ? localDate(middle, timeZone) > date : localDate(middle, timeZone) >= date) high = middle; else low = middle + 1; }
    return low;
  };
  return { start: boundary(false), end: boundary(true) };
}
function zoneMatches(value, timeZone) {
  const parts = localParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}` === value.slice(0, 19);
}
function planHash(plan) { const { queuedChanges, digest: claimed, ...body } = plan; return digest(body); }
function stringDelta(expected, actual) {
  let firstDifference = 0; while (firstDifference < Math.min(expected.length, actual.length) && expected[firstDifference] === actual[firstDifference]) firstDifference++;
  return { expectedLength: expected.length, savedLength: actual.length, firstDifference: expected === actual ? null : firstDifference, trailingWhitespaceDelta: (actual.match(/\s*$/u)[0].length - expected.match(/\s*$/u)[0].length) };
}
function hasSourceName(title, name) {
  for (let index = title.indexOf(name); index !== -1; index = title.indexOf(name, index + 1)) {
    if (!/[\p{L}\p{N}]$/u.test(title.slice(0, index)) && !/^[\p{L}\p{N}]/u.test(title.slice(index + name.length))) return true;
  }
  return false;
}

export function assessCalendar(input, { evaluatedAt, inputDigest }) {
  const { intent, plan } = input; const now = Date.parse(evaluatedAt); const findings = [];
  const finding = (code, kind, pointers, scope = null) => findings.push({ code, kind, scope, pointers });
  const age = acquiredAt => now < Date.parse(acquiredAt) ? 'future' : now - Date.parse(acquiredAt) > intent.maxEvidenceAgeMs ? 'stale' : 'fresh';
  const fresh = (acquiredAt, pointer, scope) => { const status = age(acquiredAt); if (status !== 'fresh') finding(`evidence-${status}`, 'needs-evidence', [pointer], scope); return status === 'fresh'; };
  fresh(intent.acquiredAt, '/intent/acquiredAt', 'owner-intent');
  if (!zoneMatches(intent.window.start, intent.window.timeZone) || !zoneMatches(intent.window.end, intent.window.timeZone)) finding('window-zone-mismatch', 'needs-evidence', ['/intent/window'], 'campaign');
  const intentDigest = digest(intent); const planDigest = plan === null ? null : planHash(plan);
  const boundAttempt = attempt => {
    const change = plan?.queuedChanges.find(entry => entry.id === attempt.operationId);
    return !change || (attempt.intentDigest === undefined || attempt.intentDigest === intentDigest) && (attempt.planDigest === undefined || attempt.planDigest === planDigest);
  };
  const readbackById = new Map(input.readbacks.map(readback => [readback.id, readback]));
  const readbackPointer = readback => `/readbacks/${input.readbacks.indexOf(readback)}`;
  const inventoryPointer = inventory => `/inventories/${input.inventories.indexOf(inventory)}`;
  const persistence = readback => {
    const sequence = readback.sequence;
    if (!['closedAt', 'reloadedAt', 'reopenedAt'].every(key => sequence[key] !== null)) return false;
    if (readback.forOperation === null) return true;
    return sequence.savedAt != null && input.attempts.some(attempt => attempt.operationId === readback.forOperation && attempt.outcome !== 'denied' && attempt.outcome !== 'consumed' && boundAttempt(attempt) && sameIdentity(attempt.identity, readback.identity) && Date.parse(attempt.attemptedAt) <= Date.parse(sequence.savedAt));
  };
  const eligible = readback => age(readback.acquiredAt) === 'fresh' && persistence(readback) && inTarget(readback.identity, intent.target);
  const currentCaptures = (item, field) => {
    const candidates = input.readbacks.filter(readback => sameIdentity(readback.identity, item.identity) && Object.hasOwn(readback.fields, field) && age(readback.acquiredAt) === 'fresh');
    const superseded = new Set(candidates.filter(readback => readback.supersedes?.fields.includes(field)).map(readback => readback.supersedes.readbackId));
    return candidates.filter(readback => !superseded.has(readback.id) && eligible(readback) && readback.fields[field].origin === 'saved-field').sort((left, right) => left.id.localeCompare(right.id));
  };
  const fieldResults = [];
  for (const [index, item] of intent.items.entries()) {
    const pointer = `/intent/items/${index}`;
    if (!inTarget(item.identity, intent.target)) finding('item-outside-target', 'revise', [`${pointer}/identity`], item.identity);
    const expected = item.expected;
    const timed = expected.start != null || expected.end != null;
    if (timed) {
      if (expected.start == null || expected.end == null) finding('schedule-incomplete', 'needs-evidence', [`${pointer}/expected`], item.identity);
      else {
        if (minutes(expected) <= 0 || expected.durationMinutes != null && minutes(expected) !== expected.durationMinutes) finding('schedule-duration-mismatch', 'revise', [`${pointer}/expected`], item.identity);
        const timeZone = expected.timeZone ?? intent.window.timeZone;
        if (!zoneMatches(expected.start, timeZone) || !zoneMatches(expected.end, timeZone)) finding('time-zone-mismatch', 'needs-evidence', [`${pointer}/expected`], item.identity);
        if (expected.date !== undefined && expected.date !== localDate(expected.start, timeZone)) finding('schedule-date-mismatch', 'revise', [`${pointer}/expected/date`], item.identity);
      }
    }
    if (expected.type !== undefined && expected.type !== (item.identity.containerKind === 'task-list' ? 'task' : 'event')) finding('item-type-scope-mismatch', 'revise', [`${pointer}/expected/type`], item.identity);
    for (const [field, expected] of Object.entries(item.expected)) {
      const candidates = currentCaptures(item, field); const exactIdentity = input.readbacks.filter(readback => sameIdentity(readback.identity, item.identity) && Object.hasOwn(readback.fields, field));
      let status = 'exact'; let saved;
      if (!candidates.length) {
        status = exactIdentity.some(readback => readback.fields[field].origin !== 'saved-field' && readback.fields[field].origin !== 'unreadable') ? 'wrong-provenance' : 'unreadable';
        if (exactIdentity.some(readback => !persistence(readback))) finding('persistence-unverified', 'needs-evidence', exactIdentity.map(readbackPointer), item.identity);
        for (const readback of exactIdentity) if (age(readback.acquiredAt) !== 'fresh') fresh(readback.acquiredAt, `${readbackPointer(readback)}/acquiredAt`, item.identity);
      } else if (new Set(candidates.map(readback => canonical(readback.fields[field].value))).size > 1) status = 'conflict';
      else {
        saved = candidates[0].fields[field].value;
        if (field === 'recurrence' && (expected?.kind === 'unsupported' || saved?.kind === 'unsupported')) status = 'unreadable';
        else if (!sameField(field, expected, saved)) status = 'mismatch';
      }
      const pointers = [`${pointer}/expected/${field}`, ...(candidates.length ? candidates : exactIdentity).map(readback => `${readbackPointer(readback)}/fields/${field}`)];
      const result = { itemKey: item.key, identity: item.identity, field, status, expectedDigest: digest(expected), savedDigest: saved === undefined ? null : digest(saved), readbackIds: candidates.map(readback => readback.id), pointers };
      if (typeof expected === 'string' && typeof saved === 'string') Object.assign(result, stringDelta(expected, saved));
      fieldResults.push(result);
      if (status !== 'exact') finding(`field-${status}`, status === 'mismatch' ? 'revise' : 'needs-evidence', pointers, { identity: item.identity, field });
    }
  }
  const inventoryResults = []; const usableInventories = [];
  for (const [index, inventory] of input.inventories.entries()) {
    const pointer = `/inventories/${index}`; const reasons = [];
    if (canonical(inventory.target) !== canonical(intent.target) || canonical(inventory.window) !== canonical(intent.window)) reasons.push('scope');
    if (age(inventory.acquiredAt) !== 'fresh') reasons.push(age(inventory.acquiredAt));
    for (const name of ['taskLists', 'calendars']) {
      const required = name === 'taskLists' ? intent.target.taskListIds : intent.target.calendarIds;
      if (canonical(inventory[name].map(row => row.containerId).sort()) !== canonical([...required].sort())) reasons.push(`${name}-membership`);
      for (const row of inventory[name]) {
        if (!row.available || !row.complete || row.gaps.length || !row.cursorExhausted || Object.values(row.coverage).some(value => !value)) reasons.push(`${name}-incomplete`);
        for (const item of row.items) if (!inTarget(item.identity, intent.target) || item.identity.containerId !== row.containerId || item.identity.containerKind !== (name === 'taskLists' ? 'task-list' : 'calendar') || item.type !== (name === 'taskLists' ? 'task' : 'event')) reasons.push('item-scope');
      }
    }
    inventoryResults.push({ id: inventory.id, status: reasons.length ? 'needs-evidence' : 'complete', digest: digest(inventory), reasons: [...new Set(reasons)].sort(), pointer });
    if (!reasons.length) usableInventories.push(inventory);
    if (plan?.inventoryIds.includes(inventory.id) && reasons.length) finding('inventory-incomplete', 'needs-evidence', [pointer], inventory.id);
  }
  const selectedInventories = plan === null ? [] : input.inventories.filter(inventory => plan.inventoryIds.includes(inventory.id));
  const selectedItems = selectedInventories.flatMap(inventory => [...inventory.taskLists, ...inventory.calendars].flatMap(row => row.items));
  const inventoryItems = new Map();
  for (const item of selectedItems) {
    const key = canonical(item.identity); const prior = inventoryItems.get(key);
    if (prior && canonical(prior) !== canonical(item)) finding('inventory-conflict', 'needs-evidence', ['/inventories'], item.identity);
    if (prior && selectedInventories.some(inventory => [...inventory.taskLists, ...inventory.calendars].some(row => row.items.filter(entry => sameIdentity(entry.identity, item.identity)).length > 1))) finding('inventory-duplicate', 'needs-evidence', ['/inventories'], item.identity);
    inventoryItems.set(key, item);
  }
  for (const [index, item] of intent.items.entries()) {
    if (plan !== null && !inventoryItems.has(canonical(item.identity))) finding('item-not-inventoried', 'needs-evidence', [`/intent/items/${index}/identity`, '/inventories'], item.identity);
    const ambiguous = selectedItems.filter(entry => !sameIdentity(entry.identity, item.identity) && (entry.campaignKey === item.key || item.expected.title !== undefined && entry.title === item.expected.title));
    if (ambiguous.length) finding('ambiguous-item', 'needs-evidence', [`/intent/items/${index}`, '/inventories'], item.identity);
    const observed = inventoryItems.get(canonical(item.identity));
    if (observed) {
      const values = { type: observed.type, title: observed.title, completed: observed.completed, start: observed.interval?.start ?? null, end: observed.interval?.end ?? null, durationMinutes: observed.interval === null ? null : minutes(observed.interval), timeZone: observed.interval?.timeZone ?? null };
      for (const [field, value] of Object.entries(values)) if (Object.hasOwn(item.expected, field) && !sameField(field, item.expected[field], value)) finding('inventory-field-mismatch', 'revise', [`/intent/items/${index}/expected/${field}`, '/inventories'], { identity: item.identity, field });
    }
  }
  for (const commitment of inventoryItems.values()) {
    if (commitment.interval !== null && (!zoneMatches(commitment.interval.start, commitment.interval.timeZone) || !zoneMatches(commitment.interval.end, commitment.interval.timeZone))) finding('inventory-zone-mismatch', 'needs-evidence', ['/inventories'], commitment.identity);
    if (commitment.type === 'event' && commitment.transparency === 'unknown') finding('event-transparency-unknown', 'needs-evidence', ['/inventories'], commitment.identity);
    if (commitment.type === 'event' && commitment.transparency === 'busy' && commitment.interval === null) finding('busy-event-interval-missing', 'needs-evidence', ['/inventories'], commitment.identity);
    if (commitment.type === 'event' && commitment.interval === null && intent.eventConstraints.some(event => event.mandatory && sameIdentity(event.identity, commitment.identity))) finding('mandatory-event-interval-missing', 'needs-evidence', ['/inventories'], commitment.identity);
  }
  const allocations = plan?.allocations ?? []; const conflictResults = []; const sourceResults = []; const budgetResults = []; const morningResults = [];
  if (plan === null) finding('plan-missing', 'needs-evidence', ['/plan'], 'campaign');
  else {
    if (plan.intentDigest !== intentDigest) finding('intent-binding-mismatch', 'revise', ['/plan/intentDigest', '/intent'], 'campaign');
    if (plan.digest !== undefined && plan.digest !== planDigest) finding('plan-binding-mismatch', 'revise', ['/plan/digest'], 'campaign');
    if (!selectedInventories.length) finding('baseline-missing', 'needs-evidence', ['/plan/inventoryIds'], 'campaign');
  }
  const addConflict = (left, right, code, pointers) => { conflictResults.push({ code, identities: [left.identity, right.identity], pointers }); finding(code, 'revise', pointers, left.identity); };
  for (const [index, allocation] of allocations.entries()) {
    const pointer = `/plan/allocations/${index}`; const item = intent.items.find(entry => entry.key === allocation.itemKey); const source = intent.sources.find(entry => entry.sourceId === allocation.sourceId); const duration = minutes(allocation);
    if (!item || !sameIdentity(item.identity, allocation.identity)) finding('allocation-identity-mismatch', 'revise', [pointer], allocation.identity);
    if (!source || source.kind !== allocation.sourceKind) finding('allocation-source-mismatch', 'revise', [pointer], allocation.identity);
    if (!(duration > 0) || duration % 30 !== 0) finding('duration-increment', 'revise', [pointer], allocation.identity);
    if (Date.parse(allocation.start) < Date.parse(intent.window.start) || Date.parse(allocation.end) > Date.parse(intent.window.end)) finding('allocation-outside-window', 'revise', [pointer], allocation.identity);
    if (!zoneMatches(allocation.start, intent.window.timeZone) || !zoneMatches(allocation.end, intent.window.timeZone)) finding('time-zone-mismatch', 'needs-evidence', [pointer], allocation.identity);
    if (item) {
      const required = { date: localDate(allocation.start, intent.window.timeZone), start: allocation.start, end: allocation.end, durationMinutes: duration, timeZone: intent.window.timeZone };
      for (const [field, value] of Object.entries(required)) {
        if (!Object.hasOwn(item.expected, field)) finding('allocation-field-missing', 'needs-evidence', [pointer, `/intent/items/${intent.items.indexOf(item)}/expected`], { identity: item.identity, field });
        else if (!sameField(field, item.expected[field], value)) finding('allocation-field-mismatch', 'revise', [pointer, `/intent/items/${intent.items.indexOf(item)}/expected/${field}`], item.identity);
      }
      if (item.expected.completed === true) finding('completed-work-allocation', 'revise', [pointer], item.identity);
      if (item.expected.deadline !== undefined && item.expected.deadline !== null) {
        const deadline = item.expected.deadline;
        if (deadline.kind === 'instant' ? Date.parse(allocation.end) > Date.parse(deadline.value) : localDate(allocation.end, intent.window.timeZone) > deadline.value) finding('deadline-exceeded', 'revise', [pointer], item.identity);
      }
    }
    const buffered = { start: Date.parse(allocation.start) - (intent.buffers?.beforeMinutes ?? 0) * 60000, end: Date.parse(allocation.end) + (intent.buffers?.afterMinutes ?? 0) * 60000 };
    if (buffered.start < Date.parse(intent.window.start) || buffered.end > Date.parse(intent.window.end)) finding('buffer-outside-window', 'revise', [pointer, '/intent/buffers'], allocation.identity);
    for (const commitment of inventoryItems.values()) {
      const mandatory = intent.eventConstraints.some(event => event.mandatory && sameIdentity(event.identity, commitment.identity));
      if (sameIdentity(allocation.identity, commitment.identity) || commitment.interval === null || commitment.type === 'event' && commitment.transparency === 'transparent' && !mandatory) continue;
      if (overlap(buffered, commitment.interval)) addConflict(allocation, commitment, 'calendar-collision', [pointer, '/inventories']);
    }
    for (const [otherIndex, other] of allocations.entries()) if (otherIndex > index && overlap(buffered, { start: Date.parse(other.start) - (intent.buffers?.beforeMinutes ?? 0) * 60000, end: Date.parse(other.end) + (intent.buffers?.afterMinutes ?? 0) * 60000 })) addConflict(allocation, other, 'allocation-collision', [pointer, `/plan/allocations/${otherIndex}`]);
  }
  for (const event of intent.eventConstraints) if (!inventoryItems.has(canonical(event.identity))) finding('event-constraint-not-inventoried', 'needs-evidence', ['/intent/eventConstraints', '/inventories'], event.identity);
  for (const [index, source] of (plan === null ? [] : intent.sources).entries()) {
    const matching = allocations.filter(allocation => allocation.sourceId === source.sourceId); const totalMinutes = matching.reduce((sum, allocation) => sum + Math.max(0, minutes(allocation)), 0); const reasons = [];
    if (source.kind === 'whole-source' && matching.length !== 1) reasons.push('whole-source-continuity');
    if (source.kind === 'whole-source') for (const allocation of matching) {
      const item = intent.items.find(entry => entry.key === allocation.itemKey);
      if (typeof item?.expected.title !== 'string') finding('source-name-unverified', 'needs-evidence', [`/intent/sources/${index}`, '/intent/items'], source.sourceId);
      else if (!hasSourceName(item.expected.title, source.name)) reasons.push('source-name-mismatch');
    }
    if (totalMinutes < (source.requiredMinutes ?? 0) || matching.length < (source.requiredSessions ?? 0)) reasons.push('source-minimum');
    sourceResults.push({ sourceId: source.sourceId, name: source.name, kind: source.kind, minutes: totalMinutes, sessions: matching.length, status: reasons.length ? 'revise' : 'covered', reasons, pointer: `/intent/sources/${index}` });
    for (const code of reasons) finding(code, 'revise', [`/intent/sources/${index}`, '/plan/allocations'], source.sourceId);
  }
  for (const [index, budget] of (plan === null ? [] : intent.budgets).entries()) {
    let total = 0; const day = budget.scope === 'day' ? localDay(budget.key, intent.window.timeZone) : null;
    for (const allocation of allocations) {
      if (budget.scope === 'campaign' || budget.scope === 'source' && allocation.sourceId === budget.key) total += Math.max(0, minutes(allocation));
      if (budget.scope === 'day') {
        total += Math.max(0, Math.min(day.end, Date.parse(allocation.end)) - Math.max(day.start, Date.parse(allocation.start))) / 60000;
      }
    }
    budgetResults.push({ ...budget, minutes: total, status: total <= budget.maxMinutes ? 'within' : 'exceeded', pointer: `/intent/budgets/${index}` });
    if (total > budget.maxMinutes) finding('budget-exceeded', 'revise', [`/intent/budgets/${index}`, '/plan/allocations'], budget.key);
    if (budget.scope === 'source' && !intent.sources.some(source => source.sourceId === budget.key)) finding('budget-source-unknown', 'revise', [`/intent/budgets/${index}`], budget.key);
  }
  for (const [index, morning] of (plan === null ? [] : intent.morningRequirements).entries()) {
    const start = Date.parse(morning.start); const end = Date.parse(morning.end); const intervals = allocations.map(allocation => [Math.max(start, Date.parse(allocation.start)), Math.min(end, Date.parse(allocation.end))]).filter(([left, right]) => left < right).sort((left, right) => left[0] - right[0]);
    let cursor = start; let covered = 0;
    for (const [left, right] of intervals) { covered += Math.max(0, right - Math.max(left, cursor)); cursor = Math.max(cursor, right); }
    const coveredMinutes = covered / 60000; const full = covered === end - start && coveredMinutes >= morning.minMinutes;
    morningResults.push({ date: morning.date, requiredMinutes: (end - start) / 60000, coveredMinutes, status: full ? 'covered' : 'gap', pointer: `/intent/morningRequirements/${index}` });
    if (!full) finding('morning-gap', 'revise', [`/intent/morningRequirements/${index}`, '/plan/allocations'], morning.date);
    if (localDate(morning.start, intent.window.timeZone) !== morning.date || localDate(morning.end, intent.window.timeZone) !== morning.date || !zoneMatches(morning.start, intent.window.timeZone) || !zoneMatches(morning.end, intent.window.timeZone)) finding('morning-zone-mismatch', 'needs-evidence', [`/intent/morningRequirements/${index}`], morning.date);
  }
  for (const deliverable of intent.requestedDeliverables ?? []) if (!(intent.allowedDeliverables ?? ['calendar']).includes(deliverable)) finding('unsolicited-deliverable', 'revise', ['/intent/requestedDeliverables', '/intent/allowedDeliverables'], deliverable);
  const queueResults = [];
  for (const [index, change] of (plan?.queuedChanges ?? []).entries()) {
    const pointer = `/plan/queuedChanges/${index}`; const before = findings.length; const item = intent.items.find(entry => sameIdentity(entry.identity, change.identity)); const baseline = readbackById.get(change.baselineReadbackId); const allocation = allocations.find(entry => sameIdentity(entry.identity, change.identity));
    if (!baseline) { finding('baseline-missing', 'needs-evidence', [pointer], change.identity); queueResults.push({ id: change.id, status: 'needs-evidence', operationDigest: null, pointer }); continue; }
    if (!item || !inTarget(change.identity, intent.target)) finding('operation-identity-mismatch', 'revise', [pointer], change.identity);
    if (change.intentDigest !== intentDigest || change.planDigest !== planDigest) finding('operation-binding-mismatch', 'revise', [pointer], change.identity);
    if (!sameIdentity(baseline.identity, change.identity) || change.baselineDigest !== digest(baseline.fields)) finding('baseline-binding-mismatch', 'revise', [pointer, readbackPointer(baseline)], change.identity);
    if (!eligible(baseline)) finding('baseline-ineligible', 'needs-evidence', [pointer, readbackPointer(baseline)], change.identity);
    for (const inventory of selectedInventories) if (change.inventoryDigests[inventory.id] !== digest(inventory)) finding('inventory-binding-mismatch', 'revise', [pointer, inventoryPointer(inventory)], change.identity);
    if (change.sourceId !== (allocation?.sourceId ?? null)) finding('operation-source-mismatch', 'revise', [pointer], change.identity);
    const operationDigest = digest({ identity: change.identity, intentDigest, planDigest, baselineDigest: digest(baseline.fields), inventoryDigests: Object.fromEntries(selectedInventories.map(inventory => [inventory.id, digest(inventory)])), action: change.action, fields: change.fields, allocation: allocation ?? null, authorizedFields: item?.authorizedFields ?? [] });
    if (change.operationDigest !== undefined && change.operationDigest !== operationDigest) finding('operation-digest-mismatch', 'revise', [pointer], change.identity);
    if (item) {
      for (const [field, value] of Object.entries(change.fields)) if (!item.authorizedFields.includes(field) || !Object.hasOwn(item.expected, field) || !sameField(field, value, item.expected[field])) finding('stale-desired-field', 'revise', [`${pointer}/fields/${field}`], { identity: item.identity, field });
      for (const field of change.action === 'move' ? ['date', 'start', 'end', 'timeZone'] : change.action === 'resize' ? ['end', 'durationMinutes'] : change.action === 'remove-date' ? scheduleFields : []) if (!Object.hasOwn(change.fields, field) || change.action === 'remove-date' && change.fields[field] !== null) finding('operation-field-missing', 'revise', [`${pointer}/fields`], { identity: item.identity, field });
      if (change.action === 'remove-date' && (item.expected.type !== 'task' || scheduleFields.some(field => item.expected[field] !== null))) finding('date-removal-scope', 'revise', [pointer, `/intent/items/${intent.items.indexOf(item)}`], item.identity);
      if (change.fields.completed === false && baseline.fields.completed?.value === true) finding('completed-work-reopen', 'revise', [pointer], item.identity);
      if (change.fields.type !== undefined && change.fields.type !== baseline.fields.type?.value) finding('implicit-type-conversion', 'revise', [pointer], item.identity);
      for (const field of fields) {
        const original = baseline.fields[field]; const current = currentCaptures(item, field);
        if (!original || original.origin !== 'saved-field' || !current.length) { finding('baseline-field-missing', 'needs-evidence', [pointer, readbackPointer(baseline)], { identity: item.identity, field }); continue; }
        for (const readback of current) if (!sameField(field, original.value, readback.fields[field].value)) {
          const authorizedSave = readback.forOperation === change.id && item.authorizedFields.includes(field) && Object.hasOwn(change.fields, field) && sameField(field, change.fields[field], readback.fields[field].value) && input.attempts.some(attempt => attempt.operationId === change.id && attempt.outcome === 'saved' && boundAttempt(attempt) && sameIdentity(attempt.identity, change.identity));
          if (!authorizedSave) finding('baseline-drift', 'revise', [pointer, `${readbackPointer(readback)}/fields/${field}`], { identity: item.identity, field });
        }
      }
    }
    queueResults.push({ id: change.id, status: findings.length === before ? 'current' : 'invalid', operationDigest, pointer });
  }
  const relevantAttempt = attempt => {
    if (attempt.identity === null || plan?.queuedChanges.some(change => change.id === attempt.operationId)) return true;
    const item = intent.items.find(entry => sameIdentity(entry.identity, attempt.identity));
    if (!item) return false;
    const affected = fields.includes(attempt.effectScope) ? [attempt.effectScope] : ['move', 'resize', 'remove-date'].includes(attempt.effectScope) ? scheduleFields : fields;
    return affected.some(field => Object.hasOwn(item.expected, field)) || plan?.queuedChanges.some(change => sameIdentity(change.identity, attempt.identity) && affected.some(field => Object.hasOwn(change.fields, field)));
  };
  const relevantCorrections = input.history.corrections.filter(correction => !correction.itemKeys.length || correction.itemKeys.some(key => intent.items.some(item => item.key === key)));
  const historyResults = [];
  if (!input.history.complete || input.history.gaps.length || !fresh(input.history.completeThrough, '/history/completeThrough', 'history')) finding('history-incomplete', 'needs-evidence', ['/history'], 'history');
  const latestSupplied = Math.max(Date.parse(intent.acquiredAt), ...input.attempts.filter(relevantAttempt).map(attempt => Date.parse(attempt.attemptedAt)), ...relevantCorrections.map(correction => Date.parse(correction.acquiredAt)));
  if (Date.parse(input.history.completeThrough) < latestSupplied) finding('history-cutoff-gap', 'needs-evidence', ['/history/completeThrough'], 'history');
  for (const [index, correction] of input.history.corrections.entries()) if (relevantCorrections.includes(correction) && (Date.parse(correction.acquiredAt) > Date.parse(intent.acquiredAt) || Date.parse(correction.acquiredAt) === Math.max(...relevantCorrections.map(entry => Date.parse(entry.acquiredAt))) && correction.revision !== intent.revision)) finding('owner-intent-outdated', 'revise', [`/history/corrections/${index}`, '/intent'], correction.itemKeys);
  for (const [index, aggregate] of (input.history.aggregateReports ?? []).entries()) if (aggregate.count !== aggregate.attemptIds.length || aggregate.attemptIds.some(id => input.attempts.find(attempt => attempt.id === id).outcome !== aggregate.outcome)) finding('aggregate-count-gap', 'needs-evidence', [`/history/aggregateReports/${index}`], 'history');
  for (const [index, attempt] of input.attempts.entries()) {
    const pointer = `/attempts/${index}`; const relevant = relevantAttempt(attempt); let status = 'unresolved';
    if (relevant && !boundAttempt(attempt)) finding('attempt-binding-mismatch', 'revise', [pointer], attempt.identity);
    if (['denied', 'consumed'].includes(attempt.outcome)) { status = attempt.outcome; if (relevant) finding(attempt.outcome === 'denied' ? 'effect-denied' : 'effect-consumed', 'needs-evidence', [pointer], { identity: attempt.identity, effectScope: attempt.effectScope }); }
    else {
      const resolution = attempt.resolution;
      const inventory = resolution ? usableInventories.find(entry => entry.id === resolution.inventoryId && Date.parse(entry.acquiredAt) >= Date.parse(attempt.attemptedAt)) : null;
      const captures = resolution ? resolution.readbackIds.map(id => readbackById.get(id)) : input.readbacks.filter(readback => readback.forOperation === attempt.operationId);
      const sameItemReads = captures.filter(readback => eligible(readback) && sameIdentity(readback.identity, attempt.identity) && Date.parse(readback.acquiredAt) >= Date.parse(attempt.attemptedAt));
      const inventoryEntries = inventory ? [...inventory.taskLists, ...inventory.calendars].flatMap(row => row.items) : [];
      const duplicateFree = inventory && inventoryEntries.filter(item => sameIdentity(item.identity, attempt.identity)).length === 1 && [...inventory.taskLists, ...inventory.calendars].every(row => new Set(row.items.map(item => canonical(item.identity))).size === row.items.length) && !findings.some(entry => ['ambiguous-item', 'inventory-conflict'].includes(entry.code));
      const saved = sameItemReads.some(readback => readback.forOperation === attempt.operationId && readback.sequence.savedAt != null && Date.parse(readback.sequence.savedAt) >= Date.parse(attempt.attemptedAt) && Object.keys(readback.fields).length > 0 && (!fields.includes(attempt.effectScope) || readback.fields[attempt.effectScope]?.origin === 'saved-field') && Object.values(readback.fields).every(capture => capture.origin === 'saved-field'));
      const noEffect = resolution?.kind === 'no-effect' && sameItemReads.length > 0 && sameItemReads.every(readback => {
        const change = plan?.queuedChanges.find(entry => entry.id === attempt.operationId); const baseline = change ? readbackById.get(change.baselineReadbackId) : null;
        return baseline && fields.every(field => baseline.fields[field] && readback.fields[field]?.origin === 'saved-field' && sameField(field, baseline.fields[field].value, readback.fields[field].value));
      });
      if (attempt.identity !== null && (attempt.outcome === 'saved' && saved || resolution && duplicateFree && (resolution.kind === 'saved' && saved || noEffect))) status = 'resolved';
      if (relevant && status === 'unresolved') finding(attempt.identity === null ? 'unknown-item-attempt' : 'attempt-unresolved', 'needs-evidence', [pointer], { identity: attempt.identity, effectScope: attempt.effectScope });
    }
    if (relevant && attempt.retryOf && ['denied', 'consumed'].includes(input.attempts.find(entry => entry.id === attempt.retryOf).outcome)) finding('terminal-effect-retry', 'revise', [pointer], attempt.identity);
    historyResults.push({ id: attempt.id, outcome: attempt.outcome, status, relevant, rawDigest: digest(attempt.raw), pointer });
  }
  for (const barrier of input.attempts.filter(attempt => ['denied', 'consumed'].includes(attempt.outcome))) {
    for (const change of plan?.queuedChanges ?? []) if (sameIdentity(change.identity, barrier.identity) && (change.id === barrier.operationId || change.action === barrier.effectScope || Object.hasOwn(change.fields, barrier.effectScope))) finding('terminal-effect-queued', 'revise', ['/plan/queuedChanges', `/attempts/${input.attempts.indexOf(barrier)}`], barrier.identity);
  }
  let timingStatus = 'checked';
  const clockResults = [];
  for (const item of intent.items) {
    const clocks = input.clocks.filter(clock => sameIdentity(clock.identity, item.identity)); if (!clocks.length) continue;
    const resolution = input.clockResolution; const disagreement = clocks.some(clock => clock.instant === null || clock.timeZone === null || clock.offset === null || age(clock.acquiredAt) !== 'fresh' || clock.instant !== null && clock.timeZone !== null && (!zoneMatches(clock.instant, clock.timeZone) || item.expected.start != null && !sameField('start', clock.instant, item.expected.start) || clock.offset !== null && Date.parse(`2000-01-01T00:00:00${clock.offset}`) !== Date.parse(`2000-01-01T00:00:00${clock.instant.endsWith('Z') ? 'Z' : clock.instant.slice(-6)}`))) || new Set(clocks.map(clock => clock.instant === null ? null : Date.parse(clock.instant))).size > 1;
    const resolved = resolution && age(resolution.acquiredAt) === 'fresh' && clocks.every(clock => resolution.clockIds.includes(clock.id) && Date.parse(resolution.acquiredAt) >= Date.parse(clock.acquiredAt)) && resolution.timeZone === intent.window.timeZone && zoneMatches(resolution.settledInstant, resolution.timeZone) && (item.expected.start == null || sameField('start', resolution.settledInstant, item.expected.start));
    if (disagreement && !resolved) { timingStatus = 'pending'; finding('clock-disagreement', 'needs-evidence', clocks.map(clock => `/clocks/${input.clocks.indexOf(clock)}`), item.identity); }
    clockResults.push({ identity: item.identity, clockIds: clocks.map(clock => clock.id).sort(), status: disagreement && !resolved ? 'pending' : 'checked', resolution: resolved ? '/clockResolution' : null });
  }
  findings.sort((left, right) => canonical(left).localeCompare(canonical(right)));
  const status = findings.some(entry => entry.kind === 'revise') ? 'revise' : findings.length ? 'needs-evidence' : 'checked';
  const next = [];
  for (const result of [...historyResults].sort((left, right) => ({ denied: 0, consumed: 1, unresolved: 2, resolved: 3 })[left.status] - ({ denied: 0, consumed: 1, unresolved: 2, resolved: 3 })[right.status])) if (['denied', 'consumed', 'unresolved'].includes(result.status) && (result.relevant || result.status !== 'unresolved')) next.push({ action: result.status === 'denied' ? 'stop-denied' : result.status === 'consumed' ? 'stop-consumed' : 'inspect-and-rediscover', scope: { identity: input.attempts.find(attempt => attempt.id === result.id).identity, effectScope: input.attempts.find(attempt => attempt.id === result.id).effectScope }, pointers: [result.pointer] });
  if (findings.some(entry => entry.kind === 'revise')) next.push({ action: 'refresh-intent-and-plan', scope: 'campaign', pointers: ['/intent', '/plan'] });
  if (findings.some(entry => entry.kind === 'needs-evidence')) next.push({ action: 'acquire-saved-evidence', scope: 'affected-scopes', pointers: [...new Set(findings.filter(entry => entry.kind === 'needs-evidence').flatMap(entry => entry.pointers))].sort() });
  return { schemaVersion: 1, ruleVersion: 1, status, execution: 'none', assurance: 'declared-calendar-evidence', evaluatedAt, inputDigest, intentDigest, planDigest, suppliedIntentDigest: plan?.intentDigest ?? null, fieldResults: fieldResults.sort((left, right) => `${left.itemKey}/${left.field}`.localeCompare(`${right.itemKey}/${right.field}`)), planStatus: { status: plan === null || status === 'needs-evidence' ? 'needs-evidence' : status === 'checked' ? 'current' : 'invalid', queuedChanges: queueResults, timingStatus }, inventoryResults, sourceResults: plan === null ? null : sourceResults, budgetResults: plan === null ? null : budgetResults, morningResults: plan === null ? null : morningResults, conflictResults: plan === null ? null : conflictResults, historyResults, clockResults, findings, next, limits: ['All provenance, captures, identity, history completeness, owner intent and acquisition times are declared or reported.', 'A fabricated complete envelope can pass. This check cannot authenticate native saving, recover omitted history, stop an external queue or establish adoption.', 'Material coverage is scheduled coverage. It does not establish study completion or mastery.', 'JSON.parse uses the last value for duplicate decoded object keys.'] };
}

export async function calendar({ file }) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  let bytes;
  try {
    const stat = await handle.stat(); requireValue(stat.isFile() && stat.size <= limit, 'calendar file', 'must be a regular file at most 2 MiB');
    const buffer = Buffer.alloc(limit + 1); let count = 0;
    while (count < buffer.length) { const result = await handle.read(buffer, count, buffer.length - count, null); if (!result.bytesRead) break; count += result.bytesRead; }
    requireValue(count <= limit, 'calendar file', 'exceeds 2 MiB'); bytes = buffer.subarray(0, count);
  } finally { await handle.close(); }
  const input = validateInput(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  return assessCalendar(input, { evaluatedAt: new Date().toISOString(), inputDigest: digest(bytes) });
}
