import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as original from '../../src/fleet-state.mjs';
import { morningRoot } from '../morning-fixtures.mjs';
import { graph, inspectGraph, chart, precondition, expected as expectedRefusals } from './graph.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
const cwd=process.cwd(), evidence=join(cwd,'.local/verification/morning-send',randomUUID()), scratch=await mkdtemp(join(tmpdir(), 'emmy-morning-send-'));
await mkdir(evidence,{recursive:true}); const report={status:'running',method:'finite-production-histories',scratch,runs:[],limits:['Historical reducer and staged supplied declarations only; no TLC, current morning producer or native delivery.']};
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
  async function run(name,api,expected) {
    const g=graph(api), out=join(evidence,name); await mkdir(out);
    const bytes=JSON.stringify(g); await writeFile(join(out,'graph.json'),bytes);
    const trace=inspectGraph(g,expected); const view=chart(g,trace);
    await writeFile(join(out,'chart.mmd'),view.text);
    assert.equal(await readFile(join(out,'graph.json'),'utf8'),bytes);
    assert.equal(await readFile(join(out,'chart.mmd'),'utf8'),view.text);
    if(!expected) { for(const p of [['send','ack'],['send','resolve','retry','retry-ack']]) assert.ok(g.states.some(s=>JSON.stringify(s.path)===JSON.stringify(p))); assert.equal(g.rejected.length,19); }
    else { assert.ok(trace.length>1 && trace[0]===0); let broken=precondition().state, restored=precondition().state, refused=null; const steps=[];
      for(let i=1;i<trace.length;i++) { const edge=g.edges.find(e=>e.from===trace[i-1] && e.to===trace[i]); assert.ok(edge); const before=structuredClone(broken); const result=api.fleetTransition(broken,edge.action,morningRoot,edge.at); broken=result.state; assert.deepEqual(broken,g.states[edge.to].state); assert.deepEqual(before,g.states[edge.from].state); assert.equal(result.outcome,edge.outcome);
        if(!refused) { const snap=structuredClone(restored); try {restored=original.fleetTransition(restored,edge.action,morningRoot,edge.at).state;} catch(e) {assert.deepEqual(restored,snap); assert.equal(i,trace.length-1,'refusal must occur on violating action'); assert.equal(e.message,expectedRefusals[edge.choice],`wrong restored refusal ${edge.choice}`); refused=e.message;} }
        steps.push({edge,before,broken,restored:refused?null:restored,refused}); }
      assert.equal(g.states[trace.at(-1)].rules[expected],false); if(name!=='history') assert.ok(refused); else assert.equal(restored.morningRuns[0].deliveryHistory.length,1);
      await writeFile(join(out,'replay.json'),JSON.stringify({expected,trace,steps},null,2)); }
    report.runs.push({name,expected,nodes:g.states.length,edges:g.edges.length,rejected:g.rejected.length,evidence:out,chart:{nodes:view.nodes,omittedStates:view.omittedStates,scope:view.scope}});
  }
  await run('baseline',original,null); const source=await readFile('src/morning.mjs','utf8');
  for(const [name,rule,changes] of mutations) { let mutant=source; for(const [from,to] of changes) {assert.equal(mutant.split(from).length,2,`unique mutation ${name}`); mutant=mutant.replace(from,to);} const copy=join(scratch,`source-${name}`); await cp('src',copy,{recursive:true}); await writeFile(join(copy,'morning.mjs'),mutant); const api=await import(pathToFileURL(join(copy,'fleet-state.mjs'))); await run(name,api,rule); if(['destination','attempt','readback-clock'].includes(name)) await run(`${name}-resolution`,api,'ResolutionSafe'); }
  await run('restored',original,null); report.status='passed';
} catch(e) {report.status='failed';report.error={message:e.message,stack:e.stack};process.exitCode=1;}
await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({status:report.status,evidence,runs:report.runs.length,error:report.error?.message}));
