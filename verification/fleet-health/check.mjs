import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as original from '../../src/fleet-state.mjs';
import { graph, inspectGraph, chart, root, rules } from './graph.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
const work = process.cwd(); const evidence = join(work, '.local/verification/fleet-health', randomUUID());
const scratch = await mkdtemp(join(tmpdir(), 'emmy-fleet-health-')); await mkdir(evidence, {recursive:true});
const report = {status:'running', method:'finite-production-histories', scratch, runs:[], limits:['Staged finite menus and supplied evidence only; no TLC, universal proof, native execution or provider truth.']};
const mutations = [
 ['fingerprint', '{ condition: current.condition, issueKey: current.issueKey, actionIdentity: current.actionIdentity }', '{ condition: current.condition, issueKey: current.issueKey, actionIdentity: current.actionIdentity, nextAction: current.nextAction }', 'StableEpisode'],
 ['monitor', 'if (bad(monitored.condition))', 'if (false)', 'ConservativeHealth'],
 ['future', 'Date.parse(receipt.capturedAt) > Date.parse(at) || ageMs < 0 || Date.parse(receipt.observedAt) > Date.parse(receipt.capturedAt)', 'false', 'ConservativeHealth'],
 ['fresh', 'entity.recoveryPending && freshIds.includes(entity.expected.id)', 'entity.recoveryPending', 'FreshRecovery'],
 ['pending-clock', 'Date.parse(receipt.observedAt) >= Date.parse(pending.at) && ', '', 'FreshRecovery'],
 ['scope', "insist(canonical(row.expected.scope) === canonical(capture.receipt.scope), 'Capture crosses exact source, account or environment scope');", '', 'Admission'],
 ['episode', 'entity.episode++; entity.alertId = addAlert(state, entity.expected.id, current.condition', "entity.episode += state.alerts.some(a => a.id === entity.alertId && a.condition === 'recovered') ? 0 : 1; entity.alertId = addAlert(state, entity.expected.id, current.condition", 'Recurrence']
];
try {
  assert.equal(process.argv.length, 2);
  const coverage = JSON.parse(await readFile(join(work,'verification/fleet-health/coverage.json')));
  for (const [path, expected] of Object.entries(coverage.sourceFiles)) { assert.equal(digest(await readFile(join(work,path))),expected,`Review source ${path}`); assert.equal(digest(execFileSync('git',['show',`${coverage.sourceCommit}:${path}`],{cwd:work})),expected,`Review source sync ${path}`); }
  for (const [path, expected] of Object.entries(coverage.verificationFiles)) assert.equal(digest(await readFile(join(work,path))),expected,`Review verification ${path}`);
  async function run(name, api, expected) {
    const g = graph(api); const outdir = join(evidence,name); await mkdir(outdir);
    const bytes = JSON.stringify(g); await writeFile(join(outdir,'graph.json'),bytes);
    const trace = inspectGraph(g, expected); const view = chart(g, trace);
    await writeFile(join(outdir,'chart.mmd'),view.text);
    assert.equal(await readFile(join(outdir,'graph.json'),'utf8'),bytes);
    assert.equal(await readFile(join(outdir,'chart.mmd'),'utf8'),view.text);
    if (!expected) {
      for (const path of [['both','auth-fail','auth-fail','auth-good','auth-fail'],['both','monitor-fail','auth-good','monitor-good','empty'],['both','auth-partial','empty','auth-good','stale']]) assert.ok(g.states.some(s=>JSON.stringify(s.path)===JSON.stringify(path)), `Required history ${path}`);
      for (const message of ['Capture crosses exact source, account or environment scope', 'Capture predates retained source', 'Contradictory same-time capture requires a fresh attributable read']) assert.ok(g.rejected.some(r=>r.message===message), `Missing refusal ${message}`);
      const recurrence=g.states.find(s=>JSON.stringify(s.path)===JSON.stringify(['both','auth-fail','auth-fail','auth-good','auth-fail'])); assert.deepEqual(recurrence.state.alerts.filter(a=>a.scope==='protected').map(a=>a.condition),['login-expired','recovered','login-expired']);
      const find = path => g.states.find(s => JSON.stringify(s.path) === JSON.stringify(path));
      const repeatBefore=find(['both','auth-fail']); const repeatAfter=find(['both','auth-fail','auth-fail']);
      assert.equal(repeatAfter.state.entities[1].episode,repeatBefore.state.entities[1].episode); assert.equal(repeatAfter.state.entities[1].alertId,repeatBefore.state.entities[1].alertId);
      const monitorBefore=find(['both','monitor-fail','auth-good']); const monitorAfter=find(['both','monitor-fail','auth-good','monitor-good']);
      assert.equal(monitorAfter.state.entities[1].condition,'healthy'); assert.ok(monitorAfter.state.entities[1].recoveryPending); assert.equal(monitorAfter.state.alerts.filter(a=>a.scope==='protected' && a.condition==='recovered').length,monitorBefore.state.alerts.filter(a=>a.scope==='protected' && a.condition==='recovered').length);
      const oldWrapper=find(['both','stale','policy','old-wrapper']); assert.ok(oldWrapper.state.entities[1].recoveryPending); assert.equal(oldWrapper.state.entities[1].condition,'healthy'); assert.equal(oldWrapper.state.alerts.some(a=>a.scope==='protected' && a.condition==='recovered'),false);
      const afterWrapper=find(['both','stale','policy','old-wrapper','auth-good']); assert.equal(afterWrapper.state.alerts.filter(a=>a.scope==='protected').at(-1).condition,'recovered');
      assert.equal(find(['both','auth-partial']).state.entities[1].issueKey,'coverage-gap');
      assert.equal(find(['both','auth-unprotected']).state.entities[1].issueKey,'protected-content-unverified');
      assert.equal(find(['both','future']).state.entities[1].issueKey,'future-source');
      assert.equal(find(['both','auth-fail','auth-different']).state.entities[1].episode,find(['both','auth-fail']).state.entities[1].episode + 1);
      assert.equal(find(['both','auth-partial','empty','auth-good','stale']).state.entities[1].condition,'stale-source');
      assert.ok(g.states.some(s=>s.state.alerts.some(a=>a.condition==='unknown' && a.issueKey==='not-checked')));
    } else {
      assert.ok(trace.length>1 && trace[0]===0);
      let broken=api.fleetInitial(root), restored=original.fleetInitial(root); const steps=[]; let restoredRefusal=null;
      for(let i=1;i<trace.length;i++) { const edge=g.edges.find(e=>e.from===trace[i-1] && e.to===trace[i]); assert.ok(edge); const before=structuredClone(broken); broken=api.fleetTransition(broken,edge.action,root,edge.at).state; assert.deepEqual(broken,g.states[edge.to].state);
        if (!restoredRefusal) { const old=restored; try { restored=original.fleetTransition(old,edge.action,root,edge.at).state; } catch(e) { assert.equal(expected, 'Admission'); assert.match(e.message, /Capture crosses exact source/); restoredRefusal=e.message; } if (!restoredRefusal) assert.equal(rules(old,restored,edge.action,edge.at)[expected],true); }
        steps.push({choice:edge.choice,action:edge.action,at:edge.at,broken, prior:before, restored:restoredRefusal?null:restored,restoredRefusal}); }
      assert.equal(g.states[trace.at(-1)].rules[expected],false); await writeFile(join(outdir,'replay.json'),JSON.stringify({expected,trace,steps},null,2));
    }
    report.runs.push({name,expected,states:g.states.length,edges:g.edges.length,rejected:g.rejected.length,evidence:outdir,chart: { nodes:view.nodes, omittedStates:view.omittedStates, scope:view.scope }});
  }
  await run('baseline',original,null);
  const source=await readFile(join(work,'src/fleet-state.mjs'),'utf8');
  for (const [name,find,replace,rule] of mutations) { assert.equal(source.split(find).length,2,`Unique mutation ${name}`); const copy=join(scratch,`source-${name}`); await cp(join(work,'src'),copy,{recursive:true}); await writeFile(join(copy,'fleet-state.mjs'),source.replace(find,replace)); const api=await import(pathToFileURL(join(copy,'fleet-state.mjs'))); await run(name,api,rule); }
  await run('restored',original,null); report.status='passed';
} catch(error) { report.status='failed'; report.error={message:error.message,stack:error.stack}; process.exitCode=1; }
await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({status:report.status,runs:report.runs.length,evidence,error:report.error?.message}));
