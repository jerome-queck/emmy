import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { boundedFixture } from './fixtures/reporting-bounded.mjs';
import { historyHash } from '../src/automation-reporting-discovery.mjs';
let count=0;
const request=value=>({...value,jobId:'mutation-job-'+count++});
test('actual-source budget and final-fence pairs expose designated wrong results',async()=>{
  const source=await readFile('src/automation-reporting-bounded.mjs','utf8');const output=[];const scratch=await mkdtemp(join(tmpdir(),'bounded-source-pairs-'));
  try{for(const kind of ['budget','seal'])for(const variant of ['baseline','mutant','restored']) {
    const directory=join(scratch,kind,variant);await cp(resolve('src'),directory,{recursive:true});let candidate=source;
    if(variant==='mutant') {if(kind==='budget'){const needle='limit<=HISTORY_JOB_CAP';assert.equal(source.split(needle).length,2);candidate=candidate.replace(needle,'limit<=HISTORY_JOB_CAP*2');}else{const needle="need(actual.file&&!actual.symlink&&actual.dev===expected[0]&&actual.ino===expected[1]&&actual.size===expected[2]&&actual.mtime===expected[3]&&actual.ctime===expected[4],'Source identity or in-place bytes changed immediately before seal');";assert.equal(source.split(needle).length,2);candidate=candidate.replace(needle,'');}}
    await writeFile(join(directory,'automation-reporting-bounded.mjs'),candidate);const implementation=await import(pathToFileURL(join(directory,'automation-reporting-bounded.mjs')));const value=await boundedFixture(1,832);let wrong=false;let result;
    try{if(kind==='budget'){try{result=await implementation.beginBoundedHistory(request(value.request),{limit:300000});wrong=result.status==='incomplete'&&result.actuals.limit===300000;}catch(error){assert.equal(error.message,'Fixed hard maximum job budget exceeded');result={status:'refused-hard-maximum'};}}
      else{let current=await implementation.beginBoundedHistory(request(value.request));while(current.phase!=='membership'){current=await implementation.advanceBoundedHistory(request({stateDirectory:value.stateDirectory,captureId:current.captureId,cursor:current.cursor}),{window:1});assert.equal(current.status,'incomplete',JSON.stringify(current));}const name=(await readdir(join(value.directory,'own')))[0];const file=join(value.directory,'own',name);const bytes=await readFile(file);await writeFile(file,Buffer.from(bytes.toString().replace('completed','failxxxxx')));result=await implementation.advanceBoundedHistory(request({stateDirectory:value.stateDirectory,captureId:current.captureId,cursor:current.cursor}),{window:1});wrong=result.status==='prepared';if(!wrong){assert.equal(result.status,'blocked');assert.match(result.reason,/changed immediately before seal/);}}
      assert.equal(wrong,variant==='mutant',kind+' '+variant+' '+JSON.stringify(result));output.push({kind,variant,sourceSha256:historyHash(Buffer.from(candidate)),wrong,status:result.status});
    }finally{await rm(value.base,{recursive:true,force:true});}
  }}finally{await rm(scratch,{recursive:true,force:true});}
  await mkdir('.local/consumer-evidence',{recursive:true});await writeFile('.local/consumer-evidence/bounded-source-pairs.json',JSON.stringify({productionSourceSha256:historyHash(Buffer.from(source)),output},null,2));
});
