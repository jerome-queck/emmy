import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireBriefingSource, awaitBriefingChecks, executeBriefingEffect } from '../src/briefing-cloud-caller.mjs';
import { assessBriefingReporting } from '../src/briefing-reporting.mjs';
import { digest } from '../src/records.mjs';
import { plan, at, policy } from './fixtures/briefing-policy.mjs';

async function sink(t) {
  const directory = await mkdtemp(join(tmpdir(), 'briefing-caller-')); t.after(() => rm(directory, { recursive: true, force: true })); const retained = [];
  return { directory, retained, async retainRaw(bytes, metadata) { const path = join(directory, `${retained.length}.bin`); await writeFile(path, bytes, { flag: 'wx' }); assert.equal(digest(await readFile(path)), metadata.sha256); const receipt = { ...metadata, sourceRef: path }; retained.push(receipt); return receipt; } };
}
const request = { schemaVersion: 1, role: 'gmail', account: 'primary@example.test', environment: 'dot-cloud', surface: 'connector', maxReads: 2, maxBytes: 8192 };
test('production caller retains original paginated bytes and readstate before accounting', async t => {
  const storage = await sink(t); const calls = []; let accounting;
  const result = await acquireBriefingSource(request, { ...storage, policy: policy(), now: () => at, async read(input) { calls.push(input); const value = { observedAt: '2026-11-02T23:59:00.000Z', complete: true, unreadPreserved: true, nextCursor: calls.length === 1 ? 'page-2' : null }; return { raw: JSON.stringify(value), value }; }, async completeAcquisition(value) { accounting = value; assert.equal(storage.retained.length, value.reads); } });
  assert.equal(result.complete, true); assert.equal(calls[1].cursor, 'page-2'); assert.equal(accounting.reads, 2); assert.equal(result.responses[0].response.observedAt, '2026-11-02T23:59:00.000Z');
  assert.equal(result.bytes, storage.retained.reduce((sum, ref) => sum + ref.byteCount, 0));
});
test('caller counts failed reads, retains measured overrun and refuses wrong environment/ticket', async t => {
  const storage = await sink(t); let calls = 0;
  const adapters = { ...storage, policy: policy(), now: () => at, async read() { calls++; throw new Error('provider denied'); }, async completeAcquisition() {} };
  const result = await acquireBriefingSource(request, adapters); assert.equal(result.reads, 1); assert.equal(result.complete, false); assert.equal(result.failure, 'provider denied');
  adapters.read = async () => ({ raw: JSON.stringify({ actual: 'bytes' }) });
  const overrun = await acquireBriefingSource({ ...request, maxBytes: 1 }, adapters); assert.equal(overrun.failure, 'measured-byte-budget-overrun'); assert.equal(overrun.bytes, 18);
  await assert.rejects(acquireBriefingSource({ ...request, role: 'outlook', surface: 'connector' }, adapters), /cloud UI/);
  await assert.rejects(acquireBriefingSource({ ...request, role: 'reporting', surface: 'bridge', admission: { fresh: false, ticket: null } }, adapters), /fresh canonical/);
  assert.equal(calls, 1);
});
test('pending checks continue same admitted request with paced reads until actual terminal', async t => {
  const storage = await sink(t); let paced = 0; let reads = 0;
  const initial = [{ kind: 'maintenance', scheduledFor: '2026-11-02T19:15:00.000Z', attemptId: 'attempt', requestId: 'request', state: 'pending', execution: 'running', coverage: 'partial', availability: 'available', sourceEnd: null, observedAt: null, recordedAt: null, snapshotDigest: null, summary: '' }];
  const blockers = assessBriefingReporting({action:'checks',asOf:at,results:[]}).acquisitionRequired.filter(row=>row.kind!=='maintenance').map(row=>({kind:row.kind,scheduledFor:row.scheduledFor,attemptId:'missing-'+row.kind,requestId:'missing-request-'+row.kind,state:'missing',execution:'unknown',coverage:'unavailable',availability:'unavailable',sourceEnd:null,observedAt:null,recordedAt:null,snapshotDigest:null,summary:'Synthetic exact supported source read returned terminal missing.'}));
  const result = await awaitBriefingChecks([...initial,...blockers], { ...storage, policy: policy(), now: () => at, async pace(follow) { assert.equal(follow.requestId, 'request'); paced++; }, async checkRequest(follow) { return {...request,role:'reporting',surface:'bridge',purpose:'check-progress',targetRequestId:follow.requestId,targetAttemptId:follow.attemptId,maxReads:1,admission:{requestId:'progress-'+(reads+1),owner:'LC1',sourceId:'canonical-automation-report-records'}}; }, async claimAdmission(admission) { return {outcome:'admitted',ticket:{ticket:'ticket-'+(reads+1),status:'attempted',deadline:'2026-11-03T00:01:00.000Z',remainingReads:1,remainingBytes:8192,attemptReads:0,attemptBytes:0,input:{id:admission.requestId,entityIds:['canonical-automation-report-records']}}}; }, async completeAcquisition(result){return {outcome:'completed',state:{jobs:[{ticket:result.ticket,status:'completed'}]}};}, async read(follow) { assert.equal(follow.targetRequestId, 'request'); reads++; const value = { ...initial[0], ...(reads === 3 ? { state: 'terminal', execution: 'completed', observedAt: at, recordedAt: at, sourceEnd: '2026-11-02T16:00:00.000Z', snapshotDigest: 'a'.repeat(64), summary: 'Useful bounded maintenance completed with partial coverage.' } : {}) }; return { raw: JSON.stringify(value), value }; } });
  assert.equal(result.readyForBriefing, true); assert.equal(reads, 3); assert.equal(paced, 3); assert.equal(storage.retained.length, 3);
  const controller = new AbortController(); controller.abort(); const interrupted = await awaitBriefingChecks(initial, { now: () => at }, { signal: controller.signal }); assert.equal(interrupted.interrupted, true); assert.equal(interrupted.readyForBriefing, false);
});
test('production cloud boundary reaches real versioned prepare CLI without any connector effect', async t => {
  const storage = await sink(t); const input = plan(); const path = join(storage.directory, 'request.json'); await writeFile(path, JSON.stringify({ action: 'prepare', input }));
  const called = spawnSync(process.execPath, [resolve('scripts/agent.mjs'), 'daily-briefing', '--file', path], { encoding: 'utf8' }); assert.equal(called.status, 3, called.stdout);
  const bytes = Buffer.from(called.stdout); const retained = await storage.retainRaw(bytes, { sha256: digest(bytes), byteCount: bytes.length });
  const output = JSON.parse(await readFile(retained.sourceRef, 'utf8')); assert.equal(output.ok, true); assert.equal(output.data.contract, 'daily-briefing-v3'); assert.equal(output.data.inputDigest, digest(input)); assert.ok(output.data.body.includes('Archived'));
});
test('implementation authority and unsupported delivery never call a native tool', async () => {
  let effects = 0;
  await assert.rejects(executeBriefingEffect({ schemaVersion: 1, envelope: { action: { operation: 'morning', command: { step: 'send-intent' } } }, pilotAuthority: { accepted: false } }, { chatgpt: { send: async () => effects++ } }), /pilot authority/);
  assert.equal(effects, 0);
});
test('representative provider envelope projects exact raw IDs and rejects divergent normalized state', async t => {
  const storage = await sink(t); let calls = 0;
  const provider = { structuredContent: { messages: [{ id: 'actual-provider-id' }], nextPageToken: null } };
  const projection = { contract: 'gmail-readonly-page-v1', itemsPointer: '/messages', cursorPointer: '/nextPageToken', observedAtPointer: null };
  const adapters = { ...storage, policy: policy(), now: () => at, read: async () => { calls++; return { raw: JSON.stringify(provider), projection }; }, completeAcquisition: async () => {} };
  const result = await acquireBriefingSource(request, adapters); assert.equal(result.complete, true); assert.equal(result.responses[0].response.items[0].id, 'actual-provider-id'); assert.equal(result.responses[0].response.observationBasis, 'current-read-start');
  adapters.read = async () => ({ raw: JSON.stringify(provider), projection, value: { items: [{ id: 'different-id' }] } });
  const divergent = await acquireBriefingSource(request, adapters); assert.equal(divergent.complete, false); assert.match(divergent.failure, /differs from retained raw/);
  assert.equal(storage.retained.length, 2); assert.equal(calls, 1);
});
test('canonical read admission calls sole actual claim route and cannot reuse a null or insufficient ticket', async t => {
  const storage = await sink(t); let reads = 0; let claims = 0;
  const reporting = { ...request, role: 'reporting', surface: 'bridge', admission: { requestId: 'exact-request', owner: 'LC1', sourceId: 'canonical-automation-report-records' } };
  const adapters = { ...storage, now: () => at, read: async () => { reads++; return { raw: JSON.stringify({ observedAt: at, complete: true, nextCursor: null }) }; }, completeAcquisition: async result => ({outcome:'completed',state:{jobs:[{ticket:result.ticket,status:'completed'}]}}), claimAdmission: async () => { claims++; return { outcome: 'admitted', ticket: { ticket: 'exact-ticket', status: 'attempted', deadline: '2026-11-03T00:01:00.000Z', remainingReads: 2, remainingBytes: 8192, attemptReads: 0, attemptBytes: 0, input: { id: 'exact-request', entityIds: ['canonical-automation-report-records'] } } }; } };
  assert.equal((await acquireBriefingSource(reporting, adapters)).complete, true);
  adapters.claimAdmission = async () => ({ outcome: 'reconcile-before-admission', ticket: null }); await assert.rejects(acquireBriefingSource(reporting, adapters), /Null, replayed/); assert.equal(reads, 1); assert.equal(claims, 1);
});
test('tool errors and explicit provider partial coverage cannot establish acquisition success', async t => {
  const storage = await sink(t); const page = { observedAt: at, complete: true, nextCursor: null, unreadPreserved: true };
  const adapters = { ...storage, policy: policy(), now: () => at, read: async () => ({ raw: JSON.stringify({ isError: true, structuredContent: page }) }), completeAcquisition: async () => {} };
  const error = await acquireBriefingSource(request, adapters); assert.equal(error.complete, false); assert.match(error.failure, /tool error/); assert.equal(error.responses[0].raw.sha256, storage.retained[0].sha256);
  adapters.read = async () => ({ raw: JSON.stringify({ messages: [], cursor: null, complete: false }), projection: { contract: 'gmail-readonly-page-v1', itemsPointer: '/messages', cursorPointer: '/cursor', observedAtPointer: null } });
  assert.equal((await acquireBriefingSource(request, adapters)).complete, false);
});
test('invocation UUID is labelled and durably retained once before any effect or upload', async t => {
  const {retainBriefingInvocation}=await import('../src/briefing-cloud-caller.mjs'); const storage=await sink(t); const path=join(storage.directory,'invocation.json'); let writes=0;
  const adapters={readInvocation:async()=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}},retainInvocation:async(key,value)=>{assert.equal(key,'root/day');try{await writeFile(path,JSON.stringify(value),{flag:'wx'});writes++;}catch(error){if(error.code!=='EEXIST')throw error;}return JSON.parse(await readFile(path,'utf8'));}};
  const request={runKey:'root/day',providerInvocationId:null};const first=await retainBriefingInvocation(request,adapters);assert.equal(first.source,'producer-generated'); assert.deepEqual(await retainBriefingInvocation(request,adapters),first);assert.equal(writes,1);
});
test('due unstarted checks return acquisition-required incomplete without spinning or inventing a follow identity',async()=>{
 let reads=0;const result=await awaitBriefingChecks([],{now:()=>at,pace:async()=>{reads++;},read:async()=>{reads++;}});assert.equal(result.readyForBriefing,false);assert.equal(result.completeBriefingAllowed,false);assert.ok(result.acquisitionRequired.length>0);assert.equal(result.follow.length,0);assert.equal(reads,0);
});
test('a successful raw reporting read stays incomplete when canonical acquisition accounting is blocked',async t=>{
 const storage=await sink(t);const scoped={...request,role:'reporting',surface:'bridge',maxReads:1,admission:{requestId:'bounded-report-read',owner:'LC1',sourceId:'canonical-automation-report-records'}};
 const result=await acquireBriefingSource(scoped,{...storage,now:()=>at,claimAdmission:async()=>({outcome:'admitted',ticket:{ticket:'reported-ticket',status:'attempted',deadline:'2026-11-03T00:01:00.000Z',remainingReads:1,remainingBytes:8192,attemptReads:0,attemptBytes:0,input:{id:'bounded-report-read',entityIds:['canonical-automation-report-records']}}}),read:async()=>({raw:JSON.stringify({observedAt:at,complete:true,nextCursor:null})}),completeAcquisition:async()=>({outcome:'blocked',state:{jobs:[{ticket:'reported-ticket',status:'blocked'}]}})});
 assert.equal(result.complete,false);assert.equal(result.failure,'canonical-acquisition-not-completed');assert.equal(storage.retained.length,1);
});
