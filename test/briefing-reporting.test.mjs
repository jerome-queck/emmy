import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, writeFile, readFile, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assessBriefingReporting, reportingCanonical } from '../src/briefing-reporting.mjs';

const at = '2026-11-03T01:00:00.000Z';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function producer(extra = {}) {
  return { action: 'producer', namespace: 'sample-briefing', automationId: 'daily-briefing', invocation: { id: 'run-123', source: 'producer-generated' }, origin: 'scheduled', binding: null, predecessorChain: [], at, execution: 'completed', coverage: 'partial', availability: 'available', summary: 'Completed bounded work; selected source unavailable.', artifactLinks: [], sourceWindow: null, sourceEvidence: { observedAt: null, recordedAt: null }, timing: null, telemetry: null, evidenceRefs: [], ...extra };
}
const slot = scheduledFor => `slot-${sha(reportingCanonical(['sample-briefing', 'daily-briefing', scheduledFor]))}`;
function binding() { const scheduledFor = '2026-11-03T00:00:00.000Z'; return { scheduledFor, occurrenceKey: slot(scheduledFor), observationDueAt: '2026-11-03T01:00:00.000Z', nominalSlotEvidenceRef: 'trusted-scheduler-run', observedAt: '2026-11-02T23:00:00.000Z', validThrough: '2026-11-04T00:00:00.000Z' }; }
function checks(results = [], asOf = at) { return assessBriefingReporting({ action: 'checks', asOf, results }); }
function attempt(extra = {}) { return { kind: 'maintenance', scheduledFor: '2026-11-02T19:15:00.000Z', attemptId: 'attempt-1', requestId: 'request-1', state: 'terminal', execution: 'completed', coverage: 'partial', availability: 'available', sourceEnd: '2026-11-02T16:00:00.000Z', observedAt: '2026-11-02T20:00:00.000Z', recordedAt: '2026-11-02T20:01:00.000Z', snapshotDigest: 'a'.repeat(64), summary: 'Completed intended bounded work with coverage gap.', ...extra }; }
test('expected checks retain exact SGT nominal identity and one-off lifecycle', () => {
  const rows = checks().expected;
  assert.equal(rows.find(row => row.kind === 'maintenance').scheduledFor, '2026-11-02T19:15:00.000Z');
  assert.equal(rows.find(row => row.kind === 'suggestions').scheduledFor, '2026-11-02T20:30:00.000Z');
  assert.equal(rows.find(row => row.kind === 'cleanup').scheduledFor, '2026-11-02T21:00:00.000Z');
  assert.equal(rows.find(row => row.kind === 'token').scheduledFor, '2026-11-01T18:00:00.000Z');
  assert.equal(rows.find(row => row.kind === 'weekly').scheduledFor, '2026-10-31T18:00:00.000Z');
  assert.equal(rows.find(row => row.kind === 'lifecycle').scheduledFor, '2026-10-30T22:00:00.000Z');
  assert.equal(rows[0].minimumSourceEnd, '2026-11-02T16:00:00.000Z');
  const early = checks([], '2026-11-02T18:00:00.000Z').expected;
  assert.equal(early.find(row => row.kind === 'maintenance').state, 'not-due');
  assert.equal(early.find(row => row.kind === 'token').scheduledFor, '2026-11-01T18:00:00.000Z');
});
test('pending is followed through same request, never timed out or replaced by nearby report', () => {
  const pending = attempt({ state: 'pending', execution: 'running', observedAt: null, sourceEnd: null, recordedAt: null, snapshotDigest: null });
  const nearby = attempt({ attemptId: 'other-attempt', scheduledFor: '2026-11-02T19:16:00.000Z' });
  const result = checks([pending, nearby]);
  assert.equal(result.readyForBriefing, false);
  assert.deepEqual(result.follow, [{ requestId: 'request-1', attemptId: 'attempt-1', operation: 'paced-supported-read-same-request' }]);
  assert.equal(result.retainedAttempts.length, 2);
  assert.equal(result.expected[0].attempts.length, 1);
  const farLater = checks([pending], '2026-11-03T15:00:00.000Z');
  assert.equal(farLater.expected[0].state, 'pending');
  assert.equal(farLater.follow[0].requestId, pending.requestId);
});
test('terminal partial completion stays completed; original clocks and conflicts remain visible', () => {
  const result = checks([attempt(), attempt({ attemptId: 'attempt-2', requestId: 'request-2', snapshotDigest: 'b'.repeat(64), sourceEnd: '2026-11-02T15:59:59.999Z' })]);
  const row = result.expected[0];
  assert.equal(result.readyForBriefing, false);
  assert.equal(row.attempts[0].execution, 'completed');
  assert.ok(row.gaps.includes('partial-or-inaccessible-report'));
  assert.ok(row.gaps.includes('original-source-window-incomplete'));
  assert.ok(row.gaps.includes('conflicting-exact-occurrence-snapshots'));
  const dedup = checks([attempt(), attempt({ attemptId: 'attempt-2' })]).expected[0];
  assert.equal(dedup.snapshots.length, 1);
  assert.equal(dedup.attempts.length, 2);
  const stale = checks([attempt({ observedAt: '2026-11-02T12:59:59.999Z', recordedAt: at })]);
  assert.ok(stale.expected[0].gaps.includes('original-source-stale-or-unknown'));
});
test('scheduled-unbound outcome preserves unknown source clocks and stable invocation bytes', () => {
  const input = producer(); const result = assessBriefingReporting(input);
  assert.equal(result.provenance, 'scheduled-unbound'); assert.equal(result.scheduledFor, null); assert.equal(result.occurrenceKey, null);
  const artifact = result.artifacts[0]; const report = artifact.record.data.report;
  assert.equal(report.schemaVersion, 2); assert.deepEqual(report.sourceEvidence, { observedAt: null, recordedAt: null });
  assert.deepEqual(report.generation, { mode: 'producer', attestedBy: input.namespace, basedOn: null });
  assert.equal(report.status, 'completed'); assert.equal(report.coverage, 'partial'); assert.equal(report.generatedAt, at);
  assert.equal(artifact.id, sha(reportingCanonical(artifact.record))); assert.equal(artifact.byteSha256, sha(artifact.bytes));
  assert.equal(artifact.filename, `${artifact.id}.json`); assert.equal(artifact.bytes, `${reportingCanonical(artifact.record)}\n`);
  assert.deepEqual(assessBriefingReporting(input), result);
});
test('bound run owns exact grace occurrence and run-start/terminal predecessor chain', () => {
  const startInput = producer({ binding: binding(), execution: 'running', at: '2026-11-03T00:01:00.000Z' });
  const start = assessBriefingReporting(startInput);
  assert.equal(start.artifacts[0].record.kind, 'occurrence');
  assert.equal(start.artifacts[0].record.data.expiresAt, binding().observationDueAt);
  assert.equal(start.artifacts[1].record.data.report, null);
  const run = start.artifacts[1].record;
  const end = assessBriefingReporting(producer({ binding: binding(), predecessorChain: [run] }));
  assert.equal(end.artifacts.length, 1);
  assert.equal(end.artifacts[0].record.revision, 1);
  assert.equal(end.artifacts[0].record.previous, start.artifacts[1].id);
  assert.equal(end.artifacts[0].record.data.report.provenance, 'scheduled');
  assert.equal(end.artifacts[0].record.data.report.schemaVersion, 1);
  const chain = [run, end.artifacts[0].record];
  assert.throws(() => assessBriefingReporting(producer({ binding: binding(), predecessorChain: chain, execution: 'failed' })), /terminal execution/);
  assert.throws(() => assessBriefingReporting(producer({ binding: binding(), predecessorChain: [end.artifacts[0].record] })), /Incomplete or conflicting/);
  assert.throws(() => assessBriefingReporting(producer({ predecessorChain: chain })), /occurrence/);
  assert.throws(() => assessBriefingReporting(producer({ binding: binding(), predecessorChain: [run], at: '2026-11-03T00:00:00.000Z' })), /predecessor/);
});
test('absent or expired binding never guesses a slot; early terminal report remains null', () => {
  const expired = binding(); expired.validThrough = '2026-11-03T00:59:59.999Z';
  assert.equal(assessBriefingReporting(producer({ binding: expired })).provenance, 'scheduled-unbound');
  const early = assessBriefingReporting(producer({ binding: binding(), at: '2026-11-02T23:59:00.000Z' }));
  assert.equal(early.artifacts.at(-1).record.data.report, null);
  assert.throws(() => assessBriefingReporting(producer({ binding: binding(), predecessorChain: [early.artifacts.at(-1).record] })), /Retrospective attachment/);
  assert.equal(assessBriefingReporting(producer({ origin: 'manual' })).artifacts[0].record.data.report.provenance, 'manual');
  assert.throws(() => assessBriefingReporting(producer({ binding: { ...binding(), nominalSlotEvidenceRef: '' } })), /trusted nominal/);
});
test('producer rejects private payload and invented source clocks; measured timing/telemetry are retained', () => {
  for (const change of [{ summary: 'Contact person@example.com' }, { summary: '/Volumes/Main/private' }, { artifactLinks: [{ label: 'Secret', url: 'https://example.com/?token=value' }] }, { sourceEvidence: { observedAt: '2026-11-03T01:01:00.000Z', recordedAt: null } }, { telemetry: { runtimeMs: -1, inputTokens: null, outputTokens: null, sourceRef: 'meter' } }]) assert.throws(() => assessBriefingReporting(producer(change)));
  const timing = { startedAt: '2026-11-03T00:00:00.000Z', lastHeartbeatAt: null, endedAt: '2026-11-03T00:30:00.000Z', observedAt: '2026-11-03T00:30:00.000Z', sourceRef: 'provider-timing' };
  const telemetry = { runtimeMs: 1800000, inputTokens: null, outputTokens: null, sourceRef: 'provider-telemetry' };
  const data = assessBriefingReporting(producer({ timing, telemetry })).artifacts[0].record.data;
  assert.deepEqual(data.timing, timing); assert.deepEqual(data.telemetry, telemetry);
});
test('accepted upload is not publication; uncertain upload never creates another identity', () => {
  const artifact = assessBriefingReporting(producer()).artifacts[0];
  const request = { action: 'publication', parentId: 'own-parent', artifact: { id: artifact.id, bytes: artifact.bytes }, attempt: { state: 'accepted', nativeId: 'remote-id' }, readback: null };
  const accepted = assessBriefingReporting(request);
  assert.equal(accepted.publication, 'unverified'); assert.deepEqual(accepted.next, { operation: 'read-exact-id', nativeId: 'remote-id', parentId: 'own-parent' });
  const uncertain = assessBriefingReporting({ ...request, attempt: { state: 'uncertain', nativeId: null } });
  assert.equal(uncertain.next, 'hold-rediscover-retained-exact-id-never-create');
  request.readback = { nativeId: 'remote-id', parentId: 'own-parent', bytes: artifact.bytes, observedAt: at, acquiredAt: at };
  const verified = assessBriefingReporting(request); assert.equal(verified.state, 'verified'); assert.equal(verified.delivery, 'unverified');
  for (const change of [{ parentId: 'other' }, { nativeId: 'other' }, { bytes: `${artifact.bytes} ` }]) assert.throws(() => assessBriefingReporting({ ...request, readback: { ...request.readback, ...change } }), /readback differs/);
});
test('generated envelopes pass actual installed frozen cloud prepare and verify caller', async t => {
  const client = resolve('.local/automation-reporting/cloud/06cd9d323497b32b01bef4e0ba3f541b68975836/automation-reporting-cloud-v2.mjs');
  try { await access(client); } catch { t.skip('Optional installed-client compatibility drive requires retained frozen local client; pure wire contracts run everywhere.'); return; }
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'briefing-reporting-wire-'))); t.after(() => rm(directory, { recursive: true, force: true }));
  const historicalBinding = { ...binding(), scheduledFor: '2026-10-31T00:00:00.000Z', occurrenceKey: slot('2026-10-31T00:00:00.000Z'), observationDueAt: '2026-10-31T01:00:00.000Z', observedAt: '2026-10-30T23:00:00.000Z' };
  const historical = { at: '2026-10-31T01:00:00.000Z' };
  for (const [index, artifact] of [...assessBriefingReporting(producer(historical)).artifacts, ...assessBriefingReporting(producer({ ...historical, binding: historicalBinding })).artifacts].entries()) {
    const input = join(directory, `input-${index}.json`); const output = join(directory, artifact.filename); await writeFile(input, JSON.stringify(artifact.record));
    const call = (command, finalFlag, finalValue) => spawnSync(process.execPath, [client, command, '--namespace', artifact.record.namespace, '--automation-id', artifact.record.automationId, '--file', command === 'prepare' ? input : output, finalFlag, finalValue], { encoding: 'utf8' });
    const prepared = call('prepare', '--to', output); assert.equal(prepared.status, 0, prepared.stderr);
    assert.equal(JSON.parse(prepared.stdout).id, artifact.id); assert.equal(await readFile(output, 'utf8'), artifact.bytes);
    const verified = call('verify', '--id', artifact.id); assert.equal(verified.status, 0, verified.stderr); assert.equal(JSON.parse(verified.stdout).writes, false);
    assert.equal(JSON.parse(verified.stdout).byteSha256, artifact.byteSha256);
  }
});
test('pending request survives newer expected occurrence and publication refuses arbitrary canonical JSON', () => {
  const pending = attempt({ state:'pending',execution:'running',observedAt:null,recordedAt:null,sourceEnd:null,snapshotDigest:null });
  const nextDay = checks([pending], '2026-11-04T01:00:00.000Z'); assert.equal(nextDay.readyForBriefing, false); assert.equal(nextDay.follow[0].requestId, pending.requestId);
  const bytes = `${reportingCanonical({hello:'world'})}\n`;
  assert.throws(()=>assessBriefingReporting({action:'publication',parentId:'own',artifact:{id:sha(reportingCanonical({hello:'world'})),bytes},attempt:{state:'not-started',nativeId:null},readback:null}),/members/);
});
test('reporting binding grace stays one hour and original source freshness cannot be extended by validThrough',()=>{
 const stale={...binding(),observedAt:'2026-10-31T00:00:00.000Z',validThrough:'2026-11-30T00:00:00.000Z'};
 assert.equal(assessBriefingReporting(producer({binding:stale})).provenance,'scheduled-unbound');
 assert.throws(()=>assessBriefingReporting(producer({binding:{...binding(),observationDueAt:'2026-11-03T02:00:00.000Z'}})),/grace/);
});
test('due no-attempt checks remain unstarted, explicit terminal missing attempts disclose gaps',()=>{
 const unstarted=checks();assert.equal(unstarted.readyForBriefing,false);assert.ok(unstarted.expected.some(row=>row.state==='unstarted'));
 const missing=unstarted.acquisitionRequired.map(row=>attempt({kind:row.kind,scheduledFor:row.scheduledFor,attemptId:'missing-'+row.kind,requestId:'verified-request-'+row.kind,state:'missing',execution:'unknown',coverage:'unavailable',availability:'unavailable',sourceEnd:null,observedAt:null,recordedAt:null,snapshotDigest:null,summary:'Synthetic supported source verified terminal missing.'}));const result=checks(missing);assert.equal(result.readyForBriefing,true);assert.ok(result.expected.filter(row=>row.state!=='not-due').every(row=>row.state==='attention'));
});
test('missing reporting output cannot turn a known-running check into terminal completion',()=>{
 for(const state of ['missing','offline','denied','owner-intervention']) assert.throws(()=>checks([attempt({state,execution:'running'})]),/known-running/);
 const pending=attempt({state:'pending',execution:'running',availability:'unavailable',snapshotDigest:null});const result=checks([pending]);assert.equal(result.readyForBriefing,false);assert.equal(result.follow[0].requestId,pending.requestId);
});
