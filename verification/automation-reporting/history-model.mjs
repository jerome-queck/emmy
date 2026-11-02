import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const key = state => JSON.stringify(state);
function initial() {return {generation:1,item:0,phase:'ready',calls:{},verified:[],closed:[],completed:[],anchor:0,anchorHighWater:0,pointerCalls:{},pendingPointers:[],pointerRaced:false,pointerResponse:null,crashed:false,raced:false,retries:0,failedPhase:null,sourceSets:[['a'],['a','b']]};}
function invariant(state) {
  if(state.anchor<state.anchorHighWater)return 'PointerNeverRegresses';
  if(Object.values(state.calls).some(count=>count>1)) return 'NoDuplicateCreate';
  for(const generation of state.closed) for(let item=0;item<=generation;item++) if(!state.verified.includes(generation+'/'+item)) return 'ClosedInventoryRequiresEveryRawReadback';
  for(const generation of state.completed) if(state.anchor<generation) return 'PublishedPointerRequiresExactReadback';
  if(!state.sourceSets[0].every(value=>state.sourceSets[1].includes(value))) return 'AdmittedHistoryMonotone';
  return null;
}
function successors(state,mutation) {
  const next=[];const id=state.generation+'/'+state.item;
  const add=(action,change)=>next.push({action,state:{...structuredClone(state),...change}});
  if(!state.crashed && !['done','refused','uncertain'].includes(state.phase)) add('Crash/restart',{crashed:true,phase:['intent','uploaded'].includes(state.phase)?'uncertain':['pointer-intent','pointer-wait'].includes(state.phase)?'pointer-recover':state.phase});
  for(let index=0;index<state.pendingPointers.length;index++) {
    const generation=state.pendingPointers[index];const pendingPointers=state.pendingPointers.filter((_,at)=>at!==index);
    add('Held pointer RPC effect lands for generation '+generation,{anchor:generation,anchorHighWater:Math.max(state.anchorHighWater,generation),pendingPointers});
  }
  if(!state.pointerRaced && ['pointer-wait','pointer-recover','pointer-unresolved'].includes(state.phase)) {
    const duplicate=mutation==='pointer-regression' && state.generation===1;
    add(duplicate?'Mutant second callback dispatches same pointer intent':'Second callback loses pointer dispatch claim',{pointerRaced:true,...(duplicate?{pointerCalls:{...state.pointerCalls,[state.generation]:2},pendingPointers:[...state.pendingPointers,state.generation]}:{})});
  }
  if(!state.raced && ['intent','uploaded'].includes(state.phase)) add('Second callback loses claim',mutation==='double-create'&&state.phase==='uploaded'?{raced:true,calls:{...state.calls,[id]:state.calls[id]+1}}:{raced:true});
  switch(state.phase) {
    case 'ready': add('Atomic intent winner',{phase:'intent'});break;
    case 'intent': add('Upload effect',{phase:'uploaded',calls:{...state.calls,[id]:(state.calls[id]??0)+1}});break;
    case 'uploaded': add('Persist exact returned ID',{phase:'known'});break;
    case 'uncertain': if(state.calls[id]===1) add('Retain exact-ID recovery evidence',{phase:'known'});break;
    case 'known': add('Exact metadata matches',{phase:'metadata'});add('Wrong metadata refuses',{phase:'read-failed',failedPhase:'known'});break;
    case 'metadata': add('Complete raw bytes match',{phase:'raw',verified:[...state.verified,id]});add('Wrong raw bytes refuses',{phase:'read-failed',failedPhase:'known'});if(mutation==='close-unverified'&&state.item===state.generation)add('Mutant closes without raw',{phase:'inventory-closed',closed:[...state.closed,state.generation]});break;
    case 'read-failed': if(state.retries<1)add('Explicit retained known-ID readback refresh',{phase:state.failedPhase,failedPhase:null,retries:state.retries+1});break;
    case 'raw': if(state.item<state.generation)add('Next immutable full-history object',{item:state.item+1,phase:'ready',raced:false});else add('Persist verified generation closure',{phase:'inventory-closed',closed:[...state.closed,state.generation]});break;
    case 'inventory-closed': add('Read exact prior anchor',{phase:'pointer-ready'});break;
    case 'pointer-ready': add('Persist update intent',{phase:'pointer-intent'});break;
    case 'pointer-intent': add('Unique pointer dispatch winner',{phase:'pointer-wait',pointerCalls:{...state.pointerCalls,[state.generation]:1},pendingPointers:[...state.pendingPointers,state.generation]});break;
    case 'pointer-wait': add('RPC returns response before or after actual effect',{phase:'pointer-recover',pointerResponse:'returned'});add('RPC timeout leaves actual effect unresolved',{phase:'pointer-recover',pointerResponse:'unknown'});break;
    case 'pointer-recover':
      if(state.anchor===state.generation)add('Exact desired raw readback resolves single dispatched RPC',{phase:'pointer-verified'});
      else add('Old raw readback cannot establish no future effect',{phase:'pointer-unresolved'});
      if(mutation==='close-pointer-without-readback')add('Mutant closes missing pointer',{phase:'pointer-verified'});
      break;
    case 'pointer-unresolved': if(state.retries<1)add('Explicit retained exact-ID metadata and raw refresh',{phase:'pointer-recover',retries:state.retries+1});break;
    case 'pointer-verified': add('Persist pointer closure',{phase:'generation-done',completed:[...state.completed,state.generation]});break;
    case 'generation-done': if(state.generation===1)add('Next generation after owner closure',{generation:2,item:0,phase:'ready',raced:false,pointerRaced:false,pointerResponse:null,...(mutation==='lose-history'?{sourceSets:[['a'],['b']]}:{})});else add('Done',{phase:'done'});break;
  }
  return next;
}
export function checkHistoryModel(mutation=null) {
  const start=initial();const queue=[{state:start,path:[]}];const seen=new Set([key(start)]);let edges=0;
  for(let at=0;at<queue.length;at++) {
    const {state,path}=queue[at];const broken=invariant(state);if(broken)return {mutation,states:seen.size,edges,broken,path,state};
    for(const next of successors(state,mutation)) {edges++;const encoded=key(next.state);if(!seen.has(encoded)){seen.add(encoded);queue.push({state:next.state,path:[...path,next.action]});}}
    assert.ok(seen.size<=10000,'Declared finite model bound exceeded');
  }
  return {mutation,states:seen.size,edges,broken:null,bounds:{owners:1,competingCallbacks:2,records:2,generations:2,crashes:1,explicitReadRetries:1,pointerEffects:'held across callbacks and generation handoff',pointerResponses:['returned','unknown']}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const baseline=checkHistoryModel();assert.equal(baseline.broken,null);const pairs=[];
  for(const [mutation,property] of [['double-create','NoDuplicateCreate'],['close-unverified','ClosedInventoryRequiresEveryRawReadback'],['close-pointer-without-readback','PublishedPointerRequiresExactReadback'],['lose-history','AdmittedHistoryMonotone'],['pointer-regression','PointerNeverRegresses']]) {const result=checkHistoryModel(mutation);assert.equal(result.broken,property);pairs.push(result);}
  const restored=checkHistoryModel();assert.deepEqual(restored,baseline);const directory=resolve('.local/consumer-evidence/history-model');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'report.json'),JSON.stringify({baseline,pairs,restored},null,2)+'\n');console.log(JSON.stringify({baseline,pairs:pairs.map(value=>({mutation:value.mutation,broken:value.broken,path:value.path})),evidence:resolve(directory,'report.json')}));
}
