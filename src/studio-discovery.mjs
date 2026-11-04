import { strictJson } from './strict-json.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const stable = value => JSON.stringify(value, (_, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const compare = (left, right) => stable(left).localeCompare(stable(right), 'en');
function instant(value) {
  const parts = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!parts) return NaN;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  const calendar = new Date(0); calendar.setUTCFullYear(year, month - 1, day);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return NaN;
  return Date.parse(value);
}

function decoded(response) {
  if (!object(response) || response.isError) throw new Error('Native response must be an object');
  if (!Object.hasOwn(response, 'content')) return response;
  if (Object.hasOwn(response, 'structuredContent') || !Array.isArray(response.content) || response.content.length !== 1 || response.content[0]?.type !== 'text' || !text(response.content[0].text)) throw new Error('Ambiguous or unsuccessful MCP response');
  const value = strictJson(response.content[0].text);
  if (!object(value) || Object.hasOwn(value, 'content')) throw new Error('Expected one decoded native object');
  return value;
}

export function studioDiscovery(input) {
  if (!object(input) || input.schemaVersion !== 1 || !object(input.scope) || !text(input.scope.hostId) || !text(input.scope.projectId) || !Number.isFinite(instant(input.evaluatedAt)) || !Number.isSafeInteger(input.maxAgeMs) || input.maxAgeMs < 0) throw new Error('Expected discovery schema 1, exact host/project scope, evaluatedAt and safe nonnegative maxAgeMs');
  const { scope, evaluatedAt, maxAgeMs } = input;
  const now = instant(evaluatedAt);
  const gaps = []; const nextReads = []; const identities = new Map(); const unknown = [];
  const gap = (source, reason, detail = null) => gaps.push({ source, reason, detail });
  const freshness = (source, acquiredAt) => {
    const ageMs = now - instant(acquiredAt);
    const state = !Number.isFinite(ageMs) ? 'unknown' : ageMs < 0 ? 'future' : ageMs > maxAgeMs ? 'stale' : 'fresh';
    if (state !== 'fresh') gap(source, `acquisition-${state}`, acquiredAt ?? null);
    return { acquiredAt: acquiredAt ?? null, ageMs: Number.isFinite(ageMs) ? ageMs : null, state };
  };
  const read = (tool, args) => ({ tool, arguments: args });
  let project = null; let projectState = 'unavailable'; let catalogFreshness = null;
  try {
    if (!object(input.projects)) throw new Error('Project catalog omitted');
    catalogFreshness = freshness('projects', input.projects.acquiredAt);
    const catalog = decoded(input.projects.response);
    if (catalog.schemaVersion !== 2 || !Array.isArray(catalog.projects)) throw new Error('Expected native project catalog schema 2');
    if (catalog.projects.some(item => !object(item) || !text(item.projectId) || !text(item.label) || !['local', 'remote', 'chatgpt'].includes(item.projectKind))) throw new Error('Invalid native project row');
    const unknownHost = catalog.projects.some(item => item.projectId === scope.projectId && !text(item.hostId));
    const matches = catalog.projects.filter(item => item.projectId === scope.projectId && item.hostId === scope.hostId);
    const distinct = [...new Map(matches.map(item => [stable(item), item])).values()];
    projectState = distinct.length === 0 ? (unknownHost ? 'unknown-host-membership' : 'missing-from-available-catalog') : distinct.length === 1 ? 'available' : 'conflicting';
    project = distinct.length === 1 ? distinct[0] : null;
    if (projectState !== 'available') gap('projects', projectState);
  } catch (error) { gap('projects', 'unavailable', error.message); }
  if (projectState === 'unavailable' || catalogFreshness?.state !== 'fresh' || ['conflicting', 'unknown-host-membership'].includes(projectState)) nextReads.push(read('list_projects', {}));

  const sources = {};
  for (const source of ['active', 'archived']) {
    const tool = source === 'active' ? 'list_threads' : 'list_archived_threads';
    const base = { source: 'codex', hostId: scope.hostId, ...(source === 'active' ? { mode: 'history', archived: false } : {}) };
    const capture = input[source];
    let cursor = null; let terminal = false; let validPages = 0; let retry = false;
    const seen = new Set(); const acquisitions = [];
    if (!object(capture) || !Array.isArray(capture.pages)) gap(source, 'source-omitted');
    else {
      if (capture.error !== undefined) { gap(source, 'source-unavailable', capture.error); retry = true; }
      for (const [index, page] of capture.pages.entries()) {
        try {
          if (terminal) throw new Error('Page follows terminal cursor');
          const args = page?.request;
          if (!object(args) || Object.keys(args).some(key => ![...Object.keys(base), 'limit', 'cursor'].includes(key)) || Object.entries(base).some(([key, value]) => args[key] !== value) || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50 || (cursor === null ? Object.hasOwn(args, 'cursor') : args.cursor !== cursor)) throw new Error('Tool, scope or cursor binding mismatch');
          const response = decoded(page.response);
          if (!Array.isArray(response.threads) || response.threads.length > args.limit || !(response.nextCursor === null || text(response.nextCursor))) throw new Error('Invalid native thread page');
          if (response.nextCursor !== null && seen.has(response.nextCursor)) throw new Error('Repeated next cursor');
          const acquired = freshness(`${source}[${index}]`, page.acquiredAt); acquisitions.push(acquired);
          for (const task of response.threads) {
            if (object(task) && !text(task.id)) {
              const reason = text(task.clientThreadId) ? 'pending-native-identity' : 'unknown-native-identity';
              unknown.push({ source, acquiredAt: acquired.acquiredAt, reason, task }); gap(source, reason, index); continue;
            }
            if (!object(task) || !text(task.id) || task.kind !== 'codex' || !text(task.hostId) || (task.projectId !== undefined && task.projectId !== null && !text(task.projectId))) {
              gap(source, 'invalid-task-row', index); continue;
            }
            if (!text(task.status)) gap(source, 'unknown-native-status', task.id);
            if (task.hostId !== scope.hostId) { gap(source, 'foreign-host-row', task.id); continue; }
            if (!text(task.projectId)) { unknown.push({ source, acquiredAt: acquired.acquiredAt, reason: 'unknown-membership', task }); gap(source, 'unknown-membership', task.id); }
            const key = stable([task.hostId, task.id]);
            if (!identities.has(key)) identities.set(key, new Map());
            const variants = identities.get(key); const variantKey = stable(task);
            if (!variants.has(variantKey)) variants.set(variantKey, { task, captures: [] });
            const captures = variants.get(variantKey).captures;
            const provenance = { source, acquiredAt: acquired.acquiredAt, freshness: acquired.state };
            if (!captures.some(value => stable(value) === stable(provenance))) captures.push(provenance);
          }
          validPages++;
          cursor = response.nextCursor; terminal = cursor === null;
          if (cursor !== null) seen.add(cursor);
        } catch (error) { gap(source, 'invalid-page', { index, message: error.message }); retry = terminal; break; }
      }
    }
    if (!terminal) {
      gap(source, 'pagination-incomplete', cursor);
      nextReads.push(read(tool, { ...base, limit: 50, ...(cursor !== null ? { cursor } : {}) }));
    }
    if (retry || acquisitions.some(value => value.state !== 'fresh')) nextReads.push(read(tool, { ...base, limit: 50 }));
    sources[source] = { validPages, terminalCursorObserved: terminal, acquisitions };
  }
  const tasks = [];
  for (const variants of identities.values()) {
    const observations = [...variants.values()].map(value => ({ ...value, captures: value.captures.sort(compare) })).sort(compare);
    if (!observations.some(value => value.task.projectId === scope.projectId)) continue;
    const { hostId, id } = observations[0].task;
    const overlap = new Set(observations.flatMap(value => value.captures.map(capture => capture.source))).size > 1;
    const conflict = observations.length > 1;
    if (conflict || overlap) gap('tasks', conflict ? 'conflicting-native-identity' : 'active-archive-overlap', { hostId, id });
    tasks.push({ hostId, id, conflict, overlap, observations });
  }
  return {
    schemaVersion: 1, type: 'studio-task-index', scope: { hostId: scope.hostId, projectId: scope.projectId }, evaluatedAt, maxAgeMs,
    status: gaps.length ? 'partial' : 'captured', execution: 'none', project: { state: projectState, value: project, freshness: catalogFreshness },
    sources, tasks: tasks.sort(compare), unknownMembership: unknown.sort(compare), gaps: gaps.sort(compare),
    nextReads: [...new Map(nextReads.map(value => [stable(value), value])).values()].sort(compare),
    limits: ['Supplied captures are unauthenticated. Catalog lists available saved projects only.', 'Pagination is not an atomic snapshot, absence proof or action authority.', 'Native statuses are opaque. Index is disposable stdout and no native state is changed.']
  };
}
