import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as original from '../../src/fleet-state.mjs';
import { graph, spec, cfg, root, rules } from './graph.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
const work = process.cwd(); const evidence = join(work, '.local/verification/fleet-health', randomUUID());
const scratch = await mkdtemp('/tmp/emmy-fleet-health-'); await mkdir(evidence, {recursive:true});
const jar = join(work, '.local/tools/tla2tools-1.7.4.jar');
const report = {status:'running', scratch, runs:[]};
const mutations = [
 ['fingerprint', '{ condition: current.condition, issueKey: current.issueKey, actionIdentity: current.actionIdentity }', '{ condition: current.condition, issueKey: current.issueKey, actionIdentity: current.actionIdentity, nextAction: current.nextAction }', 'StableEpisode'],
 ['monitor', 'if (bad(monitored.condition))', 'if (false)', 'ConservativeHealth'],
 ['fresh', 'entity.recoveryPending && freshIds.includes(entity.expected.id)', 'entity.recoveryPending', 'FreshRecovery'],
 ['scope', "insist(canonical(row.expected.scope) === canonical(capture.receipt.scope), 'Capture crosses exact source, account or environment scope');", '', 'Admission'],
 ['episode', 'entity.episode++; entity.alertId = addAlert(state, entity.expected.id, current.condition', "entity.episode += state.alerts.some(a => a.id === entity.alertId && a.condition === 'recovered') ? 0 : 1; entity.alertId = addAlert(state, entity.expected.id, current.condition", 'Recurrence']
];
try {
  assert.equal(process.argv.length, 2);
  const coverage = JSON.parse(await readFile(join(work,'verification/fleet-health/coverage.json')));
  for (const [path, expected] of Object.entries(coverage.sourceFiles)) { assert.equal(digest(await readFile(join(work,path))),expected,`Review source ${path}`); assert.equal(digest(execFileSync('git',['show',`${coverage.sourceCommit}:${path}`],{cwd:work})),expected,`Review source sync ${path}`); }
  for (const [path, expected] of Object.entries(coverage.verificationFiles)) assert.equal(digest(await readFile(join(work,path))),expected,`Review verification ${path}`);
  assert.equal(digest(await readFile(jar)), '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88');
  const java = execFileSync('which',['java'],{encoding:'utf8'}).trim(); const version = spawnSync(java,['-version'],{encoding:'utf8'}); assert.equal(version.status,0); assert.match(version.stderr,/version "21[.\"]/);
  report.java = {path:java, version:version.stderr, jarSha256:digest(await readFile(jar))};
  async function run(name, api, expected) {
    const g = graph(api); const dir = join(scratch,name); const outdir = join(evidence,name); await mkdir(dir); await mkdir(outdir);
    const tla = spec(g); await writeFile(join(dir,'FleetHealth.tla'),tla); await writeFile(join(dir,'FleetHealth.cfg'),cfg);
    await writeFile(join(outdir,'FleetHealth.tla'),tla); await writeFile(join(outdir,'FleetHealth.cfg'),cfg); await writeFile(join(outdir,'graph.json'),JSON.stringify(g));
    const env={...process.env,TMPDIR:dir,JAVA_TOOL_OPTIONS:`-Djava.io.tmpdir=${dir}`};
    const result=spawnSync(java,['-XX:+UseParallelGC','-Xmx1g','-cp',jar,'tlc2.TLC','-workers','1','-fp','0','-config','FleetHealth.cfg','FleetHealth.tla'],{cwd:dir,env,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});
    const output=(result.stdout??'')+(result.stderr??''); await writeFile(join(outdir,'tlc.out'),output); assert.equal(result.error,undefined); assert.equal(result.signal,null);
    if (!expected) { assert.equal(result.status,0,output); assert.match(output,/Model checking completed\. No error has been found/); assert.ok(g.states.every(s=>Object.values(s.rules).every(Boolean)));
      for (const path of [['both','auth-fail','auth-fail','auth-good','auth-fail'],['both','monitor-fail','auth-good','monitor-good','empty'],['both','auth-partial','empty','auth-good','stale']]) assert.ok(g.states.some(s=>JSON.stringify(s.path)===JSON.stringify(path)), `Required history ${path}`);
      for (const message of ['Capture crosses exact source, account or environment scope', 'Capture predates retained source', 'Contradictory same-time capture requires a fresh attributable read']) assert.ok(g.rejected.some(r=>r.message===message), `Missing refusal ${message}`);
      const recurrence=g.states.find(s=>JSON.stringify(s.path)===JSON.stringify(['both','auth-fail','auth-fail','auth-good','auth-fail'])); assert.deepEqual(recurrence.state.alerts.filter(a=>a.scope==='protected').map(a=>a.condition),['login-expired','recovered','login-expired']);
      const find = path => g.states.find(s => JSON.stringify(s.path) === JSON.stringify(path));
      const repeatBefore=find(['both','auth-fail']); const repeatAfter=find(['both','auth-fail','auth-fail']);
      assert.equal(repeatAfter.state.entities[1].episode,repeatBefore.state.entities[1].episode); assert.equal(repeatAfter.state.entities[1].alertId,repeatBefore.state.entities[1].alertId);
      const monitorBefore=find(['both','monitor-fail','auth-good']); const monitorAfter=find(['both','monitor-fail','auth-good','monitor-good']);
      assert.equal(monitorAfter.state.entities[1].condition,'healthy'); assert.ok(monitorAfter.state.entities[1].recoveryPending); assert.equal(monitorAfter.state.alerts.filter(a=>a.scope==='protected' && a.condition==='recovered').length,monitorBefore.state.alerts.filter(a=>a.scope==='protected' && a.condition==='recovered').length);
      assert.equal(find(['both','auth-partial']).state.entities[1].issueKey,'coverage-gap');
      assert.equal(find(['both','auth-unprotected']).state.entities[1].issueKey,'protected-content-unverified');
      assert.equal(find(['both','future']).state.entities[1].issueKey,'future-source');
      assert.equal(find(['both','auth-fail','auth-different']).state.entities[1].episode,find(['both','auth-fail']).state.entities[1].episode + 1);
      assert.equal(find(['both','auth-partial','empty','auth-good','stale']).state.entities[1].condition,'stale-source');
      assert.ok(g.states.some(s=>s.state.alerts.some(a=>a.condition==='unknown' && a.issueKey==='not-checked')));
      const counts=output.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/); assert.ok(counts); assert.equal(Number(counts[2].replaceAll(',','')),g.states.length); assert.equal(Number(counts[3].replaceAll(',','')),0); }
    else {
      assert.notEqual(result.status,0); assert.match(output,new RegExp(`Invariant ${expected} is violated`));
      const trace=[...output.matchAll(/State \d+: <[^>\n]+>\nnode = (\d+)/g)].map(m=>Number(m[1])-1); assert.ok(trace.length>1 && trace[0]===0);
      let broken=api.fleetInitial(root), restored=original.fleetInitial(root); const steps=[]; let restoredRefusal=null;
      for(let i=1;i<trace.length;i++) { const edge=g.edges.find(e=>e.from===trace[i-1] && e.to===trace[i]); assert.ok(edge); const before=structuredClone(broken); broken=api.fleetTransition(broken,edge.action,root,edge.at).state; assert.deepEqual(broken,g.states[edge.to].state);
        if (!restoredRefusal) { const old=restored; try { restored=original.fleetTransition(old,edge.action,root,edge.at).state; } catch(e) { assert.equal(expected, 'Admission'); assert.match(e.message, /Capture crosses exact source/); restoredRefusal=e.message; } if (!restoredRefusal) assert.equal(rules(old,restored,edge.action,edge.at)[expected],true); }
        steps.push({choice:edge.choice,action:edge.action,at:edge.at,broken, prior:before, restored:restoredRefusal?null:restored,restoredRefusal}); }
      assert.equal(g.states[trace.at(-1)].rules[expected],false); await writeFile(join(outdir,'replay.json'),JSON.stringify({expected,trace,steps},null,2));
    }
    report.runs.push({name,expected,states:g.states.length,edges:g.edges.length,rejected:g.rejected.length,tmpdir:dir,evidence:outdir});
  }
  await run('baseline',original,null);
  const source=await readFile(join(work,'src/fleet-state.mjs'),'utf8');
  for (const [name,find,replace,rule] of mutations) { assert.equal(source.split(find).length,2,`Unique mutation ${name}`); const copy=join(scratch,`source-${name}`); await cp(join(work,'src'),copy,{recursive:true}); await writeFile(join(copy,'fleet-state.mjs'),source.replace(find,replace)); const api=await import(pathToFileURL(join(copy,'fleet-state.mjs'))); await run(name,api,rule); }
  await run('restored',original,null); report.status='passed';
} catch(error) { report.status='failed'; report.error={message:error.message,stack:error.stack}; process.exitCode=1; }
await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({status:report.status,runs:report.runs.length,evidence,error:report.error?.message}));
