#!/usr/bin/env node
import { readSync } from 'node:fs';
import { runBoundedHistoryFile, boundedControllerStatus } from '../src/automation-reporting-bounded.mjs';
try {
  const [action,flag,path,...extra]=process.argv.slice(2);
  if(action==='status'){const options={};const flags=process.argv.slice(3);if(flags.length%2)throw new Error('Expected paired bounded controller launch metadata');for(let index=0;index<flags.length;index+=2){const key={'--state-directory':'stateDirectory','--job-id':'jobId','--execution-id':'executionId','--ledger-cursor':'ledgerCursor','--controller-dev':'controllerDev','--controller-ino':'controllerIno'}[flags[index]];if(!key||options[key]!==undefined)throw new Error('Unknown or duplicate controller option');options[key]=flags[index+1];}console.log(JSON.stringify(await boundedControllerStatus(options)));}
  else if(action==='live') {
    if(flag)throw new Error('live accepts bounded JSON lines containing action and file');
    const runtime={};const input=Buffer.alloc(4096);let used=0;
    while(true){const count=readSync(0,input,used,1,null);if(!count){if(used)throw new Error('Incomplete live request envelope');break;}used++;if(input[used-1]===10){const envelope=JSON.parse(input.toString('utf8',0,used));const result=await runBoundedHistoryFile(envelope.action,envelope.file,{runtime,transportBytes:used,launch:envelope.launch});console.log(JSON.stringify(result));used=0;}else if(used===input.length)throw new Error('Live request envelope exceeds4096-byte bound');}
  } else {
    if(flag!=='--file'||extra.length!==2||extra[0]!=='--launch'||Buffer.byteLength(extra[1])>2048)throw new Error('Expected begin|advance|next|respond|recover|retry-read --file ABSOLUTE_REQUEST --launch JSON');
    console.log(JSON.stringify(await runBoundedHistoryFile(action,path,{launch:JSON.parse(extra[1])})));
  }
} catch(error) {console.error(JSON.stringify({status:'blocked',reason:error.message}));process.exitCode=2;}
