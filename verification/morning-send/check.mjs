import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as original from '../../src/fleet-state.mjs';
import { morningRoot } from '../morning-fixtures.mjs';
import { graph, spec, cfg, precondition, expected as expectedRefusals } from './graph.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
const cwd=process.cwd(), evidence=join(cwd,'.local/verification/morning-send',randomUUID()), scratch=await mkdtemp(join(tmpdir(), 'emmy-morning-send-'));
await mkdir(evidence,{recursive:true}); const report={status:'running',scratch,runs:[]};
const mutations=[
  ['pending-duplicate','IntentSafe', [['!uncertainRun(run) && run.sealed?.outcomeDigest', 'run.sealed?.outcomeDigest'], ['run.sealed && !run.delivery && run.sealed.bodyDigest', 'run.sealed && run.sealed.bodyDigest']]],
  ['destination','DeliveryExact', [['same(command.scope, intent.scope) && ', '']]],
  ['attempt','DeliveryExact', [['run.delivery.sendRef === command.sendRef && ', '']]],
  ['delivered-body','DeliveryExact', [['command.deliveredBodyDigest === run.delivery.bodyDigest', 'true']]],
  ['separate-readback','DeliveryExact', [['command.readbackRef !== command.sendRef && ', '']]],
  ['readback-clock','DeliveryExact', [['Date.parse(command.acquiredAt) >= Date.parse(intent.at) && Date.parse(command.acquiredAt) <= Date.parse(at)', 'true']]],
  ['unknown-resolution','ResolutionSafe', [["command.outcome === 'known-unexecuted' && oneLine(command.sourceRef)", "oneLine(command.sourceRef)"]]],
  ['history','ResolutionSafe', [['run.deliveryHistory.push({ ...run.delivery, resolution: command });', '']]]
];
try {
  assert.equal(process.argv.length,2);
  const coverage=JSON.parse(await readFile('verification/morning-send/coverage.json'));
    for(const [path,want] of Object.entries(coverage.sourceFiles)) { assert.equal(hash(await readFile(path)),want,`Review source ${path}`); assert.equal(hash(execFileSync('git',['show',`${coverage.sourceCommit}:${path}`])),want,`Review source sync ${path}`); }
    for(const [path,want] of Object.entries(coverage.verificationFiles)) assert.equal(hash(await readFile(path)),want,`Review verification ${path}`);
  const jar=join(cwd,'.local/tools/tla2tools-1.7.4.jar'); assert.equal(hash(await readFile(jar)),'936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88');
  const java=process.env.EMMY_JAVA_BIN || execFileSync('which',['java'],{encoding:'utf8'}).trim();
  const version=spawnSync(java,['-version'],{encoding:'utf8'}); assert.equal(version.status,0); assert.match(version.stderr,/version "21[.\"]/); report.java={path:java,version:version.stderr,jarSha256:hash(await readFile(jar))};
  async function run(name,api,expected,focused=false) {
    const g=graph(api), dir=join(scratch,name), out=join(evidence,name); await mkdir(dir); await mkdir(out);
    for(const [file,data] of Object.entries({'MorningSend.tla':spec(g),'MorningSend.cfg':focused ? `INIT Init\nNEXT Next\nINVARIANT ${expected}\n` : cfg,'graph.json':JSON.stringify(g)})) {await writeFile(join(out,file),data); if(file!=='graph.json') await writeFile(join(dir,file),data);}
    const env={...process.env,TMPDIR:dir}; delete env.JAVA_TOOL_OPTIONS; delete env.JDK_JAVA_OPTIONS; delete env._JAVA_OPTIONS;
    const argv=[`-Djava.io.tmpdir=${dir}`,'-XX:+UseParallelGC','-Xmx1g','-cp',jar,'tlc2.TLC','-workers','1','-fp','0','-config','MorningSend.cfg','MorningSend.tla'];
    const result=spawnSync(java,argv,{cwd:dir,env,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024}); const output=(result.stdout??'')+(result.stderr??''); await writeFile(join(out,'tlc.out'),output); assert.equal(result.error,undefined); assert.equal(result.signal,null);
    if(!expected) { assert.equal(result.status,0,output); assert.match(output,/Model checking completed\. No error has been found/); assert.ok(g.states.every(s=>Object.values(s.rules).every(Boolean))); for(const p of [['send','ack'],['send','resolve','retry','retry-ack']]) assert.ok(g.states.some(s=>JSON.stringify(s.path)===JSON.stringify(p))); assert.equal(g.rejected.length,19); }
    else { assert.notEqual(result.status,0); assert.match(output,new RegExp(`Invariant ${expected} is violated`));
      const trace=[...output.matchAll(/State \d+: <[^>\n]+>\nnode = (\d+)/g)].map(m=>Number(m[1])-1); assert.ok(trace.length>1 && trace[0]===0); let broken=precondition().state, restored=precondition().state, refused=null; const steps=[];
      for(let i=1;i<trace.length;i++) { const edge=g.edges.find(e=>e.from===trace[i-1] && e.to===trace[i]); assert.ok(edge); const before=structuredClone(broken); const result=api.fleetTransition(broken,edge.action,morningRoot,edge.at); broken=result.state; assert.deepEqual(broken,g.states[edge.to].state); assert.deepEqual(before,g.states[edge.from].state); assert.equal(result.outcome,edge.outcome);
        if(!refused) { const snap=structuredClone(restored); try {restored=original.fleetTransition(restored,edge.action,morningRoot,edge.at).state;} catch(e) {assert.deepEqual(restored,snap); assert.equal(i,trace.length-1,'refusal must occur on violating action'); assert.equal(e.message,expectedRefusals[edge.choice],`wrong restored refusal ${edge.choice}`); refused=e.message;} }
        steps.push({edge,before,broken,restored:refused?null:restored,refused}); }
      assert.equal(g.states[trace.at(-1)].rules[expected],false); if(name!=='history') assert.ok(refused); else assert.equal(restored.morningRuns[0].deliveryHistory.length,1);
      await writeFile(join(out,'replay.json'),JSON.stringify({expected,trace,steps},null,2)); }
    report.runs.push({name,expected,nodes:g.states.length,edges:g.edges.length,rejected:g.rejected.length,argv,tmpdir:dir});
  }
  await run('baseline',original,null); const source=await readFile('src/morning.mjs','utf8');
  for(const [name,rule,changes] of mutations) { let mutant=source; for(const [from,to] of changes) {assert.equal(mutant.split(from).length,2,`unique mutation ${name}`); mutant=mutant.replace(from,to);} const copy=join(scratch,`source-${name}`); await cp('src',copy,{recursive:true}); await writeFile(join(copy,'morning.mjs'),mutant); const api=await import(pathToFileURL(join(copy,'fleet-state.mjs'))); await run(name,api,rule); if(['destination','attempt','readback-clock'].includes(name)) await run(`${name}-resolution`,api,'ResolutionSafe',true); }
  await run('restored',original,null); report.status='passed';
} catch(e) {report.status='failed';report.error={message:e.message,stack:e.stack};process.exitCode=1;}
await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({status:report.status,evidence,runs:report.runs.length,error:report.error?.message}));
