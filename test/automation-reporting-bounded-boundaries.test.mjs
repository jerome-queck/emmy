import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, rm, lstat, cp, mkdtemp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { boundedFixture, driveBounded } from './fixtures/reporting-bounded.mjs';
import { beginBoundedHistory, advanceBoundedHistory, advanceBoundedPublication, runBoundedHistoryFile, HISTORY_JOB_CAP } from '../src/automation-reporting-bounded.mjs';
import { historyBytes, historyHash } from '../src/automation-reporting-discovery.mjs';
let sequence=0;
const fresh=request=>({...request,jobId:'boundary-'+sequence++,executionId:'only'});
const ref=(value,current)=>({stateDirectory:value.stateDirectory,captureId:current.captureId,cursor:current.cursor});
async function register(value){const result=await beginBoundedHistory(fresh(value.request));assert.equal(result.status,'incomplete',JSON.stringify(result));return result;}
async function launch(request){const info=await lstat(request.stateDirectory,{bigint:true});return {stateDirectory:request.stateDirectory,jobId:request.jobId,executionId:request.executionId,controllerDev:String(info.dev),controllerIno:String(info.ino),...(request.actionId?{captureId:request.captureId,cursor:request.cursor,actionId:request.actionId}:{}),...(request.recoverReceipt?{recoverReceipt:{open:request.recoverReceipt.open}}:{}),...(request.ownerHeadCheckpoint?{ownerHeadCheckpoint:request.ownerHeadCheckpoint}:{}),...(request.jobLedger?{jobLedger:request.jobLedger}:{}),...(request.attemptDeadline?{attemptDeadline:request.attemptDeadline}:{})};}
async function fileCall(value,action,request,{path=join(value.base,'request-'+sequence+++'.json'),write=true,cli=false}={}){
  if(write)await writeFile(path,historyBytes(request));const metadata=await launch(request);
  if(!cli)return runBoundedHistoryFile(action,path,{launch:metadata});
  const child=spawnSync(process.execPath,['scripts/automation-reporting-bounded.mjs',action,'--file',path,'--launch',JSON.stringify(metadata)],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);return JSON.parse(child.stdout);
}
async function seal(value,initial){let current=initial??await beginBoundedHistory(fresh(value.request));while(current.status==='incomplete')current=await advanceBoundedHistory(fresh(ref(value,current)),{window:1});assert.equal(current.status,'prepared',JSON.stringify(current));return current;}

test('file acquisition reserves cumulative allowance before body and retains exact refusal ledger',async()=>{
  const value=await boundedFixture(1,832);try{
    await register(value);
    const initial=await fileCall(value,'begin',{...value.request,jobId:'cumulative',executionId:'one',padding:'x'.repeat(110000)},{cli:true});assert.equal(initial.status,'incomplete',JSON.stringify(initial));
    const first=await fileCall(value,'advance',{...ref(value,initial),jobId:'cumulative',executionId:'two',jobLedger:initial.jobLedger,padding:'x'.repeat(100000)},{cli:true});assert.equal(first.status,'prepared',JSON.stringify(first));
    const body={...ref(value,first),jobId:'cumulative',executionId:'three',jobLedger:first.jobLedger,padding:'x'.repeat(80000)};
    const stopped=await fileCall(value,'advance',body,{cli:true});assert.equal(stopped.status,'budget-stop');assert.equal(stopped.execute,false);assert.ok(stopped.jobLedger);assert.ok(stopped.actuals.chargedBytes<=HISTORY_JOB_CAP);
    assert.equal(stopped.actuals.readBytes-first.actuals.readBytes,first.jobLedger.size+stopped.control.registration.size,'Only prior ledger and registered profile acquired; oversized continuation body stays unread');
    const durable=await readFile(join(value.stateDirectory,'bounded-jobs','cumulative-'+stopped.jobLedger.cursor+'.json'));assert.equal(historyHash(durable),stopped.jobLedger.cursor);assert.deepEqual(JSON.parse(durable).actuals,stopped.actuals);
    const repeated=await fileCall(value,'advance',{...body,jobLedger:stopped.jobLedger,padding:'changed'},{cli:true});assert.equal(repeated.status,'execution-already-claimed');assert.equal(repeated.execute,false);assert.ok(repeated.control.readBytes<=4096);assert.equal(repeated.actuals,undefined);
  }finally{await rm(value.base,{recursive:true,force:true});}
});

test('file launch refuses unknown metadata before body and makes expired refusals durable',async()=>{
  const value=await boundedFixture(1,832);try{
    const missing=join(value.base,'absent.json');assert.equal((await runBoundedHistoryFile('begin',missing)).status,'controller-refused');await register(value);
    const request=fresh({...value.request,attemptDeadline:'2001-01-01T00:00:00Z'});const expired=await fileCall(value,'begin',request,{path:missing,write:false});assert.equal(expired.status,'controller-refused');assert.equal(expired.actuals.readBytes,0);assert.ok(expired.control.readBytes>0&&expired.control.readBytes<=4096);assert.ok(expired.control.writeBytes>0);
    const claim=JSON.parse(await readFile(join(value.stateDirectory,'bounded-jobs','execution-'+request.jobId+'-'+request.executionId+'.claim')));assert.equal(claim.status,'refused');assert.equal(claim.knownActuals.readBytes,0);assert.equal(claim.reservedBytes,HISTORY_JOB_CAP);assert.match(claim.uncertainty,/unavailable/);
    const duplicate=await fileCall(value,'begin',{...request,padding:'changed'},{path:missing,write:false,cli:true});assert.equal(duplicate.status,'execution-already-claimed');assert.equal(duplicate.execute,false);
    const extra=await runBoundedHistoryFile('begin',missing,{launch:{...await launch(fresh(value.request)),scope:value.request.scope}});assert.equal(extra.status,'controller-refused');
  }finally{await rm(value.base,{recursive:true,force:true});}
});

test('missing corrupt changed oversized and exhausted file requests cannot escape accounting or replay',async()=>{
  for(const kind of ['missing','corrupt','changed','oversized','exhausted']){
    const value=await boundedFixture(1,832);try{
      await register(value);const request=fresh(value.request);const file=join(value.base,'input.json');
      if(kind==='corrupt')await writeFile(file,'{invalid');else if(kind==='changed')await writeFile(file,historyBytes({...request,jobId:'other-job'}));else if(kind==='oversized')await writeFile(file,Buffer.alloc(HISTORY_JOB_CAP,120));else if(kind!=='missing')await writeFile(file,historyBytes(request));
      if(kind==='exhausted')request.jobLedger={cursor:'a'.repeat(64),size:100,chargedBytes:HISTORY_JOB_CAP-1,startedAt:Date.now(),deadline:Date.now()+120000};
      const result=await fileCall(value,'begin',request,{path:file,write:false});assert.equal(result.execute,false);assert.ok(['blocked','budget-stop','controller-refused'].includes(result.status),JSON.stringify(result));
      if(kind==='exhausted'){assert.ok(result.control.readBytes>0&&result.control.readBytes<=4096);assert.ok(result.control.writeBytes>0);continue;}
      assert.ok(result.jobLedger,kind);assert.ok(result.actuals.chargedBytes<=HISTORY_JOB_CAP);assert.equal(result.actuals.categories.acquired??0,result.control.registration.size+(['missing','oversized'].includes(kind)?0:(await lstat(file)).size));
      const repeated=await fileCall(value,'begin',request,{path:file,write:false,cli:true});assert.equal(repeated.status,'execution-already-claimed');assert.equal(repeated.execute,false);
    }finally{await rm(value.base,{recursive:true,force:true});}
  }
});

test('production capture clocks bracket actual first capture and final seal while original clocks stay frozen',async()=>{
  const value=await boundedFixture(1,832);try{
    const request={...value.request,synthetic:false};delete request.captureStartedAt;delete request.captureEndedAt;
    const before=Date.now();const first=await beginBoundedHistory(fresh(request));assert.equal(first.status,'incomplete');const headerPath=join(value.stateDirectory,first.captureId,'header.json');const original=await readFile(headerPath);const header=JSON.parse(original);assert.equal(header.synthetic,false);assert.equal(header.captureEndedAt,null);assert.ok(Date.parse(header.captureStartedAt)>=before&&Date.parse(header.captureStartedAt)<=Date.now());
    let current=first;while(current.phase!=='membership'){current=await advanceBoundedHistory(fresh(ref(value,current)),{window:1});assert.equal(current.status,'incomplete');}
    const beforeSeal=Date.now();current=await seal(value,current);const cursor=JSON.parse(await readFile(join(value.stateDirectory,current.captureId,'cursors',current.cursor+'.json')));assert.ok(Date.parse(cursor.captureEndedAt)>=beforeSeal&&Date.parse(cursor.captureEndedAt)<=Date.now());assert.deepEqual(await readFile(headerPath),original);assert.equal(header.evaluatedAt,value.request.evaluatedAt);assert.equal(cursor.clocks.recordedAt.min,value.records[0].recordedAt);
    for(const captureStartedAt of ['2000-01-01T00:00:00Z','2027-01-01T00:00:00Z']){const result=await beginBoundedHistory(fresh({...request,captureStartedAt,captureEndedAt:captureStartedAt}));assert.equal(result.status,'blocked');assert.match(result.reason,/synthetic/);}
    const nullable=await beginBoundedHistory(fresh({...request,captureStartedAt:null,captureEndedAt:null}));assert.equal(nullable.status,'incomplete');
    const synthetic=await seal(value,await beginBoundedHistory(fresh(value.request)));const fixed=JSON.parse(await readFile(join(value.stateDirectory,synthetic.captureId,'cursors',synthetic.cursor+'.json')));assert.equal(fixed.captureEndedAt,value.request.captureEndedAt);
  }finally{await rm(value.base,{recursive:true,force:true});}
});

test('copied-source contradiction faults preserve owner invalidation before any canonical variant',async()=>{
  const source=await readFile('src/automation-reporting-bounded.mjs','utf8');const scratch=await mkdtemp(join(tmpdir(),'bounded-contradiction-'));const evidence=[];
  const anchors=["const ownerConflict=await optional(job,global);","if(!ownerConflict)await job.putJSON(global,poison);","const local=join(state.path,'conflict.json');const captureConflict=await optional(job,local);","if(!captureConflict)await job.putJSON(local,poison);","if(raw)await job.put(join(state.path,'conflicting-raw',actionId+'-'+sha256+'.json'),raw);","await job.putJSON(join(state.path,'conflicting-responses',actionId+'-'+sha256+'.json'),cell);"];
  try{
    for(const mode of ['response','raw'])for(const [index,anchor]of anchors.entries())for(const edge of ['before','after']){
      assert.equal(source.split(anchor).length,2);const directory=join(scratch,mode+'-'+index+'-'+edge);await cp(resolve('src'),directory,{recursive:true});const fault="throw new Error('synthetic-contradiction-interruption');";await writeFile(join(directory,'automation-reporting-bounded.mjs'),source.replace(anchor,edge==='before'?fault+anchor:anchor+fault));const copied=await import(pathToFileURL(join(directory,'automation-reporting-bounded.mjs')));
      const value=await boundedFixture(1,832);try{
        const first=await driveBounded(value,{maxJobs:64});value.request={...value.request,generation:2,previous:{captureId:first.current.captureId,cursor:first.current.cursor,reference:first.current.inventory}};
        let current=await seal(value);while(true){current=await advanceBoundedPublication(fresh(ref(value,current)),{window:1});const saved=JSON.parse(await readFile(join(value.stateDirectory,current.captureId,'cursors',current.cursor+'.json')));if(saved.pub?.ancestor===null)break;assert.equal(current.status,'incomplete');}
        const actionId=mode==='raw'?'00000002':'00000000';const originalPath=join(value.stateDirectory,first.current.captureId,'responses',actionId+'.json');const original=await readFile(originalPath);const originalRawPath=join(value.stateDirectory,first.current.captureId,'response-raw',actionId+'.json');const originalRaw=mode==='raw'?await readFile(originalRawPath):null;const rawPath=join(value.base,'contrary-raw.json');const raw=originalRaw?Buffer.from(originalRaw):null;if(raw){raw[0]=91;await writeFile(rawPath,raw);}
        const response=mode==='raw'?{...JSON.parse(original).response,id:'contrary-one',acquisition:{mode:'file-reference',reference:'synthetic-contrary-one'}}:{id:'contrary-one',raw:{synthetic:true,variant:'first'}};
        const request=fresh({...ref(value,first.current),actionId,response,...(raw?{rawPath}:{})});const interrupted=await copied.respondBoundedPublication(request);assert.equal(interrupted.status,'blocked');assert.match(interrupted.reason,/synthetic-contradiction-interruption/);
        const poison=(await readdir(value.stateDirectory)).filter(name=>name.startsWith('bounded-owner-conflict-'));let variants=[];try{variants=await readdir(join(value.stateDirectory,first.current.captureId,'conflicting-responses'));}catch{}
        if(index>1||(index===1&&edge==='after')){assert.equal(poison.length,1);const next=await advanceBoundedPublication(fresh(ref(value,current)));assert.equal(next.status,'blocked');assert.equal(next.execute,false);assert.equal(next.actuals.reservedProviderCalls,0);}else{assert.equal(poison.length,0);assert.deepEqual(variants,[]);}
        const {respondBoundedPublication}=await import('../src/automation-reporting-bounded.mjs');const retained=await respondBoundedPublication(fresh(request));assert.equal(retained.status,'blocked');const again=await respondBoundedPublication(fresh(request));assert.equal(again.responseSha256,retained.responseSha256);const secondResponse=mode==='raw'?{...response,id:'contrary-two',acquisition:{mode:'file-reference',reference:'synthetic-contrary-two'}}:{id:'contrary-two',raw:{synthetic:true,variant:'second'}};const second=await respondBoundedPublication(fresh({...request,response:secondResponse}));assert.notEqual(second.responseSha256,retained.responseSha256);
        const cells=await readdir(join(value.stateDirectory,first.current.captureId,'conflicting-responses'));assert.equal(cells.length,2);const actual=[];for(const cell of cells)actual.push(JSON.parse(await readFile(join(value.stateDirectory,first.current.captureId,'conflicting-responses',cell))).response);assert.deepEqual(actual.sort((a,b)=>a.id.localeCompare(b.id)),[request.response,secondResponse]);if(raw){assert.deepEqual(await readFile(originalRawPath),originalRaw);for(const cell of cells){const saved=JSON.parse(await readFile(join(value.stateDirectory,first.current.captureId,'conflicting-responses',cell)));const retainedRaw=await readFile(join(value.stateDirectory,first.current.captureId,'conflicting-raw',cell));assert.deepEqual(retainedRaw,raw);assert.equal(saved.raw.sha256,historyHash(retainedRaw));}}assert.deepEqual(await readFile(originalPath),original);const blocked=await advanceBoundedPublication(fresh(ref(value,current)));assert.equal(blocked.status,'blocked');assert.equal(blocked.execute,false);assert.equal(blocked.actuals.reservedProviderCalls,0);evidence.push({mode,index,edge,sourceSha256:historyHash(Buffer.from(source)),poisoned:poison.length===1,variants:cells.length});
      }finally{await rm(value.base,{recursive:true,force:true});}
    }
    await mkdir('.local/consumer-evidence',{recursive:true});await writeFile('.local/consumer-evidence/bounded-contradiction-faults.json',JSON.stringify(evidence,null,2));
  }finally{await rm(scratch,{recursive:true,force:true});}
});

test('generated bounded CLI executes outside checkout with exact source semantics and launch refusal',async()=>{
  const value=await boundedFixture(1,832);try{
    await register(value);const build=spawnSync(process.execPath,['scripts/build-reporting-cloud.mjs'],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);const manifest=JSON.parse(await readFile('.local/reporting-cloud/manifest.json'));const artifact=await readFile('.local/reporting-cloud/'+manifest.artifact);assert.equal(historyHash(artifact),manifest.sha256);const executable=join(value.base,'cloud.mjs');await writeFile(executable,artifact);
    const request=fresh(value.request);const metadata=await launch(request);const input=join(value.base,'generated-request.json');await writeFile(input,historyBytes(request));const args=[executable,'history-bounded','begin','--file',input,'--launch',JSON.stringify(metadata)];const run=()=>spawnSync(process.execPath,args,{cwd:value.base,encoding:'utf8'});const initial=run();assert.equal(initial.status,0,initial.stderr);const actual=JSON.parse(initial.stdout);const expected=await beginBoundedHistory(fresh(value.request));for(const key of ['status','captureId','cursor','phase','execute'])assert.equal(actual[key],expected[key],key);assert.ok(actual.actuals.chargedBytes<=HISTORY_JOB_CAP);
    await rm(input);const repeated=run();assert.equal(repeated.status,0,repeated.stderr);assert.equal(JSON.parse(repeated.stdout).status,'execution-already-claimed');assert.equal(JSON.parse(repeated.stdout).execute,false);
    const unsafe=spawnSync(process.execPath,[executable,'history-bounded','begin','--file',input],{cwd:value.base,encoding:'utf8'});assert.equal(unsafe.status,1);assert.match(unsafe.stderr,/launch/);
  }finally{await rm(value.base,{recursive:true,force:true});}
});

test('unregistered and source-overlapping file launches refuse before bodies or source writes',async()=>{
  for(const overlap of [false,true]){
    const value=await boundedFixture(1,832);try{
      const stateDirectory=overlap?value.directory:value.stateDirectory;const before=await readdir(stateDirectory);const request=fresh({...value.request,stateDirectory});const path=join(value.base,'unregistered.json');await writeFile(path,historyBytes(request));const result=await runBoundedHistoryFile('begin',path,{launch:await launch(request)});assert.equal(result.status,'controller-refused');assert.equal(result.execute,false);assert.equal(result.control.readBytes,0);assert.equal(result.control.writeBytes,0);assert.deepEqual(await readdir(stateDirectory),before);
    }finally{await rm(value.base,{recursive:true,force:true});}
  }
});

test('registered profile rejects changed source owner and scope before source observations',async()=>{
  for(const kind of ['source','owner','scope']){
    const value=await boundedFixture(1,832);try{
      await register(value);const request=fresh(value.request);if(kind==='source')request.directory=value.stateDirectory;if(kind==='owner')request.owner='another-owner';if(kind==='scope')request.scope={...request.scope,recordScope:{...request.scope.recordScope,rootFolderId:'changed-root'}};
      const sourceBefore=await readdir(value.directory);const result=await fileCall(value,'begin',request);assert.equal(result.status,'blocked');assert.match(result.reason,/registered source, owner or scope/);assert.ok(result.jobLedger);assert.equal(result.actuals.reservedProviderCalls,0);assert.deepEqual(await readdir(value.directory),sourceBefore);assert.equal(result.actuals.readBytes,result.control.registration.size+(await lstat(join(value.base,(await readdir(value.base)).find(name=>name.startsWith('request-'))))).size);
    }finally{await rm(value.base,{recursive:true,force:true});}
  }
});

test('large error reasons retain exact known bytes and bounded durable output',async()=>{
  const value=await boundedFixture(1,832);try{
    const bad=fresh({...value.request,directory:'/'+'x'.repeat(180000)});const direct=await beginBoundedHistory(bad);assert.equal(direct.status,'blocked');assert.equal(direct.reasonTruncated,true);assert.ok(direct.reason.length<=256);assert.ok(direct.jobLedger);assert.ok(direct.actuals.chargedBytes<=HISTORY_JOB_CAP);
    await register(value);const file=await fileCall(value,'begin',fresh(bad));assert.equal(file.status,'blocked');assert.ok(file.jobLedger);assert.match(file.reason,/registered source/);assert.ok(file.actuals.readBytes>180000);const bytes=await readFile(join(value.stateDirectory,'bounded-jobs',file.jobId+'-'+file.jobLedger.cursor+'.json'));assert.equal(historyHash(bytes),file.jobLedger.cursor);assert.deepEqual(JSON.parse(bytes).actuals,file.actuals);assert.ok(Buffer.byteLength(JSON.stringify(file))<=8192);
  }finally{await rm(value.base,{recursive:true,force:true});}
});

test('unknown and inherited operation names refuse through actual CLI before any input or state work',async()=>{
  const value=await boundedFixture(1,832);try{await register(value);const request=fresh(value.request);const metadata=await launch(request);const before=await readdir(join(value.stateDirectory,'bounded-jobs'));const absent=join(value.base,'unread-missing.json');for(const action of ['unknown','constructor','toString','__proto__']){const result=spawnSync(process.execPath,['scripts/automation-reporting-bounded.mjs',action,'--file',absent,'--launch',JSON.stringify(metadata)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const refused=JSON.parse(result.stdout);assert.equal(refused.status,'controller-refused');assert.equal(refused.execute,false);assert.deepEqual(await readdir(join(value.stateDirectory,'bounded-jobs')),before);}}finally{await rm(value.base,{recursive:true,force:true});}
});
