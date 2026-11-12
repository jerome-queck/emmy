import assert from 'node:assert/strict';
import { morningFixture, morningItem, morningAssessments, morningRoot, morningAt } from '../morning-fixtures.mjs';
import { morningV3Open, morningV3Plan } from '../morning-v3-fixtures.mjs';
import { digest } from '../../src/records.mjs';

export const names = ['IntentSafe', 'DeliveryExact', 'ResolutionSafe'];
export const limits = { depth: 4, nodes: 1000, edges: 1000 };
export function precondition() {
  const f = morningFixture({ open: morningV3Open });
  f.command('review', { items: [morningItem(), morningItem('outlook')] });
  const seal = { step: 'seal', runId: morningV3Open.runId, ...morningAssessments(), deterministic: morningV3Plan(f.run) };
  f.command('seal', seal);
  return { state: structuredClone(f.state), seal };
}
const good = () => Object.fromEntries(names.map(n => [n, true]));
export const expected = {
  'wrong-intent-body':'Send requires exact sealed body and no prior uncertain delivery',
  duplicate:'Version three final report requires resolved current outcomes and resealing after pre-send moves',
  reseal:'Morning delivery already attempted',
  'wrong-ref':'Morning acknowledgement crosses exact send attempt', 'wrong-body':'Morning acknowledgement crosses exact send attempt', 'wrong-resolve':'Morning acknowledgement crosses exact send attempt',
  'wrong-delivered':'Delivery requires separate exact-body readback', 'same-readback':'Delivery requires separate exact-body readback',
  'wrong-scope':'Delivery readback must match exact destination and acquisition interval', early:'Delivery readback must match exact destination and acquisition interval', late:'Delivery readback must match exact destination and acquisition interval', 'wrong-resolve-scope':'Delivery readback must match exact destination and acquisition interval', 'resolve-early':'Delivery readback must match exact destination and acquisition interval', 'resolve-late':'Delivery readback must match exact destination and acquisition interval',
  'missing-evidence':'Uncertain send requires attributable no-effect reconciliation', 'unknown-resolve':'Uncertain send requires attributable no-effect reconciliation',
  'delivered-repeat':'Send requires exact sealed body and no prior uncertain delivery',
  'stale-ack':'Morning acknowledgement crosses exact send attempt', 'stale-resolve':'Morning acknowledgement crosses exact send attempt'
};
const time = n => new Date(Date.parse(morningAt)+n).toISOString();
function menu(node, seal) {
  const run = node.state.morningRuns[0], body = run.sealed.bodyDigest, wrong = digest('other body');
  const send = { step:'send-intent', sendRef:'send-a', bodyDigest:body };
  const ack = { step:'send-ack', sendRef:'send-a', bodyDigest:body, deliveredBodyDigest:body, readbackRef:'readback-a', nativeId:'native-a', scope:morningV3Open.delivery.scope, acquiredAt:time(1000) };
  const resolve = { step:'send-resolve', sendRef:'send-a', bodyDigest:body, sourceRef:'synthetic-inspection', reason:'Attributable no effect', outcome:'known-unexecuted', scope:ack.scope, acquiredAt:time(1000) };
  if (node.path.length === 0) return [['send',send],['wrong-intent-body',{...send,bodyDigest:wrong}]];
  if (node.path.length === 1) return [ ['duplicate',send], ['reseal',seal], ['ack',ack], ['wrong-ref',{...ack,sendRef:'send-b'}], ['wrong-body',{...ack,bodyDigest:wrong}], ['wrong-delivered',{...ack,deliveredBodyDigest:wrong}], ['same-readback',{...ack,readbackRef:'send-a'}], ['wrong-scope',{...ack,scope:{...ack.scope,resource:'other'}}], ['early',{...ack,acquiredAt:'2026-10-25T00:59:59.999Z'}], ['late',{...ack,acquiredAt:time(2001)}], ['resolve',resolve], ['wrong-resolve',{...resolve,sendRef:'send-b'}], ['wrong-resolve-scope',{...resolve,scope:{...resolve.scope,resource:'other'}}], ['resolve-early',{...resolve,acquiredAt:time(-1)}], ['resolve-late',{...resolve,acquiredAt:time(2001)}], ['missing-evidence',{...resolve,sourceRef:''}], ['unknown-resolve',{...resolve,outcome:'unknown'}] ];
  if (node.path.length === 2 && node.path[1] === 'resolve') return [['retry',{...send,sendRef:'send-b'}]];
  if (node.path.length === 2 && node.path[1] === 'ack') return [['delivered-repeat',send]];
  if (node.path.length === 3 && node.path[2] === 'retry') return [ ['retry-ack',{...ack,sendRef:'send-b',readbackRef:'readback-b',nativeId:'native-b',acquiredAt:time(4000)}], ['stale-ack',{...ack,acquiredAt:time(4000)}], ['stale-resolve',{...resolve,acquiredAt:time(4000)}] ];
  return [];
}
export function rules(before, after, choice, command, outcome, at) {
  const r=good(), a=after.morningRuns[0], b=before.morningRuns[0], d=b.delivery;
  if (command.step==='seal') r.IntentSafe = !d;
  if (command.step==='send-intent') r.IntentSafe = !d && command.bodyDigest===b.sealed.bodyDigest && a.delivery?.status==='uncertain' && a.delivery.sendRef===command.sendRef && a.delivery.bodyDigest===b.sealed.bodyDigest && outcome==='morning-retained';
  if (['send-ack','send-resolve'].includes(command.step)) {
    const sameAttempt=d?.status==='uncertain' && d.sendRef===command.sendRef && d.bodyDigest===command.bodyDigest;
    const scoped=JSON.stringify(d?.scope)===JSON.stringify(command.scope) && Date.parse(command.acquiredAt)>=Date.parse(d?.at) && Date.parse(command.acquiredAt)<=Date.parse(at);
    if (command.step==='send-ack') r.DeliveryExact = sameAttempt && scoped && command.readbackRef!==command.sendRef && command.deliveredBodyDigest===d.bodyDigest && a.delivery?.status==='delivered' && a.delivery.sendRef===command.sendRef && a.delivery.bodyDigest===command.bodyDigest && a.delivery.readbackRef===command.readbackRef && a.delivery.nativeId===command.nativeId;
    else r.ResolutionSafe = sameAttempt && scoped && command.outcome==='known-unexecuted' && !!command.sourceRef && !!command.reason && a.delivery===null && a.deliveryHistory?.length===(b.deliveryHistory?.length??0)+1 && JSON.stringify(a.deliveryHistory.at(-1))===JSON.stringify({...d,resolution:command});
  }
  return r;
}
export function graph(api) {
  const {state,seal} = precondition(); const states=[{state,rules:good(),path:[]}], edges=[], rejected=[]; let frontier=[0];
  for (let depth=0;depth<limits.depth;depth++) { const next=[];
    for (const from of frontier) for (const [choice,raw] of menu(states[from],seal)) {
      const command={runId:morningV3Open.runId,...raw}; const action={operation:'morning',command}; const at=time([0,2000,3000,5000][depth]); const before=states[from].state, snapshot=structuredClone(before); let result;
      try { result=api.fleetTransition(before,action,morningRoot,at); }
      catch (e) { assert.deepEqual(before,snapshot); assert.ok(Object.hasOwn(expected,choice),`unexpected refusal ${choice}: ${e.message}`); assert.equal(e.message,expected[choice],`wrong refusal ${choice}`); rejected.push({from,choice,reason:e.message,prior:snapshot,action,at}); continue; }
      assert.deepEqual(before,snapshot); const r=rules(before,result.state,choice,command,result.outcome,at), to=states.length;
      states.push({state:result.state,rules:r,path:[...states[from].path,choice]}); edges.push({from,to,choice,action,at,outcome:result.outcome});
      assert.ok(states.length<=limits.nodes && edges.length<=limits.edges,'graph bound exceeded'); if(Object.values(r).every(Boolean)) next.push(to);
    } frontier=next;
  }
  return {states,edges,rejected,limits};
}
export function inspectGraph(g, expected) {
  const outgoing = g.states.map(() => []);
  for (const edge of g.edges) {
    assert.ok(Number.isInteger(edge.from) && outgoing[edge.from] && Number.isInteger(edge.to) && outgoing[edge.to], 'Invalid graph edge');
    assert.deepEqual(g.states[edge.to].path, [...g.states[edge.from].path, edge.choice], 'Edge disagrees with retained history');
    outgoing[edge.from].push(edge.to);
  }
  const paths = new Map([[0, [0]]]); const queue = [0];
  for (let i = 0; i < queue.length; i++) for (const to of outgoing[queue[i]]) {
    if (!paths.has(to)) { paths.set(to, [...paths.get(queue[i]), to]); queue.push(to); }
  }
  assert.equal(paths.size, g.states.length, 'Graph contains unreachable states');
  if (!expected) {
    assert.ok(g.states.every(s => Object.values(s.rules).every(Boolean)), 'Original graph violates a rule');
    return null;
  }
  assert.ok(names.includes(expected), 'Unknown intended rule');
  const broken = queue.find(i => g.states[i].rules[expected] === false);
  assert.notEqual(broken, undefined, `Mutation survived ${expected}`);
  return paths.get(broken);
}

export function chart(g, trace) {
  const nodes = trace ?? g.states.map((_, i) => i);
  const lines = ['stateDiagram-v2', '  [*] --> n0'];
  for (const i of nodes) {
    const run = g.states[i].state.morningRuns[0];
    const failed = Object.entries(g.states[i].rules).filter(([, ok]) => !ok).map(([name]) => name);
    const label = run.delivery ? `${run.delivery.status} ${run.delivery.sendRef}` : run.deliveryHistory?.length ? 'resolved prior attempt' : 'sealed';
    lines.push(`  n${i}: ${label}${failed.length ? ' / breaks ' + failed.join(', ') : ''}`);
    if (failed.length) lines.push(`  class n${i} breaks`);
  }
  for (const e of g.edges) if (nodes.includes(e.from) && nodes.includes(e.to)) lines.push(`  n${e.from} --> n${e.to}: ${e.choice}`);
  lines.push('  classDef breaks fill:#ffecee,stroke:#e72e3b');
  return { text: lines.join('\n') + '\n', nodes, omittedStates: g.states.length - nodes.length, scope: 'All accepted baseline histories, or the intended counterexample. Full graph.json also retains refusals.' };
}
