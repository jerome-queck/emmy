import { withReportingAccounting, serializedSize } from './reporting-representation.mjs';
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, link, unlink, opendir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, validateRecord, predecessorOK } from './automation-reporting.mjs';
import { assertExportSafe, assertNoCredentials } from './reporting-privacy.mjs';
import { historyBytes, historyHash, historyDecode, historySourceClocks, validateDiscoveryScope, validateHistoryInventory, validateRemoteMetadata, historyOriginalText } from './automation-reporting-discovery.mjs';

export const HISTORY_JOB_CAP = 262144;
export const HISTORY_ACCOUNTING_REVISION='native-evidence-v2-identical-utf8-once';
export const HISTORY_CAPTURE_REVISION='bounded-history-v2-owner-turn-1';
const RESERVE = 8192;
const need = (condition, message) => { if (!condition) throw new Error(message); };
const same=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a).filter(key=>a[key]!==undefined);const other=Object.keys(b).filter(key=>b[key]!==undefined);return keys.length===other.length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));};
const retainedJSON=new WeakMap();
const hash = value => retainedJSON.has(value)?historyHash(retainedJSON.get(value)):historyHash(historyBytes(value));
const remoteId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,400}$/.test(value);
const exactId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ordinal = index => String(index).padStart(8,'0');
function statSize(info){return serializedSize(Object.fromEntries(Object.entries(info).map(([key,value])=>[key,typeof value==='bigint'?String(value):value])))+1;}
function canonicalTextMatches(value,encoded){const text=historyOriginalText(value);if(!text||text.length!==encoded.length+1||text.at(-1)!=='\n')return false;for(let index=0;index<encoded.length;index++)if(text[index]!==encoded[index])return false;return true;}
function failure(error){const message=String(error.message??'Bounded operation failed');return {reason:message.slice(0,256),reasonTruncated:message.length>256};}
class Exhausted extends Error {}
class ReusedExecution extends Error {}
const stamp=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
class Job {
  constructor(jobId, limit) {
    need(typeof jobId==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(jobId),'Explicit unique execution identity required');
    need(Number.isSafeInteger(limit) && limit>RESERVE && limit<=HISTORY_JOB_CAP,'Fixed hard maximum job budget exceeded');
    this.id=jobId;this.executionId=null;this.priorLedgerUnread=false;this.diagnostics={}; this.limit=limit;this.startedAt=Date.now();this.deadline=this.startedAt+120000; this.charged=0; this.categories={}; this.readBytes=0; this.writeBytes=0; this.readOps=0; this.writeOps=0;this.reservedProviderCalls=0;this.knownActualProviderCalls=0;this.jsonCache=new Map();this.rawCache=new Map();
  }
  reserve(size) {if(Date.now()>this.deadline)throw new Exhausted('Absolute attempt deadline reached before operation');if(this.readOps+this.writeOps>=10000)throw new Exhausted('Ticket filesystem operation limit reached before operation');need(Number.isSafeInteger(size)&&size>=0,'Invalid budget reservation'); if(this.charged+size+RESERVE>this.limit)throw new Exhausted('Job budget stop before acquisition or generation');}
  diagnostic(size,category){need(Number.isSafeInteger(size)&&size>=0,'Invalid process diagnostic size');if(Object.values(this.diagnostics).reduce((sum,value)=>sum+value,0)+size>16777216)throw new Exhausted('Ticket diagnostic representation limit reached');this.diagnostics[category]=(this.diagnostics[category]??0)+size;}
  charge(size,category) {need(Number.isSafeInteger(size)&&size>=0,'Invalid charge');if(this.charged+size+RESERVE>this.limit)throw new Exhausted('Evidence allowance exhausted'); this.charged+=size;this.categories[category]=(this.categories[category]??0)+size;}
  generated(value) {this.reserve(serializedSize(value)+1);this.charge(serializedSize(value)+1,'generated-stage-artifact');return historyBytes(value);}
  async stat(path) {this.reserve(0);this.readOps++;let value;try{value=await lstat(path,{bigint:true});}catch(error){this.diagnostic(64,'metadata-error');throw error;}const result={dev:String(value.dev),ino:String(value.ino),size:Number(value.size),mtime:String(value.mtimeNs),ctime:String(value.ctimeNs),file:value.isFile(),directory:value.isDirectory(),symlink:value.isSymbolicLink()};this.diagnostic(statSize(value),'filesystem-metadata');return result;}
  async read(path,expected=null) {
    if(this.rawCache.has(path)){const bytes=this.rawCache.get(path);if(expected)need((expected.size===undefined||bytes.length===expected.size)&&(expected.sha256===undefined||historyHash(bytes)===expected.sha256),'Cached immutable evidence digest mismatch');return bytes;}
    await directory(this,dirname(path));const info=await this.stat(path);need(info.file&&!info.symlink,'Ordinary bounded evidence file required');if(expected?.size!==undefined)need(info.size===expected.size,'Declared raw response length refused before acquisition');this.reserve(info.size);
    const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let bytes;
    try {this.reserve(0);const after=await file.stat({bigint:true});this.diagnostic(statSize(after),'handle-metadata');this.readOps++;need(String(after.dev)===info.dev&&String(after.ino)===info.ino&&Number(after.size)===info.size&&String(after.mtimeNs)===info.mtime&&String(after.ctimeNs)===info.ctime,'Evidence identity changed before read');bytes=Buffer.alloc(info.size);let offset=0;while(offset<bytes.length){this.reserve(bytes.length-offset);const part=await file.read(bytes,offset,bytes.length-offset,null);this.charge(part.bytesRead,'acquired');this.readBytes+=part.bytesRead;this.readOps++;need(part.bytesRead>0,'Truncated evidence');offset+=part.bytesRead;}this.reserve(1);const tail=Buffer.alloc(1);const extra=await file.read(tail,0,1,null);this.charge(extra.bytesRead,'acquired');this.readBytes+=extra.bytesRead;this.readOps++;need(extra.bytesRead===0,'Evidence grew during read');}finally{await file.close();}

    if(expected)need((expected.size===undefined||bytes.length===expected.size)&&(expected.sha256===undefined||historyHash(bytes)===expected.sha256),'Exact retained evidence digest mismatch');if(/\/[a-f0-9]{64}\//.test(path)&&!path.endsWith('.assembling'))this.rawCache.set(path,bytes);return bytes;
  }
  async json(path,expected=null) {if(this.jsonCache.has(path)){const value=this.jsonCache.get(path);const raw=retainedJSON.get(value);if(expected)need((expected.size===undefined||raw.length===expected.size)&&(expected.sha256===undefined||historyHash(raw)===expected.sha256),'Cached JSON exact digest mismatch');return value;}const raw=await this.read(path,expected);const value=historyDecode(raw);const encoded=canonical(value);need(canonicalTextMatches(value,encoded),'Noncanonical bounded state');retainedJSON.set(value,raw);this.jsonCache.set(path,value);return value;}
  async list(path) {this.reserve(1024);const directory=await opendir(path,{bufferSize:1});this.readOps++;const entries=[];try{while(true){this.reserve(1024);const entry=await directory.read();this.readOps++;if(!entry){this.charge(4,'directory-entry');break;}this.charge(Buffer.byteLength(entry.name)+4,'directory-entry');entries.push(entry.name);}}finally{await directory.close();}return entries.sort();}
  async parent(path){need(path===this.root||path.startsWith(this.root+sep),'Evidence writes outside admitted private state refused');let current=this.root;for(const name of path.slice(this.root.length).split(sep).filter(Boolean)){current=join(current,name);let info;try{info=await this.stat(current);}catch(error){if(error.code!=='ENOENT')throw error;this.reserve(0);try{await mkdir(current,{mode:0o700});this.writeOps++;}catch(error){if(error.code!=='EEXIST')throw error;}info=await this.stat(current);}need(info.directory&&!info.symlink,'Ordinary evidence directory required before writes');}}
  async put(path,bytes) {
    this.reserve(2048);await this.parent(dirname(path));
    const pending=join(dirname(path),'.pending-'+randomUUID());const file=await open(pending,'wx',0o600);
    try{await file.writeFile(bytes);await file.sync();this.writeBytes+=bytes.length;this.writeOps++;}finally{await file.close();}
    try{await link(pending,path);this.writeOps++;}catch(error){if(error.code!=='EEXIST')throw error;need((await this.read(path)).equals(bytes),'Concurrent immutable state conflict');}finally{await unlink(pending);this.writeOps++;}
  }
  async comparePut(path,bytes) {
    this.reserve(2048);await this.parent(dirname(path));const pending=join(dirname(path),'.pending-'+randomUUID());const file=await open(pending,'wx',0o600);
    try{await file.writeFile(bytes);await file.sync();this.writeBytes+=bytes.length;this.writeOps++;}finally{await file.close();}
    let won=false;try{await link(pending,path);this.writeOps++;won=true;}catch(error){if(error.code!=='EEXIST')throw error;}finally{await unlink(pending);this.writeOps++;}return won;
  }
  async putJSON(path,value) {const raw=this.generated(value);await this.put(path,raw);retainedJSON.set(value,raw);this.jsonCache.set(path,value);this.rawCache.set(path,raw);}
  actuals(){return {accountingRevision:HISTORY_ACCOUNTING_REVISION,diagnostics:this.diagnostics,limit:this.limit,startedAt:this.startedAt,deadline:this.deadline,chargedBytes:this.charged,categories:this.categories,readBytes:this.readBytes,writeBytes:this.writeBytes,readOps:this.readOps,writeOps:this.writeOps,providerAccounting:this.priorLedgerUnread?'prior-ledger-unread':'verified',reservedProviderCalls:this.priorLedgerUnread?null:this.reservedProviderCalls,knownActualProviderCalls:this.priorLedgerUnread?null:this.knownActualProviderCalls,uncertainProviderCalls:this.priorLedgerUnread?null:this.reservedProviderCalls-this.knownActualProviderCalls};}
}
async function directory(job,path) {need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path,'Exact absolute directory required');let current=path;while(true){const info=await job.stat(current);need(info.directory&&!info.symlink,'Ordinary directory ancestry required');const parent=dirname(current);if(parent===current)break;current=parent;}job.reserve(Buffer.byteLength(path)+1024);need(await realpath(path)===path,'Symlinked directory refused');job.diagnostic(Buffer.byteLength(path),'realpath');job.readOps++;}
async function optional(job,path) {try{return await job.json(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function execute(request,operation,{limit=HISTORY_JOB_CAP,requestBytes=0,window=1,runtime=null,preflight=null,acquireRequest=null,controller=null}={}) {
  const job=new Job(request.jobId,limit);if(preflight){job.readBytes=preflight.readBytes;job.readOps=preflight.readOps;job.diagnostics.requestMetadata=preflight.metadataBytes;}const original=request;request={...request};if(runtime){if(runtime.jobId===request.jobId&&runtime.cursor===request.jobLedger?.cursor){job.jsonCache=runtime.jsonCache;job.rawCache=runtime.rawCache;}else{runtime.jobId=request.jobId;runtime.startedAt=Date.now();runtime.callbacks=0;}runtime.callbacks++;need(runtime.callbacks<=128,'Live ticket callback limit reached');job.startedAt=runtime.startedAt;}
  need(typeof request.stateDirectory==='string'&&isAbsolute(request.stateDirectory)&&resolve(request.stateDirectory)===request.stateDirectory,'Exact absolute state directory required');
  const executionId=request.executionId??request.jobId;job.executionId=executionId;need(typeof executionId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(executionId),'Distinct explicit callback execution identity required');const executionPath=join(request.stateDirectory,'bounded-jobs','execution-'+request.jobId+'-'+executionId+'.claim');
  const prior=request.jobLedger??null;if(prior?.startedAt){job.startedAt=prior.startedAt;job.deadline=Math.min(job.deadline,prior.deadline??prior.startedAt+120000);}if(request.attemptDeadline!==undefined){need(stamp(request.attemptDeadline),'Exact absolute attempt deadline required');job.deadline=Math.min(job.deadline,Date.parse(request.attemptDeadline));}need(job.deadline<=job.startedAt+120000,'Attempt deadline cannot extend ticket duration');
  if(prior) {need(exactId(prior.cursor)&&Number.isSafeInteger(prior.chargedBytes)&&Number.isSafeInteger(prior.size)&&prior.size>0&&prior.size<=RESERVE,'Exact previous ticket ledger required');job.charged+=prior.chargedBytes;job.priorLedgerUnread=true;}
  try {await withReportingAccounting(job,async()=>{job.charge(requestBytes||serializedSize(original)+1,'request');if(prior)job.reserve(prior.size*3+2048);await directory(job,request.stateDirectory);try{await job.stat(executionPath);throw new ReusedExecution('Execution identity already consumed; no source replay');}catch(error){if(error.code!=='ENOENT')throw error;}let root=request.directory;if(!root&&exactId(request.captureId)){const header=await job.json(join(request.stateDirectory,request.captureId,'header.json'));need(hash(header)===request.captureId,'Exact capture header required before state writes');root=header.directory;}if(root)need(root!==request.stateDirectory&&!request.stateDirectory.startsWith(root+sep)&&!root.startsWith(request.stateDirectory+sep),'Private state must be outside canonical Records before writes');});job.reserve(2048);}catch(error){const result={status:error instanceof ReusedExecution?'execution-already-claimed':error instanceof Exhausted?'budget-stop':'blocked',...failure(error),execute:false,executionAdmitted:false,actuals:job.actuals()};job.charged+=serializedSize(result)+1;result.actuals={...job.actuals(),...(error instanceof ReusedExecution?{reservedBytes:limit}:{})};return result;}
  job.root=request.stateDirectory;const jobs=join(request.stateDirectory,'bounded-jobs');await job.parent(jobs);
  const claim=join(jobs,request.jobId+'-'+(prior?.cursor??'initial')+'.claim');let handle;
  try{handle=await open(claim,'wx',0o600);}catch(error){if(error.code!=='EEXIST')throw error;return {status:'execution-already-claimed',jobId:job.id,execute:false,actuals:{...job.actuals(),reservedBytes:limit,claimOpenOps:1,requestBytes},accounting:'Original reservation consumes remaining allowance; no source replay or renewed budget'};}
  const claimBytes=historyBytes({kind:'bounded-execution-claim',jobId:job.id,executionId,previous:prior?.cursor??null,reservedBytes:limit,requestSha256:hash(original),knownBeforeClaim:job.actuals(),requestBytes,crashAccounting:'full remaining allowance reserved until completed ledger'});
  try{await handle.writeFile(claimBytes);await handle.sync();}finally{await handle.close();}job.charged+=claimBytes.length;job.categories.claim=claimBytes.length;job.writeBytes+=claimBytes.length;job.writeOps++;
  const executionBytes=job.generated({kind:'bounded-execution-identity',jobId:job.id,executionId,previous:prior?.cursor??null,reservedBytes:limit});let executionHandle;try{executionHandle=await open(executionPath,'wx',0o600);}catch(error){if(error.code!=='EEXIST')throw error;return {status:'execution-already-claimed',execute:false,actuals:job.actuals(),reservation:'remaining predecessor allowance unavailable'};}try{await executionHandle.writeFile(executionBytes);await executionHandle.sync();job.writeBytes+=executionBytes.length;job.writeOps++;}finally{await executionHandle.close();}
  let result;let last=null;
  try {
    result=await withReportingAccounting(job,async()=>{
      if(prior) {const previous=await job.json(join(jobs,request.jobId+'-'+prior.cursor+'.json'),{size:prior.size,sha256:prior.cursor});need(previous.actuals.chargedBytes===prior.chargedBytes&&previous.jobId===job.id&&previous.actuals.startedAt===job.startedAt&&previous.actuals.deadline===(prior.deadline??job.startedAt+120000),'Ticket ledger accounting binding mismatch');need(previous.actuals.providerAccounting!=='prior-ledger-unread','Unresolved predecessor accounting cannot grant a new permission');job.priorLedgerUnread=false;job.reservedProviderCalls=previous.actuals.reservedProviderCalls??0;job.knownActualProviderCalls=previous.actuals.knownActualProviderCalls??0;for(const[key,value]of Object.entries(previous.actuals.diagnostics??{}))job.diagnostics[key]=(job.diagnostics[key]??0)+value;job.readBytes+=previous.actuals.readBytes;job.writeBytes+=previous.actuals.writeBytes;job.readOps+=previous.actuals.readOps;job.writeOps+=previous.actuals.writeOps;for(const [key,value]of Object.entries(previous.actuals.categories))job.categories[key]=(job.categories[key]??0)+value;}
      if(acquireRequest)request=await acquireRequest(job,request);
      for(let index=0;index<Math.min(64,window);index++) {const next=await operation(job,request);last=next;if(next.status!=='incomplete'||job.limit-job.charged<30000)return next;request={...request,cursor:next.cursor,captureId:next.captureId,...(next.ownerHeadCheckpoint?{ownerHeadCheckpoint:next.ownerHeadCheckpoint}:{})};}
      return last;
    });
  } catch(error) {result=error instanceof Exhausted&&last?{...last,budgetStopped:true}:{status:error instanceof Exhausted?'budget-stop':'blocked',...failure(error),execute:false,...(last?{captureId:last.captureId,cursor:last.cursor}:{})};}
  if(controller)result={...result,control:controller};
  const accounting=job.actuals();let summarySize=0;
  for(let attempt=0;attempt<16;attempt++) {summarySize=serializedSize({...result,jobId:job.id,executionId,actuals:accounting})+1;const outputSize=serializedSize({...result,jobId:job.id,executionId,actuals:accounting,jobLedger:{cursor:'0'.repeat(64),size:summarySize,chargedBytes:accounting.chargedBytes,startedAt:job.startedAt,deadline:job.deadline},ticketRemaining:limit-accounting.chargedBytes})+1;const total=job.charged+summarySize+outputSize;if(accounting.chargedBytes===total)break;accounting.chargedBytes=total;accounting.categories={...job.categories,summaryRepresentation:(job.categories.summaryRepresentation??0)+summarySize,outputRepresentation:(job.categories.outputRepresentation??0)+outputSize};accounting.writeBytes=job.writeBytes+summarySize;accounting.writeOps=job.writeOps+1;}
  const summary=historyBytes({...result,jobId:job.id,executionId,actuals:accounting});need(accounting.chargedBytes<=limit,'Reserved summary budget exceeded');const cursor=historyHash(summary);const ledger=await open(join(jobs,job.id+'-'+cursor+'.json'),'wx',0o600);await ledger.writeFile(summary);await ledger.close();const parsed=JSON.parse(summary);retainedJSON.set(parsed,summary);job.jsonCache.set(join(jobs,job.id+'-'+cursor+'.json'),parsed);job.rawCache.set(join(jobs,job.id+'-'+cursor+'.json'),summary);if(runtime){runtime.cursor=cursor;runtime.jsonCache=job.jsonCache;runtime.rawCache=job.rawCache;}return {...parsed,jobLedger:{cursor,size:summary.length,chargedBytes:accounting.chargedBytes,startedAt:job.startedAt,deadline:job.deadline},ticketRemaining:limit-accounting.chargedBytes};
}
async function snapshot(job,header) {
  const roots=await job.list(header.directory);need(same(roots,header.scope.recordScope.namespaces.map(item=>item.namespace).sort()),'Original root membership changed or incomplete');
  const folders=[];const records=[];const root=await job.stat(header.directory);
  for(const namespace of header.owner.namespaces.slice().sort()) {
    const folder=header.scope.recordScope.namespaces.find(item=>item.namespace===namespace);const path=join(header.directory,namespace);const info=await job.stat(path);need(info.directory&&!info.symlink,'Ordinary admitted namespace required');folders.push({namespace,dev:info.dev,ino:info.ino});
    for(const name of await job.list(path)){need(/^[a-f0-9]{64}\.json$/.test(name),'Unexpected or partial canonical history entry');records.push({namespace,name,parentId:folder.folderId});}
  }
  records.sort((a,b)=>a.name.localeCompare(b.name)||a.namespace.localeCompare(b.namespace));need(records.length<=4096,'History object bound exceeded');return {root:{dev:root.dev,ino:root.ino},folders,records};
}
async function state(job,request) {
  need(exactId(request.captureId)&&exactId(request.cursor),'Exact capture identity and durable cursor required');const path=join(request.stateDirectory,request.captureId);const header=await job.json(join(path,'header.json'));need(hash(header)===request.captureId&&header.captureRevision===HISTORY_CAPTURE_REVISION&&header.accountingRevision===HISTORY_ACCOUNTING_REVISION,'Capture request identity or protocol revision mismatch');need(!job.controllerProfile||(header.directory===job.controllerProfile.sourceRoot&&header.owner.owner===job.controllerProfile.owner&&hash(header.scope)===job.controllerProfile.scopeSha256),'Capture contradicts registered source, owner or scope profile');const cursor=await job.json(join(path,'cursors',request.cursor+'.json'));need(hash(cursor)===request.cursor&&cursor.captureId===request.captureId,'Cursor identity mismatch');
  const child=await optional(job,join(path,'transitions',request.cursor+'.json'));return {path,header,cursor,child,ownerHeadCheckpoint:request.ownerHeadCheckpoint??null};
}
async function transition(job,state,change) {
  const cursor={...state.cursor,...change,sequence:state.cursor.sequence+1};const id=hash(cursor);await job.putJSON(join(state.path,'cursors',id+'.json'),cursor);await job.putJSON(join(state.path,'transitions',hash(state.cursor)+'.json'),{cursor:id});return {status:cursor.phase==='sealed'?'prepared':'incomplete',captureId:cursor.captureId,cursor:id,phase:cursor.phase,index:cursor.index,records:cursor.count,execute:false};
}
export async function beginBoundedHistory(request,options) {
  return execute(request,async (job,request)=>{
    const {directory:root,scope,owner:ownerId,generation,previous=null,admission,evaluatedAt}=request;
    const synthetic=request.synthetic===true;need(synthetic||(request.captureStartedAt==null&&request.captureEndedAt==null),'Injected capture clocks require explicit synthetic mode');
    let previousTurn=null;const captureStartedAt=synthetic?(request.captureStartedAt??new Date().toISOString()):new Date().toISOString();const captureEndedAt=synthetic?(request.captureEndedAt??null):null;
    validateDiscoveryScope(scope);const owner=scope.owners.find(item=>item.owner===ownerId);need(owner,'Registered single owner required');need(Number.isSafeInteger(generation)&&generation>0&&generation<=5000&&(generation===1?previous===null:previous!==null),'Exact preceding generation required');if(previous){const prior=await state(job,{stateDirectory:request.stateDirectory,captureId:previous.captureId,cursor:previous.cursor});need(prior.cursor.phase==='published'&&prior.header.generation===generation-1&&same(prior.cursor.inventory,previous.reference)&&same(prior.header.scope,scope)&&prior.header.owner.owner===ownerId&&prior.header.directory===root&&prior.header.admission.id===admission.id&&Date.parse(captureStartedAt)>=Date.parse(prior.cursor.captureEndedAt),'Predecessor generation binding or admitted history changed');previousTurn=prior.cursor.ownerTurn??null;}need(admission?.completeAdmittedHistory===true&&typeof admission.id==='string'&&admission.id.length>0&&admission.id.length<=400&&!/[\u0000-\u001f\u007f]/.test(admission.id),'Complete original history admission required');need(stamp(evaluatedAt)&&stamp(captureStartedAt)&&(captureEndedAt===null||(stamp(captureEndedAt)&&Date.parse(captureStartedAt)<=Date.parse(captureEndedAt))),'Frozen original evaluation clock and ordered capture clocks required');await directory(job,root);need(!request.stateDirectory.startsWith(root+sep)&&!root.startsWith(request.stateDirectory+sep)&&root!==request.stateDirectory,'State outside original Records required');
    const controller=await job.stat(request.stateDirectory);const registration={schemaVersion:1,kind:'bounded-controller-registration',stateDirectory:request.stateDirectory,controllerDev:controller.dev,controllerIno:controller.ino,sourceRoot:root,owner:ownerId,scopeSha256:hash(scope)};need(serializedSize(registration)+1<=2048,'Registered controller profile exceeds metadata bound');await job.putJSON(join(request.stateDirectory,'bounded-controller.json'),registration);
    const header={schemaVersion:2,kind:'automation-reporting-history-batch',captureRevision:HISTORY_CAPTURE_REVISION,accountingRevision:HISTORY_ACCOUNTING_REVISION,directory:root,scope,owner,generation,previous,admission,evaluatedAt,synthetic,captureStartedAt,captureEndedAt};const captureId=hash(header);const path=join(request.stateDirectory,captureId);await job.putJSON(join(path,'header.json'),header);const cursor={captureId,ownerTurn:previousTurn,sequence:0,phase:'census',index:0,count:0,clocks:{recordedAt:{min:null,max:null},originalEvidence:{min:null,max:null}}};const cursorId=hash(cursor);await job.putJSON(join(path,'cursors',cursorId+'.json'),cursor);return {status:'incomplete',captureId,cursor:cursorId,phase:'census',execute:false};
  },options);
}
const boundsMerge=(a,b)=>({min:[a.min,b.min].filter(Boolean).sort((x,y)=>Date.parse(x)-Date.parse(y))[0]??null,max:[a.max,b.max].filter(Boolean).sort((x,y)=>Date.parse(x)-Date.parse(y)).at(-1)??null});
export async function advanceBoundedHistory(request,options) {
  return execute(request,async (job,request)=>{
    const s=await state(job,request);if(s.child)return {status:'already-advanced',captureId:request.captureId,cursor:s.child.cursor,execute:false};const {header,cursor,path}=s;
    if(cursor.phase==='sealed')return {status:'prepared',captureId:request.captureId,cursor:request.cursor,records:cursor.count,execute:false};
    if(cursor.phase==='census') {
      const census=await snapshot(job,header);const raw=job.generated(census,'census');await job.put(join(path,'census.json'),raw);
      for(let index=0;index<census.records.length;index++)await job.putJSON(join(path,'entries',ordinal(index)+'.json'),census.records[index]);for(const namespace of header.owner.namespaces)await job.putJSON(join(path,'namespace-indices',namespace+'.json'),census.records.flatMap((entry,index)=>entry.namespace===namespace?[index]:[]));
      return transition(job,s,{phase:'first-pass',count:census.records.length,census:{size:raw.length,sha256:historyHash(raw)}});
    }
    if(['first-pass','second-pass'].includes(cursor.phase)&&cursor.index<cursor.count) {
      if(cursor.phase==='first-pass') {
        const entry=await job.json(join(path,'entries',ordinal(cursor.index)+'.json'));const source=join(header.directory,entry.namespace,entry.name);const raw=await job.read(source);const record=validateRecord(historyDecode(raw),header.evaluatedAt);assertExportSafe(record);const encoded=canonical(record);need(canonicalTextMatches(record,encoded)&&record.namespace===entry.namespace&&historyHash(raw.subarray(0,-1))+'.json'===entry.name&&header.scope.recordScope.namespaces.find(item=>item.namespace===entry.namespace).automationIds.includes(record.automationId),'Original source canonical scope mismatch');
        const sourceIdentity=await job.stat(source);await job.put(join(path,'raw',entry.name),raw);const clocks=historySourceClocks([record]);let pendingCount=cursor.pendingCount??0;let ancestryVerified=record.previous===null;if(record.previous!==null){const predecessorIndex=await optional(job,join(path,'digests',record.previous+'.json'));if(predecessorIndex&&predecessorIndex.index<cursor.index){const predecessor=await job.json(join(path,'records',ordinal(predecessorIndex.index)+'.json'));const previous=historyDecode(await job.read(join(path,'raw',record.previous+'.json'),predecessor));need(predecessorOK(record,previous),'Incomplete or invalid admitted ancestry');ancestryVerified=true;}else{await job.putJSON(join(path,'pending-pairs',ordinal(pendingCount)+'.json'),{index:cursor.index,previous:record.previous});pendingCount++;}}const descriptor={namespace:entry.namespace,name:entry.name,parentId:entry.parentId,size:raw.length,sha256:historyHash(raw),previous:record.previous,identity:sourceIdentity,ancestryVerified};await job.putJSON(join(path,'records',ordinal(cursor.index)+'.json'),descriptor);await job.putJSON(join(path,'digests',entry.name),{index:cursor.index});const identity=fragment(job,(cursor.index===0?'[':',')+canonical([sourceIdentity.dev,sourceIdentity.ino,sourceIdentity.size,sourceIdentity.mtime,sourceIdentity.ctime]));await segment(job,join(path,'identities.assembling'),cursor.identityOffset??0,identity);return transition(job,s,{index:cursor.index+1,pendingCount,identityOffset:(cursor.identityOffset??0)+identity.length,clocks:{recordedAt:boundsMerge(cursor.clocks.recordedAt,clocks.recordedAt),originalEvidence:boundsMerge(cursor.clocks.originalEvidence,clocks.originalEvidence)}});
      }
      const descriptor=await job.json(join(path,'records',ordinal(cursor.index)+'.json'));
      if(cursor.phase==='second-pass') {const source=join(header.directory,descriptor.namespace,descriptor.name);await job.read(source,descriptor);need(same(await job.stat(source),descriptor.identity),'Original source identity or metadata drift');}
      return transition(job,s,{index:cursor.index+1});
    }
    if(['first-pass','second-pass'].includes(cursor.phase)){if(cursor.phase==='first-pass')await segment(job,join(path,'identities.assembling'),cursor.identityOffset??0,fragment(job,cursor.count===0?'[]\n':']\n'));return transition(job,s,{phase:cursor.phase==='first-pass'?((cursor.pendingCount??0)>0?'ancestry':header.previous?'prior-history':'second-pass'):'membership',index:0});}
    if(cursor.phase==='ancestry'){if(cursor.index<(cursor.pendingCount??0)){const pending=await job.json(join(path,'pending-pairs',ordinal(cursor.index)+'.json'));const descriptor=await job.json(join(path,'records',ordinal(pending.index)+'.json'));need(descriptor.previous===pending.previous&&!descriptor.ancestryVerified,'Pending predecessor pair binding changed');const record=historyDecode(await job.read(join(path,'raw',descriptor.name),descriptor));const predecessorIndex=await job.json(join(path,'digests',pending.previous+'.json'));const previousDescriptor=await job.json(join(path,'records',ordinal(predecessorIndex.index)+'.json'));const previous=historyDecode(await job.read(join(path,'raw',pending.previous+'.json'),previousDescriptor));need(predecessorOK(record,previous),'Incomplete or invalid admitted ancestry');return transition(job,s,{index:cursor.index+1});}return transition(job,s,{phase:header.previous?'prior-history':'second-pass',index:0});}
    if(cursor.phase==='prior-history'){const prior=await state(job,{stateDirectory:request.stateDirectory,captureId:header.previous.captureId,cursor:header.previous.cursor});if(cursor.index<prior.cursor.count){const before=await job.json(join(prior.path,'records',ordinal(cursor.index)+'.json'));const found=await job.json(join(path,'digests',before.name));const after=await job.json(join(path,'records',ordinal(found.index)+'.json'));need(before.namespace===after.namespace&&before.name===after.name&&before.size===after.size&&before.sha256===after.sha256,'Admitted source history regression');return transition(job,s,{index:cursor.index+1});}return transition(job,s,{phase:'second-pass',index:0});}
    if(cursor.phase==='fence') {if(cursor.index<cursor.count){const descriptor=await job.json(join(path,'records',ordinal(cursor.index)+'.json'));need(same(await job.stat(join(header.directory,descriptor.namespace,descriptor.name)),descriptor.identity),'Source metadata changed before seal');return transition(job,s,{index:cursor.index+1});}return transition(job,s,{phase:'membership',index:0});}
    need(cursor.phase==='membership','Unknown bounded capture phase');const original=await job.json(join(path,'census.json'),cursor.census);need(same(original,await snapshot(job,header)),'Source changed across complete capture membership/metadata fences');const identities=await job.json(join(path,'identities.assembling'));need(identities.length===original.records.length,'Complete metadata fence required');for(let index=0;index<original.records.length;index++){const entry=original.records[index];const actual=await job.stat(join(header.directory,entry.namespace,entry.name));const expected=identities[index];need(actual.file&&!actual.symlink&&actual.dev===expected[0]&&actual.ino===expected[1]&&actual.size===expected[2]&&actual.mtime===expected[3]&&actual.ctime===expected[4],'Source identity or in-place bytes changed immediately before seal');}const captureEndedAt=header.captureEndedAt??new Date().toISOString();need(Date.parse(captureEndedAt)>=Date.parse(header.captureStartedAt),'Capture end precedes capture start');return transition(job,s,{phase:'sealed',index:0,captureEndedAt});
  },{...options,window:options?.window??64});
}
function fragment(job,value) {job.reserve(Buffer.byteLength(value));job.charge(Buffer.byteLength(value),'fragment');return Buffer.from(value);}
async function segment(job,path,offset,bytes) {
  job.reserve(bytes.length+2048);await directory(job,dirname(path));let file;try{file=await open(path,constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(error){if(error.code!=='ENOENT')throw error;file=await open(path,'wx+',0o600);}
  try {const info=await file.stat();job.diagnostic(512,'handle-metadata');job.readOps++;need(info.isFile()&&info.size>=offset&&info.size<=offset+bytes.length,'Fragment assembly cursor/length mismatch');if(info.size>offset){const retained=Buffer.alloc(info.size-offset);job.charge(retained.length,'acquired');const result=await file.read(retained,0,retained.length,offset);job.readBytes+=result.bytesRead;job.readOps++;need(result.bytesRead===retained.length&&retained.equals(bytes.subarray(0,retained.length)),'Conflicting or corrupt partial inventory fragment');}let written=0;while(written<bytes.length){job.reserve(0);const result=await file.write(bytes,written,bytes.length-written,offset+written);job.writeBytes+=result.bytesWritten;job.writeOps++;need(result.bytesWritten>0,'Incomplete inventory fragment write');written+=result.bytesWritten;}await file.sync();}finally{await file.close();}
}
async function publicationCell(job,s,index) {
  const intent=await job.json(join(s.path,'actions',ordinal(index)+'.json'));need(intent.sequence===index&&intent.captureId===s.cursor.captureId,'Publication intent identity changed');
  const reply=await optional(job,join(s.path,'responses',ordinal(index)+'.json'));const retry=['getMetadata','downloadRaw'].includes(intent.method)?await optional(job,join(s.path,'read-retries',ordinal(index)+'.json')):null;if(retry)need(retry.actionSha256===hash(intent)&&Number.isSafeInteger(retry.attempt)&&retry.attempt>0&&retry.attempt<=20,'Historical read retry binding changed');
  if(reply) {
    need(reply.actionSha256===hash(intent),'Response original action binding changed');assertNoCredentials(reply);
    if(intent.method==='getMetadata'&&!retry)validateRemoteMetadata(reply.response,intent.expected,intent.expected.size??131072);
    if(intent.method==='downloadRaw'&&!retry) {need(reply.response.id===intent.expected.id&&reply.response.complete===true&&reply.response.acquisition?.mode==='file-reference'&&reply.response.raw&&typeof reply.response.raw==='object','Complete exact raw response evidence required');const raw=await job.read(join(s.path,'response-raw',ordinal(index)+'.json'),reply.raw);need((intent.expected.size===undefined||raw.length===intent.expected.size)&&(intent.expected.sha256===undefined||historyHash(raw)===intent.expected.sha256),'Original raw response contradicts exact expected bytes');}
    if(intent.method==='uploadImmutable'&&reply.response.id)need(reply.response.raw&&typeof reply.response.raw==='object','Original returned upload response required');
  }
  const recovery=intent.method==='uploadImmutable'?await optional(job,join(s.path,'recoveries',ordinal(index)+'.json')):null;const late=intent.method==='uploadImmutable'?await optional(job,join(s.path,'late-responses',ordinal(index)+'.json')):null;const candidateId=recovery?.id??reply?.response?.id??late?.response?.id;const knownId=remoteId(candidateId)?candidateId:null;if(late)need(late.actionSha256===hash(intent),'Late response original action binding changed');if(recovery)need(recovery.actionSha256===hash(intent),'Recovery original action binding changed');for(const response of [reply?.response,late?.response])if(remoteId(response?.id))need(response.id===knownId,'Late upload response contradicts recovered exact ID');return {intent,reply,recovery,knownId};
}
async function inventoryObject(job,s,index) {
  if(index<s.cursor.count)return {...await job.json(join(s.path,'records',ordinal(index)+'.json')),path:join(s.path,'raw',(await job.json(join(s.path,'entries',ordinal(index)+'.json'))).name)};
  const ref=await job.json(join(s.path,'inventory-ref.json'));return {...ref,path:join(s.path,'inventory.json')};
}
const ownerBinding=s=>({owner:s.header.owner.owner,anchorId:s.header.owner.anchor.id,scopeSha256:hash(s.header.scope)});
const ownerKey=s=>historyHash(s.header.owner.anchor.id);
const ownerDirectory=s=>join(dirname(s.path),'bounded-owner-turns-'+ownerKey(s));
const ownerSlot=(s,sequence)=>join(ownerDirectory(s),ordinal(sequence)+'.json');
const turnReceipt=turn=>({sequence:turn.sequence,sha256:hash(turn)});
function validateTurn(turn,binding,sequence,previous=undefined) {
  need(turn.schemaVersion===1&&turn.kind==='bounded-owner-turn'&&same(turn.binding,binding)&&turn.sequence===sequence&&Number.isSafeInteger(sequence)&&sequence>=0&&['grant','poison'].includes(turn.decision?.kind),'Invalid owner-turn identity or decision');
  if(previous!==undefined)need(same(turn.previous,previous),'Owner-turn predecessor fork');
  need(turn.previous===null?sequence===0:turn.previous.sequence===sequence-1&&exactId(turn.previous.sha256),'Invalid owner-turn predecessor');
  need(exactId(turn.decision.captureId)&&/^\d{8}$/.test(turn.decision.actionId)&&Number.isSafeInteger(turn.decision.generation)&&turn.decision.generation>0,'Invalid owner-turn action binding');
  need(turn.decision.kind==='grant'?exactId(turn.decision.intentSha256)&&exactId(turn.decision.auditCursor)&&typeof turn.decision.executionId==='string':exactId(turn.decision.contradictionSha256),'Invalid owner-turn evidence binding');return turn;
}
async function headCheckpoint(job,s,head) {
  const value={schemaVersion:1,kind:'bounded-owner-head',binding:ownerBinding(s),head};const bytes=job.generated(value);const sha256=historyHash(bytes);await job.put(join(dirname(s.path),'bounded-owner-heads',sha256+'.json'),bytes);return {sha256,size:bytes.length};
}
async function ownerHead(job,s,basis=undefined) {
  const binding=ownerBinding(s);let head=basis===undefined?(s.cursor.ownerTurn??null):basis;let last=null;
  if(basis===undefined&&s.ownerHeadCheckpoint){const ref=s.ownerHeadCheckpoint;need(exactId(ref.sha256)&&Number.isSafeInteger(ref.size)&&ref.size>0&&ref.size<=2048,'Exact bounded owner-head checkpoint required');const saved=await job.json(join(dirname(s.path),'bounded-owner-heads',ref.sha256+'.json'),ref);need(saved.schemaVersion===1&&saved.kind==='bounded-owner-head'&&same(saved.binding,binding)&&saved.head&&Number.isSafeInteger(saved.head.sequence)&&saved.head.sequence>=0&&exactId(saved.head.sha256),'Owner-head checkpoint binding mismatch');head=saved.head;}
  if(head){need(Number.isSafeInteger(head.sequence)&&exactId(head.sha256),'Exact owner-turn receipt required');last=validateTurn(await job.json(ownerSlot(s,head.sequence),{sha256:head.sha256}),binding,head.sequence);if(last.decision.kind==='poison')return {status:'closed',head,turn:last};}
  for(let count=0;count<32;count++) {
    const sequence=head?head.sequence+1:0;const turn=await optional(job,ownerSlot(s,sequence));if(!turn)return {status:'ready',head,turn:last};validateTurn(turn,binding,sequence,head);
    if(last)need(turn.decision.generation>=last.decision.generation,'Owner-turn generation regressed');head=turnReceipt(turn);last=turn;if(turn.decision.kind==='poison')return {status:'closed',head,turn};
  }
  return {status:'incomplete',head,ownerHeadCheckpoint:await headCheckpoint(job,s,head)};
}
async function commitOwnerTurn(job,s,head,decision) {
  if(head){const previous=validateTurn(await job.json(ownerSlot(s,head.sequence),{sha256:head.sha256}),ownerBinding(s),head.sequence);if(previous.decision.kind==='poison')return {status:'closed',head,turn:previous};need(decision.generation>=previous.decision.generation,'Owner-turn grant cannot regress generation');}
  if(decision.kind==='grant'){const intent=await job.json(join(s.path,'actions',decision.actionId+'.json'));need(hash(intent)===decision.intentSha256&&intent.captureId===decision.captureId&&ordinal(intent.sequence)===decision.actionId,'Grant requires exact durable original intent');const audit=await job.json(join(s.path,'cursors',decision.auditCursor+'.json'),{sha256:decision.auditCursor});need(audit.captureId===decision.captureId&&audit.pub?.ancestor===null,'Grant requires durable complete ancestor audit');}
  const sequence=head?head.sequence+1:0;const value={schemaVersion:1,kind:'bounded-owner-turn',binding:ownerBinding(s),sequence,previous:head,decision};const bytes=job.generated(value);const won=await job.comparePut(ownerSlot(s,sequence),bytes);
  if(won)return {status:'committed',head:{sequence,sha256:historyHash(bytes)},turn:value};
  const winner=validateTurn(await job.json(ownerSlot(s,sequence)),ownerBinding(s),sequence,head);return {status:winner.decision.kind==='poison'?'closed':'lost',head:turnReceipt(winner),turn:winner};
}
async function pendingInvalidation(job,s) {
  const path=join(dirname(s.path),'bounded-owner-invalidations-'+ownerKey(s));let names;try{names=await job.list(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(names.length===0)return null;const name=names.find(name=>/^pending-[a-f0-9]{64}\.json$/.test(name));if(!name)return {status:'blocked',execute:false,reason:'Unfinished owner invalidation evidence requires explicit reconciliation'};
  const frame=await job.json(join(path,name));need(frame.kind==='bounded-owner-invalidation'&&same(frame.binding,ownerBinding(s))&&hash(frame.cell)===frame.contradictionSha256,'Pending invalidation binding changed');
  const origin=await state(job,{stateDirectory:dirname(s.path),captureId:frame.captureId,cursor:frame.cursor,...(s.ownerHeadCheckpoint?{ownerHeadCheckpoint:s.ownerHeadCheckpoint}:{})});need(same(ownerBinding(origin),ownerBinding(s)),'Pending invalidation owner changed');const intent=await job.json(join(origin.path,'actions',frame.actionId+'.json'));need(hash(intent)===frame.cell.actionSha256,'Pending invalidation original action changed');const raw=frame.raw?await job.read(frame.raw.path,frame.raw):null;return contradiction(job,origin,frame.actionId,frame.cell,raw);
}
async function issue(job,s,method,args,expected) {
  need(!await optional(job,join(dirname(s.path),'bounded-owner-conflict-'+ownerKey(s)+'.json')),'Late contradictory response invalidates dispatch permission');
  const pending=await pendingInvalidation(job,s);if(pending)return {...pending,captureId:s.cursor.captureId,cursor:hash(s.cursor),execute:false};
  const head=await ownerHead(job,s);if(head.status!=='ready')return {status:head.status==='closed'?'blocked':'incomplete',reason:'Owner-turn poison or incomplete head prevents a new grant',captureId:s.cursor.captureId,cursor:hash(s.cursor),...(head.ownerHeadCheckpoint?{ownerHeadCheckpoint:head.ownerHeadCheckpoint}:{}),execute:false};
  const sequence=s.cursor.actionCount;const existing=await optional(job,join(s.path,'actions',ordinal(sequence)+'.json'));
  if(existing){need(existing.captureId===s.cursor.captureId&&existing.sequence===sequence&&existing.method===method&&same(existing.args,args)&&same(existing.expected,expected),'Conflicting partial publication intent');const next=await transition(job,s,{phase:'publication',pub:{...s.cursor.pub,waiting:sequence},actionCount:sequence+1});return {...next,status:['uploadImmutable','updatePointer'].includes(method)?'uncertain':'incomplete',execute:false,actionId:ordinal(sequence),reason:'Recovered durable original intent; no new mutation permission'};}
  if(job.reservedProviderCalls>=32)throw new Exhausted('Admitted ticket provider-call cap reached before intent');job.reservedProviderCalls++;
  const intent={captureId:s.cursor.captureId,jobId:job.id,sequence,method,args,expected};
  await job.putJSON(join(s.path,'actions',ordinal(sequence)+'.json'),intent);
  const advanced=await transition(job,s,{phase:'publication',pub:{...s.cursor.pub,waiting:sequence},actionCount:sequence+1});
  const ownerClaim=await job.json(join(dirname(s.path),'bounded-owner-'+ownerKey(s)+'-'+s.header.generation+'.json'));need(ownerClaim.captureId===s.cursor.captureId&&ownerClaim.scopeSha256===hash(s.header.scope),'Owner claim changed before grant');need(!s.cursor.pub.ancestor,'Complete ancestor audit required before grant');
  const turn=await commitOwnerTurn(job,s,head.head,{kind:'grant',generation:s.header.generation,captureId:s.cursor.captureId,actionId:ordinal(sequence),intentSha256:hash(intent),auditCursor:hash(s.cursor),jobId:job.id,executionId:job.executionId});
  if(turn.status!=='committed')return {...advanced,status:turn.status==='closed'?'blocked':'uncertain',execute:false,actionId:ordinal(sequence),reason:'Owner-turn CAS lost; original intent retained without new permission',ownerTurn:turn.head};
  const committed=await transition(job,await state(job,{stateDirectory:dirname(s.path),captureId:advanced.captureId,cursor:advanced.cursor}),{ownerTurn:turn.head});
  const current=await ownerHead(job,{...s,cursor:{...s.cursor,ownerTurn:turn.head},ownerHeadCheckpoint:null});const permissionCommit={...turn.head,intentSha256:hash(intent),historical:true,currentEligibility:'not-established',delivery:'original-winning-callback-only'};
  if(current.status!=='ready'||!same(current.head,turn.head))return {...committed,status:current.status==='closed'?'blocked':'uncertain',execute:false,permissionCommit,...(current.ownerHeadCheckpoint?{ownerHeadCheckpoint:current.ownerHeadCheckpoint}:{}),reason:'Earlier grant is historical after later or unverified owner activity; no fresh dispatch permission'};
  const mutative=['uploadImmutable','updatePointer'].includes(method);
  return {...committed,status:'action-required',execute:true,permissionCommit,actionId:ordinal(sequence),action:intent,tool:method==='uploadImmutable'?{operation:'upload_file',arguments:{file_name:args.name,parent_folder_id:args.parentId,mime_type:'application/json',file_uri:args.file_uri}}:method==='updatePointer'?{operation:'update_file',arguments:{fileId:args.id,mime_type:'application/json',file_uri:args.file_uri}}:method==='getMetadata'?{operation:'get_file_metadata',arguments:{fileId:args.id,fields:'id,name,parents,size,mimeType,trashed'}}:{operation:'fetch',arguments:{url:`https://drive.google.com/file/d/${encodeURIComponent(args.id)}/view`,download_raw_file:true,include_base64:false}},effect:mutative?'one retained mutation grant':'known-ID read grant only'};
}
async function readStep(job,s,base,expected) {
  const pub=s.cursor.pub;
  if(pub.stage===base+'-metadata')return issue(job,s,'getMetadata',{id:expected.id},expected);
  if(pub.stage===base+'-download')return issue(job,s,'downloadRaw',{id:expected.id},{...expected,size:pub.readSize});
  throw new Error('Unexpected bounded read stage');
}
export async function advanceBoundedPublication(request,options) {
  return execute(request,async (job,request)=>{
    const s=await state(job,request);if(await optional(job,join(request.stateDirectory,'bounded-owner-conflict-'+historyHash(s.header.owner.anchor.id)+'.json'))||await optional(job,join(s.path,'conflict.json')))throw new Error('Retained contradictory publication response');const pending=await pendingInvalidation(job,s);if(pending)return {...pending,captureId:request.captureId,cursor:request.cursor,execute:false};if(s.child)return {status:'already-advanced',captureId:request.captureId,cursor:s.child.cursor,execute:false};
    const {cursor,header,path}=s;const nextOwnerClaim=join(request.stateDirectory,'bounded-owner-'+historyHash(header.owner.anchor.id)+'-'+(header.generation+1)+'.json');need(!await optional(job,nextOwnerClaim),'Later generation owns anchor; old mutation resume refused');need(['sealed','publication','published'].includes(cursor.phase),'Complete sealed source required before publication');
    if(cursor.phase==='published')return {status:'published',captureId:request.captureId,cursor:request.cursor,inventory:cursor.inventory,providerLatest:'not-established',activeAvailability:'not-established',execute:false};
    if(cursor.phase==='sealed') {
      if(header.previous){const previousClaim=await job.json(join(request.stateDirectory,'bounded-owner-'+historyHash(header.owner.anchor.id)+'-'+(header.generation-1)+'.json'));need(same(previousClaim,{captureId:header.previous.captureId,owner:header.owner.owner,scopeSha256:hash(header.scope),generation:header.generation-1}),'Preceding owner claim binding changed');}
      const ownerPath=join(request.stateDirectory,'bounded-owner-'+historyHash(header.owner.anchor.id)+'-'+header.generation+'.json');const claim={captureId:cursor.captureId,owner:header.owner.owner,scopeSha256:hash(header.scope),generation:header.generation};await job.putJSON(ownerPath,claim);
      return transition(job,s,{phase:'publication',actionCount:0,pub:{object:0,stage:'upload',waiting:null,audit:0,ancestor:header.previous?{captureId:header.previous.captureId,cursor:header.previous.cursor,index:0}:null}});
    }
    const pub=cursor.pub;
    if(pub.ancestor){const ancestor=await state(job,{stateDirectory:request.stateDirectory,captureId:pub.ancestor.captureId,cursor:pub.ancestor.cursor});need(ancestor.cursor.phase==='published'&&same(ancestor.header.scope,header.scope)&&ancestor.header.owner.owner===header.owner.owner,'Claimed ancestor no longer has valid publication closure');if(pub.ancestor.index<ancestor.cursor.actionCount){await publicationCell(job,ancestor,pub.ancestor.index);return transition(job,s,{pub:{...pub,ancestor:{...pub.ancestor,index:pub.ancestor.index+1}}});}return transition(job,s,{pub:{...pub,ancestor:ancestor.header.previous?{captureId:ancestor.header.previous.captureId,cursor:ancestor.header.previous.cursor,index:0}:null}});}
    if(pub.waiting!==null) {
      const {intent,reply,recovery,knownId}=await publicationCell(job,s,pub.waiting);
      if(!reply&&intent.method==='updatePointer')return transition(job,s,{pub:{...pub,waiting:null,stage:'anchor-after-metadata'}});
      if(!reply&&!recovery)return {status:['uploadImmutable','updatePointer'].includes(intent.method)?'uncertain':'awaiting-response',captureId:request.captureId,cursor:request.cursor,actionId:ordinal(intent.sequence),action:intent,execute:false,reason:'Original retained intent awaits exact response; mutation never reissued'};
      let next={...pub,waiting:null};
      if(intent.method==='uploadImmutable'){if(!knownId)return {status:'uncertain',captureId:request.captureId,cursor:request.cursor,actionId:ordinal(intent.sequence),execute:false,reason:'Unknown create outcome requires exact-ID recovery; no create retry'};next={...next,stage:'object-metadata',remoteId:knownId};}
      else if(intent.method==='getMetadata'){next.stage=pub.stage.replace(/metadata$/,'download');next.readSize=reply.response.size;}
      else if(intent.method==='downloadRaw') {
        if(pub.stage==='object-download'){const object=await inventoryObject(job,s,pub.object);await job.putJSON(join(path,'verified',ordinal(pub.object)+'.json'),{id:pub.remoteId,name:object.name,parentId:object.parentId,size:object.size,sha256:object.sha256});next={...next,stage:pub.object<cursor.count?'upload':'anchor-before-metadata',object:pub.object+1};}
        else if(pub.stage==='anchor-before-download') {
          const previous=historyDecode(await job.read(join(path,'response-raw',ordinal(intent.sequence)+'.json')));const desired=await job.json(join(path,'anchor.json'));
          need(same(previous,{schemaVersion:1,kind:'automation-reporting-discovery-anchor',owner:header.owner.owner,generation:header.previous?header.generation-1:0,inventory:header.previous?.reference??null})||same(previous,desired),'Anchor differs from exact preceding generation');next.stage=same(previous,desired)?'anchor-after-metadata':'pointer';
        } else if(pub.stage==='anchor-after-download') {
          const bytes=await job.read(join(path,'response-raw',ordinal(intent.sequence)+'.json'));const desired=await job.read(join(path,'anchor.json'));if(!bytes.equals(desired))return {status:'uncertain',captureId:request.captureId,cursor:request.cursor,generationClosed:true,execute:false,reason:'Pointer unresolved; retained mutation cannot be repeated'};next.stage='close';next.audit=0;
        }
      } else next.stage='anchor-after-metadata';
      return transition(job,s,{pub:next});
    }
    if(pub.audit<cursor.actionCount) {let index=pub.audit;while(index<cursor.actionCount&&job.limit-job.charged>20000){try{await publicationCell(job,s,index);index++;}catch(error){if(!(error instanceof Exhausted)||index===pub.audit)throw error;break;}}return transition(job,s,{pub:{...pub,audit:index}});}
    if(pub.stage==='upload') {
      if(pub.object===cursor.count) {
        const built=await optional(job,join(path,'inventory-ref.json'));if(!built)return transition(job,s,{pub:{...pub,stage:'inventory-build',build:0}});
      }
      const object=await inventoryObject(job,s,pub.object);await job.read(object.path,object);
      return issue(job,s,'uploadImmutable',{name:object.name,parentId:object.parentId,file_uri:object.path},{name:object.name,parentId:object.parentId,size:object.size,sha256:object.sha256});
    }
    if(pub.stage==='inventory-build') {
      const build=pub.buildState??{phase:'source',index:0,offset:0};
      const sourcePath=join(path,'source-set.assembling');const inventoryPath=join(path,'inventory.assembling');
      if(build.phase==='source') {
        if(build.index<cursor.count) {
          const record=await job.json(join(path,'records',ordinal(build.index)+'.json'));const source={namespace:record.namespace,digest:record.name.slice(0,-5),size:record.size,sha256:record.sha256};
          const bytes=fragment(job,(build.index===0?'[':',')+canonical(source));await segment(job,sourcePath,build.offset,bytes);
          return transition(job,s,{pub:{...pub,buildState:{...build,index:build.index+1,offset:build.offset+bytes.length}}});
        }
        const end=fragment(job,cursor.count===0?'[]':']');await segment(job,sourcePath,build.offset,end);const source=await job.read(sourcePath);const sourceHash=historyHash(source);
        return transition(job,s,{pub:{...pub,buildState:{phase:'inventory',index:0,offset:0,sourceHash,namespace:0}}});
      }
      const folders=header.scope.recordScope.namespaces.filter(item=>header.owner.namespaces.includes(item.namespace));
      if(build.phase==='inventory') {
        if(build.offset===0) {
          const prefix={captureInterval:{startedAt:header.captureStartedAt,endedAt:cursor.captureEndedAt},generation:header.generation,kind:'automation-reporting-history-inventory'};
          const bytes=fragment(job,canonical(prefix).slice(0,-1)+',"namespaces":[');await segment(job,inventoryPath,0,bytes);return transition(job,s,{pub:{...pub,buildState:{...build,offset:bytes.length,opened:false}}});
        }
        if(build.namespace<folders.length) {
          const folder=folders[build.namespace];
          if(!build.opened) {const bytes=fragment(job,(build.namespace===0?'':',')+'{"entries":[');await segment(job,inventoryPath,build.offset,bytes);return transition(job,s,{pub:{...pub,buildState:{...build,offset:build.offset+bytes.length,opened:true,entryCount:0}}});}
          const indices=await job.json(join(path,'namespace-indices',folder.namespace+'.json'));if(build.index<indices.length) {
            const record=await job.json(join(path,'records',ordinal(indices[build.index])+'.json'));let offset=build.offset;let entryCount=build.entryCount;
            if(record.namespace===folder.namespace) {const verified=await job.json(join(path,'verified',ordinal(indices[build.index])+'.json'));const bytes=fragment(job,(entryCount===0?'':',')+canonical({...verified,type:'file'}));await segment(job,inventoryPath,offset,bytes);offset+=bytes.length;entryCount++;}
            return transition(job,s,{pub:{...pub,buildState:{...build,index:build.index+1,offset,entryCount}}});
          }
          const bytes=fragment(job,'],"folderId":'+canonical(folder.folderId)+',"namespace":'+canonical(folder.namespace)+'}');await segment(job,inventoryPath,build.offset,bytes);return transition(job,s,{pub:{...pub,buildState:{...build,index:0,namespace:build.namespace+1,opened:false,offset:build.offset+bytes.length}}});
        }
        const suffix={owner:header.owner.owner,previous:header.previous?{generation:header.generation-1,inventory:header.previous.reference}:null,rootEntries:folders.map(item=>({id:item.folderId,name:item.namespace,parentId:header.scope.recordScope.rootFolderId,type:'folder'})),rootFolderId:header.scope.recordScope.rootFolderId,schemaVersion:2,sourceBoundary:{admissionId:header.admission.id,throughGeneration:header.generation,completeAdmittedHistory:true},sourceClocks:cursor.clocks};
        const bytes=fragment(job,'],'+canonical(suffix).slice(1,-1)+',"sourceSet":');await segment(job,inventoryPath,build.offset,bytes);return transition(job,s,{pub:{...pub,buildState:{...build,phase:'source-copy',offset:build.offset+bytes.length}}});
      }
      if(build.phase==='source-copy') {const bytes=await job.read(sourcePath);await segment(job,inventoryPath,build.offset,bytes);const suffix=fragment(job,',"sourceSetSha256":'+canonical(build.sourceHash)+'}\n');await segment(job,inventoryPath,build.offset+bytes.length,suffix);return transition(job,s,{pub:{...pub,buildState:{...build,phase:'seal',offset:build.offset+bytes.length+suffix.length}}});}
      need(build.phase==='seal','Unknown inventory fragment phase');const bytes=await job.read(inventoryPath);need(bytes.length===build.offset,'Inventory assembly length mismatch');need(bytes.length<=131072,'History inventory exceeds remote schema bound');const inventory=validateHistoryInventory(historyDecode(bytes,131072),header.scope,header.owner);need(canonicalTextMatches(inventory,canonical(inventory)),'Assembled inventory is not exact canonical bytes');const sha256=historyHash(bytes);const final=join(path,'inventory.json');await job.put(final,bytes);await job.putJSON(join(path,'inventory-ref.json'),{name:`history-${header.owner.owner}-${header.generation}-${build.sourceHash}.json`,parentId:header.owner.inventoryParentId,size:bytes.length,sha256});return transition(job,s,{pub:{...pub,stage:'upload'}});
    }
    if(['object-metadata','object-download'].includes(pub.stage)) {const object=await inventoryObject(job,s,pub.object);return readStep(job,s,'object',{id:pub.remoteId,name:object.name,parentId:object.parentId,size:object.size,sha256:object.sha256});}
    if(pub.stage==='anchor-before-metadata') {
      const inventory=await job.json(join(path,'verified',ordinal(cursor.count)+'.json'));const anchor={schemaVersion:1,kind:'automation-reporting-discovery-anchor',owner:header.owner.owner,generation:header.generation,inventory};await job.putJSON(join(path,'anchor.json'),anchor);return readStep(job,s,'anchor-before',header.owner.anchor);
    }
    if(['anchor-before-download','anchor-after-metadata','anchor-after-download'].includes(pub.stage))return readStep(job,s,pub.stage.startsWith('anchor-before')?'anchor-before':'anchor-after',header.owner.anchor);
    if(pub.stage==='pointer') {const bytes=await job.read(join(path,'anchor.json'));return issue(job,s,'updatePointer',{...header.owner.anchor,file_uri:join(path,'anchor.json')},{...header.owner.anchor,size:bytes.length,sha256:historyHash(bytes)});}
    need(pub.stage==='close','Unknown bounded publication stage');const inventory=await job.json(join(path,'verified',ordinal(cursor.count)+'.json'));return transition(job,s,{phase:'published',inventory});
  },{...options,window:options?.window??64});
}
async function contradiction(job,state,actionId,cell,raw=null) {
  const sha256=hash(cell);const pendingPath=join(dirname(state.path),'bounded-owner-invalidations-'+ownerKey(state));let rawRef=null;
  if(raw){const path=join(pendingPath,'raw-'+sha256+'.json');await job.put(path,raw);rawRef={path,size:raw.length,sha256:historyHash(raw)};}
  const frame={kind:'bounded-owner-invalidation',binding:ownerBinding(state),captureId:state.cursor.captureId,cursor:hash(state.cursor),actionId,contradictionSha256:sha256,cell,raw:rawRef};await job.putJSON(join(pendingPath,'pending-'+sha256+'.json'),frame);
  let head=await ownerHead(job,state);if(head.status==='incomplete')return {status:'incomplete',captureId:state.cursor.captureId,cursor:hash(state.cursor),ownerHeadCheckpoint:head.ownerHeadCheckpoint,execute:false,reason:'Pending invalidation retained; bounded owner-head continuation required'};
  for(let attempt=0;head.status!=='closed'&&attempt<2;attempt++){
    const committed=await commitOwnerTurn(job,state,head.head,{kind:'poison',generation:Math.max(state.header.generation,head.turn?.decision.generation??0),captureId:state.cursor.captureId,actionId,contradictionSha256:sha256,evidence:{path:join(pendingPath,'pending-'+sha256+'.json'),size:retainedJSON.get(frame).length,sha256:hash(frame)}});
    if(committed.status==='committed'||committed.status==='closed'){head={status:'closed',head:committed.head};break;}head=await ownerHead(job,state,committed.head);
  }
  if(head.status!=='closed')return {status:'incomplete',captureId:state.cursor.captureId,cursor:hash(state.cursor),ownerHeadCheckpoint:await headCheckpoint(job,state,head.head),execute:false,reason:'Pending invalidation retained after CAS loss; future grants must reconcile it'};
  const poison={captureId:state.cursor.captureId,actionId,contradictionSha256:sha256,ownerTurn:head.head,evidence:'Contrary variants pending or retained against exact original action'};
  const global=join(dirname(state.path),'bounded-owner-conflict-'+historyHash(state.header.owner.anchor.id)+'.json');
  const ownerConflict=await optional(job,global);
  if(!ownerConflict)await job.putJSON(global,poison);
  const local=join(state.path,'conflict.json');const captureConflict=await optional(job,local);
  if(!captureConflict)await job.putJSON(local,poison);
  if(raw)await job.put(join(state.path,'conflicting-raw',actionId+'-'+sha256+'.json'),raw);
  await job.putJSON(join(state.path,'conflicting-responses',actionId+'-'+sha256+'.json'),cell);
  return {status:'blocked',reason:'Conflicting actual response retained against exact original action',responseSha256:sha256,ownerTurn:head.head,execute:false};
}
export async function respondBoundedPublication(request,options) {
  return execute(request,async (job,request)=>{
    const s=await state(job,request);need(typeof request.actionId==='string'&&/^\d{8}$/.test(request.actionId),'Exact original action identity required');const intent=await job.json(join(s.path,'actions',request.actionId+'.json'));need(intent.captureId===request.captureId&&ordinal(intent.sequence)===request.actionId,'Response exact original action mismatch');
    assertNoCredentials(request.response);const response=structuredClone(request.response);need(response&&typeof response==='object','Actual response object required');let raw=null;
    if(intent.method==='downloadRaw'&&!response.error&&response.isError!==true) {
      need(typeof request.rawPath==='string'&&isAbsolute(request.rawPath),'Exact authenticated raw file materialization path required');const declared=await job.stat(request.rawPath);need(declared.size<=(intent.expected.size??131072),'Oversized response refused before raw acquisition');raw=await job.read(request.rawPath);need(raw.length<=(intent.expected.size??131072),'Raw response exceeds role bound');assertNoCredentials(raw.toString('utf8'));need(response.acquisition?.mode==='file-reference'&&typeof response.acquisition.reference==='string'&&response.raw&&typeof response.raw==='object','Original raw response reference required');
    }
    const cell={actionSha256:hash(intent),response,...(raw?{raw:{size:raw.length,sha256:historyHash(raw)}}:{})};if(intent.method==='updatePointer'&&response.id&&response.id!==intent.expected.id)return contradiction(job,s,request.actionId,cell,raw);if(intent.method==='uploadImmutable'){const recovery=await optional(job,join(s.path,'recoveries',request.actionId+'.json'));if(recovery&&response.id&&response.id!==recovery.id)return contradiction(job,s,request.actionId,cell,raw);}const existing=await optional(job,join(s.path,'responses',request.actionId+'.json'));
    if(existing) {if(intent.method==='uploadImmutable'&&!existing.response.id){const recovered=await optional(job,join(s.path,'recoveries',request.actionId+'.json'));if(recovered&&response.id===recovered.id){const late=await optional(job,join(s.path,'late-responses',request.actionId+'.json'));if(late){if(same(late,cell))return {status:'identical',execute:false};return contradiction(job,s,request.actionId,cell,raw);}await job.putJSON(join(s.path,'late-responses',request.actionId+'.json'),cell);return {status:'retained',execute:false};}}if(same(existing,cell))return {status:'identical',execute:false};return contradiction(job,s,request.actionId,cell,raw);}
    if(intent.jobId===job.id)job.knownActualProviderCalls++;if(raw)await job.put(join(s.path,'response-raw',request.actionId+'.json'),raw);await job.putJSON(join(s.path,'responses',request.actionId+'.json'),cell);return {status:'retained',execute:false};
  },options);
}
export async function recoverBoundedPublication(request,options) {
  return execute(request,async(job,request)=>{
    const s=await state(job,request);need(/^\d{8}$/.test(request.actionId??''),'Exact retained upload action required');const intent=await job.json(join(s.path,'actions',request.actionId+'.json'));need(intent.method==='uploadImmutable'&&typeof request.id==='string'&&/^[a-zA-Z0-9_-]{1,400}$/.test(request.id)&&request.evidence&&typeof request.evidence==='object','Explicit exact-ID recovery evidence required');assertNoCredentials(request.evidence);const response=await optional(job,join(s.path,'responses',request.actionId+'.json'));need(response?.response.id===undefined||response.response.id===request.id,'Recovery contradicts original returned ID');await job.putJSON(join(s.path,'recoveries',request.actionId+'.json'),{actionSha256:hash(intent),id:request.id,evidence:request.evidence});return {status:'recovered-id-only',execute:false,readback:'required'};
  },options);
}
export async function retryBoundedPublicationRead(request,options) {
  return execute(request,async(job,request)=>{
    const s=await state(job,request);need(!s.child&&s.cursor.phase==='publication'&&s.cursor.pub.waiting!==null&&ordinal(s.cursor.pub.waiting)===request.actionId,'Only current retained known-ID read may refresh');const intent=await job.json(join(s.path,'actions',request.actionId+'.json'));need(['getMetadata','downloadRaw'].includes(intent.method),'Only explicit known-ID read refresh is permitted');need(request.evidence&&typeof request.evidence==='object','Explicit bounded refresh evidence required');assertNoCredentials(request.evidence);const attempt=(s.cursor.pub.retry??0)+1;need(attempt<=20,'Read retry bound exhausted');await job.putJSON(join(s.path,'read-retries',request.actionId+'.json'),{actionSha256:hash(intent),attempt,evidence:request.evidence});const stage=s.cursor.pub.stage.replace(/download$/,'metadata');return transition(job,s,{pub:{...s.cursor.pub,stage,waiting:null,retry:attempt}});
  },options);
}
export async function runBoundedHistoryFile(action,path,options={}) {
  const invokedAt=Date.now();
  const operations={begin:beginBoundedHistory,advance:advanceBoundedHistory,next:advanceBoundedPublication,respond:respondBoundedPublication,recover:recoverBoundedPublication,'retry-read':retryBoundedPublicationRead};
  const launch=options.launch;
  const allowed=['stateDirectory','jobId','executionId','jobLedger','attemptDeadline','controllerDev','controllerIno'];
  if(!launch||typeof launch!=='object'||Array.isArray(launch)||Object.keys(launch).some(key=>!allowed.includes(key))||serializedSize(launch)>2048||typeof action!=='string'||!Object.hasOwn(operations,action)||typeof operations[action]!=='function'||typeof path!=='string'||!isAbsolute(path)||Buffer.byteLength(path)>1024)return {status:'controller-refused',execute:false,reason:'Bounded explicit launch metadata and known action required before request acquisition'};
  const prior=launch.jobLedger;
  if(prior&&(!exactId(prior.cursor)||Object.keys(prior).some(key=>!['cursor','size','chargedBytes','startedAt','deadline'].includes(key))||!Number.isSafeInteger(prior.size)||prior.size<1||prior.size>RESERVE||!Number.isSafeInteger(prior.chargedBytes)||prior.chargedBytes<0||prior.chargedBytes>HISTORY_JOB_CAP||!Number.isSafeInteger(prior.startedAt)||!Number.isSafeInteger(prior.deadline)||prior.deadline>prior.startedAt+120000))return {status:'controller-refused',execute:false,reason:'Exact bounded prior ledger metadata required; no body acquisition'};
  const {controllerDev,controllerIno,...request}=launch;
  if(launch.attemptDeadline!==undefined&&!stamp(launch.attemptDeadline))return {status:'controller-refused',execute:false,reason:'Exact original absolute launch deadline required'};
  request.attemptDeadline=new Date(Math.min(invokedAt+120000,Date.parse(launch.attemptDeadline??new Date(invokedAt+120000).toISOString()))).toISOString();
  const controlInput={stateDirectory:launch.stateDirectory,jobId:launch.jobId,executionId:launch.executionId,controllerDev,controllerIno,...(launch.jobLedger?{ledgerCursor:launch.jobLedger.cursor}:{})};
  const control=await boundedControllerStatus(controlInput);if(control.status!=='controller-unclaimed')return control;
  if(prior&&prior.chargedBytes+serializedSize(launch)+Buffer.byteLength(path)+1+RESERVE>HISTORY_JOB_CAP)return controllerStatus(controlInput,{refusal:'No remaining evidence allowance for request admission',control:control.control,actuals:{requestReadBytes:0,priorLedger:'unread; supplied remaining allowance exhausted',reservedRemaining:'unavailable'}});
  control.control.outputBytes=0;
  let result;try{result=await operations[action](request,{...options,controller:control.control,requestBytes:options.transportBytes??(serializedSize(launch)+Buffer.byteLength(path)+1),acquireRequest:async(job,admitted)=>{
    job.controllerProfile=await job.json(join(admitted.stateDirectory,'bounded-controller.json'),control.control.registration);
    const raw=await job.read(path);const body=historyDecode(raw);
    need(body&&typeof body==='object'&&!Array.isArray(body)&&body.stateDirectory===admitted.stateDirectory&&body.jobId===admitted.jobId&&body.executionId===admitted.executionId&&same(body.jobLedger??null,admitted.jobLedger??null),'Request body contradicts admitted launch metadata');
    need(body.attemptDeadline===undefined||body.attemptDeadline===launch.attemptDeadline,'Body cannot change admitted absolute deadline');
    need((body.directory===undefined||body.directory===job.controllerProfile.sourceRoot)&&(body.owner===undefined||body.owner===job.controllerProfile.owner)&&(body.scope===undefined||hash(body.scope)===job.controllerProfile.scopeSha256),'Request contradicts registered source, owner or scope profile');
    return {...body,...admitted};
  }});}catch(error){return controllerStatus(controlInput,{refusal:failure(error).reason,control:control.control});}
  if(result.executionAdmitted===false&&result.status==='budget-stop')return controllerStatus(controlInput,{refusal:result.reason,control:control.control,actuals:result.actuals});
  return result;
}
export async function boundedControllerStatus(input) {return controllerStatus(input);}
async function controllerStatus(input,{refusal=null,control:previousControl=null,actuals=null}={}) {
  const startedAt=previousControl?.startedAt??Date.now();const control=previousControl??{startedAt,inputBytes:serializedSize(input)+1,readBytes:0,readOps:0,writeBytes:0,writeOps:0,metadataBytes:0,outputBytes:0,maxBytes:8192,maxOps:128,maxElapsedMs:2000};
  const finish=(status,reason)=>{const result={status,execute:false,reason,...(actuals?{actuals}:{}),control};for(let index=0;index<4;index++)control.outputBytes=serializedSize(result)+1;need(control.outputBytes<=2048&&control.inputBytes+control.readBytes+control.writeBytes+control.outputBytes<=control.maxBytes,'Bounded controller output exceeded');return result;};
  if(control.inputBytes>2048)return {status:'controller-refused',execute:false,reason:'Launch metadata exceeds2048-byte bound',control:{maxInputBytes:2048}};
  try {
    need(Object.keys(input).every(key=>['stateDirectory','jobId','executionId','ledgerCursor','controllerDev','controllerIno'].includes(key))&&typeof input.stateDirectory==='string'&&isAbsolute(input.stateDirectory)&&resolve(input.stateDirectory)===input.stateDirectory&&typeof input.jobId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(input.jobId)&&typeof input.executionId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(input.executionId)&&(input.ledgerCursor===undefined||exactId(input.ledgerCursor))&&typeof input.controllerDev==='string'&&/^\d+$/.test(input.controllerDev)&&typeof input.controllerIno==='string'&&/^\d+$/.test(input.controllerIno),'Exact bounded launch identity and registered controller identity required');
    const beforeIO=()=>need(control.readOps+control.writeOps<control.maxOps&&Date.now()-startedAt<control.maxElapsedMs,'Controller operation or time bound reached');
    const stat=async path=>{beforeIO();control.readOps++;const info=await lstat(path,{bigint:true});control.metadataBytes+=statSize(info);return info;};
    const readMetadata=async(path,max)=>{
      const metadata=await stat(path);need(metadata.isFile()&&!metadata.isSymbolicLink()&&metadata.size>0&&metadata.size<=BigInt(max),'Controller metadata oversized, partial or unsafe; no body acquired');need(control.inputBytes+control.readBytes+control.writeBytes+Number(metadata.size)+2048<=control.maxBytes,'Metadata exceeds remaining controller allowance');beforeIO();const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let raw;
      try{beforeIO();const actual=await file.stat({bigint:true});control.readOps++;control.metadataBytes+=statSize(actual);need(actual.dev===metadata.dev&&actual.ino===metadata.ino&&actual.size===metadata.size&&actual.mtimeNs===metadata.mtimeNs&&actual.ctimeNs===metadata.ctimeNs,'Controller metadata identity changed');raw=Buffer.alloc(Number(actual.size));let offset=0;while(offset<raw.length){beforeIO();const part=await file.read(raw,offset,raw.length-offset,null);control.readOps++;control.readBytes+=part.bytesRead;need(part.bytesRead>0,'Partial controller metadata');offset+=part.bytesRead;}beforeIO();const tail=Buffer.alloc(1);const extra=await file.read(tail,0,1,null);control.readOps++;control.readBytes+=extra.bytesRead;need(extra.bytesRead===0,'Controller metadata grew');}finally{await file.close();}
      return {raw,value:historyDecode(raw,max)};
    };
    let parent=input.stateDirectory;while(true){const info=await stat(parent);need(info.isDirectory()&&!info.isSymbolicLink(),'Ordinary controller ancestry required');if(parent===input.stateDirectory)need(String(info.dev)===input.controllerDev&&String(info.ino)===input.controllerIno,'Registered controller identity changed');const next=dirname(parent);if(next===parent)break;parent=next;}
    const registered=await readMetadata(join(input.stateDirectory,'bounded-controller.json'),2048);const profile=registered.value;
    need(profile.schemaVersion===1&&profile.kind==='bounded-controller-registration'&&Object.keys(profile).length===8&&profile.stateDirectory===input.stateDirectory&&profile.controllerDev===input.controllerDev&&profile.controllerIno===input.controllerIno&&typeof profile.sourceRoot==='string'&&isAbsolute(profile.sourceRoot)&&resolve(profile.sourceRoot)===profile.sourceRoot&&profile.sourceRoot!==input.stateDirectory&&!profile.sourceRoot.startsWith(input.stateDirectory+sep)&&!input.stateDirectory.startsWith(profile.sourceRoot+sep)&&typeof profile.owner==='string'&&exactId(profile.scopeSha256),'Registered source/state/owner/scope profile required before file admission');
    control.registration={size:registered.raw.length,sha256:historyHash(registered.raw)};
    const directory=join(input.stateDirectory,'bounded-jobs');const info=await stat(directory);need(info.isDirectory()&&!info.isSymbolicLink(),'Ordinary registered controller claim directory required');const path=join(directory,'execution-'+input.jobId+'-'+input.executionId+'.claim');let found;
    try{found=await readMetadata(path,4096);}catch(error){if(error.code!=='ENOENT')throw error;
      if(!refusal)return finish('controller-unclaimed','Registered controller status only; no execution permission or automatic source retry');
      const bytes=historyBytes({kind:'bounded-execution-identity',jobId:input.jobId,executionId:input.executionId,previous:input.ledgerCursor??null,reservedBytes:HISTORY_JOB_CAP,status:'refused',reason:refusal.slice(0,256),knownActuals:actuals,uncertainty:'No request body acquired; remaining reservation unavailable; stop automatic retry'});
      need(bytes.length<=4096&&control.inputBytes+control.readBytes+bytes.length+2048<=control.maxBytes,'Refusal exceeds controller byte bound');beforeIO();const file=await open(path,'wx',0o600);try{await file.writeFile(bytes);await file.sync();control.writeBytes+=bytes.length;control.writeOps++;}finally{await file.close();}
      return finish('controller-refused','Durable execution refusal retained; no request acquisition or automatic retry');}
    const claim=found.value;need(claim.kind==='bounded-execution-identity'&&claim.jobId===input.jobId&&claim.executionId===input.executionId&&claim.reservedBytes===HISTORY_JOB_CAP,'Controller claim is ambiguous or unrecognized');return finish('execution-already-claimed','Original execution reservation retained; stop automatic retry');
  } catch {return finish('controller-refused','Controller safety, registration or identity is ambiguous; no deeper inspection or execution permission');}
}
