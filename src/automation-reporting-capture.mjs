import { chargeReportingBytes, serializedSize } from './reporting-representation.mjs';
import { createHash } from 'node:crypto';
import { strictJson } from './bounded-json.mjs';
import { canonical, recordDigest, validateRecord, projectReadView } from './automation-reporting.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(value);
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 400 && !/[\u0000-\u001f\u007f]/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const CAPTURE_LIMITS = Object.freeze({ packetBytes: 33554432, scopeBytes: 131072, inventoryBytes: 4194304, rootEntries: 200, files: 5000, pages: 1000, recordBytes: 32769, totalRecordBytes: 16777216 });
export const CAPTURE_RULES = 'automation-reporting-capture-v1';
function fields(value, required) {
  need(object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key)), `Expected capture members ${required.join(', ')}`);
}
function decode(bytes, limit) {
  need((typeof bytes === 'string' || Buffer.isBuffer(bytes)) && Buffer.byteLength(bytes) <= limit, 'Capture input exceeds byte bound');
  chargeReportingBytes(Buffer.byteLength(bytes),'decoded');return strictJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes)));
}
function raw(value, limit) {
  need(typeof value === 'string' && value.length <= Math.ceil(limit / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), 'Invalid bounded canonical base64');
  chargeReportingBytes(value.length/4*3-(value.endsWith('==')?2:value.endsWith('=')?1:0),'base64-decoded');const bytes = Buffer.from(value, 'base64');
  chargeReportingBytes(Math.ceil(bytes.length/3)*4,'base64');need(bytes.length <= limit && bytes.toString('base64') === value, 'Invalid base64 bytes');
  return bytes;
}
function scopeConfig(scope) {
  fields(scope, ['schemaVersion', 'kind', 'rootFolderId', 'namespaces', 'inventory', 'controlAuthority']);
  need(scope.schemaVersion === 1 && scope.kind === 'automation-reporting-read-scope' && opaque(scope.rootFolderId), 'Invalid approved capture scope');
  need(Array.isArray(scope.namespaces) && scope.namespaces.length > 0 && scope.namespaces.length <= CAPTURE_LIMITS.rootEntries, 'Invalid namespace scope bound');
  const names = new Set(); const folders = new Set([scope.rootFolderId]);
  for (const item of scope.namespaces) {
    fields(item, ['namespace', 'folderId', 'automationIds']);
    need(identity(item.namespace) && opaque(item.folderId) && !names.has(item.namespace.toLowerCase()) && !folders.has(item.folderId), 'Duplicate or invalid namespace/folder scope');
    need(Array.isArray(item.automationIds) && item.automationIds.length > 0 && item.automationIds.length <= 200 && item.automationIds.every(identity) && new Set(item.automationIds).size === item.automationIds.length, 'Invalid approved automation scope');
    names.add(item.namespace.toLowerCase()); folders.add(item.folderId);
  }
  if (scope.inventory?.mode === 'pages') fields(scope.inventory, ['mode']);
  else { fields(scope.inventory, ['mode', 'id', 'sha256']); need(scope.inventory.mode === 'pinned' && opaque(scope.inventory.id) && digest(scope.inventory.sha256), 'Invalid immutable inventory pin'); }
  if (scope.controlAuthority !== null) {
    fields(scope.controlAuthority, ['namespace', 'automationId']);
    need(scope.namespaces.some(item => item.namespace === scope.controlAuthority.namespace && item.automationIds.includes(scope.controlAuthority.automationId)), 'Control authority outside approved scope');
  }
  return scope;
}
function pageListing(listing, folderId, state) {
  fields(listing, ['folderId', 'generation', 'totalEntries', 'totalPages', 'pages', 'mechanism', 'evidenceRef', 'beforeGeneration', 'afterGeneration']);
  need(listing.folderId === folderId && opaque(listing.generation) && listing.mechanism === 'snapshot-cursor' && opaque(listing.evidenceRef), 'Explicit snapshot generation and pagination evidence required');
  need(Number.isSafeInteger(listing.totalEntries) && listing.totalEntries >= 0 && Number.isSafeInteger(listing.totalPages) && listing.totalPages > 0 && listing.totalPages <= CAPTURE_LIMITS.pages && Array.isArray(listing.pages) && listing.pages.length <= listing.totalPages, 'Invalid pagination totals');
  need(listing.beforeGeneration === listing.generation && (listing.afterGeneration === null || opaque(listing.afterGeneration)), 'Invalid before/after generation evidence');
  if (listing.afterGeneration !== listing.beforeGeneration) state.complete = false;
  state.pages = (state.pages ?? 0) + listing.pages.length;
  need(state.pages <= CAPTURE_LIMITS.pages, 'Total pagination pages exceed bound');
  const entries = []; const cursors = new Set(); let cursor = null; let ended = false;
  for (const page of listing.pages) {
    fields(page, ['generation', 'cursor', 'nextCursor', 'eof', 'entries']);
    need(page.generation === listing.generation && page.cursor === cursor && !ended && !cursors.has(page.cursor), 'Skipped, repeated or changed-generation page');
    need(typeof page.eof === 'boolean' && (page.nextCursor === null || opaque(page.nextCursor)) && page.eof === (page.nextCursor === null) && Array.isArray(page.entries), 'Invalid explicit pagination EOF');
    cursors.add(page.cursor); cursor = page.nextCursor; ended = page.eof; entries.push(...page.entries);
  }
  need(entries.length <= listing.totalEntries, 'Pagination exceeds declared inventory');
  if (!ended || listing.pages.length !== listing.totalPages || entries.length !== listing.totalEntries) state.complete = false;
  return entries;
}
function inventoryOf(capture, scope, state) {
  if (scope.inventory.mode === 'pinned') {
    fields(capture.inventory, ['mode', 'id', 'bytesBase64']);
    need(capture.inventory.mode === 'pinned' && capture.inventory.id === scope.inventory.id, 'Immutable inventory ID mismatch');
    const bytes = raw(capture.inventory.bytesBase64, CAPTURE_LIMITS.inventoryBytes);
    need(hash(bytes) === scope.inventory.sha256, 'Immutable inventory raw digest mismatch');
    const inventory = decode(bytes, CAPTURE_LIMITS.inventoryBytes);
    fields(inventory, ['schemaVersion', 'kind', 'rootFolderId', 'rootEntries', 'namespaces']);
    chargeReportingBytes(serializedSize(inventory)+1);need(inventory.schemaVersion === 1 && inventory.kind === 'automation-reporting-history-inventory' && inventory.rootFolderId === scope.rootFolderId && bytes.equals(Buffer.from(canonical(inventory) + '\n')), 'Invalid canonical full-history inventory');
    return inventory;
  }
  fields(capture.inventory, ['mode', 'root', 'namespaces']);
  need(capture.inventory.mode === 'pages' && Array.isArray(capture.inventory.namespaces), 'Expected paginated inventory');
  const rootEntries = pageListing(capture.inventory.root, scope.rootFolderId, state);
  return { rootEntries, namespaces: capture.inventory.namespaces.map(item => {
    fields(item, ['namespace', 'listing']);
    const approved = scope.namespaces.find(value => value.namespace === item.namespace);
    need(approved, 'Unapproved namespace listing');
    return { namespace: item.namespace, folderId: approved.folderId, entries: pageListing(item.listing, approved.folderId, state) };
  }) };
}
function capturedRecords(capture, scope, evaluatedAt) {
  fields(capture, ['schemaVersion', 'kind', 'inventory', 'objects']);
  need(capture.schemaVersion === 1 && capture.kind === 'automation-reporting-capture' && Array.isArray(capture.objects) && capture.objects.length <= CAPTURE_LIMITS.files, 'Invalid capture or object bound');
  const state = { complete: true }; const inventory = inventoryOf(capture, scope, state);
  need(Array.isArray(inventory.rootEntries) && inventory.rootEntries.length <= CAPTURE_LIMITS.rootEntries && Array.isArray(inventory.namespaces) && inventory.namespaces.length <= scope.namespaces.length, 'Root inventory exceeds bound');
  const ids = new Set([scope.rootFolderId]); const names = new Set();
  for (const entry of inventory.rootEntries) {
    fields(entry, ['id', 'name', 'parentId', 'type']);
    const approved = scope.namespaces.find(item => item.namespace === entry.name && item.folderId === entry.id);
    need(approved && entry.type === 'folder' && entry.parentId === scope.rootFolderId && !ids.has(entry.id) && !names.has(entry.name.toLowerCase()), 'Wrong, duplicate or unapproved root entry');
    ids.add(entry.id); names.add(entry.name.toLowerCase());
  }
  if (inventory.rootEntries.length !== scope.namespaces.length) state.complete = false;
  const namespaces = new Set(); const listed = new Map(); let files = 0;
  for (const item of inventory.namespaces) {
    fields(item, ['namespace', 'folderId', 'entries']);
    const approved = scope.namespaces.find(value => value.namespace === item.namespace && value.folderId === item.folderId);
    need(approved && !namespaces.has(item.namespace) && Array.isArray(item.entries), 'Duplicate or unapproved namespace inventory');
    namespaces.add(item.namespace); const filenames = new Set();
    if (!ids.has(item.folderId)) state.complete = false;
    for (const entry of item.entries) {
      need(++files <= CAPTURE_LIMITS.files, 'Total file inventory exceeds bound');
      fields(entry, ['id', 'name', 'parentId', 'type', 'size', 'sha256']);
      need(opaque(entry.id) && !ids.has(entry.id) && entry.parentId === item.folderId && entry.type === 'file' && /^[a-f0-9]{64}\.json$/.test(entry.name) && !filenames.has(entry.name), 'Wrong or duplicate record location');
      need(Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= CAPTURE_LIMITS.recordBytes && digest(entry.sha256), 'Invalid record byte metadata');
      ids.add(entry.id); filenames.add(entry.name); listed.set(entry.id, { ...entry, approved });
    }
  }
  if (namespaces.size !== scope.namespaces.length) state.complete = false;
  const records = []; const objects = new Set(); let totalBytes = 0;
  for (const item of capture.objects) {
    fields(item, ['id', 'bytesBase64']);
    const entry = listed.get(item.id);
    need(entry && !objects.has(item.id), 'Unlisted or duplicate captured object'); objects.add(item.id);
    const bytes = raw(item.bytesBase64, CAPTURE_LIMITS.recordBytes);
    need(bytes.length === entry.size && hash(bytes) === entry.sha256, 'Record length or raw digest mismatch');
    totalBytes += bytes.length; need(totalBytes <= CAPTURE_LIMITS.totalRecordBytes, 'Aggregate record bytes exceed bound');
    const record = validateRecord(decode(bytes, CAPTURE_LIMITS.recordBytes), evaluatedAt);
    chargeReportingBytes(serializedSize(record)+1);need(bytes.equals(Buffer.from(canonical(record) + '\n')), 'Record requires exact canonical JSON and final newline');
    need(record.namespace === entry.approved.namespace && entry.approved.automationIds.includes(record.automationId) && recordDigest(record) + '.json' === entry.name, 'Record scope or content digest mismatch');
    records.push(record);
  }
  if (objects.size !== listed.size) state.complete = false;
  return { records, complete: state.complete, findings: state.complete ? [] : ['incomplete-capture'] };
}
export function consumeCapture(scopeBytes, captureBytes, request, { evaluatedAt = new Date().toISOString() } = {}) {
  need(object(request), 'Expected capture read request');
  need(Object.keys(request).every(key => ['action', 'namespace', 'automationId', 'id', 'query', 'cursor', 'limit', 'maxAgeSeconds', 'findingCursor'].includes(key)) && ['status', 'inspect', 'list', 'get'].includes(request.action), 'Expected bounded read-only capture request');
  need(request.query === undefined || typeof request.query === 'string' && request.query.length <= 200, 'Invalid bounded capture query');
  const scope = scopeConfig(decode(scopeBytes, CAPTURE_LIMITS.scopeBytes));
  need(request.namespace === undefined || scope.namespaces.some(item => item.namespace === request.namespace), 'Read namespace outside approved scope');
  need(request.automationId === undefined || scope.namespaces.some(item => (!request.namespace || item.namespace === request.namespace) && item.automationIds.includes(request.automationId)), 'Read automation outside approved scope');
  const snapshot = capturedRecords(decode(captureBytes, CAPTURE_LIMITS.packetBytes), scope, evaluatedAt);
  const view = projectReadView({ ...request, controlAuthority: scope.controlAuthority }, snapshot, { evaluatedAt });
  const provenance = { rules: CAPTURE_RULES, scopeSha256: hash(scopeBytes), captureSha256: hash(captureBytes), evaluatedAt, request, inventoryMode: scope.inventory.mode, completeness: snapshot.complete ? 'mechanically-consistent-supplied-history' : 'incomplete', authority: 'reported-capture', providerLatest: 'not-established', writes: false };
  return { ...view, capture: provenance, resultSha256: hash(canonical({ provenance, view })) };
}
