import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { closureGraph } from './graph.mjs';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '../..');
const jar = resolve(root, '.local/tools/tla2tools-1.7.4.jar');
const actualJar = jar;
const hash = b => createHash('sha256').update(b).digest('hex');
const coverage = JSON.parse(await readFile(join(root, 'verification/responsibility-closure/coverage.json'), 'utf8'));
for (const [path, expected] of Object.entries(coverage.sourceFiles)) {
  assert.equal(hash(await readFile(join(root, path))), expected, `Review closure mapping after ${path} changes`);
  assert.equal(hash(execFileSync('git', ['show', `${coverage.sourceCommit}:${path}`], { cwd: root })), expected, `Closure sync commit differs for ${path}`);
}
for (const [path, expected] of Object.entries(coverage.verificationFiles)) assert.equal(hash(await readFile(join(root, path))), expected, `Review closure verifier after ${path} changes`);
assert.equal(hash(await readFile(actualJar)), '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88');
const java = process.env.EMMY_JAVA_BIN || 'java';
const version = spawnSync(java, ['-version'], { encoding: 'utf8' });
assert.equal(version.status, 0, 'Selected Java must answer the version probe');
assert.match(`${version.stdout}${version.stderr}`, /version "21[."]/, 'Java 21 required');
const evidenceRoot = resolve(root, '.local/verification/responsibility-closure');
await mkdir(evidenceRoot, { recursive:true });
const out = await mkdtemp(join(evidenceRoot, 'run-'));
const mutations = [
  ['retention', 'const findings = new Map(prior);', 'const findings = new Map();'],
  ['link', "if (repair.findingId !== finding.id || !finding.failureRefs.every(ref => repair.failureRefs.includes(ref))) reasons.push('failure-link-mismatch');", "if (false) reasons.push('failure-link-mismatch');"],
  ['recheck', "if (!passing || claims.some(({ claim }) => claim.outcome !== 'pass')) reasons.push(`recheck-failed:${criterion.id}`);", "if (false) reasons.push(`recheck-failed:${criterion.id}`);"]
];
async function run(name, mutation) {
  const dir = join(out, name); await mkdir(dir); const temp = join(dir, 'tmp'); await mkdir(temp); await cp(join(root, 'src'), join(dir, 'src'), { recursive: true });
  if (mutation) {
    const file = join(dir, 'src', mutation[0] === 'retention' ? 'responsibilities.mjs' : 'work.mjs');
    const text = await readFile(file, 'utf8'); assert.equal(text.split(mutation[1]).length, 2); await writeFile(file, text.replace(mutation[1], mutation[2]));
  }
  const { states, edges, bad, invoke, def, weak, failure, pass, targetObs, unrelated, retained, finding, first, repair, wrongLink } = await closureGraph(dir);
  const actions=['Failure','Retain','Pass','Weaken','Unrelated','BadRepair','GoodRepair','InspectFailure','WrongLink','Reconcile'];
  const set=xs=>`{${xs.join(', ')}}`;
  const steps=actions.map(action=>`${action} == \\/ ${edges.filter(e=>e.action===action).map(e=>`/\\ node = ${e.from+1} /\\ node' = ${e.to+1}`).join('\n    \\/ ')}`).join('\n');
  const tla=`---- MODULE Closure ----\nEXTENDS Naturals\nVARIABLE node\nInit == node = 1\n${steps}\nNext == ${actions.join(' \\/ ')}\nClosure == node \\notin ${set(bad)}\n====\n`;
  await writeFile(join(dir,'Closure.tla'),tla); await writeFile(join(dir,'Closure.cfg'),'INIT Init\nNEXT Next\nINVARIANT Closure\nCHECK_DEADLOCK FALSE\n');
  await writeFile(join(dir,'graph.json'),JSON.stringify({states,edges,bad},null,2));
  const tlc=spawnSync(java,[`-Djava.io.tmpdir=${temp}`, '-XX:+UseParallelGC','-cp',actualJar,'tlc2.TLC','-workers','1','-config','Closure.cfg','Closure.tla'],{cwd:dir,env:{...process.env,TMPDIR:temp},encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024});
  const output=(tlc.stdout??'')+(tlc.stderr??''); await writeFile(join(dir,'tlc.out'),output);
  if(mutation) {
    assert.match(output,/Invariant Closure is violated/); const nodes=[...output.matchAll(/node = (\d+)/g)].map(x=>Number(x[1])-1); assert.ok(nodes.length>1);
    const trace=nodes.slice(1).map((n,i)=>{const edge=edges.find(e=>e.from===nodes[i]&&e.to===n);assert.ok(edge); const s=states[n]; if(edge.action==='InspectFailure') assert.deepEqual(invoke(def,[failure],[],[]),first); if(edge.action==='Reconcile') { const f=s.flags; const observations=[failure,...(f&4?[pass]:[]),...(f&16?[unrelated]:[])]; const repairs=[...(f&32?[repair(false)]:[]),...(f&64?[repair(true)]:[]),...(f&256?[wrongLink]:[])]; const result=invoke(f&8?weak:def,observations,repairs,f&2?[retained]:[]); assert.equal(result.findings.find(x=>x.id===finding.id)?.status??'missing',s.review); } return {...edge,state:s}});
    assert.ok(bad.includes(nodes.at(-1)+1)); await writeFile(join(dir,'replay.json'),JSON.stringify(trace,null,2));
  } else { assert.equal(tlc.status,0,output);assert.match(output,/Model checking completed\. No error has been found/); }
  return {name,states:states.length,edges:edges.length,bad:bad.length,path:dir};
}
const runs=[]; for(const [name,...mutation] of [['baseline'],...mutations,['restored']]) runs.push(await run(name,mutation.length?[name,...mutation]:null));
await writeFile(join(out,'report.json'),JSON.stringify({runs},null,2)); console.log(JSON.stringify({out,runs}));
