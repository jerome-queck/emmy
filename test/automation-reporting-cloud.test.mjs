import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, writeFile, rm, stat, symlink, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonical, recordDigest } from '../src/automation-reporting.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const time = '2026-01-01T00:00:00Z';
function record() {
  return { schemaVersion: 1, namespace: 'own', automationId: 'daily', kind: 'run', key: 'run-one', revision: 0, previous: null, recordedAt: time, data: { occurrenceKey: null, execution: 'blocked', coverage: 'partial', report: { schemaVersion: 1, type: 'automation-outcome', runId: 'run-one', provenance: 'manual', scheduledFor: null, status: 'blocked', coverage: 'partial', availability: 'available', summary: 'Waiting for source evidence.', artifactLinks: [], sourceWindow: null, generatedAt: time }, evidenceRefs: [], timing: { startedAt: null, lastHeartbeatAt: null, endedAt: null, observedAt: time, sourceRef: 'observed-source' }, telemetry: { runtimeMs: null, inputTokens: null, outputTokens: null, sourceRef: 'unavailable' } } };
}

test('cloud bundle executes outside repository with exact product validation and safe output', async () => {
  const build = spawnSync(process.execPath, ['scripts/build-reporting-cloud.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'emmy-cloud-'));
  try {
    const executable = join(directory, 'cloud.mjs');
    await copyFile(join(root, '.local/reporting-cloud/automation-reporting-cloud-v1.mjs'), executable);
    const input = join(directory, 'input.json'); const output = join(directory, 'canonical.json');
    const run = (command, extra = []) => spawnSync(process.execPath, [executable, command, '--namespace', 'own', '--automation-id', 'daily', '--file', command === 'verify' ? output : input, ...(command === 'verify' ? ['--id', recordDigest(record())] : ['--to', output]), ...extra], { cwd: directory, encoding: 'utf8' });
    const prepare = async value => { await writeFile(input, typeof value === 'string' ? value : JSON.stringify(value)); return run('prepare'); };
    assert.equal(spawnSync(process.execPath, [executable, '--help'], { cwd: directory }).status, 0);
    const first = await prepare(record()); assert.equal(first.status, 0, first.stderr);
    const result = JSON.parse(first.stdout);
    assert.equal(result.id, recordDigest(record()));
    const bytes = await readFile(output);
    assert.equal(bytes.toString(), canonical(record()) + '\n');
    assert.equal(result.byteSha256, hash(bytes)); assert.equal(result.bytes, bytes.length);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.equal(result.nativePublication, 'pending'); assert.match(result.validation, /ancestry requires namespace history/);
    assert.equal(JSON.parse(run('prepare').stdout).output, 'identical');
    assert.equal(run('verify').status, 0);
    const wrongDigest = spawnSync(process.execPath, [executable, 'verify', '--namespace', 'own', '--automation-id', 'daily', '--file', output, '--id', '0'.repeat(64)], { cwd: directory, encoding: 'utf8' });
    assert.equal(wrongDigest.status, 1); assert.match(wrongDigest.stderr, /digest mismatch/);
    const originalBytes = await readFile(output);
    await writeFile(output, canonical(record()));
    assert.equal(run('verify').status, 1);
    await writeFile(output, originalBytes);
    const different = record(); different.key = 'different'; different.data.report.runId = 'different';
    assert.equal((await prepare(different)).status, 1);
    assert.deepEqual(await readFile(output), originalBytes);
    const cases = [
      ['duplicate key', JSON.stringify(record()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')],
      ['wrong namespace', { ...record(), namespace: 'someone-else' }],
      ['future recorded time', { ...record(), recordedAt: '2999-01-01T00:00:00Z' }],
      ['unknown field', { ...record(), deliveryVerified: true }],
      ['privacy path', { ...record(), key: '/Users/private/report' }],
      ['privacy account', { ...record(), key: 'person@example.com' }],
      ['credential', { ...record(), key: 'Bearer abcdefghijklmnopqrst' }],
      ['oversize', ' '.repeat(32770)],
      ['invalid JSON string', '{\"secret\":\"/Users/private/raw\\x\"}'],
      ['state mismatch', { ...record(), data: { ...record().data, execution: 'unknown' } }],
      ['timing order', { ...record(), data: { ...record().data, timing: { ...record().data.timing, startedAt: time, endedAt: '2025-01-01T00:00:00Z' } } }],
      ['timing future', { ...record(), data: { ...record().data, timing: { ...record().data.timing, observedAt: '2026-01-01T00:00:01Z' } } }],
      ['telemetry fabricated string', { ...record(), data: { ...record().data, telemetry: { ...record().data.telemetry, runtimeMs: 'unknown' } } }],
    ];
    for (const [label, value] of cases) { const attempt = await prepare(value); assert.equal(attempt.status, 1, label); assert.deepEqual(await readFile(output), originalBytes, label); }
    await rm(output);
    const unknown = record(); unknown.data.execution = 'unknown'; unknown.data.report.status = 'unknown'; unknown.data.report.availability = 'unavailable'; unknown.data.report.summary = '';
    assert.equal((await prepare(unknown)).status, 0);
    await rm(output);
    const legacy = record(); legacy.data.execution = 'completed';
    legacy.data.report = { schemaVersion: 1, kind: 'maintenance', scheduledFor: time, runId: legacy.key, provenance: 'manual', status: 'completed', coverage: 'partial', summary: 'Bounded source review.', findings: 0, evidenceRefs: [], sourceWindow: { start: '2025-12-31T00:00:00Z', end: time }, generatedAt: time };
    assert.equal((await prepare(legacy)).status, 0);
    await rm(output);
    const target = join(directory, 'target.json'); await writeFile(target, 'unchanged'); await symlink(target, output);
    assert.equal((await prepare(record())).status, 1); assert.equal(await readFile(target, 'utf8'), 'unchanged');
    await rm(output);
    const ordinary = join(directory, 'ordinary'); await mkdir(ordinary); const alias = join(directory, 'alias'); await symlink(ordinary, alias);
    await writeFile(input, JSON.stringify(record()));
    const badAncestor = spawnSync(process.execPath, [executable, 'prepare', '--namespace', 'own', '--automation-id', 'daily', '--file', input, '--to', join(alias, 'record.json')], { cwd: directory, encoding: 'utf8' });
    assert.equal(badAncestor.status, 1); assert.match(badAncestor.stderr, /ancestry/);
    const source = await readFile(executable, 'utf8');
    assert.equal(source.includes(root), false); assert.equal(source.includes('/Volumes/Main/'), false); assert.equal(source.includes('/Users/'), false);
    assert.equal(/^import .*from ['"]\.\//m.test(source), false);
    const manifest = JSON.parse(await readFile(join(root, '.local/reporting-cloud/manifest.json'), 'utf8'));
    assert.equal(manifest.sha256, hash(Buffer.from(source))); assert.equal(manifest.bytes, Buffer.byteLength(source));
    for (const entry of manifest.sources) { const actual = await readFile(join(root, entry.path)); assert.equal(entry.sha256, hash(actual)); assert.equal(entry.bytes, actual.length); assert.ok(['working-tree','committed'].includes(entry.sourceState)); if (entry.sourceState === 'committed') { assert.match(entry.commit, /^[a-f0-9]{40}$/); } else { assert.equal(entry.commit,null); assert.equal(manifest.sourceState,'working-tree'); } }
    const schema = await readFile(join(root, 'schemas/automation-reporting-v1.schema.json'));
    assert.equal(manifest.schema.sha256, hash(schema));
    assert.deepEqual(await readFile(join(root, '.local/reporting-cloud/automation-reporting-v1.schema.json')), schema);
    const controlSchema = await readFile(join(root,'schemas/automation-reporting-v2.schema.json'));
    assert.equal(manifest.controlSchema.sha256,hash(controlSchema)); assert.equal(manifest.controlSchema.bytes,controlSchema.length);
    assert.deepEqual(await readFile(join(root,'.local/reporting-cloud/automation-reporting-v2.schema.json')),controlSchema);
    if (manifest.sourceState === 'committed') assert.ok(manifest.sources.every(source => source.sourceState === 'committed' && /^[a-f0-9]{40}$/.test(source.commit)));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

import { bindExpectedOccurrence } from '../src/automation-reporting-binding.mjs';
import { registrationFingerprint, registrationKey, expectationKey } from '../src/automation-reporting-expectations.mjs';
function bindingFixture() {
  const observedAt = '2026-01-01T00:00:00.000Z'; const scheduledFor = '2026-01-01T08:00:00.000Z';
  const captureData = {actor:'registration-control',targetNamespace:'own',targetAutomationId:'daily',nativeRef:'cloud-daily',enabled:true,rrule:'FREQ=DAILY;BYHOUR=8;BYMINUTE=0',dtstart:null,timezone:'UTC',timezoneSource:'owner-explicit',sourceKind:'cloud-definition',sourceRef:'capture-one',observedAt};
  const data = {...captureData,effectiveAt:observedAt,observationGraceSeconds:3600,sourceMaxAgeSeconds:172800}; data.fingerprint = registrationFingerprint(data);
  const registration = {schemaVersion:2,namespace:'control',automationId:'upkeep',kind:'registration',key:registrationKey('own','daily'),revision:0,previous:null,recordedAt:observedAt,data};
  const expectedData = {actor:'registration-control',registration:recordDigest(registration),targetNamespace:'own',targetAutomationId:'daily',fingerprint:data.fingerprint,scheduledFor,observationDueAt:'2026-01-01T09:00:00.000Z'};
  const expectation = {schemaVersion:2,namespace:'control',automationId:'upkeep',kind:'expectation',key:expectationKey(expectedData),revision:0,previous:null,recordedAt:observedAt,data:expectedData};
  const snapshot = {schemaVersion:1,kind:'automation-expectation-binding',control:{namespace:'control',automationId:'upkeep'},target:{namespace:'own',automationId:'daily'},evaluatedAt:observedAt,validThrough:'2026-01-03T00:00:00.000Z',captureData,records:[registration,expectation]};
  const request = {namespace:'own',automationId:'daily',controlNamespace:'control',controlAutomationId:'upkeep',scheduledFor,nominalSlotEvidenceRef:'trusted-scheduler-slot',evaluatedAt:'2026-01-01T10:00:00.000Z'};
  return {snapshot,request};
}
test('binding requires exact trusted nominal slot, complete control ancestry and fresh current source', () => {
  const {snapshot,request} = bindingFixture();
  const bound = bindExpectedOccurrence(snapshot,request);
  assert.equal(bound.status,'bound'); assert.equal(bound.execution,'not-inferred');
  assert.equal(bound.expectation,recordDigest(snapshot.records[1]));
  assert.equal(bindExpectedOccurrence(snapshot,{...request,scheduledFor:null}).status,'scheduled-unbound');
  assert.equal(bindExpectedOccurrence(snapshot,{...request,nominalSlotEvidenceRef:null}).occurrenceKey,null);
  assert.throws(() => bindExpectedOccurrence(snapshot,{...request,namespace:'foreign'}), /target mismatch/);
  assert.throws(() => bindExpectedOccurrence(snapshot,{...request,controlNamespace:'foreign'}), /Control identity/);
  assert.throws(() => bindExpectedOccurrence(snapshot,{...request,scheduledFor:'2026-01-01T10:00:00.000Z'}), /absent/);
  assert.throws(() => bindExpectedOccurrence(snapshot,{...request,evaluatedAt:'2026-01-03T00:00:00.001Z'}), /expired/);
  assert.equal(bindExpectedOccurrence(snapshot,{...request,evaluatedAt:'2026-01-01T09:00:00.000Z'}).status,'bound');
  assert.equal(bindExpectedOccurrence(snapshot,{...request,evaluatedAt:'2026-01-01T09:00:00.001Z'}).status,'bound');
  for (const edit of [data => {data.enabled=false;},data => {data.rrule='FREQ=DAILY;BYHOUR=9;BYMINUTE=0';}]) {
    const changed = structuredClone(snapshot); const previous = changed.records[0]; const next = structuredClone(previous);
    edit(next.data); next.data.observedAt='2026-01-01T01:00:00.000Z'; next.data.effectiveAt=next.data.observedAt; next.data.fingerprint=registrationFingerprint(next.data);
    next.recordedAt=next.data.observedAt; next.revision=1; next.previous=recordDigest(previous); changed.records.push(next); changed.evaluatedAt=next.recordedAt;
    const {effectiveAt,observationGraceSeconds,sourceMaxAgeSeconds,fingerprint,...captureData}=next.data; changed.captureData=captureData;
    assert.throws(() => bindExpectedOccurrence(changed,request), /disabled or edited/);
    changed.records.shift(); assert.throws(() => bindExpectedOccurrence(changed,request), /lineage/);
  }
  const missing=structuredClone(snapshot); missing.records.shift(); assert.throws(() => bindExpectedOccurrence(missing,request), /registration lineage/);
  const duplicate=structuredClone(snapshot); duplicate.records.push(structuredClone(snapshot.records[1])); assert.throws(() => bindExpectedOccurrence(duplicate,request), /Duplicate/);
  const malformed=structuredClone(snapshot); malformed.records[0].data.fingerprint='0'.repeat(64); assert.throws(() => bindExpectedOccurrence(malformed,request), /fingerprint/);
  const oversized=structuredClone(snapshot); oversized.records=Array(257).fill(snapshot.records[0]); assert.throws(() => bindExpectedOccurrence(oversized,request), /bounds/);
  const regressing=structuredClone(snapshot); const regressed=structuredClone(regressing.records[0]); regressed.revision=1; regressed.previous=recordDigest(regressing.records[0]); regressed.data.observedAt='2025-12-31T23:00:00.000Z'; regressed.data.effectiveAt=regressed.data.observedAt; regressing.records.push(regressed);
  assert.throws(() => bindExpectedOccurrence(regressing,request), /observation regresses/);
  const retargeted=structuredClone(snapshot); const successor=structuredClone(retargeted.records[1]); successor.revision=1; successor.previous=recordDigest(retargeted.records[1]); successor.data.registration='0'.repeat(64); retargeted.records.push(successor);
  assert.throws(() => bindExpectedOccurrence(retargeted,request), /registration reference changes/);
  const badGrace=structuredClone(snapshot); badGrace.records[1].data.observationDueAt='2026-01-01T10:00:00.000Z';
  assert.throws(() => bindExpectedOccurrence(badGrace,request), /grace mismatch/);
  const foreign=structuredClone(snapshot); foreign.records[1].namespace='foreign'; assert.throws(() => bindExpectedOccurrence(foreign,request), /Foreign control/);
  const stale=structuredClone(snapshot); stale.validThrough='2026-01-04T00:00:00.000Z'; assert.throws(() => bindExpectedOccurrence(stale,{...request,evaluatedAt:'2026-01-03T01:00:00.000Z'}), /stale/);
});

test('copied standalone bind writes private exact binding without repository imports', async () => {
  const build=spawnSync(process.execPath,['scripts/build-reporting-cloud.mjs'],{cwd:root,encoding:'utf8'}); assert.equal(build.status,0,build.stderr);
  const directory=await mkdtemp(join(await realpath(tmpdir()),'emmy-bind-'));
  try {
    const executable=join(directory,'cloud.mjs'); await copyFile(join(root,'.local/reporting-cloud/automation-reporting-cloud-v1.mjs'),executable);
    const {snapshot}=bindingFixture();
    const now=new Date(); const observed=new Date(now.getTime()-3600000).toISOString(); const slot=new Date(now.getTime()+3600000); slot.setUTCMinutes(0,0,0);
    const registration=snapshot.records[0]; registration.recordedAt=observed; registration.data.observedAt=observed; registration.data.effectiveAt=observed; registration.data.rrule=`FREQ=DAILY;BYHOUR=${slot.getUTCHours()};BYMINUTE=0`; registration.data.fingerprint=registrationFingerprint(registration.data);
    snapshot.captureData.observedAt=observed; snapshot.captureData.rrule=registration.data.rrule;
    const expected=snapshot.records[1]; expected.recordedAt=observed; expected.data.registration=recordDigest(registration); expected.data.fingerprint=registration.data.fingerprint; expected.data.scheduledFor=slot.toISOString(); expected.data.observationDueAt=new Date(slot.getTime()+3600000).toISOString(); expected.key=expectationKey(expected.data);
    snapshot.evaluatedAt=observed; snapshot.validThrough=new Date(now.getTime()+86400000).toISOString();
    const input=join(directory,'manifest.json'); const output=join(directory,'binding.json'); await writeFile(input,canonical(snapshot));
    const flags=['bind','--namespace','own','--automation-id','daily','--control-namespace','control','--control-automation-id','upkeep','--file',input,'--to',output];
    const result=spawnSync(process.execPath,[executable,...flags,'--scheduled-for',slot.toISOString(),'--nominal-slot-evidence','trusted-scheduler-slot'],{cwd:directory,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr); assert.equal(JSON.parse(result.stdout).status,'bound'); assert.equal((await stat(output)).mode&0o777,0o600);
    const pending=spawnSync(process.execPath,[executable,...flags.slice(0,-1),join(directory,'pending.json')],{cwd:directory,encoding:'utf8'});
    assert.equal(pending.status,0,pending.stderr); assert.equal(JSON.parse(pending.stdout).status,'scheduled-unbound');
  } finally { await rm(directory,{recursive:true,force:true}); }
});
