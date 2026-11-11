import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm, realpath, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expandExpectedSlots, registrationFingerprint, registrationKey, expectationKey, validateControlRecord } from '../src/automation-reporting-expectations.mjs';
import { reconcileExpectations } from '../src/automation-reporting-control.mjs';
import { recordDigest, canonical } from '../src/automation-reporting.mjs';
const at = '2026-11-01T00:00:00.000Z';
const capture = {actor:'registration-control',targetNamespace:'daily',targetAutomationId:'daily',nativeRef:'actual-native',enabled:true,rrule:'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',dtstart:null,timezone:'Asia/Singapore',timezoneSource:'owner-declared-session',sourceKind:'cloud-definition',sourceRef:'actual-capture',observedAt:at};
const data = {...capture,effectiveAt:at,observationGraceSeconds:3600,sourceMaxAgeSeconds:172800}; data.fingerprint = registrationFingerprint(data);
const projection = (changes={},options={}) => expandExpectedSlots({...data,...changes},{from:at,through:'2026-11-03T00:00:00.000Z',...options});
async function fixture(fn) { const root = await mkdtemp(join(await realpath(tmpdir()),'emmy-control-')); try { const directory=join(root,'reports'); await mkdir(directory); await fn({root,directory}); } finally { await rm(root,{recursive:true,force:true}); } }
const request = directory => ({directory,namespace:'upkeep',automationId:'upkeep',captures:[capture],evaluatedAt:at});
test('finite DAILY/WEEKLY projects actual SGT/UTC fields and COUNT needs actual DTSTART', () => {
  assert.deepEqual(projection(),['2026-11-01T01:00:00.000Z','2026-11-02T01:00:00.000Z']);
  assert.deepEqual(projection({rrule:'FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=9;BYMINUTE=0'}),['2026-11-02T01:00:00.000Z']);
  assert.deepEqual(projection({rrule:'FREQ=DAILY;COUNT=2;BYHOUR=9;BYMINUTE=0',dtstart:'2026-10-31T01:00:00Z'}),['2026-11-01T01:00:00.000Z']);
  assert.deepEqual(projection({rrule:'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;UNTIL=20261101T010000Z'}),['2026-11-01T01:00:00.000Z']);
  for (const changes of [{rrule:'FREQ=DAILY;COUNT=2;BYHOUR=9;BYMINUTE=0'},{rrule:'FREQ=MONTHLY;BYHOUR=9;BYMINUTE=0'},{timezone:'Europe/London'},{rrule:'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYMONTH=1'},{rrule:'FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0'},{rrule:'FREQ=DAILY;INTERVAL=2;BYHOUR=9;BYMINUTE=0'}]) assert.throws(()=>projection(changes),/Unsupported|requires|needs/);
  assert.throws(()=>projection({}, {limit:1}),/limit/);
  assert.deepEqual(projection({enabled:false}),[]);
});
test('control identities bind exact fingerprint/target/slot and precede schedule', () => {
  const registration={schemaVersion:2,namespace:'upkeep',automationId:'upkeep',kind:'registration',key:registrationKey('daily','daily'),revision:0,previous:null,recordedAt:at,data};
  assert.equal(validateControlRecord(registration),registration);
  assert.throws(()=>validateControlRecord({...registration,data:{...data,fingerprint:'f'.repeat(64)}}),/fingerprint/);
  const expectedData={actor:'registration-control',registration:recordDigest(registration),targetNamespace:'daily',targetAutomationId:'daily',fingerprint:data.fingerprint,scheduledFor:'2026-11-01T01:00:00.000Z',observationDueAt:'2026-11-01T02:00:00.000Z'};
  const expected={...registration,kind:'expectation',key:expectationKey(expectedData),data:expectedData}; validateControlRecord(expected);
  assert.throws(()=>validateControlRecord({...expected,recordedAt:expectedData.scheduledFor}),/precede/);
  assert.notEqual(expectationKey({...expectedData,targetNamespace:'other'}),expected.key);
});
test('dry-run preplans independent future records and complete bounded snapshot without writes', async()=>fixture(async({directory})=>{
  const result=await reconcileExpectations(request(directory)); assert.equal(result.status,'ready'); assert.equal(result.applied,false); assert.equal(result.records.filter(record=>record.kind==='expectation').length,8); assert.deepEqual(await readdir(directory),[]);
  assert.equal(result.manifests[0].snapshot.validThrough,'2026-11-03T00:00:00.000Z'); assert.ok(result.records.every(record=>record.namespace==='upkeep')); assert.ok(result.records.filter(record=>record.kind==='expectation').every(record=>Date.parse(record.recordedAt)<Date.parse(record.data.scheduledFor)));
}));
test('apply/retry preserves exact slots and fresh capture creates registration successor', async()=>fixture(async({directory,root})=>{
  const manifestDirectory=join(root,'bindings');await mkdir(manifestDirectory);
  const first=await reconcileExpectations({...request(directory),apply:true,manifestDirectory}); assert.equal(first.status,'ready'); const names=await readdir(join(directory,'upkeep'));
  const retry=await reconcileExpectations({...request(directory),apply:true});assert.deepEqual(retry.records,[]);assert.deepEqual(await readdir(join(directory,'upkeep')),names);
  const fresh=await reconcileExpectations({...request(directory),captures:[{...capture,observedAt:'2026-11-01T00:01:00.000Z',sourceRef:'actual-new-capture'}],evaluatedAt:'2026-11-01T00:01:00.000Z',apply:true});
  assert.equal(fresh.records.length,1);assert.equal(fresh.records[0].kind,'registration');assert.equal(fresh.records[0].revision,1);assert.equal(fresh.records[0].data.fingerprint,data.fingerprint);
  const original=first.records.find(record=>record.kind==='expectation'); assert.ok(fresh.manifests[0].snapshot.records.some(record=>canonical(record)===canonical(original)));assert.equal(fresh.manifests[0].snapshot.records.filter(record=>record.kind==='registration').length,2);
  const saved=JSON.parse(await readFile(first.manifests[0].path,'utf8'));assert.deepEqual(saved,first.manifests[0].snapshot);
}));
test('schedule edit and disabled read create successors; unsupported/stale capture stays pending', async()=>fixture(async({directory})=>{
  await reconcileExpectations({...request(directory),apply:true});
  const edited=await reconcileExpectations({...request(directory),captures:[{...capture,rrule:'FREQ=DAILY;BYHOUR=10;BYMINUTE=0',observedAt:'2026-11-01T00:01:00Z'}],evaluatedAt:'2026-11-01T00:01:00Z',apply:true});assert.equal(edited.records.length,9);assert.notEqual(edited.records[0].data.fingerprint,data.fingerprint);
  const disabled=await reconcileExpectations({...request(directory),captures:[{...capture,enabled:false,observedAt:'2026-11-01T00:02:00Z'}],evaluatedAt:'2026-11-01T00:02:00Z',apply:true});assert.equal(disabled.records.length,1);assert.equal(disabled.records[0].data.enabled,false);
  const unsupported=await reconcileExpectations({...request(directory),captures:[{...capture,rrule:'FREQ=MONTHLY',observedAt:'2026-11-01T00:03:00Z'}],evaluatedAt:'2026-11-01T00:03:00Z'});assert.equal(unsupported.status,'pending');assert.equal(unsupported.records.filter(record=>record.kind==='expectation').length,0);
  const stale=await reconcileExpectations({...request(directory),evaluatedAt:'2026-11-05T00:00:00Z'});assert.equal(stale.status,'pending');assert.equal(stale.manifests.length,0);
}));
test('native exact ordinary TOML capture ignores prompt text and retains original hash', async()=>fixture(async({root,directory})=>{
  const nativeDirectory=join(root,'automations');await mkdir(nativeDirectory);const selected=join(nativeDirectory,'native');await mkdir(selected);
  const bytes='id = "native"\nprompt = """\nstatus = "PAUSED"\nrrule = "wrong"\n"""\nstatus = "ACTIVE"\nrrule = "FREQ=DAILY;BYHOUR=9;BYMINUTE=0"\n';await writeFile(join(selected,'automation.toml'),bytes);
  const nativeDefinitions=[{nativeId:'native',targetNamespace:'daily',targetAutomationId:'daily',timezone:'Asia/Singapore',timezoneSource:'owner-declared-session'}];
  const result=await reconcileExpectations({...request(directory),captures:[],nativeDirectory,nativeDefinitions});assert.equal(result.status,'ready');assert.equal(result.captures[0].enabled,true);assert.equal(result.captures[0].observedAt,at);assert.match(result.captures[0].sourceHash,/^[a-f0-9]{64}$/);
  await rm(join(selected,'automation.toml'));await symlink(join(root,'absent'),join(selected,'automation.toml'));const unsafe=await reconcileExpectations({...request(directory),captures:[],nativeDirectory,nativeDefinitions});assert.equal(unsafe.status,'pending');assert.equal(unsafe.records.length,0);
}));
test('incomplete source scan refuses before publication', async()=>fixture(async({directory})=>{
  await mkdir(join(directory,'upkeep'));await writeFile(join(directory,'upkeep',`${'f'.repeat(64)}.json`),'{');
  await assert.rejects(reconcileExpectations({...request(directory),apply:true}),/incomplete/);
  assert.deepEqual(await readdir(join(directory,'upkeep')),[`${'f'.repeat(64)}.json`]);
}));
test('native rereads produce actual fresh capture and preserve slot keys', async()=>fixture(async({root,directory})=>{
  const nativeDirectory=join(root,'automations');await mkdir(nativeDirectory);const selected=join(nativeDirectory,'native');await mkdir(selected);
  const path=join(selected,'automation.toml');await writeFile(path,'id = "native"\nstatus = "ACTIVE"\nrrule = "FREQ=DAILY;BYHOUR=9;BYMINUTE=0"\n');
  const nativeDefinitions=[{nativeId:'native',targetNamespace:'daily',targetAutomationId:'daily',timezone:'Asia/Singapore',timezoneSource:'owner-declared-session'}];const source={...request(directory),captures:[],nativeDirectory,nativeDefinitions,apply:true};
  const first=await reconcileExpectations(source);const next=await reconcileExpectations({...source,evaluatedAt:'2026-11-01T00:01:00Z'});
  assert.equal(next.captures[0].sourceHash,first.captures[0].sourceHash);assert.equal(next.captures[0].observedAt,'2026-11-01T00:01:00Z');assert.equal(next.records.length,1);assert.equal(next.records[0].revision,1);
  await writeFile(path,'id = "native"\nstatus = "PAUSED"\nrrule = "FREQ=DAILY;BYHOUR=9;BYMINUTE=0"\n');const paused=await reconcileExpectations({...source,evaluatedAt:'2026-11-01T00:02:00Z'});assert.notEqual(paused.captures[0].sourceHash,first.captures[0].sourceHash);assert.equal(paused.records.length,1);assert.equal(paused.records[0].data.enabled,false);
}));

test('duplicate target captures refuse without writing', async()=>fixture(async({directory})=>{
  await assert.rejects(reconcileExpectations({...request(directory),captures:[capture,capture],apply:true}),/Duplicate/);assert.deepEqual(await readdir(directory),[]);
}));
test('distinct target pairs retain separate binding files despite ambiguous delimiter spellings', async()=>fixture(async({directory,root})=>{
  const manifestDirectory=join(root,'bindings');await mkdir(manifestDirectory);
  const result=await reconcileExpectations({...request(directory),captures:[{...capture,targetNamespace:'a--b',targetAutomationId:'c'},{...capture,targetNamespace:'a',targetAutomationId:'b--c'}],apply:true,manifestDirectory});
  assert.equal(result.status,'ready');assert.equal(new Set(result.manifests.map(item=>item.path)).size,2);assert.equal((await readdir(manifestDirectory)).length,2);
  for(const manifest of result.manifests)assert.deepEqual(JSON.parse(await readFile(manifest.path,'utf8')).target,manifest.snapshot.target);
}));
const cloudDefinition = (id,schedule,extra={}) => ({id,title:'Actual selected projection',schedule,timing_mode:'exact_schedule',is_enabled:true,default_timezone:'Asia/Singapore',next_run_time:null,last_run_time:null,updated_at:null,...extra});
const cloudCapture = definitions => ({schemaVersion:1,clientCapturedAt:at,source:{tool:'actual-peek',operation:'read-only inventory',assurance:'observed-selected-fields',projection:'selected fields; not full API response'},definitions,limits:['No next-run identity inferred.']});
const vevent = (start,rrule) => `BEGIN:VEVENT\nDTSTART;TZID=Asia/Singapore:${start}\nRRULE:${rrule}\nEND:VEVENT`;
async function cloudFixture(fn) { await fixture(async({root,directory})=>{const cloudCaptureFile=join(root,'cloud.json');const config={...request(directory),captures:[],cloudCaptureFile,cloudDefinitions:[{nativeId:'tuesday',targetNamespace:'tuesday',targetAutomationId:'tuesday'},{nativeId:'wednesday',targetNamespace:'wednesday',targetAutomationId:'wednesday'}]}; const captured=cloudCapture([cloudDefinition('tuesday',vevent('20261020T162000','FREQ=WEEKLY;BYDAY=TU;COUNT=4')),cloudDefinition('wednesday',vevent('20261014T132000','FREQ=WEEKLY;BYDAY=WE;COUNT=5'))]);await writeFile(cloudCaptureFile,JSON.stringify(captured));await fn({root,directory,config,captured});}); }
test('cloud file actual DTSTART anchors Tuesday COUNT4 and Wednesday COUNT5 with null nextRun',async()=>cloudFixture(async({config})=>{
  const result=await reconcileExpectations({...config,policy:{lookaheadDays:31}});assert.equal(result.status,'ready');assert.deepEqual(result.records.filter(record=>record.kind==='expectation').map(record=>record.data.scheduledFor).sort(),['2026-11-03T08:20:00.000Z','2026-11-04T05:20:00.000Z','2026-11-10T08:20:00.000Z','2026-11-11T05:20:00.000Z']);
  assert.equal(result.captures[0].dtstart,'2026-10-20T08:20:00.000Z');assert.equal(result.captures[1].dtstart,'2026-10-14T05:20:00.000Z');assert.equal(result.captures[0].observedAt,at);assert.match(result.captures[0].sourceRef,/^cloud-selected-field-projection:sha256:/);
}));
test('cloud file is reread; fresh input clock, edit and disabled status create actual successors',async()=>cloudFixture(async({config,captured})=>{
  const first=await reconcileExpectations({...config,apply:true});
  const later='2026-11-01T00:10:00.000Z'; const unchanged=await reconcileExpectations({...config,evaluatedAt:later,apply:true});assert.equal(unchanged.records.length,0);assert.equal(unchanged.captures[0].observedAt,at);
  captured.clientCapturedAt='2026-11-01T00:05:00.000Z';captured.definitions[0].schedule=vevent('20261020T172000','FREQ=WEEKLY;BYDAY=TU;COUNT=4');captured.definitions[1].is_enabled=false;await writeFile(config.cloudCaptureFile,JSON.stringify(captured));
  const changed=await reconcileExpectations({...config,evaluatedAt:later,apply:true});assert.equal(changed.status,'ready');assert.equal(changed.captures[0].observedAt,captured.clientCapturedAt);assert.equal(changed.captures[1].enabled,false);assert.ok(changed.captures.every(item=>item.sourceHash!==first.captures.find(before=>before.nativeRef===item.nativeRef).sourceHash));assert.deepEqual(changed.records.filter(record=>record.kind==='expectation').map(record=>record.data.scheduledFor),['2026-11-03T09:20:00.000Z']);assert.ok(changed.records.filter(record=>record.kind==='registration').every(record=>record.revision===1));
}));
test('cloud capture refuses duplicate IDs/missing targets and unsupported conflicting schedules',async()=>cloudFixture(async({config,captured,directory})=>{
  captured.definitions.push(captured.definitions[0]);await writeFile(config.cloudCaptureFile,JSON.stringify(captured));const duplicate=await reconcileExpectations({...config,apply:true});assert.equal(duplicate.status,'pending');assert.equal(duplicate.records.length,0);assert.deepEqual(await readdir(directory),[]);
  captured.definitions= captured.definitions.slice(0,1);await writeFile(config.cloudCaptureFile,JSON.stringify(captured));const missing=await reconcileExpectations(config);assert.equal(missing.pending[0].targetNamespace,'wednesday');assert.match(missing.pending[0].reason,/missing/);
  captured.definitions[0].default_timezone='UTC';await writeFile(config.cloudCaptureFile,JSON.stringify(captured));const conflict=await reconcileExpectations(config);assert.equal(conflict.records.length,0);assert.ok(conflict.pending.some(item=>/Conflicting/.test(item.reason)));
  captured.definitions[0].default_timezone='Asia/Singapore';captured.definitions[0].timing_mode='flexible';await writeFile(config.cloudCaptureFile,JSON.stringify(captured));const flexible=await reconcileExpectations(config);assert.equal(flexible.records.length,0);
}));
test('cloud UTC DTSTART remains canonical; invalid dates and unsafe files stay pending',async()=>cloudFixture(async({config,captured,root})=>{
  captured.definitions[0].schedule='BEGIN:VEVENT\nDTSTART:20261020T162000Z\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=4\nEND:VEVENT';captured.definitions[0].default_timezone='UTC';await writeFile(config.cloudCaptureFile,JSON.stringify(captured));const utc=await reconcileExpectations(config);assert.equal(utc.captures[0].dtstart,'2026-10-20T16:20:00.000Z');assert.equal(utc.captures[0].timezone,'UTC');
  captured.definitions[0].schedule=vevent('20260230T162000','FREQ=WEEKLY;BYDAY=TU;COUNT=4');captured.definitions[0].default_timezone='Asia/Singapore';await writeFile(config.cloudCaptureFile,JSON.stringify(captured));const invalid=await reconcileExpectations(config);assert.ok(invalid.pending.some(item=>/Invalid cloud DTSTART/.test(item.reason)));
  await rm(config.cloudCaptureFile);await symlink(join(root,'absent'),config.cloudCaptureFile);const unsafe=await reconcileExpectations(config);assert.equal(unsafe.records.length,0);assert.equal(unsafe.pending.length,2);
}));
