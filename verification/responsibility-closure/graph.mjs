import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function closureGraph(dir) {
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
  return { states, edges, bad, invoke, def, weak, failure, pass, targetObs, unrelated, retained, finding, first, repair, wrongLink };
}
