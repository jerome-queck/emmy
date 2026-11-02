import test from 'node:test';
import assert from 'node:assert/strict';
test('full-history publication and discovery surface exists', async () => {
  let publisher = {}; let discovery = {};
  try { publisher = await import('../src/automation-reporting-history.mjs'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  try { discovery = await import('../src/automation-reporting-discovery.mjs'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.deepEqual(['prepareHistoryBatch','publicationAction','recordPublicationResponse','recoverPublicationId','publishHistory'].filter(name => typeof publisher[name] !== 'function'), []);
  assert.deepEqual(['planDiscovery','consumeDiscovery'].filter(name => typeof discovery[name] !== 'function'), []);
});
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareHistoryBatch, publicationAction, recordPublicationResponse, recoverPublicationId, publishHistory } from '../src/automation-reporting-history.mjs';
import { historyBytes, historyDecode, historyHash, planDiscovery, consumeDiscovery, validateRemoteMetadata } from '../src/automation-reporting-discovery.mjs';
import { transportAutomationReporting, sanitizeRecords } from '../src/automation-reporting-transport.mjs';
import { planUpkeep, applyUpkeep } from '../src/automation-reporting-upkeep.mjs';
import { CAPTURE_LIMITS } from '../src/automation-reporting-capture.mjs';
import { canonical, recordDigest } from '../src/automation-reporting.mjs';
import { runRecord, evaluatedAt } from './fixtures/reporting-capture.mjs';
import { FakeDrive, historyScope, emptyPacket } from './fixtures/reporting-history.mjs';
async function setup(records=[runRecord()]) {
  const root=await mkdtemp(join(await realpath(tmpdir()),'emmy-history-'));const directory=join(root,'Records');const stateDirectory=join(root,'private-state');await mkdir(join(directory,'own'),{recursive:true});await mkdir(stateDirectory);
  for(const record of records) await writeFile(join(directory,'own',recordDigest(record)+'.json'),historyBytes(record));
  const scope=historyScope(records);const drive=new FakeDrive(scope);const input={directory,stateDirectory,scope,owner:'producer',generation:1,admission:{id:'admitted-producer-history',completeAdmittedHistory:true},captureStartedAt:'2026-01-02T00:00:00Z',captureEndedAt:'2026-01-02T00:00:01Z'};
  return {root,directory,stateDirectory,scope,drive,input};
}
async function prepared(value) {const batch=await prepareHistoryBatch(value.input,{evaluatedAt});return {stateDirectory:value.stateDirectory,batchId:batch.batchId};}
const consume=(value,packet,options={})=>consumeDiscovery(historyBytes(value.scope),historyBytes(packet),{action:'inspect'},{evaluatedAt,...options});

test('async adapter actually publishes all source bytes and closes generation then exact anchor',async()=>{
  const first=runRecord();const later={...first,revision:1,previous:recordDigest(first),recordedAt:evaluatedAt};const conflict={...later,data:{...later.data,evidenceRefs:['conflicting-source']}};
  const receipt={...runRecord('publication-one'),kind:'publication',recordedAt:evaluatedAt,data:{subject:recordDigest(first),state:'verified',evidenceRef:'synthetic-actual-target-readback'}};
  const value=await setup([first,later,conflict,runRecord('failed-attempt'),receipt]);
  try {const request=await prepared(value);const result=await publishHistory(request,value.drive);assert.equal(result.status,'published');assert.equal(value.drive.calls.filter(call=>call.method==='uploadImmutable').length,6);
    const packet=await value.drive.packet(value.scope);const view=consume(value,packet);assert.equal(view.scan.records,5);assert.equal(view.scan.complete,true);assert.equal(view.status,'needs-attention');assert.ok(view.findings.some(f=>f.startsWith('conflict:')));assert.equal(view.publications.length,1);assert.equal(view.runs[0].data.report,null);
    for(const record of [first,later,conflict,receipt]) assert.ok(packet.objects.some(object=>object.download.bytesBase64===historyBytes(record).toString('base64')));
    assert.equal(planDiscovery(historyBytes(value.scope),historyBytes(packet)).status,'acquired');assert.notEqual(view.resultSha256,consumeDiscovery(Buffer.concat([Buffer.from(' '),historyBytes(value.scope)]),historyBytes(packet),{action:'inspect'},{evaluatedAt}).resultSha256);const count=value.drive.calls.length;assert.deepEqual(await publishHistory(request,value.drive),result);assert.equal(value.drive.calls.length,count);
    const events=await readdir(join(value.stateDirectory,request.batchId));const all=await Promise.all(events.filter(name=>/^\d/.test(name)).map(name=>readFile(join(value.stateDirectory,request.batchId,name),'utf8')));assert.ok(all.findIndex(bytes=>bytes.includes('generation-closed'))<all.findIndex(bytes=>bytes.includes('anchor-update')));
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('pending upload never blindly retries; explicit exact ID recovery performs metadata/full byte reads',async()=>{
  const value=await setup();try {const request=await prepared(value);const next=await publicationAction(request);assert.equal(next.execute,true);const response=await value.drive.uploadImmutable(next.action.args);assert.equal((await publicationAction(request)).status,'uncertain');assert.equal((await publishHistory(request,value.drive)).status,'uncertain');
    await recoverPublicationId({...request,actionId:next.action.actionId,id:response.id,evidence:{source:'retained-exact-upload-response',response}});
    assert.equal((await publishHistory(request,value.drive)).status,'published');assert.equal(value.drive.calls.filter(call=>call.method==='uploadImmutable').length,2);
    await assert.rejects(recoverPublicationId({...request,actionId:next.action.actionId,id:'wrong',evidence:{source:'name-search'}}));
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('concurrent intent claim produces one permitted upload, idempotent response and conflicting response refusal',async()=>{
  const value=await setup();try {const request=await prepared(value);const actions=await Promise.all([publicationAction(request),publicationAction(request)]);assert.equal(actions.filter(item=>item.execute).length,1);
    const action=actions.find(item=>item.execute).action;const response=await value.drive.uploadImmutable(action.args);await recordPublicationResponse({...request,actionId:action.actionId,response});assert.equal((await recordPublicationResponse({...request,actionId:action.actionId,response})).status,'identical');await assert.rejects(recordPublicationResponse({...request,actionId:action.actionId,response:{...response,id:'wrong'}}));
    assert.equal((await publishHistory(request,value.drive)).status,'published');
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('exact remote metadata/full-byte corruption refuses clean publication and retains actual response',async()=>{
  for(const [method,change] of [
    ['getMetadata',v=>({...v,id:'wrong'})],['getMetadata',v=>({...v,parents:['academic-folder']})],['getMetadata',v=>({...v,size:v.size+1})],['getMetadata',v=>({...v,mimeType:'application/vnd.google-apps.document'})],['getMetadata',v=>({...v,name:'wrong.json'})],
    ['downloadRaw',v=>({...v,id:'wrong'})],['downloadRaw',v=>({...v,complete:false})],['downloadRaw',v=>({...v,bytesBase64:Buffer.from('truncated').toString('base64')})],['downloadRaw',v=>({...v,bytesBase64:Buffer.from(Buffer.from(v.bytesBase64,'base64').toString().replace('completed','skipped  ')).toString('base64')})],['downloadRaw',v=>({...v,acquisition:{mode:'inline-provider-base64',reference:'wrong'}})]
  ]) {const value=await setup();try {const request=await prepared(value);const original=value.drive[method].bind(value.drive);value.drive[method]=async args=>change(await original(args));const result=await publishHistory(request,value.drive);assert.equal(result.status,'blocked',method);assert.equal(result.generationClosed,false);const journal=await readdir(join(value.stateDirectory,request.batchId));assert.ok(journal.length>=5);assert.equal(value.drive.calls.filter(call=>call.method==='updatePointer').length,0);
    } finally {await rm(value.root,{recursive:true,force:true});}}
});

test('generation closure survives pointer failure; pointer history never fabricates publication/delivery receipts',async()=>{
  const value=await setup();try {const request=await prepared(value);value.drive.updatePointer=async()=>{throw new Error('provider update failure');};const result=await publishHistory(request,value.drive);assert.equal(result.status,'uncertain');assert.equal(result.generationClosed,true);assert.ok(result.reason.includes('future effect'));
    assert.equal((await readdir(join(value.directory,'own'))).length,1);
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('discovery acquisition is exact metadata first and raw only after approved metadata validation',async()=>{
  const value=await setup();try {const packet=emptyPacket();let plan=planDiscovery(historyBytes(value.scope),historyBytes(packet));assert.equal(plan.steps[0].method,'get_file_metadata');assert.equal(plan.steps[0].args.fileId,'anchor-one');
    const request=await prepared(value);await publishHistory(request,value.drive);packet.anchorsBefore=[{metadata:await value.drive.getMetadata({id:'anchor-one'}),download:null}];plan=planDiscovery(historyBytes(value.scope),historyBytes(packet));assert.equal(plan.steps[0].method,'fetch');assert.equal(plan.steps[0].args.include_base64,false);
    packet.anchorsBefore[0].metadata.parents=['academic-folder'];assert.throws(()=>planDiscovery(historyBytes(value.scope),historyBytes(packet)),/location/);
    const complete=await value.drive.packet(value.scope);for(const alter of [p=>p.objects.pop(),p=>p.inventories.pop(),p=>p.anchorsAfter.pop()]) {const changed=structuredClone(complete);alter(changed);assert.throws(()=>consume(value,changed),/Incomplete/);}
    for(const alter of [p=>{p.objects[0].metadata.parents=['wrong'];},p=>{p.objects[0].metadata.size++;},p=>{p.objects[0].download.bytesBase64='eA==';},p=>{p.anchorsAfter[0].download.bytesBase64='eA==';},p=>{p.inventories[0].metadata.id='wrong';}]) {const changed=structuredClone(complete);alter(changed);assert.throws(()=>consume(value,changed));}
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('full source capture rejects concurrent append, partial pending entries, missing ancestry and shared anchors',async()=>{
  const value=await setup();try {await assert.rejects(prepareHistoryBatch(value.input,{evaluatedAt,checkpoint:async name=>{if(name==='source-captured'){const record=runRecord('concurrent');await writeFile(join(value.directory,'own',recordDigest(record)+'.json'),historyBytes(record));}}}),/changed/);
    await writeFile(join(value.directory,'own','.pending-retained'),'incomplete');await assert.rejects(prepared(value),/pending/);
    const scope=structuredClone(value.scope);scope.owners.push({...scope.owners[0],owner:'other'});await assert.rejects(prepareHistoryBatch({...value.input,scope}),/anchor|writer/);
    await assert.rejects(prepareHistoryBatch({...value.input,stateDirectory:value.directory}),/outside/);
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('credential-shaped raw responses never enter immutable state',async()=>{
  const value=await setup();try {const request=await prepared(value);const next=await publicationAction(request);await assert.rejects(recordPublicationResponse({...request,actionId:next.action.actionId,response:{id:'remote-secret',raw:{authorization:'Bearer sk-abcdefghijklmnopqrstuvwxyz1234567890'}}}));const files=await readdir(join(value.stateDirectory,request.batchId));assert.equal(files.filter(name=>/^\d/.test(name)).length,1);assert.equal((await publicationAction(request)).status,'uncertain');
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('bootstrap exact empty anchor is publication-pending; new generations retain complete lineage and checkpoint',async()=>{
  const value=await setup();try {
    const bootstrap=emptyPacket();bootstrap.anchorsBefore=[await value.drive.readback('anchor-one')];assert.equal(planDiscovery(historyBytes(value.scope),historyBytes(bootstrap)).status,'publication-pending');assert.throws(()=>consume(value,bootstrap),/Incomplete/);
    const firstRequest=await prepared(value);const originalAnchor=value.drive.files.get('anchor-one').bytesBase64;value.drive.files.get('anchor-one').bytesBase64=Buffer.from(' '+Buffer.from(originalAnchor,'base64').toString()).toString('base64');const refused=await publishHistory(firstRequest,value.drive);assert.equal(refused.status,'blocked');assert.match(refused.reason,/canonical/);value.drive.files.get('anchor-one').bytesBase64=originalAnchor;const files=await readdir(join(value.stateDirectory,firstRequest.batchId));const failedIntents=(await Promise.all(files.filter(name=>/^\d/.test(name)).map(async name=>JSON.parse(await readFile(join(value.stateDirectory,firstRequest.batchId,name),'utf8'))))).filter(event=>event.kind==='intent');const publisher=await import('../src/automation-reporting-history.mjs');await publisher.retryPublicationRead({...firstRequest,actionId:failedIntents.at(-1).actionId,evidence:{reason:'restore-explicit-canonical-bootstrap-bytes'}});const first=await publishHistory(firstRequest,value.drive);const firstPacket=await value.drive.packet(value.scope);const firstView=consume(value,firstPacket);const checkpoint=firstView.discovery.checkpoint;
    const priorInventory=historyDecode(Buffer.from(value.drive.files.get(first.inventory.id).bytesBase64,'base64'));
    const record=runRecord('second-attempt');await writeFile(join(value.directory,'own',recordDigest(record)+'.json'),historyBytes(record));
    const secondBatch=await prepareHistoryBatch({...value.input,generation:2,previous:{reference:first.inventory,inventory:priorInventory},captureStartedAt:'2026-01-03T00:00:00Z',captureEndedAt:'2026-01-03T00:00:01Z'},{evaluatedAt:'2026-01-03T00:00:02Z'});
    const second=await publishHistory({stateDirectory:value.stateDirectory,batchId:secondBatch.batchId},value.drive);assert.equal(second.status,'published');const packet=await value.drive.packet(value.scope);assert.equal(packet.inventories.length,2);assert.equal(consume(value,packet,{checkpoint}).scan.records,2);
    const newCheckpoint=consume(value,packet).discovery.checkpoint;assert.throws(()=>consume(value,firstPacket,{checkpoint:newCheckpoint}),/regression|fork/);
    const fork=structuredClone(checkpoint);fork.owners[0].inventory.id='fork-id';assert.throws(()=>consume(value,packet,{checkpoint:fork}),/regression|fork/);
    await rm(join(value.directory,'own',recordDigest(runRecord())+'.json'));await assert.rejects(prepareHistoryBatch({...value.input,generation:2,previous:{reference:first.inventory,inventory:priorInventory},captureStartedAt:'2026-01-03T00:00:00Z',captureEndedAt:'2026-01-03T00:00:01Z'}),/regression/);
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('standalone discovers and consumes exact immutable generations outside checkout after fresh process',async()=>{
  const value=await setup();try {const request=await prepared(value);await publishHistory(request,value.drive);const packet=await value.drive.packet(value.scope);
    const build=spawnSync(process.execPath,['scripts/build-reporting-cloud.mjs'],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);const artifact=join(value.root,'cloud.mjs');await writeFile(artifact,await readFile('.local/reporting-cloud/automation-reporting-cloud-v2.mjs'));const scopePath=join(value.root,'scope.json');const packetPath=join(value.root,'capture.json');await writeFile(scopePath,historyBytes(value.scope));await writeFile(packetPath,historyBytes(packet));
    const run=command=>spawnSync(process.execPath,[artifact,command,'--scope',scopePath,'--capture',packetPath,...(command==='discover-consume'?['--action','inspect','--evaluated-at',evaluatedAt]:[])],{cwd:value.root,encoding:'utf8'});
    assert.equal(run('discover-plan').status,0);const output=run('discover-consume');assert.equal(output.status,0,output.stderr);assert.equal(JSON.parse(output.stdout).scan.records,1);
    for(const collection of ['anchorsBefore','anchorsAfter','inventories','objects'])for(const value of packet[collection])value.metadata.trashed=null;
    await writeFile(packetPath,historyBytes(packet));const unknown=run('discover-consume');assert.equal(unknown.status,0,unknown.stderr);assert.equal(JSON.parse(unknown.stdout).discovery.activeAvailability,'not-established');assert.ok(JSON.parse(unknown.stdout).discovery.trashObservations.every(item=>item.trashed===null));
    const provider=join(value.root,'metadata.json');const response={structuredContent:{id:'one',title:'one.json',parent_ids:['parent'],mime_type:'application/json',size:'12'}};await writeFile(provider,historyBytes(response));
    const normalize=()=>spawnSync(process.execPath,[artifact,'discover-metadata','--file',provider],{cwd:value.root,encoding:'utf8'});const normalized=normalize();assert.equal(normalized.status,0,normalized.stderr);assert.equal(JSON.parse(normalized.stdout).trashed,null);assert.deepEqual(JSON.parse(normalized.stdout).raw,response);assert.deepEqual(historyDecode(await readFile(provider)),response);
    response.structuredContent.trashed=true;await writeFile(provider,historyBytes(response));assert.equal(normalize().status,1);
    packet.objects=[];await writeFile(packetPath,historyBytes(packet));assert.equal(run('discover-consume').status,1);
    const cliRequest=join(value.root,'request.json');await writeFile(cliRequest,historyBytes(request));const next=spawnSync(process.execPath,['scripts/automation-reporting-history.mjs','next','--file',cliRequest],{encoding:'utf8'});assert.equal(next.status,0,next.stderr);assert.equal(JSON.parse(next.stdout).status,'published');
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('fresh-process crash at every durable boundary retains source and refuses unknown creates',async()=>{
  const baseline=await setup();let total;
  const persisted=kind=>['bytes-prepared','bytes-committed',kind+'-persisted'];
  const readAction=[...persisted('intent'),'remote-effect-returned',...persisted('response')];
  const mutationAction=[...persisted('intent'),'bytes-prepared','bytes-committed','remote-effect-returned',...persisted('response')];
  const immutableObject=[...mutationAction,...readAction,...readAction];
  const expectedCheckpoints=['source-captured','bytes-prepared','bytes-committed','batch-prepared','bytes-prepared','bytes-committed','owner-claimed',...immutableObject,...immutableObject,...persisted('generation-closed'),...readAction,...readAction,...mutationAction,...readAction,...readAction,...persisted('pointer-closed')];
  const worker=(value,cutoff)=>spawnSync(process.execPath,['test/fixtures/reporting-history-worker.mjs',value.root,String(cutoff)],{encoding:'utf8'});
  try {await writeFile(join(baseline.root,'input.json'),historyBytes(baseline.input));await baseline.drive.save(join(baseline.root,'remote.json'));const run=worker(baseline,0);assert.equal(run.status,0,run.stderr);const baselineOutput=JSON.parse(run.stdout);assert.equal(baselineOutput.result.status,'published','crash baseline must publish');assert.deepEqual(JSON.parse(await readFile(join(baseline.root,'trace.json'))),expectedCheckpoints,'declared exact checkpoint sequence');total=baselineOutput.count;assert.equal(total,96,'declared durable checkpoint count');await mkdir('.local/consumer-evidence',{recursive:true});await writeFile('.local/consumer-evidence/history-baseline-checkpoints.json',await readFile(join(baseline.root,'trace.json')));} finally {await rm(baseline.root,{recursive:true,force:true});}
  const outcomes=[];
  for(let cutoff=1;cutoff<=total;cutoff++) {
    const value=await setup();try {
      await writeFile(join(value.root,'input.json'),historyBytes(value.input));await value.drive.save(join(value.root,'remote.json'));
      const stopped=worker(value,cutoff);assert.equal(stopped.status,73,`cutoff ${cutoff}: ${stopped.stderr}`);
      let restarted=worker(value,0);assert.equal(restarted.status,0,`restart ${cutoff}: ${restarted.stderr}`);let output=JSON.parse(restarted.stdout);let drive=await FakeDrive.load(join(value.root,'remote.json'));
      if(output.result.status==='uncertain') {
        const next=await publicationAction({stateDirectory:value.stateDirectory,batchId:output.batch.batchId});let proof=null;try {proof=JSON.parse(await readFile(join(value.root,'last-return.json')));}catch(error){if(error.code!=='ENOENT')throw error;}
        if(next.action?.method==='uploadImmutable' && proof?.method==='uploadImmutable') {await recoverPublicationId({stateDirectory:value.stateDirectory,batchId:output.batch.batchId,actionId:next.action.actionId,id:proof.response.id,evidence:{source:'synthetic-retained-provider-response',response:proof.response}});restarted=worker(value,0);assert.equal(restarted.status,0,restarted.stderr);output=JSON.parse(restarted.stdout);drive=await FakeDrive.load(join(value.root,'remote.json'));}
        else {
          assert.equal(next.execute,false);
          if(next.action?.method==='uploadImmutable') {assert.ok([9,10,11,12,32,33,34,35].includes(cutoff),'unknown create only at declared cutoffs');assert.notEqual(proof?.method,'uploadImmutable');outcomes.push({cutoff,status:'uncertain-no-returned-id'});}
          else {
            assert.ok([72,73,74,75].includes(cutoff),'pointer uncertainty only at declared cutoffs');assert.equal(next.generationClosed,true);assert.equal(next.inventory.id,'remote-2');
            const events=await Promise.all((await readdir(join(value.stateDirectory,output.batch.batchId))).filter(name=>/^\d/.test(name)).map(async name=>JSON.parse(await readFile(join(value.stateDirectory,output.batch.batchId,name)))));
            const closed=events.filter(event=>event.kind==='generation-closed');assert.equal(closed.length,1);assert.deepEqual(closed[0].inventory,next.inventory);
            const intent=events.find(event=>event.kind==='intent'&&event.method==='updatePointer');assert.equal(intent.actionId,'anchor-update-0');assert.equal(intent.args.id,value.scope.owners[0].anchor.id);assert.equal(historyDecode(Buffer.from(intent.args.bytesBase64,'base64')).inventory.id,closed[0].inventory.id);
            assert.equal(events.some(event=>event.kind==='pointer-closed'),false);assert.equal(drive.calls.filter(call=>call.method==='updatePointer').length,0);assert.equal(drive.calls.filter(call=>call.method==='uploadImmutable').length,2);
            outcomes.push({cutoff,status:'uncertain-pointer-no-effect-proof'});
          }
          continue;
        }
      }
      assert.equal(output.result.status,'published',`cutoff ${cutoff}: ${JSON.stringify(output.result)}`);assert.equal(drive.calls.filter(call=>call.method==='uploadImmutable').length,2,`no duplicate upload cutoff ${cutoff}`);assert.equal(consume(value,await drive.packet(value.scope)).scan.records,1);assert.equal((await readdir(join(value.directory,'own'))).length,1);outcomes.push({cutoff,status:'published'});
    } finally {await rm(value.root,{recursive:true,force:true});}
  }
  assert.deepEqual(outcomes.filter(item=>item.status==='uncertain-no-returned-id').map(item=>item.cutoff),[9,10,11,12,32,33,34,35]);assert.deepEqual(outcomes.filter(item=>item.status==='uncertain-pointer-no-effect-proof').map(item=>item.cutoff),[72,73,74,75]);assert.equal(outcomes.filter(item=>item.status==='published').length,84);
  await mkdir('.local/consumer-evidence',{recursive:true});await writeFile('.local/consumer-evidence/history-crash-boundaries.json',JSON.stringify({total,outcomes},null,2));
});

test('same-owner competing batches serialize locally and old generation resumes cannot overwrite newer anchor',async()=>{
  const value=await setup();try {const one=await prepared(value);const twoBatch=await prepareHistoryBatch({...value.input,captureEndedAt:'2026-01-02T00:00:02Z'});const two={stateDirectory:value.stateDirectory,batchId:twoBatch.batchId};const result=await Promise.all([publicationAction(one),publicationAction(two)]);assert.equal(result.filter(item=>item.execute).length,1);assert.equal(result.filter(item=>item.status==='blocked').length,1);
    const active=result[0].execute?one:two;const first=await publishHistoryAfterRetainedIntent(value,active,result.find(item=>item.execute));assert.equal(first.status,'published');
    const prior=historyDecode(Buffer.from(value.drive.files.get(first.inventory.id).bytesBase64,'base64'));const second=await prepareHistoryBatch({...value.input,generation:2,previous:{reference:first.inventory,inventory:prior},captureStartedAt:'2026-01-03T00:00:00Z',captureEndedAt:'2026-01-03T00:00:01Z'});assert.equal((await publishHistory({stateDirectory:value.stateDirectory,batchId:second.batchId},value.drive)).status,'published');const calls=value.drive.calls.length;assert.equal((await publishHistory(active,value.drive)).status,'blocked');assert.equal(value.drive.calls.length,calls);
  } finally {await rm(value.root,{recursive:true,force:true});}
});
async function publishHistoryAfterRetainedIntent(value,request,next) {const response=await value.drive[next.action.method](next.action.args);await recordPublicationResponse({...request,actionId:next.action.actionId,response});return publishHistory(request,value.drive);}

test('lost pointer response reconciles exact ID and refuses a later external anchor fork',async()=>{
  const value=await setup();try {const request=await prepared(value);let done=false;
    while(!done) {const next=await publicationAction(request);assert.equal(next.status,'action-required');const response=await value.drive[next.action.method](next.action.args);if(next.action.method==='updatePointer'){done=true;break;}await recordPublicationResponse({...request,actionId:next.action.actionId,response});}
    const fork={schemaVersion:1,kind:'automation-reporting-discovery-anchor',owner:'producer',generation:9,inventory:{id:'later-inventory',parentId:'config-folder',name:'later.json',size:1,sha256:'0'.repeat(64)}};value.drive.files.get('anchor-one').bytesBase64=historyBytes(fork).toString('base64');const updates=value.drive.calls.filter(call=>call.method==='updatePointer').length;
    const result=await publishHistory(request,value.drive);assert.equal(result.status,'blocked');assert.equal(result.generationClosed,true);assert.equal(value.drive.calls.filter(call=>call.method==='updatePointer').length,updates);assert.equal(JSON.parse(Buffer.from(value.drive.files.get('anchor-one').bytesBase64,'base64')).generation,9);
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('paired actual-source mutants return their designated wrong acceptance; baseline and restored refuse',async()=>{
  const cases=[
    {name:'double-create',file:'automation-reporting-history',from:"status:!created&&['uploadImmutable','updatePointer'].includes(next.value.method)?'uncertain':'action-required',execute:created||!['uploadImmutable','updatePointer'].includes(next.value.method)",to:"status:'action-required',execute:true",run:async(publisher,discovery,value)=>{const batch=await publisher.prepareHistoryBatch(value.input);const request={stateDirectory:value.stateDirectory,batchId:batch.batchId};const first=await publisher.publicationAction(request);const second=await publisher.publicationAction(request);for(const next of [first,second])if(next.execute&&next.status==='action-required')await value.drive.uploadImmutable(next.action.args);return {wrong:value.drive.counter===2,uploadCalls:value.drive.counter};}},
    {name:'pointer-regression',file:'automation-reporting-history',from:"status:!created&&['uploadImmutable','updatePointer'].includes(next.value.method)?'uncertain':'action-required',execute:created||!['uploadImmutable','updatePointer'].includes(next.value.method)",to:"status:'action-required',execute:true",run:async(publisher,discovery,value)=>{
      const batch=await publisher.prepareHistoryBatch(value.input);const request={stateDirectory:value.stateDirectory,batchId:batch.batchId};
      for(let index=0;index<30;index++){const next=await publisher.publicationAction(request);await publisher.recordPublicationResponse({...request,actionId:next.action.actionId,response:await value.drive[next.action.method](next.action.args)});if(next.action.actionId==='anchor-before:download')break;}
      const callbacks=await Promise.all([publisher.publicationAction(request),publisher.publicationAction(request)]);const winner=callbacks.find(next=>next.execute);const loser=callbacks.find(next=>next!==winner);
      await publisher.recordPublicationResponse({...request,actionId:winner.action.actionId,response:await value.drive.updatePointer(winner.action.args)});
      const one=await publisher.publishHistory(request,value.drive);const inventory=discovery.historyDecode(Buffer.from(value.drive.files.get(one.inventory.id).bytesBase64,'base64'));
      const second=await publisher.prepareHistoryBatch({...value.input,generation:2,previous:{reference:one.inventory,inventory},captureStartedAt:'2026-01-03T00:00:00Z',captureEndedAt:'2026-01-03T00:00:01Z'});
      const two=await publisher.publishHistory({stateDirectory:value.stateDirectory,batchId:second.batchId},value.drive);assert.equal(two.status,'published');
      if(loser.execute)await value.drive.updatePointer(loser.action.args);
      const generation=JSON.parse(Buffer.from(value.drive.files.get('anchor-one').bytesBase64,'base64')).generation;
      return {wrong:generation===1,one:one.status,two:two.status,generation,permittedCallbacks:callbacks.filter(next=>next.execute).length};
    }},
    {name:'close-unverified',file:'automation-reporting-history',from:"const result=readActions(state,key,expected,key==='inventory'?CAPTURE_LIMITS.inventoryBytes:CAPTURE_LIMITS.recordBytes);",to:"const result=key==='inventory'?{bytes}:readActions(state,key,expected,CAPTURE_LIMITS.recordBytes);",run:async(publisher,discovery,value)=>{const original=value.drive.uploadImmutable.bind(value.drive);value.drive.uploadImmutable=async args=>{const response=await original(args);if(args.name.startsWith('history-'))value.drive.files.get(response.id).bytesBase64=Buffer.from('{}\n').toString('base64');return response;};const batch=await publisher.prepareHistoryBatch(value.input);const output=await publisher.publishHistory({stateDirectory:value.stateDirectory,batchId:batch.batchId},value.drive);return {wrong:output.status==='published',output};}},
    {name:'close-pointer-without-readback',file:'automation-reporting-history',from:'const pointerVerified=after.bytes.equals(bytes);',to:'const pointerVerified=true;',run:async(publisher,discovery,value)=>{value.drive.updatePointer=async args=>({id:args.id,raw:{synthetic:true,noEffect:true}});const batch=await publisher.prepareHistoryBatch(value.input);const output=await publisher.publishHistory({stateDirectory:value.stateDirectory,batchId:batch.batchId},value.drive);return {wrong:output.status==='published',output,actualAnchorGeneration:JSON.parse(Buffer.from(value.drive.files.get('anchor-one').bytesBase64,'base64')).generation};}},
    {name:'lose-history',file:'automation-reporting-history',from:"need(previous.inventory.sourceSet.every(item=>keys.has(canonical(item))) && previous.inventory.sourceBoundary.admissionId===inventory.sourceBoundary.admissionId && Date.parse(interval.startedAt)>=Date.parse(previous.inventory.captureInterval.endedAt),'Admitted source history regression');",to:'void keys;',run:async(publisher,discovery,value)=>{const request=await prepared(value);const first=await publishHistory(request,value.drive);const prior=historyDecode(Buffer.from(value.drive.files.get(first.inventory.id).bytesBase64,'base64'));await rm(join(value.directory,'own',recordDigest(runRecord())+'.json'));try{const output=await publisher.prepareHistoryBatch({...value.input,generation:2,previous:{reference:first.inventory,inventory:prior},captureStartedAt:'2026-01-03T00:00:00Z',captureEndedAt:'2026-01-03T00:00:01Z'});return {wrong:output.status==='prepared',output};}catch(error){return {wrong:false,refusal:error.message};}}},
    {name:'metadata-before-fetch',file:'automation-reporting-discovery',from:"historyFields(value,['metadata','download']); validateRemoteMetadata(value.metadata,expected,limit);",to:"historyFields(value,['metadata','download']);",run:async(publisher,discovery,value)=>{const packet=emptyPacket();const metadata=await value.drive.getMetadata({id:'anchor-one'});metadata.parents=['academic-folder'];packet.anchorsBefore=[{metadata,download:null}];try{const output=discovery.planDiscovery(historyBytes(value.scope),historyBytes(packet));return {wrong:output.steps.some(step=>step.method==='fetch'),output};}catch(error){return {wrong:false,refusal:error.message};}}},
    {name:'metadata-role-bound',file:'automation-reporting-discovery',from:'metadata.size <= limit && ',to:'',run:async(publisher,discovery,value)=>{const packet=emptyPacket();const metadata=await value.drive.getMetadata({id:'anchor-one'});metadata.size=Number.MAX_SAFE_INTEGER;packet.anchorsBefore=[{metadata,download:null}];try{const output=discovery.planDiscovery(historyBytes(value.scope),historyBytes(packet));return {wrong:output.steps.some(step=>step.method==='fetch'),output};}catch(error){return {wrong:false,refusal:error.message};}}},
    {name:'checkpoint-regression',file:'automation-reporting-discovery',from:"need(prior && lineage.some(item=>same(prior,{owner:owner.owner,generation:item.inventory.generation,inventory:item.ref})), 'Persisted checkpoint regression or fork');",to:'void prior;',run:async(publisher,discovery,value)=>{const request=await prepared(value);const first=await publishHistory(request,value.drive);const packet=await value.drive.packet(value.scope);const checkpoint={schemaVersion:1,owners:[{owner:'producer',generation:2,inventory:{...first.inventory,id:'newer-exact-inventory'}}]};try{const output=discovery.consumeDiscovery(historyBytes(value.scope),historyBytes(packet),{action:'inspect'},{evaluatedAt,checkpoint});return {wrong:output.scan.complete===true,output};}catch(error){return {wrong:false,refusal:error.message};}}},
  ];
  const reports=[];
  for(const entry of cases) {
    const outputs=[];
    for(const variant of ['baseline','mutant','restored']) {
      const value=await setup();try {const sourceDir=join(value.root,'copied-source');await cp('src',sourceDir,{recursive:true});const path=join(sourceDir,entry.file+'.mjs');const source=await readFile(path,'utf8');assert.equal(source.split(entry.from).length-1,1,entry.name+' exact mutation anchor');if(variant==='mutant')await writeFile(path,source.replace(entry.from,entry.to));
        const publisher=await import(pathToFileURL(join(sourceDir,'automation-reporting-history.mjs')));const discovery=await import(pathToFileURL(join(sourceDir,'automation-reporting-discovery.mjs')));const output=await entry.run(publisher,discovery,value);assert.equal(output.wrong,variant==='mutant',entry.name+' '+variant+' '+JSON.stringify(output));outputs.push({variant,sourceSha256:historyHash(await readFile(path)),output});
      } finally {await rm(value.root,{recursive:true,force:true});}
    }
    assert.deepEqual(outputs[0].output,outputs[2].output,entry.name+' restored concrete result');reports.push({name:entry.name,outputs});
  }
  await mkdir('.local/consumer-evidence',{recursive:true});await writeFile('.local/consumer-evidence/history-source-pairs.json',JSON.stringify({pairs:reports.length,reports},null,2));
});

test('publication input symlinks and same-byte directory replacement refuse capture before any batch writes',async()=>{
  const {symlink,rename}=await import('node:fs/promises');const value=await setup();try {const alias=join(value.root,'source-alias');await symlink(value.directory,alias);await assert.rejects(prepareHistoryBatch({...value.input,directory:alias}),/[Oo]rdinary|Symlink/);const stateAlias=join(value.root,'state-alias');await symlink(value.stateDirectory,stateAlias);await assert.rejects(prepareHistoryBatch({...value.input,stateDirectory:stateAlias}),/[Oo]rdinary|Symlink/);
    await assert.rejects(prepareHistoryBatch(value.input,{checkpoint:async name=>{if(name==='source-captured'){await rename(join(value.directory,'own'),join(value.root,'retained-own'));await cp(join(value.root,'retained-own'),join(value.directory,'own'),{recursive:true});}}}),/changed/);assert.deepEqual(await readdir(value.stateDirectory),[]);
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('transport and upkeep actors prepare full TARGET history including actual receipt and call explicit adapter',async()=>{
  for(const actor of ['transport','upkeep']) {
    const value=await setup();try {const target=join(value.root,'TargetRecords');await mkdir(join(target,'own'),{recursive:true});const projected=sanitizeRecords([runRecord()],{namespace:'own'}).records[0];const receipt={...runRecord('actual-target-receipt'),kind:'publication',recordedAt:evaluatedAt,data:{subject:recordDigest(projected),state:'verified',evidenceRef:'synthetic-actual-target-readback'}};
      for(const record of [projected,receipt])await writeFile(join(target,'own',recordDigest(record)+'.json'),historyBytes(record));
      let result;
      if(actor==='transport') result=await transportAutomationReporting({sourceDirectory:value.directory,directory:target,namespace:'own',publication:value.input},{adapter:value.drive,evaluatedAt});
      else {const {plan}=await planUpkeep({sourceDirectory:value.directory,directory:target,namespace:'own'});result=await applyUpkeep(plan,{publication:value.input,adapter:value.drive});}
      assert.equal(result.historyPublication.status,'published',actor);const packet=await value.drive.packet(value.scope);assert.equal(consume(value,packet).scan.records,2);assert.ok(packet.objects.some(object=>object.download.bytesBase64===historyBytes(receipt).toString('base64')));assert.equal((await readdir(join(target,'own'))).length,2);
    } finally {await rm(value.root,{recursive:true,force:true});}
  }
});

test('credential-shaped locally encoded download bytes refuse persistence before semantic checks',async()=>{
  const value=await setup();try {const request=await prepared(value);let next=await publicationAction(request);await recordPublicationResponse({...request,actionId:next.action.actionId,response:await value.drive.uploadImmutable(next.action.args)});next=await publicationAction(request);await recordPublicationResponse({...request,actionId:next.action.actionId,response:await value.drive.getMetadata(next.action.args)});next=await publicationAction(request);const response=await value.drive.downloadRaw(next.action.args);response.bytesBase64=Buffer.from('Bearer abcdefghijklmnopqrstuvwxyz123456').toString('base64');const before=await readdir(join(value.stateDirectory,request.batchId));await assert.rejects(recordPublicationResponse({...request,actionId:next.action.actionId,response}),/Credential/);assert.deepEqual(await readdir(join(value.stateDirectory,request.batchId)),before);
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('explicit bounded readback retry after restart preserves failed raw responses and closes same generation',async()=>{
  const publisher=await import('../src/automation-reporting-history.mjs');
  for(const method of ['getMetadata','downloadRaw']) {
    const value=await setup();try {const request=await prepared(value);const original=value.drive[method].bind(value.drive);let failed=true;value.drive[method]=async args=>{if(failed){failed=false;if(method==='getMetadata')throw new Error('synthetic-transient-metadata-failure');const response=await original(args);return {...response,bytesBase64:Buffer.from('truncated').toString('base64')};}return original(args);};
      const first=await publishHistory(request,value.drive);assert.equal(first.status,'blocked');assert.equal(typeof publisher.retryPublicationRead,'function','supported append-only known-ID readback retry');
      const journal=join(value.stateDirectory,request.batchId);const events=await Promise.all((await readdir(journal)).filter(name=>/^\d/.test(name)).map(async name=>({name,bytes:await readFile(join(journal,name),'utf8')})));const failedIntent=events.map(entry=>JSON.parse(entry.bytes)).filter(entry=>entry.kind==='intent').at(-1);
      const retryFile=join(value.root,'retry.json');await writeFile(retryFile,historyBytes({...request,actionId:failedIntent.actionId,evidence:{reason:'explicit-known-id-readback-refresh-after-transient-failure'}}));const retry=spawnSync(process.execPath,['scripts/automation-reporting-history.mjs','retry-read','--file',retryFile],{encoding:'utf8'});assert.equal(retry.status,0,retry.stderr);await writeFile(join(value.root,'input.json'),historyBytes(value.input));await value.drive.save(join(value.root,'remote.json'));const resumed=spawnSync(process.execPath,['test/fixtures/reporting-history-worker.mjs',value.root,'0'],{encoding:'utf8'});assert.equal(resumed.status,0,resumed.stderr);assert.equal(JSON.parse(resumed.stdout).result.status,'published');value.drive=await FakeDrive.load(join(value.root,'remote.json'));for(const event of events)assert.equal(await readFile(join(journal,event.name),'utf8'),event.bytes);assert.equal(value.drive.calls.filter(call=>call.method==='uploadImmutable').length,2);if(method==='downloadRaw')assert.ok(value.drive.calls.filter(call=>call.method==='getMetadata'&&call.id==='remote-1').length>=2);
      const retryEvents=(await Promise.all((await readdir(journal)).filter(name=>/^\d/.test(name)).map(async name=>JSON.parse(await readFile(join(journal,name),'utf8'))))).filter(entry=>entry.kind==='read-retry');assert.equal(retryEvents.length,1);
      const out=await publicationAction(request);assert.equal(out.status,'published');await assert.rejects(publisher.retryPublicationRead({...request,actionId:'record-0:upload',evidence:{reason:'not-a-read'}}));
    } finally {await rm(value.root,{recursive:true,force:true});}
  }
});

test('concrete upload artifact and supported tool arguments bind exact durable bytes before effect',async()=>{
  const publisher=await import('../src/automation-reporting-history.mjs');const value=await setup();try {const request=await prepared(value);const next=await publicationAction(request);assert.equal(next.tool.operation,'upload_file');assert.equal(next.tool.arguments.file_uri,next.artifact.path);const bytes=await readFile(next.artifact.path);assert.equal(bytes.length,next.artifact.size);assert.equal(historyHash(bytes),next.artifact.sha256);assert.equal(bytes.toString('base64'),next.action.args.bytesBase64);assert.deepEqual(await publisher.materializePublicationUpload({...request,actionId:next.action.actionId}),next.artifact);
    const response=await value.drive.uploadImmutable(next.action.args);await recordPublicationResponse({...request,actionId:next.action.actionId,response});const metadata=await publicationAction(request);assert.equal(metadata.tool.operation,'get_file_metadata');assert.equal(metadata.tool.arguments.fileId,response.id);await recordPublicationResponse({...request,actionId:metadata.action.actionId,response:await value.drive.getMetadata(metadata.action.args)});const raw=await publicationAction(request);assert.equal(raw.tool.operation,'fetch');assert.equal(raw.tool.arguments.download_raw_file,true);assert.equal(raw.tool.arguments.include_base64,false);
  } finally {await rm(value.root,{recursive:true,force:true});}
});

async function advanceThrough(value,request,actionId) {
  for(let index=0;index<40;index++) {
    const next=await publicationAction(request);assert.equal(next.status,'action-required',JSON.stringify(next));
    await recordPublicationResponse({...request,actionId:next.action.actionId,response:await value.drive[next.action.method](next.action.args)});
    if(next.action.actionId===actionId)return;
  }
  assert.fail('Named action not reached');
}
async function secondGeneration(value,first) {
  const inventory=historyDecode(Buffer.from(value.drive.files.get(first.inventory.id).bytesBase64,'base64'));
  const batch=await prepareHistoryBatch({...value.input,generation:2,previous:{reference:first.inventory,inventory},captureStartedAt:'2026-01-03T00:00:00Z',captureEndedAt:'2026-01-03T00:00:01Z'});
  return {stateDirectory:value.stateDirectory,batchId:batch.batchId};
}

test('same-owner callbacks grant exactly one pointer dispatch before generation handoff',async()=>{
  const value=await setup();try {
    const request=await prepared(value);await advanceThrough(value,request,'anchor-before:download');
    const callbacks=await Promise.all([publicationAction(request),publicationAction(request)]);
    assert.equal(callbacks.filter(next=>next.execute).length,1,'Only one callback may issue a pointer mutation');
    assert.ok(callbacks.every(next=>next.action.method==='updatePointer'));
    const winner=callbacks.find(next=>next.execute);await recordPublicationResponse({...request,actionId:winner.action.actionId,response:await value.drive.updatePointer(winner.action.args)});
    const first=await publishHistory(request,value.drive);assert.equal(first.status,'published');
    assert.equal((await publishHistory(await secondGeneration(value,first),value.drive)).status,'published');
    assert.equal(JSON.parse(Buffer.from(value.drive.files.get('anchor-one').bytesBase64,'base64')).generation,2);
    assert.equal(value.drive.calls.filter(call=>call.method==='updatePointer').length,2);
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('unknown pointer RPC with a held effect cannot retry or hand off on an old read',async()=>{
  const {retryPublicationRead}=await import('../src/automation-reporting-history.mjs');
  const value=await setup();try {
    const request=await prepared(value);const original=value.drive.updatePointer.bind(value.drive);let pending=null;let attempts=0;
    value.drive.updatePointer=async args=>{attempts++;pending=args;throw new Error('RPC timeout with effect still pending');};
    const first=await publishHistory(request,value.drive);assert.equal(first.status,'uncertain');assert.equal(first.generationClosed,true);assert.equal(attempts,1);
    const journal=join(value.stateDirectory,request.batchId);const old=await Promise.all((await readdir(journal)).filter(name=>/^\d/.test(name)).map(async name=>({name,bytes:await readFile(join(journal,name),'utf8')})));
    const closed=old.map(entry=>JSON.parse(entry.bytes)).find(event=>event.kind==='generation-closed');
    const next=await secondGeneration(value,closed);assert.equal((await publishHistory(next,value.drive)).status,'blocked');assert.equal(attempts,1);
    assert.equal((await publishHistory(request,value.drive)).status,'uncertain');assert.equal(attempts,1);
    await original(pending);
    const last=old.map(entry=>JSON.parse(entry.bytes)).filter(event=>event.kind==='intent').at(-1);
    await retryPublicationRead({...request,actionId:last.actionId,evidence:{reason:'Held single RPC has now returned; refresh exact-ID readback'}});
    assert.equal((await publishHistory(request,value.drive)).status,'published');
    value.drive.updatePointer=original;assert.equal((await publishHistory(next,value.drive)).status,'published');
    for(const event of old)assert.equal(await readFile(join(journal,event.name),'utf8'),event.bytes);
    assert.equal(value.drive.calls.filter(call=>call.method==='updatePointer').length,2);
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('upload create error survives exact-ID recovery and fresh-process verification byte for byte',async()=>{
  for(const fault of [null,'id','parent','hash']) {
    const value=await setup();try {
      const request=await prepared(value);const original=value.drive.uploadImmutable.bind(value.drive);let once=true;
      value.drive.uploadImmutable=async args=>{const response=await original(args);if(once){once=false;throw new Error('create succeeded; response lost');}return response;};
      assert.equal((await publishHistory(request,value.drive)).status,'uncertain');
      const journal=join(value.stateDirectory,request.batchId);const old=await Promise.all((await readdir(journal)).filter(name=>/^\d/.test(name)).map(async name=>({name,bytes:await readFile(join(journal,name),'utf8')})));
      const failed=old.map(entry=>JSON.parse(entry.bytes)).find(event=>event.kind==='response');assert.equal(failed.response.error,'adapter-call-failed');
      await recoverPublicationId({...request,actionId:failed.actionId,id:fault==='id'?'wrong-id':'remote-1',evidence:{source:'synthetic-retained-exact-create-response',id:'remote-1'}});
      if(fault==='parent')value.drive.files.get('remote-1').parentId='wrong';
      if(fault==='hash')value.drive.files.get('remote-1').bytesBase64=Buffer.from('x'.repeat(Buffer.from(value.drive.files.get('remote-1').bytesBase64,'base64').length)).toString('base64');
      await writeFile(join(value.root,'input.json'),historyBytes(value.input));await value.drive.save(join(value.root,'remote.json'));
      const resumed=spawnSync(process.execPath,['test/fixtures/reporting-history-worker.mjs',value.root,'0'],{encoding:'utf8'});assert.equal(resumed.status,0,resumed.stderr);
      assert.equal(JSON.parse(resumed.stdout).result.status,fault===null?'published':'blocked');
      for(const event of old)assert.equal(await readFile(join(journal,event.name),'utf8'),event.bytes);
    } finally {await rm(value.root,{recursive:true,force:true});}
  }
});

test('per-role known metadata bounds stop acquisition before fetch or adapter download',async()=>{
  const value=await setup();try {
    const request=await prepared(value);await publishHistory(request,value.drive);const full=await value.drive.packet(value.scope);
    for(const [field,limit] of [['anchorsBefore',CAPTURE_LIMITS.scopeBytes],['anchorsAfter',CAPTURE_LIMITS.scopeBytes],['inventories',CAPTURE_LIMITS.inventoryBytes],['objects',CAPTURE_LIMITS.recordBytes]]) {
      for(const extra of [0,1]) {
        const packet=structuredClone(full);const item=packet[field][0];item.metadata.size=limit+extra;item.download=null;
        if(field==='inventories') {const anchor=JSON.parse(Buffer.from(packet.anchorsBefore[0].download.bytesBase64,'base64'));anchor.inventory.size=limit+extra;const bytes=historyBytes(anchor);packet.anchorsBefore[0].download.bytesBase64=bytes.toString('base64');packet.anchorsBefore[0].metadata.size=bytes.length;}
        if(extra===1)assert.throws(()=>planDiscovery(historyBytes(value.scope),historyBytes(packet)),/bound|length|reference/);
        else if(field.startsWith('anchors'))assert.ok(planDiscovery(historyBytes(value.scope),historyBytes(packet)).steps.some(step=>step.method==='fetch'));
        const expected={id:item.metadata.id,name:item.metadata.name,parentId:item.metadata.parents[0]};
        if(extra)assert.throws(()=>validateRemoteMetadata(item.metadata,expected,limit),/bound|length/);else assert.doesNotThrow(()=>validateRemoteMetadata(item.metadata,expected,limit));
      }
    }
  } finally {await rm(value.root,{recursive:true,force:true});}
  for(const role of ['anchor-before','anchor-after','inventory','record']) {
    const value=await setup();try {
      const request=await prepared(value);const original=value.drive.getMetadata.bind(value.drive);let badId=null;let anchorReads=0;
      value.drive.getMetadata=async args=>{const response=await original(args);const file=value.drive.files.get(args.id);if(args.id==='anchor-one')anchorReads++;
        const matches=role==='anchor-before'?args.id==='anchor-one'&&anchorReads===1:role==='anchor-after'?args.id==='anchor-one'&&anchorReads===2:role==='inventory'?file.name.startsWith('history-'):args.id!=='anchor-one'&&!file.name.startsWith('history-');
        if(matches){badId=args.id;return {...response,size:(role.startsWith('anchor')?CAPTURE_LIMITS.scopeBytes:role==='inventory'?CAPTURE_LIMITS.inventoryBytes:CAPTURE_LIMITS.recordBytes)+1};}return response;};
      const output=await publishHistory(request,value.drive);assert.equal(output.status,'blocked',role);assert.ok(badId,role);
      const calls=value.drive.calls;const lastMetadata=calls.findLastIndex(call=>call.method==='getMetadata'&&call.id===badId);assert.ok(!calls.slice(lastMetadata+1).some(call=>call.method==='downloadRaw'&&call.id===badId),role+' download refused before effect');
    } finally {await rm(value.root,{recursive:true,force:true});}
  }
});

test('identical concurrent generation closures advance both callback snapshots once',async()=>{
  const value=await setup();try {
    const request=await prepared(value);await advanceThrough(value,request,'inventory:download');
    let closures=0;let release;const barrier=new Promise(resolve=>{release=resolve;});
    const checkpoint=async name=>{if(name==='generation-closed-persisted'){closures++;if(closures===2)release();if(closures>2)throw new Error('Identical concurrent closure replay exceeded bound');await barrier;}};
    const callbacks=await Promise.all([publicationAction(request,{checkpoint}),publicationAction(request,{checkpoint})]);
    assert.equal(closures,2);assert.ok(callbacks.every(next=>next.status==='action-required'));assert.ok(callbacks.every(next=>next.action.method==='getMetadata'));
    assert.equal((await publishHistory(request,value.drive)).status,'published');
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('overlapping callback preserves a late pointer RPC response after old readback',async()=>{
  const value=await setup();try {
    const request=await prepared(value);await advanceThrough(value,request,'anchor-before:download');
    const original=value.drive.updatePointer.bind(value.drive);let release;let announce;
    const held=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{announce=resolve;});
    value.drive.updatePointer=async args=>{announce();await held;return original(args);};
    const winner=publishHistory(request,value.drive);await started;
    const reader=await publishHistory(request,value.drive);assert.equal(reader.status,'uncertain');release();
    const returned=await winner;assert.equal(returned.status,'uncertain');
    const events=await Promise.all((await readdir(join(value.stateDirectory,request.batchId))).filter(name=>/^\d/.test(name)).map(async name=>JSON.parse(await readFile(join(value.stateDirectory,request.batchId,name)))));
    assert.ok(events.some(event=>event.kind==='response'&&event.actionId==='anchor-update-0'&&event.response.raw.id==='anchor-one'));
    assert.equal(value.drive.calls.filter(call=>call.method==='updatePointer').length,1);
  } finally {await rm(value.root,{recursive:true,force:true});}
});


for(const conflict of [false,true]) test('late same-owner upload callback retains '+(conflict?'conflicting':'matching')+' original response after exact-ID recovery without another mutation',async()=>{
    const value=await setup();try {
      const request=await prepared(value);const original=value.drive.uploadImmutable.bind(value.drive);let announce,release;
      const started=new Promise(resolve=>announce=resolve);const held=new Promise(resolve=>release=resolve);let first=true;
      value.drive.uploadImmutable=async args=>{const response=await original(args);if(first){first=false;announce(response);await held;return conflict?{...response,id:'conflicting-returned-id'}:response;}return response;};
      const running=publishHistory(request,value.drive).then(result=>({result}),error=>({error:error.message}));const response=await started;
      await recoverPublicationId({...request,actionId:'record-0:upload',id:response.id,evidence:{source:'synthetic-exact-provider-create-response',response}});
      assert.equal((await publishHistory(request,value.drive)).status,'published');
      const journal=join(value.stateDirectory,request.batchId);const before=await Promise.all((await readdir(journal)).filter(name=>/^\d/.test(name)).map(async name=>({name,bytes:await readFile(join(journal,name))})));
      const calls=value.drive.calls.length;release();const late=await running;
      const events=await Promise.all((await readdir(journal)).filter(name=>/^\d/.test(name)).map(async name=>JSON.parse(await readFile(join(journal,name)))));
      const actual=events.filter(event=>event.kind==='response'&&event.actionId==='record-0:upload');assert.equal(actual.length,1,'actual delayed upload response retained');
      assert.equal(canonical(actual[0].response),canonical(conflict?{...response,id:'conflicting-returned-id'}:response));
      for(const entry of before)assert.deepEqual(await readFile(join(journal,entry.name)),entry.bytes,'prior recovery and closure bytes retained');
      const retainedNames=await readdir(journal);await assert.rejects(recordPublicationResponse({...request,actionId:'record-0:upload',response:{...response,raw:{authorization:'Bearer abcdefghijklmnopqrstuvwxyz123456'}}}),/Credential/);assert.deepEqual(await readdir(journal),retainedNames,'late credentials refuse before persistence');
      assert.equal(value.drive.calls.length,calls,'late response grants no new remote effect');assert.equal(value.drive.calls.filter(call=>call.method==='uploadImmutable').length,2);
      if(conflict){assert.match(late.error,/Recovery disagrees with returned exact ID/);assert.equal((await publicationAction(request)).status,'blocked');}
      else {assert.equal(late.result.status,'published');assert.equal((await publicationAction(request)).status,'published');}
    } finally {await rm(value.root,{recursive:true,force:true});}
});


test('crash oracle rejects early uncertainty in isolated actual source and restored controls publish',async()=>{
  const root=join(await realpath('.'),'.local','consumer-evidence','crash-oracle-'+Date.now());await mkdir(root,{recursive:true});
  await cp('src',join(root,'src'),{recursive:true});await cp('test',join(root,'test'),{recursive:true});
  const sourcePath=join(root,'src','automation-reporting-history.mjs');const source=await readFile(sourcePath,'utf8');
  const anchor="  const anchor={schemaVersion:1,kind:'automation-reporting-discovery-anchor'";assert.equal(source.split(anchor).length-1,1);
  const results=[];const environment={...process.env};delete environment.NODE_TEST_CONTEXT;
  for(const variant of ['baseline','mutant','restored']) {
    await writeFile(sourcePath,variant==='mutant'?source.replace(anchor,"  if(!state.events.some(e=>e.kind==='recovery')) return {done:true,status:'uncertain',execute:false};\n"+anchor):source);
    const result=spawnSync(process.execPath,['--test','--test-name-pattern=^fresh-process crash','test/automation-reporting-history.test.mjs'],{cwd:root,encoding:'utf8',env:environment});
    await writeFile(join(root,variant+'.stdout.log'),result.stdout);await writeFile(join(root,variant+'.stderr.log'),result.stderr);
    const output=result.stdout+result.stderr;assert.equal(result.error,undefined);
    if(variant==='mutant') {assert.equal(result.status,1);assert.match(output,/crash baseline must publish/);assert.match(output,/'uncertain'/);assert.match(output,/'published'/);assert.doesNotMatch(output,/SyntaxError|ERR_MODULE_NOT_FOUND/);}
    else {assert.equal(result.status,0,output);assert.equal(JSON.parse(await readFile(join(root,'.local','consumer-evidence','history-crash-boundaries.json'))).total,96);}
    results.push({variant,status:result.status,sourceSha256:historyHash(await readFile(sourcePath)),behavior:variant==='mutant'?'baseline-uncertain-rejected-before-cutoffs':'96-cutoffs-passed'});
  }
  assert.equal(results[0].sourceSha256,results[2].sourceSha256);await writeFile(join(root,'report.json'),JSON.stringify({results},null,2));
});

for(const timing of ['before-successor','claimed-successor','older-ancestor']) for(const conflict of [false,true]) test('current ancestor receipts gate '+timing+' handoff with '+(conflict?'conflicting':'matching')+' late response',async()=>{
  const value=await setup();try {
    const request=await prepared(value);const original=value.drive.uploadImmutable.bind(value.drive);let announce,release;
    const started=new Promise(resolve=>announce=resolve);const held=new Promise(resolve=>release=resolve);let once=true;
    value.drive.uploadImmutable=async args=>{const response=await original(args);if(once){once=false;announce(response);await held;return conflict?{...response,id:'conflicting-returned-id'}:response;}return response;};
    const running=publishHistory(request,value.drive).then(result=>({result}),error=>({error:error.message}));const response=await started;
    await recoverPublicationId({...request,actionId:'record-0:upload',id:response.id,evidence:{source:'synthetic-exact-upload-response',response}});
    const first=await publishHistory(request,value.drive);assert.equal(first.status,'published');
    let successor=await secondGeneration(value,first);
    if(timing==='claimed-successor') await advanceThrough(value,successor,'record-0:download');
    if(timing==='older-ancestor') {
      const second=await publishHistory(successor,value.drive);assert.equal(second.status,'published');
      const inventory=historyDecode(Buffer.from(value.drive.files.get(second.inventory.id).bytesBase64,'base64'));
      const third=await prepareHistoryBatch({...value.input,generation:3,previous:{reference:second.inventory,inventory},captureStartedAt:'2026-01-04T00:00:00Z',captureEndedAt:'2026-01-04T00:00:01Z'});
      successor={stateDirectory:value.stateDirectory,batchId:third.batchId};
      await advanceThrough(value,successor,'record-0:download');
    }
    const snapshots=[];
    for(const name of (await readdir(value.stateDirectory)).filter(name=>/^[a-f0-9]{64}$/.test(name)||name.startsWith('owner-'))) {
      for(const file of await readdir(join(value.stateDirectory,name))) snapshots.push({path:join(value.stateDirectory,name,file),bytes:await readFile(join(value.stateDirectory,name,file))});
    }
    const calls=value.drive.calls.length;release();const late=await running;
    assert.equal(value.drive.calls.length,calls,'late evidence itself performs no remote work');
    for(const item of snapshots)assert.deepEqual(await readFile(item.path),item.bytes,'all prior batch, owner, receipt, recovery and closure bytes retained');
    const journal=join(value.stateDirectory,request.batchId);const events=await Promise.all((await readdir(journal)).filter(name=>/^\d/.test(name)).map(async name=>JSON.parse(await readFile(join(journal,name)))));
    const receipts=events.filter(event=>event.kind==='response'&&event.actionId==='record-0:upload');assert.equal(receipts.length,1);assert.equal(receipts[0].response.id,conflict?'conflicting-returned-id':response.id);
    if(conflict) {
      assert.match(late.error,/Recovery disagrees/);
      const next=await publicationAction(successor);assert.equal(next.status,'blocked','contradictory ancestor cannot grant any further publication permission');assert.notEqual(next.execute,true);
      assert.equal((await publishHistory(successor,value.drive)).status,'blocked');assert.equal(value.drive.calls.length,calls,'blocked successor performs zero new adapter effects');
      for(const item of snapshots)assert.deepEqual(await readFile(item.path),item.bytes);
    } else {
      assert.equal(late.result.status,timing==='before-successor'?'published':'blocked');
      assert.equal((await publishHistory(successor,value.drive)).status,'published','matching late receipt preserves valid handoff');assert.ok(value.drive.calls.length>calls);
    }
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('unknown trash metadata permits exact content closure and retains separate observations',async()=>{
  const value=await setup();try {
    const original=value.drive.getMetadata.bind(value.drive);value.drive.getMetadata=async args=>({...await original(args),trashed:null});
    const request=await prepared(value);const published=await publishHistory(request,value.drive);assert.equal(published.status,'published');
    assert.equal(published.activeAvailability,'not-established');assert.ok(published.trashObservations.every(item=>item.trashed===null));
    const packet=await value.drive.packet(value.scope);packet.anchorsBefore[0].metadata.trashed=false;
    const view=consume(value,packet);assert.equal(view.scan.complete,true);assert.equal(view.discovery.activeAvailability,'not-established');
    assert.deepEqual(view.discovery.trashObservations.filter(item=>item.role.startsWith('anchor')).map(item=>item.trashed),[false,null]);
    assert.notEqual(view.resultSha256,consume(value,{...packet,anchorsBefore:packet.anchorsAfter}).resultSha256);
    assert.equal(planDiscovery(historyBytes(value.scope),historyBytes(packet)).trashObservations.length,4);
    const count=value.drive.calls.length;assert.deepEqual(await publishHistory(request,value.drive),published);assert.equal(value.drive.calls.length,count);
    for(const collection of ['anchorsBefore','anchorsAfter','inventories','objects']) for(const state of [true,'false',undefined]) {
      const changed=structuredClone(packet);if(state===undefined)delete changed[collection][0].metadata.trashed;else changed[collection][0].metadata.trashed=state;
      assert.throws(()=>consume(value,changed),collection+' '+state);
    }
    for(const collection of ['anchorsBefore','anchorsAfter','inventories','objects']) for(const state of [null,false]) {
      const changed=structuredClone(packet);changed[collection][0].metadata.trashed=state;changed[collection][0].metadata.raw={structuredContent:{trashed:true}};assert.throws(()=>consume(value,changed),/trash/i);
    }
    for(const change of [p=>{p.objects[0].metadata.parents=['wrong'];},p=>{p.objects[0].metadata.size=CAPTURE_LIMITS.recordBytes+1;},p=>{p.objects[0].download.bytesBase64='eA==';},p=>{p.objects[0].download.bytesBase64=Buffer.from(Buffer.from(p.objects[0].download.bytesBase64,'base64').toString().replace('completed','skipped  ')).toString('base64');},p=>{p.objects[0].download.complete=false;}]) {const changed=structuredClone(packet);change(changed);assert.throws(()=>consume(value,changed));}
  } finally {await rm(value.root,{recursive:true,force:true});}
});

test('Drive metadata normalizer preserves actual omission and refuses explicit invalid trash',async()=>{
  const {normalizeDriveMetadata}=await import('../src/automation-reporting-discovery.mjs');assert.equal(typeof normalizeDriveMetadata,'function');
  const raw={id:'one',name:'one.json',parents:['parent'],size:'12',mimeType:'application/json'};
  const metadata=normalizeDriveMetadata(raw);assert.equal(metadata.trashed,null);assert.deepEqual(metadata.raw,raw);assert.equal(Object.hasOwn(raw,'trashed'),false);assert.equal(metadata.size,12);
  const wrapped={content:[{type:'text',text:'Action completed'}],structuredContent:{id:'one',title:'one.json',parent_ids:['parent'],mime_type:'application/json',size:'12'}};
  assert.deepEqual(normalizeDriveMetadata(wrapped),{...metadata,raw:wrapped});
  assert.equal(normalizeDriveMetadata({...raw,trashed:false}).trashed,false);
  assert.throws(()=>normalizeDriveMetadata({...wrapped,isError:true}),/tool error/);
  for(const structuredContent of [null,[],42,'metadata'])assert.throws(()=>normalizeDriveMetadata({...raw,structuredContent}),/structured/);
  for(const trashed of [true,null,'false',0])assert.throws(()=>normalizeDriveMetadata({...raw,trashed}),/trash/i);
});

test('every publication role refuses known trash and invalid metadata before its raw fetch',async()=>{
  for(const role of [1,2,3,4])for(const state of [true,'false',undefined,'raw-true']) {
    const value=await setup();try {
      const original=value.drive.getMetadata.bind(value.drive);let count=0;
      value.drive.getMetadata=async args=>{const response={...await original(args),trashed:null};if(++count===role){if(state===undefined)delete response.trashed;else if(state==='raw-true')response.raw={trashed:true};else response.trashed=state;}return response;};
      const request=await prepared(value);const result=await publishHistory(request,value.drive);assert.equal(result.status,'blocked');assert.equal(value.drive.calls.filter(call=>call.method==='downloadRaw').length,role-1);
      assert.equal(result.generationClosed,role>=3);const calls=value.drive.calls.length;assert.equal((await publishHistory(request,value.drive)).status,'blocked');assert.equal(value.drive.calls.length,calls);
      assert.equal(value.drive.calls.filter(call=>call.method==='updatePointer').length,role===4?1:0);
    }finally{await rm(value.root,{recursive:true,force:true});}
  }
});

test('unknown metadata retry and pointer interruption retain journal and never duplicate mutations',async()=>{
  const {retryPublicationRead}=await import('../src/automation-reporting-history.mjs');
  for(const fault of ['metadata','raw','pointer']) {
    const value=await setup();try {
      const metadata=value.drive.getMetadata.bind(value.drive);value.drive.getMetadata=async args=>({...await metadata(args),trashed:null});
      const raw=value.drive.downloadRaw.bind(value.drive);let once=true;
      if(fault==='metadata'){const normal=value.drive.getMetadata;value.drive.getMetadata=async args=>{const result=await normal(args);if(once){once=false;return {...result,size:0};}return result;};}
      if(fault==='raw')value.drive.downloadRaw=async args=>{const result=await raw(args);if(once){once=false;return {...result,bytesBase64:'eA=='};}return result;};
      let pending;const update=value.drive.updatePointer.bind(value.drive);if(fault==='pointer')value.drive.updatePointer=async args=>{pending=args;throw new Error('held effect');};
      const request=await prepared(value);const first=await publishHistory(request,value.drive);assert.equal(first.status,fault==='pointer'?'uncertain':'blocked');
      const journal=join(value.stateDirectory,request.batchId);const old=await Promise.all((await readdir(journal)).filter(name=>/^\d/.test(name)).map(async name=>({name,bytes:await readFile(join(journal,name),'utf8')})));
      const last=old.map(item=>JSON.parse(item.bytes)).filter(event=>event.kind==='intent').at(-1);
      if(fault==='pointer'){assert.ok(first.trashObservations.every(item=>item.trashed===null));await update(pending);}
      await retryPublicationRead({...request,actionId:last.actionId,evidence:{reason:'explicit exact-ID retry after retained failure'}});
      const result=await publishHistory(request,value.drive);assert.equal(result.status,'published');assert.ok(result.trashObservations.some(item=>item.trashed===null));
      for(const item of old)assert.equal(await readFile(join(journal,item.name),'utf8'),item.bytes);
      const file=join(value.root,'request.json');await writeFile(file,historyBytes(request));const reopened=spawnSync(process.execPath,['scripts/automation-reporting-history.mjs','next','--file',file],{encoding:'utf8'});assert.equal(reopened.status,0,reopened.stderr);assert.deepEqual(JSON.parse(reopened.stdout),result);
      assert.equal(value.drive.calls.filter(call=>call.method==='uploadImmutable').length,2);assert.equal(value.drive.calls.filter(call=>call.method==='updatePointer').length,1);
    }finally{await rm(value.root,{recursive:true,force:true});}
  }
});

test('normalized trash cannot hide retained raw false, null, malformed or wrapper contradiction',()=>{
  const expected={id:'one',name:'one.json',parentId:'parent'};
  const metadata={id:'one',name:'one.json',parents:['parent'],size:12,mimeType:'application/json',trashed:null,raw:{}};
  for(const raw of [{isError:true},{structuredContent:null},{trashed:false},{trashed:null},{trashed:'false'},{trashed:0},{trashed:true,structuredContent:{trashed:false}},{trashed:false,structuredContent:{trashed:true}}])assert.throws(()=>validateRemoteMetadata({...metadata,raw},expected),/trash|tool error|structured/i);
  assert.doesNotThrow(()=>validateRemoteMetadata({...metadata,trashed:false,raw:{trashed:false}},expected));
});

test('unknown metadata preserves full two-generation lineage and persisted checkpoints',async()=>{
  const value=await setup();try {
    const metadata=value.drive.getMetadata.bind(value.drive);value.drive.getMetadata=async args=>({...await metadata(args),trashed:null});
    const first=await publishHistory(await prepared(value),value.drive);const packet=await value.drive.packet(value.scope);const checkpoint=consume(value,packet).discovery.checkpoint;
    const additional=runRecord('second-null-generation');await writeFile(join(value.directory,'own',recordDigest(additional)+'.json'),historyBytes(additional));
    const request=await secondGeneration(value,first);const second=await publishHistory(request,value.drive);assert.equal(second.status,'published');const nextPacket=await value.drive.packet(value.scope);assert.equal(nextPacket.inventories.length,2);
    const view=consume(value,nextPacket,{checkpoint});assert.equal(view.scan.records,2);assert.equal(view.scan.complete,true);assert.ok(view.discovery.trashObservations.every(item=>item.trashed===null));
    assert.throws(()=>consume(value,packet,{checkpoint:view.discovery.checkpoint}),/regression|fork/);
    nextPacket.inventories.pop();assert.throws(()=>consume(value,nextPacket,{checkpoint}),/Incomplete/);
  }finally{await rm(value.root,{recursive:true,force:true});}
});
