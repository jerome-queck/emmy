#!/usr/bin/env node
import { readHistoryRequest, prepareHistoryBatch, publicationAction, recordPublicationResponse, recoverPublicationId, retryPublicationRead, materializePublicationUpload } from '../src/automation-reporting-history.mjs';
import { assertNoCredentials } from '../src/reporting-privacy.mjs';
const help='history prepare|next|respond|recover|retry-read|materialize --file ABSOLUTE_PRIVATE_REQUEST. prepare captures complete admitted TARGET history outside Records. next persists one exact connector intent before effect. Execute only execute:true; an unresolved create stays uncertain. respond retains raw actual adapter responses. recover binds an explicitly acquired exact ID, then requires metadata/raw readback. No autonomous local connector, subprocess, provider call or fabricated receipt. Drive raw fetch must use download_raw_file:true/include_base64:false, then materialize returned file reference and encode bounded exact bytes locally. One registered writer per anchor; no CAS/latest promise.';
try {
  const [action,flag,path,...extra]=process.argv.slice(2);
  if(action==='--help'||action==='help') console.log(JSON.stringify({help}));
  else {
    if(!['prepare','next','respond','recover','retry-read','materialize'].includes(action)||flag!=='--file'||!path?.startsWith('/')||extra.length) throw new Error('Expected history action and exact private request file');
    const request=await readHistoryRequest(path); const operations={prepare:prepareHistoryBatch,next:publicationAction,respond:recordPublicationResponse,recover:recoverPublicationId,'retry-read':retryPublicationRead,materialize:materializePublicationUpload};
    const result=await operations[action](request); console.log(JSON.stringify(result)); if(['blocked','uncertain'].includes(result.status)) process.exitCode=3;
  }
} catch(error) {
  let reason=error.code?'Private file unavailable':error.message;try{assertNoCredentials(reason);}catch{reason='Unsafe response refused';}
  console.error(JSON.stringify({status:'blocked',reason}));process.exitCode=2;
}
