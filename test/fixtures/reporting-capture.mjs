import { createHash } from 'node:crypto';
import { canonical, recordDigest } from '../../src/automation-reporting.mjs';
export const evaluatedAt = '2026-01-02T00:00:00Z';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const bytesOf = value => canonical(value) + '\n';
export function runRecord(key = 'attempt-one') {
  return { schemaVersion: 1, namespace: 'own', automationId: 'daily', kind: 'run', key, revision: 0, previous: null, recordedAt: '2026-01-01T00:00:00Z', data: { occurrenceKey: null, execution: 'completed', coverage: 'partial', report: null, evidenceRefs: [] } };
}
export function fixture(records = [runRecord()], mode = 'pages') {
  const scope = { schemaVersion: 1, kind: 'automation-reporting-read-scope', rootFolderId: 'root-folder', namespaces: [...new Set(records.map(record => record.namespace))].map(namespace => ({ namespace, folderId: namespace + '-folder', automationIds: [...new Set(records.filter(record => record.namespace === namespace).map(record => record.automationId))] })), inventory: { mode: 'pages' }, controlAuthority: null };
  if (!scope.namespaces.length) scope.namespaces.push({ namespace: 'own', folderId: 'own-folder', automationIds: ['daily'] });
  const rootEntries = scope.namespaces.map(item => ({ id: item.folderId, name: item.namespace, parentId: scope.rootFolderId, type: 'folder' }));
  const objects = records.map((record, index) => ({ id: 'record-' + index, bytesBase64: Buffer.from(bytesOf(record)).toString('base64') }));
  const namespaces = scope.namespaces.map(item => ({ namespace: item.namespace, folderId: item.folderId, entries: records.map((record, index) => ({ record, index })).filter(({ record }) => record.namespace === item.namespace).map(({ record, index }) => ({ id: objects[index].id, name: recordDigest(record) + '.json', parentId: item.folderId, type: 'file', size: Buffer.byteLength(bytesOf(record)), sha256: sha256(bytesOf(record)) })) }));
  const listing = (folderId, entries) => ({ folderId, generation: 'snapshot-one', beforeGeneration: 'snapshot-one', afterGeneration: 'snapshot-one', totalEntries: entries.length, totalPages: 1, mechanism: 'snapshot-cursor', evidenceRef: 'synthetic-source-page-evidence', pages: [{ generation: 'snapshot-one', cursor: null, nextCursor: null, eof: true, entries }] });
  const inventory = { schemaVersion: 1, kind: 'automation-reporting-history-inventory', rootFolderId: scope.rootFolderId, rootEntries, namespaces };
  const capture = { schemaVersion: 1, kind: 'automation-reporting-capture', inventory: { mode: 'pages', root: listing(scope.rootFolderId, rootEntries), namespaces: namespaces.map(item => ({ namespace: item.namespace, listing: listing(item.folderId, item.entries) })) }, objects };
  if (mode === 'pinned') {
    scope.inventory = { mode: 'pinned', id: 'immutable-inventory-one', sha256: sha256(bytesOf(inventory)) };
    capture.inventory = { mode: 'pinned', id: scope.inventory.id, bytesBase64: Buffer.from(bytesOf(inventory)).toString('base64') };
  }
  return { scope, capture, inventory };
}
