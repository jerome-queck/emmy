import { chargeReportingBytes, serializedSize } from './reporting-representation.mjs';
import { createHash } from 'node:crypto';
import { strictJson } from './bounded-json.mjs';
import { canonical, recordDigest, validateRecord } from './automation-reporting.mjs';
import { outcomeSourceTimes } from './automation-reporting-outcome.mjs';
import { consumeCapture, CAPTURE_LIMITS } from './automation-reporting-capture.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => canonical(a) === canonical(b);
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 400 && !/[\u0000-\u001f\u007f]/.test(value);
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
function reportingBase64(bytes){chargeReportingBytes(Math.ceil(bytes.length/3)*4,'base64');return bytes.toString('base64');}
export const historyHash = bytes => createHash('sha256').update(bytes).digest('hex');
export const historyBytes = value => { chargeReportingBytes(serializedSize(value)+1); return Buffer.from(canonical(value) + '\n'); };
export function historyFields(value, keys) {
  need(value && typeof value === 'object' && !Array.isArray(value) && keys.length === Object.keys(value).length && keys.every(key => Object.hasOwn(value, key)), `Expected history members ${keys.join(', ')}`);
}
const originalText=new WeakMap();
export const historyOriginalText=value=>originalText.get(value);
export function historyDecode(bytes, limit = CAPTURE_LIMITS.packetBytes) {
  need((typeof bytes === 'string' || Buffer.isBuffer(bytes)) && Buffer.byteLength(bytes) <= limit, 'History input exceeds bound');
  chargeReportingBytes(Buffer.byteLength(bytes),'decoded');const text=new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes));const value=strictJson(text);if(value&&typeof value==='object')originalText.set(value,text);return value;
}
export function historyRaw(encoded, limit) {
  need(typeof encoded === 'string' && encoded.length <= Math.ceil(limit / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), 'Expected bounded canonical base64');
  chargeReportingBytes(encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0),'base64-decoded');const bytes = Buffer.from(encoded, 'base64');
  chargeReportingBytes(Math.ceil(bytes.length/3)*4,'base64');need(bytes.length <= limit && bytes.toString('base64') === encoded, 'Invalid raw history bytes');
  return bytes;
}
export function validateHistoryReference(ref) {
  historyFields(ref, ['id','parentId','name','size','sha256']);
  need(opaque(ref.id) && opaque(ref.parentId) && opaque(ref.name) && Number.isSafeInteger(ref.size) && ref.size > 0 && ref.size <= CAPTURE_LIMITS.inventoryBytes && digest(ref.sha256), 'Invalid exact history reference');
  return ref;
}
export function validateDiscoveryScope(scope) {
  historyFields(scope, ['schemaVersion','kind','recordScope','owners']);
  need(scope.schemaVersion === 2 && scope.kind === 'automation-reporting-discovery-scope', 'Expected approved discovery scope v2');
  const recordScope = scope.recordScope;
  need(recordScope?.inventory?.mode === 'pages', 'Discovery record scope requires pages placeholder');
  const inventory = { schemaVersion: 1, kind: 'automation-reporting-history-inventory', rootFolderId: recordScope.rootFolderId, rootEntries: [], namespaces: [] };
  const bytes = historyBytes(inventory);
  consumeCapture(historyBytes({ ...recordScope, inventory: { mode: 'pinned', id: 'scope-validation', sha256: historyHash(bytes) } }), historyBytes({ schemaVersion: 1, kind: 'automation-reporting-capture', inventory: { mode: 'pinned', id: 'scope-validation', bytesBase64: reportingBase64(bytes) }, objects: [] }), { action: 'status' });
  need(Array.isArray(scope.owners) && scope.owners.length > 0 && scope.owners.length <= CAPTURE_LIMITS.rootEntries, 'Bounded registered publication owners required');
  const owners = new Set(); const anchors = new Set(); const namespaces = new Set();
  const canonicalFolders = new Set([recordScope.rootFolderId, ...recordScope.namespaces.map(item => item.folderId)]);
  for (const owner of scope.owners) {
    historyFields(owner, ['owner','anchor','inventoryParentId','namespaces','singleWriter']);
    historyFields(owner.anchor, ['id','parentId','name']);
    need(identity(owner.owner) && !owners.has(owner.owner) && owner.singleWriter === true && opaque(owner.inventoryParentId) && !canonicalFolders.has(owner.inventoryParentId), 'One registered writer per anchor; inventory outside Records required');
    need(opaque(owner.anchor.id) && !anchors.has(owner.anchor.id) && !canonicalFolders.has(owner.anchor.id) && opaque(owner.anchor.parentId) && !canonicalFolders.has(owner.anchor.parentId) && opaque(owner.anchor.name), 'Unique approved anchor outside Records required');
    need(Array.isArray(owner.namespaces) && owner.namespaces.length > 0 && new Set(owner.namespaces).size === owner.namespaces.length && owner.namespaces.every(name => recordScope.namespaces.some(item => item.namespace === name) && !namespaces.has(name)), 'Publication owner namespaces must be disjoint');
    owner.namespaces.forEach(name => namespaces.add(name)); owners.add(owner.owner); anchors.add(owner.anchor.id);
  }
  need(namespaces.size === recordScope.namespaces.length, 'Every admitted namespace needs a registered owner');
  return scope;
}
export function historySourceSet(namespaces) {
  return namespaces.flatMap(item => item.entries.map(entry => ({ namespace: item.namespace, digest: entry.name.slice(0, -5), size: entry.size, sha256: entry.sha256 }))).sort((a,b) => canonical(a).localeCompare(canonical(b)));
}
export function historySourceClocks(records) {
  const bounds = times => { const sorted = times.filter(value => value !== null && value !== undefined).sort((a,b) => Date.parse(a) - Date.parse(b)); return { min: sorted[0] ?? null, max: sorted.at(-1) ?? null }; };
  return { recordedAt: bounds(records.map(record => record.recordedAt)), originalEvidence: bounds(records.flatMap(record => record.kind === 'run' && record.data.report !== null ? [record.data.report.generatedAt,record.data.report.sourceWindow?.end,...outcomeSourceTimes(record.data.report)] : ['automation','registration'].includes(record.kind) ? [record.data.observedAt] : [])) };
}
export function validateHistoryInventory(inventory, scope, owner) {
  historyFields(inventory, ['schemaVersion','kind','rootFolderId','rootEntries','namespaces','owner','generation','previous','sourceSet','sourceSetSha256','captureInterval','sourceClocks','sourceBoundary']);
  need(inventory.schemaVersion === 2 && inventory.kind === 'automation-reporting-history-inventory' && inventory.owner === owner.owner && inventory.rootFolderId === scope.recordScope.rootFolderId && Number.isSafeInteger(inventory.generation) && inventory.generation > 0 && inventory.generation <= CAPTURE_LIMITS.files, 'Invalid inventory generation/owner');
  historyFields(inventory.captureInterval, ['startedAt','endedAt']);
  need(stamp(inventory.captureInterval.startedAt) && stamp(inventory.captureInterval.endedAt) && Date.parse(inventory.captureInterval.startedAt) <= Date.parse(inventory.captureInterval.endedAt), 'Invalid source capture interval');
  historyFields(inventory.sourceBoundary, ['admissionId','throughGeneration','completeAdmittedHistory']);
  need(opaque(inventory.sourceBoundary.admissionId) && inventory.sourceBoundary.throughGeneration === inventory.generation && inventory.sourceBoundary.completeAdmittedHistory === true, 'Complete admitted producer history boundary required');
  need(Array.isArray(inventory.rootEntries) && inventory.rootEntries.length === owner.namespaces.length && Array.isArray(inventory.namespaces) && inventory.namespaces.length === owner.namespaces.length, 'Incomplete owner history inventory');
  const expectedRoots = scope.recordScope.namespaces.filter(item => owner.namespaces.includes(item.namespace)).map(item => ({ id:item.folderId, name:item.namespace, parentId:scope.recordScope.rootFolderId, type:'folder' }));
  need(same([...inventory.rootEntries].sort((a,b)=>a.name.localeCompare(b.name)), expectedRoots.sort((a,b)=>a.name.localeCompare(b.name))), 'Wrong owner namespace roots');
  const seen = new Set(); const ids = new Set(); let total = 0;
  for (const item of inventory.namespaces) {
    historyFields(item, ['namespace','folderId','entries']);
    need(owner.namespaces.includes(item.namespace) && !seen.has(item.namespace) && scope.recordScope.namespaces.some(value => value.namespace === item.namespace && value.folderId === item.folderId) && Array.isArray(item.entries), 'Invalid owner namespace'); seen.add(item.namespace);
    const names = new Set();
    for (const entry of item.entries) {
      need(++total <= CAPTURE_LIMITS.files, 'Total history object bound exceeded');
      historyFields(entry, ['id','name','parentId','type','size','sha256']);
      need(opaque(entry.id) && !ids.has(entry.id) && entry.parentId === item.folderId && entry.type === 'file' && /^[a-f0-9]{64}\.json$/.test(entry.name) && !names.has(entry.name) && Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= CAPTURE_LIMITS.recordBytes && digest(entry.sha256), 'Invalid full-history object entry');
      ids.add(entry.id); names.add(entry.name);
    }
  }
  need(same(inventory.sourceSet, historySourceSet(inventory.namespaces)) && inventory.sourceSetSha256 === historyHash(canonical(inventory.sourceSet)), 'Source history fingerprint mismatch');
  historyFields(inventory.sourceClocks, ['recordedAt','originalEvidence']);
  for (const bounds of Object.values(inventory.sourceClocks)) { historyFields(bounds,['min','max']); need(bounds.min === null && bounds.max === null || stamp(bounds.min) && stamp(bounds.max) && Date.parse(bounds.min) <= Date.parse(bounds.max), 'Invalid original source clock bounds'); }
  if (inventory.previous === null) need(inventory.generation === 1, 'Bootstrap must start at generation one');
  else { historyFields(inventory.previous, ['generation','inventory']); need(inventory.previous.generation === inventory.generation - 1, 'Missing inventory predecessor generation'); validateHistoryReference(inventory.previous.inventory); need(inventory.previous.inventory.parentId === owner.inventoryParentId, 'Predecessor outside approved inventory parent'); }
  return inventory;
}
function reportedTrash(raw) {
  need(raw.isError !== true, 'Drive metadata tool error response');
  need(!Object.hasOwn(raw, 'structuredContent') || raw.structuredContent && typeof raw.structuredContent === 'object' && !Array.isArray(raw.structuredContent), 'Invalid structured Drive metadata');
  const sources = [raw, raw?.structuredContent].filter(value => value && typeof value === 'object' && Object.hasOwn(value, 'trashed'));
  for (const source of sources) need(source.trashed === false, 'Explicit invalid or true trash metadata');
  return sources.length ? false : null;
}
export function normalizeDriveMetadata(raw) {
  need(raw && typeof raw === 'object' && !Array.isArray(raw), 'Original Drive metadata object required');
  const trashed = reportedTrash(raw);
  const source = Object.hasOwn(raw, 'structuredContent') ? raw.structuredContent : raw;
  const size = typeof source.size === 'string' && /^[1-9][0-9]*$/.test(source.size) ? Number(source.size) : source.size;
  need(Number.isSafeInteger(size) && size > 0, 'Invalid Drive metadata size');
  const metadata = {id:source.id,name:source.name ?? source.title,parents:source.parents ?? source.parent_ids,size,mimeType:source.mimeType ?? source.mime_type,trashed,raw};
  need(opaque(metadata.id) && opaque(metadata.name) && Array.isArray(metadata.parents) && metadata.parents.length === 1 && opaque(metadata.parents[0]), 'Exact Drive metadata identity/location required');
  return validateRemoteMetadata(metadata,{id:metadata.id,name:metadata.name,parentId:metadata.parents[0]});
}
export function validateRemoteMetadata(metadata, expected, limit = CAPTURE_LIMITS.inventoryBytes) {
  historyFields(metadata, ['id','name','parents','size','mimeType','trashed','raw']);
  need(metadata.raw !== null && typeof metadata.raw === 'object' && Buffer.byteLength(canonical(metadata.raw)) <= CAPTURE_LIMITS.inventoryBytes, 'Retained original metadata response required');
  const reported = reportedTrash(metadata.raw);
  need((metadata.trashed === false || metadata.trashed === null) && (reported === null || metadata.trashed === reported), 'Invalid or contradictory normalized trash metadata');
  need(metadata.id === expected.id && metadata.name === expected.name && Array.isArray(metadata.parents) && same(metadata.parents, [expected.parentId]) && ['application/json','application/octet-stream'].includes(metadata.mimeType) && Number.isSafeInteger(metadata.size) && metadata.size > 0 && metadata.size <= limit && (expected.size === undefined || metadata.size === expected.size), 'Wrong exact remote ID/location/type/length');
  return metadata;
}
export function validateRemoteDownload(download, expected, limit = CAPTURE_LIMITS.inventoryBytes) {
  historyFields(download, ['id','complete','bytesBase64','acquisition','raw']);
  historyFields(download.acquisition, ['mode','reference']);
  need(download.id === expected.id && download.complete === true && download.acquisition.mode === 'file-reference' && opaque(download.acquisition.reference) && download.raw !== null && typeof download.raw === 'object' && Buffer.byteLength(canonical(download.raw)) <= CAPTURE_LIMITS.inventoryBytes, 'Complete raw file-reference acquisition required');
  const bytes = historyRaw(download.bytesBase64, limit);
  need((expected.size === undefined || bytes.length === expected.size) && (expected.sha256 === undefined || historyHash(bytes) === expected.sha256), 'Remote raw length/hash mismatch');
  return bytes;
}
function readback(value, expected, limit) {
  historyFields(value, ['metadata','download']); validateRemoteMetadata(value.metadata, expected, limit);
  return validateRemoteDownload(value.download, { ...expected, size:value.metadata.size }, limit);
}
function uniqueReadbacks(values) {
  need(Array.isArray(values) && values.length <= CAPTURE_LIMITS.files, 'Bounded readbacks required');
  const map = new Map();
  for (const value of values) { const id = value?.metadata?.id; need(opaque(id) && !map.has(id), 'Duplicate exact-ID readback'); map.set(id, value); }
  return map;
}
function anchorOf(value, owner) {
  const bytes = readback(value, owner.anchor, CAPTURE_LIMITS.scopeBytes); const anchor = historyDecode(bytes, CAPTURE_LIMITS.scopeBytes);
  historyFields(anchor, ['schemaVersion','kind','owner','generation','inventory']);
  need(anchor.schemaVersion === 1 && anchor.kind === 'automation-reporting-discovery-anchor' && anchor.owner === owner.owner && Number.isSafeInteger(anchor.generation) && anchor.generation >= 0 && bytes.equals(historyBytes(anchor)), 'Invalid canonical discovery anchor');
  if(anchor.generation===0) need(anchor.inventory===null,'Bootstrap anchor requires explicit null inventory');
  else {validateHistoryReference(anchor.inventory); need(anchor.inventory.parentId === owner.inventoryParentId, 'Inventory outside approved parent');}
  return { anchor, bytes };
}
function discovery(scopeBytes, packetBytes, checkpoint) {
  const scope = validateDiscoveryScope(historyDecode(scopeBytes,CAPTURE_LIMITS.scopeBytes)); const packet = historyDecode(packetBytes);
  historyFields(packet, ['schemaVersion','kind','anchorsBefore','anchorsAfter','inventories','objects']);
  need(packet.schemaVersion === 1 && packet.kind === 'automation-reporting-discovery-capture', 'Expected discovery acquisition packet');
  const before = uniqueReadbacks(packet.anchorsBefore); const after = uniqueReadbacks(packet.anchorsAfter); const inventories = uniqueReadbacks(packet.inventories); const objects = uniqueReadbacks(packet.objects);
  const trashObservations = []; const steps = []; const pending = []; const current = []; const usedInventories = new Set(); const usedObjects = new Set(); const checkpoints = [];
  const acquire = (kind, expected, values, limit) => {
    const value=values.get(expected.id);
    if(value===undefined) { steps.push({kind,expected,method:'get_file_metadata',args:{fileId:expected.id,fields:'id,name,parents,size,mimeType,trashed'}}); return null; }
    historyFields(value,['metadata','download']); validateRemoteMetadata(value.metadata,expected,limit);
    trashObservations.push({role:kind,id:expected.id,trashed:value.metadata.trashed,metadataSha256:historyHash(canonical(value.metadata))});
    if(value.download===null) { steps.push({kind,expected,method:'fetch',args:{url:`https://drive.google.com/file/d/${encodeURIComponent(expected.id)}/view`,download_raw_file:true,include_base64:false},rawAcquisition:'Materialize returned file reference; read complete bounded original bytes locally. No provider inline base64.'}); return null; }
    return readback(value,expected,limit);
  };
  if (checkpoint !== null) { historyFields(checkpoint,['schemaVersion','owners']); need(checkpoint.schemaVersion === 1 && Array.isArray(checkpoint.owners) && checkpoint.owners.length === scope.owners.length, 'Invalid persisted discovery checkpoint'); }
  for (const owner of scope.owners) {
    if (acquire('anchor-before',owner.anchor,before,CAPTURE_LIMITS.scopeBytes)===null) continue;
    const {anchor,bytes:anchorBytes} = anchorOf(before.get(owner.anchor.id),owner);
    if(anchor.generation===0) {pending.push({owner:owner.owner,status:'publication-pending'});continue;}
    let ref = anchor.inventory; let generation = anchor.generation; const lineage = []; const lineageIds = new Set();
    while (ref !== null) {
      need(lineage.length < CAPTURE_LIMITS.files && !lineageIds.has(ref.id), 'Inventory lineage cycle/bound exceeded'); lineageIds.add(ref.id);
      const acquired=acquire('inventory',ref,inventories,CAPTURE_LIMITS.inventoryBytes); if(acquired===null) break;
      usedInventories.add(ref.id);
      const bytes = readback(inventories.get(ref.id), ref, CAPTURE_LIMITS.inventoryBytes); const inventory = validateHistoryInventory(historyDecode(bytes,CAPTURE_LIMITS.inventoryBytes),scope,owner);
      need(bytes.equals(historyBytes(inventory)) && inventory.generation === generation, 'Inventory generation or canonical bytes mismatch');
      lineage.push({inventory,ref});
      if (inventory.previous === null) { ref = null; break; }
      ref = inventory.previous.inventory; generation = inventory.previous.generation;
    }
    if (ref !== null) continue;
    for (let index=0; index<lineage.length-1; index++) {
      const later = lineage[index].inventory; const earlier = lineage[index+1].inventory;
      const sources = new Set(later.sourceSet.map(value=>canonical(value)));
      need(earlier.sourceSet.every(value=>sources.has(canonical(value))) && later.sourceBoundary.admissionId === earlier.sourceBoundary.admissionId && Date.parse(later.captureInterval.startedAt) >= Date.parse(earlier.captureInterval.endedAt), 'Source history regressed or admission/capture lineage changed');
    }
    if (checkpoint !== null) {
      const prior = checkpoint.owners.find(item=>item.owner===owner.owner);
      need(prior && lineage.some(item=>same(prior,{owner:owner.owner,generation:item.inventory.generation,inventory:item.ref})), 'Persisted checkpoint regression or fork');
    }
    const inventory = lineage[0].inventory; const records = [];
    for (const item of inventory.namespaces) for (const entry of item.entries) {
      if(acquire('record',entry,objects,CAPTURE_LIMITS.recordBytes)===null) continue;
      usedObjects.add(entry.id); const bytes = readback(objects.get(entry.id),entry,CAPTURE_LIMITS.recordBytes); const record = validateRecord(historyDecode(bytes,CAPTURE_LIMITS.recordBytes));
      need(bytes.equals(historyBytes(record)) && record.namespace === item.namespace && recordDigest(record)+'.json' === entry.name, 'Noncanonical or wrong source record'); records.push(record);
    }
    if (records.length === inventory.sourceSet.length) {
      need(same(inventory.sourceClocks,historySourceClocks(records)), 'Original source clocks changed');
      for (const ancestor of lineage.slice(1)) { const keys = new Set(ancestor.inventory.sourceSet.map(value=>value.namespace+'/'+value.digest)); need(same(ancestor.inventory.sourceClocks,historySourceClocks(records.filter(record=>keys.has(record.namespace+'/'+recordDigest(record))))), 'Ancestor source clocks changed'); }
    }
    current.push(inventory);
    checkpoints.push({owner:owner.owner,generation:inventory.generation,inventory:anchor.inventory});
    const afterBytes=acquire('anchor-after',owner.anchor,after,CAPTURE_LIMITS.scopeBytes);
    if(afterBytes!==null) need(afterBytes.equals(anchorBytes), 'Discovery pointer changed during acquisition');
  }
  need([...before.keys(),...after.keys()].every(id=>scope.owners.some(owner=>owner.anchor.id===id)), 'Unregistered anchor readback');
  if (!steps.length) need(usedInventories.size === inventories.size && usedObjects.size === objects.size, 'Unlisted acquisition objects');
  need(steps.length <= CAPTURE_LIMITS.files + CAPTURE_LIMITS.rootEntries * 2, 'Acquisition step bound exceeded');
  return {scope,packet,steps,pending,current,trashObservations,checkpoint:{schemaVersion:1,owners:checkpoints}};
}
export function planDiscovery(scopeBytes, packetBytes, { checkpoint = null } = {}) {
  const result = discovery(scopeBytes,packetBytes,checkpoint);
  const plan = {schemaVersion:1,status:result.steps.length?'acquisition-required':result.pending.length?'publication-pending':'acquired',pending:result.pending,steps:result.steps,trashObservations:result.trashObservations,activeAvailability:'not-established',providerLatest:'not-established', boundary:'complete registered admitted producer history only; unregistered writers and provider latest unknown',writes:false};
  return {...plan,resultSha256:historyHash(canonical(plan))};
}
export function consumeDiscovery(scopeBytes, packetBytes, request, { evaluatedAt = new Date().toISOString(), checkpoint = null } = {}) {
  const result = discovery(scopeBytes,packetBytes,checkpoint);
  need(!result.steps.length && !result.pending.length && result.current.length === result.scope.owners.length, 'Incomplete full-history discovery acquisition');
  const inventory = {schemaVersion:1,kind:'automation-reporting-history-inventory',rootFolderId:result.scope.recordScope.rootFolderId,rootEntries:result.current.flatMap(value=>value.rootEntries),namespaces:result.current.flatMap(value=>value.namespaces)};
  const bytes = historyBytes(inventory); const scope = {...result.scope.recordScope,inventory:{mode:'pinned',id:'validated-discovery-inventory',sha256:historyHash(bytes)}};
  const capture = {schemaVersion:1,kind:'automation-reporting-capture',inventory:{mode:'pinned',id:scope.inventory.id,bytesBase64:bytes.toString('base64')},objects:result.packet.objects.map(value=>({id:value.metadata.id,bytesBase64:value.download.bytesBase64}))};
  const view = consumeCapture(historyBytes(scope),historyBytes(capture),request,{evaluatedAt});
  const provenance={scopeSha256:historyHash(scopeBytes),packetSha256:historyHash(packetBytes),priorCheckpointSha256:checkpoint===null?null:historyHash(canonical(checkpoint)),checkpoint:result.checkpoint,trashObservations:result.trashObservations,activeAvailability:'not-established',boundary:'complete registered admitted producer history only',unregisteredWriters:'unknown',providerLatest:'not-established',pointerAtomicity:'not-established',writes:false};
  return {...view,discovery:provenance,resultSha256:historyHash(canonical({view,discovery:provenance}))};
}
