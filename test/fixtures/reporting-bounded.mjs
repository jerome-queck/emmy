import { mkdir, mkdtemp, realpath, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRecord, evaluatedAt } from './reporting-capture.mjs';
import { historyScope, FakeDrive } from './reporting-history.mjs';
import { historyBytes } from '../../src/automation-reporting-discovery.mjs';
import { recordDigest } from '../../src/automation-reporting.mjs';
import { beginBoundedHistory, advanceBoundedHistory, advanceBoundedPublication, respondBoundedPublication } from '../../src/automation-reporting-bounded.mjs';
export const neutralShape=Object.fromEntries([[8,7284],[9,7811],[8,7190],[1,662],[5,3767],[8,5784],[6,4874],[4,2864],[4,2811],[1,651],[1,659],[1,641],[1,626],[1,644],[1,634],[1,633],[3,2558],[129,109788]].map(([files,bytes],index)=>['source_'+String(index).padStart(2,'0'),{files,bytes}]));
export async function boundedFixture(count=192,totalBytes=159881,{shape=count===192?neutralShape:null}={}) {
  const base=await mkdtemp(join(await realpath(tmpdir()),'emmy-bounded-'));const directory=join(base,'Records');const stateDirectory=join(base,'state');await mkdir(directory);await mkdir(stateDirectory);const records=[];let total=0;const selected=shape??{own:{files:count,bytes:totalBytes}};
  for(const [namespace,amount]of Object.entries(selected)){await mkdir(join(directory,namespace));let local=0;for(let index=0;index<amount.files;index++){const record=runRecord('run-'+records.length);record.namespace=namespace;record.data.evidenceRefs=['a','b','c'];const target=index===amount.files-1?amount.bytes-local:Math.floor(amount.bytes/amount.files);let padding=target-historyBytes(record).length;for(let entry=0;entry<3;entry++){const add=Math.min(399,padding);record.data.evidenceRefs[entry]=String.fromCharCode(97+entry).repeat(1+add);padding-=add;}if(padding!==0)throw new Error('Synthetic padding shape cannot fit valid record');const bytes=historyBytes(record);local+=bytes.length;total+=bytes.length;records.push(record);await writeFile(join(directory,record.namespace,recordDigest(record)+'.json'),bytes);}}
  const scope=historyScope(records);scope.owners[0].namespaces=scope.recordScope.namespaces.map(item=>item.namespace);return {base,directory,stateDirectory,records,total,shape:selected,request:{directory,stateDirectory,scope,owner:'producer',generation:1,synthetic:true,admission:{id:'synthetic-admission',completeAdmittedHistory:true},evaluatedAt,captureStartedAt:evaluatedAt,captureEndedAt:evaluatedAt}};
}
export async function driveBounded(value,{invoke=null,maxJobs=64,publish=true,live=true,remote=null,jobPrefix=''}={}) {
  const runtime=live?{}:null;const operations={begin:beginBoundedHistory,advance:advanceBoundedHistory,next:advanceBoundedPublication,respond:respondBoundedPublication};const drive=remote??new FakeDrive(value.request.scope);const calls=[];const tickets=new Map();let ticket=0;let callback=0;let ledger=null;let current={};let stage='begin';
  const call=async(action,details)=>{
    if(!ledger||ledger.chargedBytes>210000){ticket++;ledger=null;}
    if(ticket>maxJobs)throw new Error('Synthetic flight exceeds available ticket ceiling');
    const request={stateDirectory:value.stateDirectory,...details,jobId:jobPrefix+'ticket-'+ticket,executionId:'callback-'+callback++,...(ledger?{jobLedger:ledger}:{})};const result=await (invoke?invoke(action,request):operations[action](request,{runtime}));
    if(result.jobLedger){ledger=result.jobLedger;tickets.set(ticket,result.actuals);}
    calls.push({action,status:result.status,jobId:request.jobId,actuals:result.actuals});
    if(result.status==='budget-stop'){ledger=null;return call(action,details);}
    if(result.status==='blocked'||result.status==='uncertain'||result.status==='execution-already-claimed')throw new Error(JSON.stringify(result));
    return result;
  };
  current=await call('begin',value.request);
  while(current.status!=='prepared')current=await call('advance',{captureId:current.captureId,cursor:current.cursor});
  const captured={...current};if(!publish)return {current,captured,calls,tickets:[...tickets.values()],drive};
  while(current.status!=='published') {
    const next=await call('next',{captureId:current.captureId,cursor:current.cursor});current=next;
    if(next.status!=='action-required')continue;
    let args=next.action.args;if(args.file_uri)args={...args,bytesBase64:(await readFile(args.file_uri)).toString('base64')};const response=await drive[next.action.method](args);let rawPath;
    if(next.action.method==='downloadRaw'){rawPath=join(value.base,'response-'+next.actionId+'.json');await writeFile(rawPath,Buffer.from(response.bytesBase64,'base64'));delete response.bytesBase64;}
    await call('respond',{captureId:current.captureId,cursor:current.cursor,actionId:next.actionId,response,...(rawPath?{rawPath}:{})});
  }
  return {current,captured,calls,tickets:[...tickets.values()],drive};
}
export async function replayBoundedPacket(value,result) {
  const path=join(value.stateDirectory,result.current.captureId);let acquiredBytes=0;let readOps=0;
  const bytes=async file=>{const raw=await readFile(file);acquiredBytes+=raw.length;readOps++;return raw;};
  const cursor=JSON.parse(await bytes(join(path,'cursors',result.current.cursor+'.json')));
  const readback=async(metadataIndex,downloadIndex)=>{const metadata=JSON.parse(await bytes(join(path,'responses',String(metadataIndex).padStart(8,'0')+'.json'))).response;const download=JSON.parse(await bytes(join(path,'responses',String(downloadIndex).padStart(8,'0')+'.json'))).response;const raw=await bytes(join(path,'response-raw',String(downloadIndex).padStart(8,'0')+'.json'));return {metadata,download:{...download,bytesBase64:raw.toString('base64')}};};
  const objects=[];for(let index=0;index<value.records.length;index++)objects.push(await readback(index*3+1,index*3+2));const inventory=await readback(value.records.length*3+1,value.records.length*3+2);const anchor=await readback(cursor.actionCount-2,cursor.actionCount-1);
  return {packet:{schemaVersion:1,kind:'automation-reporting-discovery-capture',anchorsBefore:[anchor],anchorsAfter:[anchor],inventories:[inventory],objects},acquiredBytes,readOps,providerCalls:0,assurance:'verification-only replay of retained historical publisher evidence; same anchor evidence reused; no fresh acquisition or latest claim'};
}
