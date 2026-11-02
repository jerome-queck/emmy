import { constants } from 'node:fs';
import { open, lstat, realpath, opendir, mkdir, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, recordDigest, validateRecord, aggregate, requireExistingNamespace } from './automation-reporting.mjs';
import { assertExportSafe, assertNoCredentials } from './reporting-privacy.mjs';
import { CAPTURE_LIMITS } from './automation-reporting-capture.mjs';
import { historyBytes, historyHash, historyDecode, historyRaw, historySourceSet, historySourceClocks, validateDiscoveryScope, validateHistoryInventory, validateHistoryReference, validateRemoteMetadata, validateRemoteDownload } from './automation-reporting-discovery.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a,b) => canonical(a) === canonical(b);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const within = (path,root) => path === root || path.startsWith(root+sep);
const noCheckpoint = async () => {};
async function ordinaryDirectory(path) {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path, 'Absolute ordinary private directory required');
  let current = path;
  while (true) { const stat = await lstat(current); need(stat.isDirectory() && !stat.isSymbolicLink(), 'Ordinary private ancestry required'); if (current === parse(current).root) break; current = dirname(current); }
  need(await realpath(path) === path, 'Symlinked private directory refused'); return path;
}
async function readBytes(path,limit=CAPTURE_LIMITS.packetBytes) {
  const file = await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try { const info = await file.stat(); need(info.isFile() && info.size <= limit,'Bounded ordinary history file required'); const buffer = Buffer.alloc(limit+1); let count=0; while(count<buffer.length) {const next=await file.read(buffer,count,buffer.length-count,null); if(!next.bytesRead) break; count+=next.bytesRead;} need(count<=limit,'History file exceeds bound'); return buffer.subarray(0,count); } finally {await file.close();}
}
export async function readHistoryRequest(path) {
  need(typeof path==='string' && isAbsolute(path) && resolve(path)===path,'Absolute private request file required');
  await ordinaryDirectory(dirname(path)); return historyDecode(await readBytes(path));
}
async function names(path,limit) { const result=[]; for await (const entry of await opendir(path)) {need(result.length<limit,'History directory bound exceeded'); result.push(entry.name);} return result.sort(); }
async function immutable(path,bytes,checkpoint=noCheckpoint) {
  let existing;
  try { existing=await readBytes(path); } catch(error) {if(error.code!=='ENOENT') throw error;}
  if(existing!==undefined) {need(existing.equals(bytes),'Immutable history conflict'); return false;}
  const pending=join(dirname(path),'.pending-'+randomUUID()); const file=await open(pending,'wx',0o600);
  try {await file.writeFile(bytes); await file.sync();} finally {await file.close();}
  await checkpoint('bytes-prepared');
  let created=true;
  try {await link(pending,path);} catch(error) {if(error.code!=='EEXIST') throw error; need((await readBytes(path)).equals(bytes),'Concurrent history journal conflict'); created=false;}
  await checkpoint('bytes-committed'); await unlink(pending); return created;
}
async function captureSource(directory,scope,owner,evaluatedAt) {
  await ordinaryDirectory(directory);
  const roots=await names(directory,CAPTURE_LIMITS.rootEntries);
  need(roots.every(name=>scope.recordScope.namespaces.some(item=>item.namespace===name)), 'Unexpected Records root entry; admitted root scope must be complete');
  const rootIdentity=await lstat(directory,{bigint:true}); const witnesses=[{namespace:null,dev:String(rootIdentity.dev),ino:String(rootIdentity.ino)}];
  const sources=[]; let total=0; let size=0;
  for(const namespace of owner.namespaces.slice().sort()) {
    const path=await requireExistingNamespace(directory,namespace); const folder=scope.recordScope.namespaces.find(item=>item.namespace===namespace);
    const info=await lstat(path,{bigint:true}); witnesses.push({namespace,dev:String(info.dev),ino:String(info.ino)});
    for(const name of await names(path,CAPTURE_LIMITS.files)) {
      need(++total<=CAPTURE_LIMITS.files && /^[a-f0-9]{64}\.json$/.test(name),'Unexpected/pending source history entry');
      const bytes=await readBytes(join(path,name),CAPTURE_LIMITS.recordBytes); size+=bytes.length; need(size<=CAPTURE_LIMITS.totalRecordBytes,'Aggregate source bytes exceed bound');
      const record=validateRecord(historyDecode(bytes,CAPTURE_LIMITS.recordBytes),evaluatedAt); assertExportSafe(record);
      need(record.namespace===namespace && recordDigest(record)+'.json'===name && bytes.equals(historyBytes(record)) && folder.automationIds.includes(record.automationId),'Source record scope/canonical bytes mismatch');
      sources.push({namespace,name,parentId:folder.folderId,size:bytes.length,sha256:historyHash(bytes),bytesBase64:bytes.toString('base64')});
    }
  }
  const records=sources.map(item=>historyDecode(historyRaw(item.bytesBase64,CAPTURE_LIMITS.recordBytes)));
  const view=aggregate(records,{evaluatedAt});
  need(!view.findings.some(value=>value.startsWith('missing-or-invalid-predecessor:')),'Incomplete admitted producer ancestry');
  return {sources,sourceClocks:historySourceClocks(records),witnesses};
}
export async function prepareHistoryBatch({directory,stateDirectory,scope,owner:ownerId,generation,previous=null,admission,captureStartedAt=new Date().toISOString(),captureEndedAt=null},{evaluatedAt=new Date().toISOString(),checkpoint=noCheckpoint}={}) {
  validateDiscoveryScope(scope); const owner=scope.owners.find(item=>item.owner===ownerId); need(owner,'Registered publication owner required');
  await ordinaryDirectory(stateDirectory); await ordinaryDirectory(directory);
  need(!within(stateDirectory,directory) && !within(directory,stateDirectory),'Publication state must be outside canonical Records');
  const first=await captureSource(directory,scope,owner,evaluatedAt); await checkpoint('source-captured');
  const second=await captureSource(directory,scope,owner,evaluatedAt); need(same(first,second),'Source changed during full history capture');
  const interval={startedAt:captureStartedAt,endedAt:captureEndedAt??new Date().toISOString()};
  const namespaces=scope.recordScope.namespaces.filter(item=>owner.namespaces.includes(item.namespace)).map(item=>({namespace:item.namespace,folderId:item.folderId,entries:first.sources.filter(source=>source.namespace===item.namespace).map(source=>({id:'pending-'+source.name.slice(0,-5),name:source.name,parentId:source.parentId,type:'file',size:source.size,sha256:source.sha256}))}));
  const sourceSet=historySourceSet(namespaces);
  const inventory={schemaVersion:2,kind:'automation-reporting-history-inventory',rootFolderId:scope.recordScope.rootFolderId,rootEntries:namespaces.map(item=>({id:item.folderId,name:item.namespace,parentId:scope.recordScope.rootFolderId,type:'folder'})),namespaces,owner:ownerId,generation,previous:previous===null?null:{generation:previous.inventory.generation,inventory:previous.reference},sourceSet,sourceSetSha256:historyHash(canonical(sourceSet)),captureInterval:interval,sourceClocks:first.sourceClocks,sourceBoundary:{admissionId:admission?.id,throughGeneration:generation,completeAdmittedHistory:admission?.completeAdmittedHistory}};
  validateHistoryInventory(inventory,scope,owner);
  if(previous!==null) {
    validateHistoryReference(previous.reference); validateHistoryInventory(previous.inventory,scope,owner);
    need(historyHash(historyBytes(previous.inventory))===previous.reference.sha256 && historyBytes(previous.inventory).length===previous.reference.size,'Previous inventory bytes/reference mismatch');
    const keys=new Set(sourceSet.map(item=>canonical(item)));
    need(previous.inventory.sourceSet.every(item=>keys.has(canonical(item))) && previous.inventory.sourceBoundary.admissionId===inventory.sourceBoundary.admissionId && Date.parse(interval.startedAt)>=Date.parse(previous.inventory.captureInterval.endedAt),'Admitted source history regression');
  }
  const batch={schemaVersion:1,kind:'automation-reporting-history-batch',scope,owner:ownerId,inventory,sources:first.sources};
  const bytes=historyBytes(batch); need(bytes.length<=CAPTURE_LIMITS.packetBytes,'History batch exceeds bound'); const batchId=historyHash(bytes); const path=join(stateDirectory,batchId);
  try {await mkdir(path,{mode:0o700});} catch(error) {if(error.code!=='EEXIST') throw error;}
  await ordinaryDirectory(path); await immutable(join(path,'batch.json'),bytes,checkpoint); await checkpoint('batch-prepared');
  return {batchId,generation,sourceSetSha256:inventory.sourceSetSha256,records:first.sources.length,status:'prepared',remote:'pending',boundary:'declared complete admitted producer history; unregistered writers unknown'};
}
async function load({stateDirectory,batchId}) {
  need(digest(batchId),'Exact batch digest required'); await ordinaryDirectory(stateDirectory); const path=join(stateDirectory,batchId); await ordinaryDirectory(path);
  const bytes=await readBytes(join(path,'batch.json')); need(historyHash(bytes)===batchId,'History batch digest mismatch'); const batch=historyDecode(bytes);
  need(bytes.equals(historyBytes(batch)),'Noncanonical history batch'); validateDiscoveryScope(batch.scope); const owner=batch.scope.owners.find(item=>item.owner===batch.owner); validateHistoryInventory(batch.inventory,batch.scope,owner);
  const entries=await names(path,40002); const journal=entries.filter(name=>/^\d{8}\.json$/.test(name));
  need(entries.every(name=>name==='batch.json'||name.startsWith('.pending-')||/^payload-[a-f0-9]{64}\.json$/.test(name)||/^\d{8}\.json$/.test(name)),'Unexpected publication journal file');
  const events=[]; let previous=null;
  for(let index=0;index<journal.length;index++) {
    need(journal[index]===String(index).padStart(8,'0')+'.json','Missing publication journal event'); const raw=await readBytes(join(path,journal[index])); const event=historyDecode(raw);
    need(event.sequence===index && event.previous===previous && raw.equals(historyBytes(event)),'Publication journal chain mismatch'); previous=historyHash(raw); events.push(event);
  }
  return {path,batch,owner,events,previous};
}
async function append(state,data,checkpoint) {
  const event={sequence:state.events.length,previous:state.previous,...data}; const bytes=historyBytes(event); const path=join(state.path,String(event.sequence).padStart(8,'0')+'.json');
  const created=await immutable(path,bytes,checkpoint); await checkpoint(data.kind+'-persisted'); state.events.push(event);state.previous=historyHash(bytes); return {event,created};
}
function responses(state,key) {return state.events.filter(event=>event.kind==='response'&&event.actionId===key);}
function responseOf(state,key) {const found=responses(state,key); need(found.length<=1,'Conflicting publication responses'); return found[0]?.response;}
function knownId(state,key,response) {
  const recoveries=state.events.filter(event=>event.kind==='recovery'&&event.actionId===key); need(recoveries.length<=1,'Conflicting exact-ID recoveries');
  need(recoveries[0]===undefined || response?.id===undefined || recoveries[0].id===response.id,'Recovery disagrees with returned exact ID');
  const id=recoveries[0]?.id??response?.id;
  return typeof id==='string'&&/^[a-zA-Z0-9_-]{1,400}$/.test(id)?id:null;
}
function action(state,key,method,args,expected) {
  const existing=state.events.find(event=>event.kind==='intent'&&event.actionId===key);
  const value={kind:'intent',actionId:key,method,args,expected};
  need(existing===undefined || same({...existing,sequence:undefined,previous:undefined},{...value,sequence:undefined,previous:undefined}),'Publication intent changed');
  return {value,existing};
}
function readAttempt(state,base) {
  const retries=state.events.filter(event=>event.kind==='read-retry'&&event.actionBase===base);
  need(retries.length<=20 && retries.every((event,index)=>event.attempt===index+1),'Readback retry chain/bound invalid');
  return {actionId:base+(retries.length?':retry-'+retries.length:''),attempt:retries.length};
}
function readActions(state,key,expected,limit) {
  const metadataAttempt=readAttempt(state,key+':metadata'); const metadataKey=metadataAttempt.actionId;
  const metadata=responseOf(state,metadataKey);
  if(metadata===undefined) return action(state,metadataKey,'getMetadata',{id:expected.id},expected);
  validateRemoteMetadata(metadata,expected,limit);
  const downloadKey=readAttempt(state,key+':download'+(metadataAttempt.attempt?':metadata-'+metadataAttempt.attempt:'')).actionId;
  const download=responseOf(state,downloadKey);
  if(download===undefined) return action(state,downloadKey,'downloadRaw',{id:expected.id},expected);
  const bytes=validateRemoteDownload(download,{...expected,size:metadata.size},limit);
  return {bytes,metadata,download};
}

function immutableActions(state,key,location,bytes) {
  const upload=responseOf(state,key+':upload'); const id=knownId(state,key+':upload',upload);
  if(id===null) return action(state,key+':upload','uploadImmutable',{name:location.name,parentId:location.parentId,bytesBase64:bytes.toString('base64')},{...location,size:bytes.length,sha256:historyHash(bytes)});
  need(state.events.some(event=>event.kind==='recovery'&&event.actionId===key+':upload'&&event.id===id) || upload?.raw!==null && typeof upload?.raw==='object','Original upload response or retained exact-ID recovery required');
  const expected={id,...location,size:bytes.length,sha256:historyHash(bytes)}; const result=readActions(state,key,expected,key==='inventory'?CAPTURE_LIMITS.inventoryBytes:CAPTURE_LIMITS.recordBytes);
  return result.bytes?{reference:expected,...result}:result;
}
function derive(state) {
  const namespaces=structuredClone(state.batch.inventory.namespaces); let index=0;
  for(const source of state.batch.sources) {
    const bytes=historyRaw(source.bytesBase64,CAPTURE_LIMITS.recordBytes); need(bytes.length===source.size && historyHash(bytes)===source.sha256,'Retained source bytes changed');
    const result=immutableActions(state,'record-'+index,{name:source.name,parentId:source.parentId},bytes);
    if(!result.reference) return result;
    namespaces.find(item=>item.namespace===source.namespace).entries.find(item=>item.name===source.name).id=result.reference.id; index++;
  }
  const inventory={...state.batch.inventory,namespaces}; validateHistoryInventory(inventory,state.batch.scope,state.owner);
  const inventoryResult=immutableActions(state,'inventory',{name:`history-${state.batch.owner}-${inventory.generation}-${state.batch.inventory.sourceSetSha256}.json`,parentId:state.owner.inventoryParentId},historyBytes(inventory));
  if(!inventoryResult.reference) return inventoryResult;
  const closed=state.events.find(event=>event.kind==='generation-closed');
  if(!closed) return {closure:{kind:'generation-closed',inventory:inventoryResult.reference,generation:inventory.generation}};
  need(same(closed.inventory,inventoryResult.reference),'Closed generation reference mismatch');
  const anchor={schemaVersion:1,kind:'automation-reporting-discovery-anchor',owner:state.batch.owner,generation:inventory.generation,inventory:inventoryResult.reference}; const bytes=historyBytes(anchor);
  const before=readActions(state,'anchor-before',state.owner.anchor,CAPTURE_LIMITS.scopeBytes);
  if(!before.bytes) return before;
  const previous=historyDecode(before.bytes,CAPTURE_LIMITS.scopeBytes);
  need(before.bytes.equals(historyBytes(previous)),'Anchor prior body must be exact canonical JSON');
  const expectedPrevious=inventory.previous;
  const alreadyCurrent=before.bytes.equals(bytes);
  if(!alreadyCurrent) {
    if(expectedPrevious===null) need(same(previous,{schemaVersion:1,kind:'automation-reporting-discovery-anchor',owner:state.batch.owner,generation:0,inventory:null}),'Bootstrap anchor must be explicit empty same-owner anchor');
    else need(same(previous,{schemaVersion:1,kind:'automation-reporting-discovery-anchor',owner:state.batch.owner,generation:expectedPrevious.generation,inventory:expectedPrevious.inventory}),'Anchor does not match exact preceding generation');
  }
  const key='anchor-update-0';
  const intent=state.events.find(event=>event.kind==='intent'&&event.actionId===key);
  if(!alreadyCurrent && !intent) return action(state,key,'updatePointer',{id:state.owner.anchor.id,name:state.owner.anchor.name,parentId:state.owner.anchor.parentId,bytesBase64:bytes.toString('base64')},{...state.owner.anchor,size:bytes.length,sha256:historyHash(bytes)});
  const after=readActions(state,'anchor-after-0',state.owner.anchor,CAPTURE_LIMITS.scopeBytes);
  if(!after.bytes) return after;
  const pointerVerified=after.bytes.equals(bytes);
  if(!pointerVerified) {
    need(!alreadyCurrent && after.bytes.equals(before.bytes),'Discovery anchor changed to unrecognized bytes');
    return {done:true,status:'uncertain',execute:false,generationClosed:true,generation:inventory.generation,inventory:inventoryResult.reference,reason:'Pointer mutation unresolved; old readback does not rule out a future effect; refresh exact-ID readback only'};
  }
  if(!state.events.some(event=>event.kind==='pointer-closed')) return {closure:{kind:'pointer-closed',anchor:state.owner.anchor,inventory:inventoryResult.reference,generation:inventory.generation}};
  return {done:true,status:'published',generation:inventory.generation,inventory:inventoryResult.reference,anchor:state.owner.anchor,assurance:'validated-retained-adapter-readbacks',providerLatest:'not-established',delivery:'not-inferred'};
}
async function publicationOwner(state,checkpoint) {
  const directory=join(dirname(state.path),'owner-'+historyHash(state.owner.anchor.id));
  try {await mkdir(directory,{mode:0o700});} catch(error) {if(error.code!=='EEXIST')throw error;}
  await ordinaryDirectory(directory); const entries=(await names(directory,CAPTURE_LIMITS.files+100)).filter(name=>!name.startsWith('.pending-')); let last=null; let previous=null;
  for(let index=0;index<entries.length;index++) {
    need(entries[index]===String(index).padStart(8,'0')+'.json','Owner journal gap');const raw=await readBytes(join(directory,entries[index]),CAPTURE_LIMITS.scopeBytes);const claim=historyDecode(raw,CAPTURE_LIMITS.scopeBytes);
    need(claim.sequence===index && claim.previous===previous && claim.owner===state.batch.owner && claim.scopeSha256===historyHash(canonical(state.batch.scope)) && raw.equals(historyBytes(claim)),'Publication owner binding changed'); last=claim;previous=historyHash(raw);
    if(claim.batchId!==historyHash(historyBytes(state.batch))) {
      const ancestor=await load({stateDirectory:dirname(state.path),batchId:claim.batchId});const current=derive(ancestor);
      need(ancestor.batch.owner===claim.owner && same(ancestor.batch.scope,state.batch.scope) && current.done && current.status==='published' && current.generation===claim.generation,'Earlier owner generation lacks currently valid publication evidence');
    }
  }
  if(last?.batchId===historyHash(historyBytes(state.batch))) return;
  const batchId=historyHash(historyBytes(state.batch));
  if(last!==null) {
    need(state.batch.inventory.generation===last.generation+1,'Another batch owns this anchor generation; old resume refused');
    const predecessor=await load({stateDirectory:dirname(state.path),batchId:last.batchId});const closed=predecessor.events.find(event=>event.kind==='pointer-closed');
    need(closed && state.batch.inventory.previous!==null && same(state.batch.inventory.previous,{generation:last.generation,inventory:closed.inventory}),'Earlier owner generation not pointer-closed; no overlapping publication');
  } else need(state.batch.inventory.generation===1,'Owner bootstrap generation missing');
  const claim={schemaVersion:1,sequence:entries.length,previous,owner:state.batch.owner,scopeSha256:historyHash(canonical(state.batch.scope)),batchId,generation:state.batch.inventory.generation};
  await immutable(join(directory,String(entries.length).padStart(8,'0')+'.json'),historyBytes(claim),checkpoint); await checkpoint('owner-claimed');
}
async function uploadArtifact(state,intent,checkpoint) {
  const bytes=historyRaw(intent.args.bytesBase64,CAPTURE_LIMITS.inventoryBytes);
  need(bytes.length===intent.expected.size && historyHash(bytes)===intent.expected.sha256,'Upload artifact differs from retained intent');
  const path=join(state.path,'payload-'+historyHash(bytes)+'.json');await immutable(path,bytes,checkpoint);
  need((await readBytes(path,CAPTURE_LIMITS.inventoryBytes)).equals(bytes),'Upload artifact readback mismatch');
  return {path,size:bytes.length,sha256:historyHash(bytes)};
}
export async function materializePublicationUpload({stateDirectory,batchId,actionId},{checkpoint=noCheckpoint}={}) {
  const state=await load({stateDirectory,batchId});const intent=state.events.find(event=>event.kind==='intent'&&event.actionId===actionId);
  need(intent && ['uploadImmutable','updatePointer'].includes(intent.method),'Retained upload/update intent required');return uploadArtifact(state,intent,checkpoint);
}
function toolAction(intent,artifact) {
  const args=intent.args;
  if(intent.method==='getMetadata')return {operation:'get_file_metadata',arguments:{fileId:args.id,fields:'id,name,parents,size,mimeType,trashed'}};
  if(intent.method==='downloadRaw')return {operation:'fetch',arguments:{url:`https://drive.google.com/file/d/${encodeURIComponent(args.id)}/view`,download_raw_file:true,include_base64:false},materialization:'Materialize authenticated returned file reference and read bounded full raw bytes locally before encoding.'};
  if(intent.method==='uploadImmutable')return {operation:'upload_file',arguments:{file_name:args.name,parent_folder_id:args.parentId,mime_type:'application/json',file_uri:artifact.path},artifact};
  return {operation:'update_file',arguments:{fileId:args.id,mime_type:'application/json',file_uri:artifact.path},artifact};
}
function publicationEvidence(state, result) {
  const metadataActions = new Set(state.events.filter(event => event.kind === 'intent' && event.method === 'getMetadata').map(event => event.actionId));
  const trashObservations = state.events.filter(event => event.kind === 'response' && metadataActions.has(event.actionId)).map(event => {
    const trashed = event.response?.trashed;
    return {role:event.actionId.split(':')[0],actionId:event.actionId,id:event.response?.id,trashed,metadataState:trashed===null?'requested-field-unavailable':typeof trashed==='boolean'?'reported':'invalid-response',metadataSha256:historyHash(canonical(event.response))};
  });
  const value = {...result,trashObservations,activeAvailability:'not-established',providerLatest:'not-established'};
  return {...value,resultSha256:historyHash(canonical(value))};
}
async function nextAction(state,checkpoint) {
  let next;
  try {await publicationOwner(state,checkpoint);next=derive(state);} catch(error) {return publicationEvidence(state,{status:'blocked',generationClosed:state.events.some(event=>event.kind==='generation-closed'),reason:error.message});}
  if(next.closure) {await append(state,next.closure,checkpoint); return nextAction(state,checkpoint);}
  if(next.done) return publicationEvidence(state,next);
  let created=next.existing===undefined;
  if(created) created=(await append(state,next.value,checkpoint)).created;
  const artifact=['uploadImmutable','updatePointer'].includes(next.value.method)?await uploadArtifact(state,next.value,checkpoint):null;
  return publicationEvidence(state,{tool:toolAction(next.value,artifact),...(artifact===null?{}:{artifact}),status:!created&&['uploadImmutable','updatePointer'].includes(next.value.method)?'uncertain':'action-required',execute:created||!['uploadImmutable','updatePointer'].includes(next.value.method),action:next.value,generationClosed:state.events.some(event=>event.kind==='generation-closed')});
}
export async function publicationAction(request,{checkpoint=noCheckpoint}={}) { return nextAction(await load(request),checkpoint); }
function guardResponse(value) {
  assertNoCredentials(value);
  if(Array.isArray(value)) value.forEach(guardResponse);
  else if(value && typeof value==='object') for(const [name,item] of Object.entries(value)) {if(name==='bytesBase64' && typeof item==='string')assertNoCredentials(Buffer.from(item,'base64').toString('utf8'));else if(typeof item==='object')guardResponse(item);}
}
async function retainResponse(state,actionId,response,checkpoint) {
  const intent=state.events.find(event=>event.kind==='intent'&&event.actionId===actionId); need(intent,'Response needs retained exact intent');
  need(response!==undefined && Buffer.byteLength(canonical(response))<=CAPTURE_LIMITS.packetBytes,'Bounded actual response required'); guardResponse(response);
  const existing=responseOf(state,actionId); if(existing!==undefined) {need(same(existing,response),'Publication response conflict'); return {status:'identical'};}
  need(intent.method==='updatePointer' || (intent.method==='uploadImmutable' && state.events.some(event=>event.kind==='recovery'&&event.actionId===actionId)) || !state.events.some(event=>event.kind==='intent'&&event.sequence>intent.sequence),'Stale response after later effect refused');
  await append(state,{kind:'response',actionId,response},checkpoint);
  if(intent.method==='uploadImmutable') knownId(state,actionId,response);
  return {status:'retained'};
}
export async function recordPublicationResponse({stateDirectory,batchId,actionId,response},{checkpoint=noCheckpoint}={}) { return retainResponse(await load({stateDirectory,batchId}),actionId,response,checkpoint); }
export async function recoverPublicationId({stateDirectory,batchId,actionId,id,evidence},{checkpoint=noCheckpoint}={}) {
  const state=await load({stateDirectory,batchId}); const intent=state.events.find(event=>event.kind==='intent'&&event.actionId===actionId); guardResponse(evidence);
  need(intent?.method==='uploadImmutable' && typeof id==='string' && /^[a-zA-Z0-9_-]{1,400}$/.test(id) && evidence && typeof evidence==='object' && Buffer.byteLength(canonical(evidence))<=CAPTURE_LIMITS.inventoryBytes,'Explicit ambiguous-attempt exact-ID evidence required');
  need(!state.events.some(event=>event.kind==='recovery'&&event.actionId===actionId)||state.events.some(event=>event.kind==='recovery'&&event.actionId===actionId&&event.id===id&&same(event.evidence,evidence)),'Recovery exact ID conflict');
  const response=responseOf(state,actionId); need(response?.id===undefined||response.id===id,'Recovery disagrees with returned exact ID');
  if(!state.events.some(event=>event.kind==='recovery'&&event.actionId===actionId)) await append(state,{kind:'recovery',actionId,id,evidence},checkpoint);
  return {status:'recovered-id-only',readback:'required'};
}
export async function retryPublicationRead({stateDirectory,batchId,actionId,evidence},{checkpoint=noCheckpoint}={}) {
  const state=await load({stateDirectory,batchId}); guardResponse(evidence);
  need(evidence && typeof evidence==='object' && Buffer.byteLength(canonical(evidence))<=CAPTURE_LIMITS.inventoryBytes,'Explicit bounded readback retry evidence required');
  const identical=state.events.find(event=>event.kind==='read-retry'&&event.sourceActionId===actionId&&same(event.evidence,evidence));
  if(identical)return {status:'readback-refresh-requested',actionBase:identical.actionBase,attempt:identical.attempt,exactId:identical.exactId,priorResponses:'retained'};
  const intent=state.events.filter(event=>event.kind==='intent').at(-1);
  need(intent?.actionId===actionId && ['getMetadata','downloadRaw'].includes(intent.method) && responseOf(state,actionId)!==undefined && !state.events.some(event=>event.kind==='pointer-closed'),'Only current retained known-ID readback can be retried before pointer closure');
  const metadataIntent=intent.method==='getMetadata'?intent:state.events.filter(event=>event.kind==='intent'&&event.method==='getMetadata'&&event.expected.id===intent.expected.id).at(-1);
  need(metadataIntent,'Known-ID readback metadata intent missing');
  const actionBase=metadataIntent.actionId.replace(/:retry-[1-9][0-9]*$/,''); const current=readAttempt(state,actionBase);
  need(current.actionId===metadataIntent.actionId && current.attempt<20,'Stale or exhausted readback retry refused');
  await publicationOwner(state,checkpoint);
  await append(state,{kind:'read-retry',sourceActionId:actionId,actionBase,attempt:current.attempt+1,exactId:intent.expected.id,evidence},checkpoint);
  return {status:'readback-refresh-requested',actionBase,attempt:current.attempt+1,exactId:intent.expected.id,priorResponses:'retained'};
}
export async function publishHistory(request,adapter,{checkpoint=noCheckpoint}={}) {
  need(adapter && ['uploadImmutable','getMetadata','downloadRaw','updatePointer'].every(method=>typeof adapter[method]==='function'),'Explicit supported Drive adapter required; no autonomous local connector');
  let state=await load(request);
  for(let index=0;index<CAPTURE_LIMITS.files*3+100;index++) {
    const next=await nextAction(state,checkpoint); if(next.status!=='action-required'||!next.execute) return next;
    let response;
    try {response=await adapter[next.action.method]({...next.action.args,...(next.artifact?{artifact:next.artifact}:{})});} catch(error) {response={error:'adapter-call-failed',message:typeof error.message==='string'?error.message:'unknown'};}
    await checkpoint('remote-effect-returned');
    state=await load(request);
    await retainResponse(state,next.action.actionId,response,checkpoint);
  }
  throw new Error('Publication action bound exceeded');
}
