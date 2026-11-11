import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '../..');
const jar = resolve(root, '.local/tools/tla2tools-1.7.4.jar');
const actualJar = jar;
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(hash(await readFile(actualJar)), '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88');
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
  const R = await import(pathToFileURL(join(dir, 'src/records.mjs')));
  const W = await import(pathToFileURL(join(dir, 'src/work.mjs')));
  const { reconcileState } = await import(pathToFileURL(join(dir, 'src/responsibilities.mjs')));
  const time = n => new Date(Date.parse('2026-10-22T12:00:00Z') + n * 1000).toISOString();
  const target = { projectId:'alpha', repository:'https://example.invalid/alpha', executor:'local-codex', hostId:'host', nativeProjectId:'native', path:'/fixture', revision:'a'.repeat(40), dirtyDigest:'1'.repeat(64) };
  const criterion = { id:'artifact', description:'Original evidence', evidence:'local-digest', path:'/fixture/artifact', sha256:'0'.repeat(64) };
  const other = { id:'other', description:'Other evidence', evidence:'reported-check' };
  const def = R.recordPayload(R.parseDefinition({ id:'watch', parents:[], goal:'Retain outcome', context:'fixture', target, action:'verify', resource:'alpha', destination:'local', authorityRef:{ reference:'owner', action:'verify', resource:'alpha', destination:'local' }, criteria:[criterion, other], freshness:{maxAgeMs:86400000,sources:[]}, reviewAt:time(1000), feature:{ id:'feature',method:'inspect',intendedEffect:'verify',reviewAt:time(1000) }, lifecycle:{status:'active'} }));
  const { hash: originalHash, ...rawDefinition } = def;
  const weak = R.recordPayload(R.parseDefinition({ ...rawDefinition, parents:[originalHash], criteria:[other] }));
  const obs = (category, observedAt, claims=[], extra={}) => R.recordPayload({ ...R.parseObservation({ responsibilityId:def.id,subject:target,observedAt,observer:'fixture',category,availability:'available',coverage:{complete:true,gaps:[]},claims,evidenceRefs:[],...extra }), origin:category === 'effect' ? 'reported' : 'observed-local' });
  const claim = (item,outcome) => ({ criterionId:item.id,revision:target.revision,kind:item.evidence,specHash:W.criterionHash(item),outcome,evidenceRef:'fixture' });
  const failure=obs('criteria',time(1),[claim(criterion,'fail')]);
  const pass=obs('criteria',time(2),[claim(criterion,'pass')]);
  const targetObs=obs('target',time(0));
  const unrelated=obs('effect',time(3),[],{effects:[{key:W.effectKey(def),status:'completed'}]});
  const bindings={localHostId:'host',hosts:{host:{machine:'fixture'}},projects:{alpha:{hostId:'host',path:'/fixture',nativeProjectId:'native',repository:target.repository}}};
  const catalog={projects:[{id:'alpha',repository:target.repository}]};
  const invoke=(definition,observations,repairs,reviews)=>reconcileState(definition,{definitions:definition===weak?[def,weak]:[def],observations:[targetObs,...observations],repairs,reviews,bindings,catalog,machine:'fixture',asOf:time(10)});
  const first=invoke(def,[failure],[],[]); const finding=first.findings.find(x=>x.code==='criterion-failed'); assert.ok(finding);
  const retained=R.recordPayload({...first,inputHashes:[def.hash,targetObs.hash,failure.hash].sort()});
  const repair=(valid)=>R.recordPayload(R.parseRepair({responsibilityId:def.id, author:'fixture', findingId:finding.id,failureRefs:[failure.hash],expectedSubject:target,recheckRefs:valid?[pass.hash]:[],observedAt:time(4),changeRef:'fix'}));
  const {hash: validRepairHash, ...validRepair} = repair(true);
  const wrongLink=R.recordPayload(R.parseRepair({...validRepair,failureRefs:[pass.hash]}));
  const actions=['Failure','Retain','Pass','Weaken','Unrelated','BadRepair','GoodRepair','InspectFailure','WrongLink','Reconcile'];
  const initial={flags:0, review:'none', seen:false, closed:false, valid:false};
  const states=[initial], edges=[], keys=new Map([[JSON.stringify(initial),0]]);
  for(let i=0;i<states.length;i++) {
    const s=states[i];
    for(let a=0;a<actions.length;a++) {
      const bit=1<<a; if(a!==9 && (s.flags&bit)) continue;
      if(a===1 && !(s.flags&128)) continue;
      if(a===5 && !(s.flags&2)) continue;
      if(a===6 && (!(s.flags&2)||!(s.flags&4))) continue;
      if((a===7 || a===9) && !(s.flags&1)) continue;
      if(a===8 && (!(s.flags&2)||!(s.flags&4))) continue;
      const n={...s,flags:a===9?s.flags:s.flags|bit};
      if(a===7) { const observed = invoke(def,[failure],[],[]); assert.deepEqual(observed, first); assert.equal(observed.findings.find(x=>x.id===finding.id)?.status, 'open'); }
      if(a===9) {
        const f=n.flags; const observations=[...(f&1?[failure]:[]),...(f&4?[pass]:[]),...(f&16?[unrelated]:[])];
        const repairs=[...(f&32?[repair(false)]:[]),...(f&64?[repair(true)]:[]),...(f&256?[wrongLink]:[])];
        const result=invoke(f&8?weak:def,observations,repairs,f&2?[retained]:[]);
        const got=result.findings.find(x=>x.id===finding.id);
        n.review=got?.status??'missing'; n.seen=Boolean(f&2); n.closed=got?.status==='resolved';
        n.valid=Boolean(f&64); // valid repair can only arrive after retained failure and passing recheck
      }
      const key=JSON.stringify(n); let j=keys.get(key); if(j===undefined){j=states.length;keys.set(key,j);states.push(n)}
      edges.push({from:i,to:j,action:actions[a]});
    }
  }
  const bad=states.map((s,i)=>s.seen && (s.review==='missing'||(s.closed&&!s.valid))?i+1:null).filter(Boolean);
  assert.ok(states.some(s=>s.seen&&s.review==='open')); assert.ok(states.some(s=>s.seen&&s.closed&&s.valid));
  const set=xs=>`{${xs.join(', ')}}`;
  const steps=actions.map(action=>`${action} == \\/ ${edges.filter(e=>e.action===action).map(e=>`/\\ node = ${e.from+1} /\\ node' = ${e.to+1}`).join('\n    \\/ ')}`).join('\n');
  const tla=`---- MODULE Closure ----\nEXTENDS Naturals\nVARIABLE node\nInit == node = 1\n${steps}\nNext == ${actions.join(' \\/ ')}\nClosure == node \\notin ${set(bad)}\n====\n`;
  await writeFile(join(dir,'Closure.tla'),tla); await writeFile(join(dir,'Closure.cfg'),'INIT Init\nNEXT Next\nINVARIANT Closure\nCHECK_DEADLOCK FALSE\n');
  await writeFile(join(dir,'graph.json'),JSON.stringify({states,edges,bad},null,2));
  const tlc=spawnSync('java',[`-Djava.io.tmpdir=${temp}`, '-XX:+UseParallelGC','-cp',actualJar,'tlc2.TLC','-workers','1','-config','Closure.cfg','Closure.tla'],{cwd:dir,env:{...process.env,TMPDIR:temp},encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024});
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
