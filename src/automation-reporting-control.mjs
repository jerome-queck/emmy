import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { automationReporting, canonical, recordDigest } from './automation-reporting.mjs';
import { validateControlRecord, registrationFingerprint, registrationKey, expectationKey, expandExpectedSlots } from './automation-reporting-expectations.mjs';
import { strictJson } from './bounded-json.mjs';
const need = (ok, message) => { if (!ok) throw new Error(message); };
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(value);
const fields = (value, required, optional = []) => need(value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value,key)) && Object.keys(value).every(key => [...required,...optional].includes(key)), 'Invalid control request fields');
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z','Z') === value.replace('.000Z','Z');
async function ordinaryDirectory(path) {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path, 'Expected canonical absolute directory');
  for (let current = path;; current = dirname(current)) { const stat = await lstat(current); need(stat.isDirectory() && !stat.isSymbolicLink(), 'Ordinary directory ancestry required'); if (current === parse(current).root) break; }
  need(await realpath(path) === path, 'Canonical directory required');
}
async function boundedBytes(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { const info = await handle.stat(); need(info.isFile() && info.size <= 131072, 'Expected bounded ordinary native file'); const bytes = Buffer.alloc(131073); let size = 0; while (size < bytes.length) { const read = await handle.read(bytes,size,bytes.length-size,null); if (!read.bytesRead) break; size += read.bytesRead; } need(size <= 131072, 'Native definition exceeds bound'); return bytes.subarray(0,size); } finally { await handle.close(); }
}
function nativeString(text, key, required = true) {
  const values = []; let multiline = null; let root = true;
  for (const line of text.split('\n')) {
    if (multiline) { if (line.includes(multiline)) multiline = null; continue; }
    if (/^\s*\[/.test(line)) { root = false; continue; }
    const assignment = /^([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/.exec(line);
    if (!assignment) continue;
    const raw = assignment[2].trim();
    if (raw.startsWith('"""') || raw.startsWith("'''")) {
      const delimiter = raw.slice(0,3); if (!raw.slice(3).includes(delimiter)) multiline = delimiter;
      need(assignment[1] !== key, `Unsupported multiline native ${key}`); continue;
    }
    if (root && assignment[1] === key) values.push([line,raw]);
  }
  need(!multiline, 'Unclosed native multiline string');
  need(values.length <= 1 && (!required || values.length === 1), `Native definition needs exact ${key}`);
  if (!values.length) return null;
  const raw = values[0][1].trim();
  if (/^'[^'\n]*'$/.test(raw)) return raw.slice(1,-1);
  need(/^"(?:[^"\\\n]|\\["\\/bfnrt]|\\u[\da-fA-F]{4})*"$/.test(raw), `Unsupported native ${key} string`);
  return JSON.parse(raw);
}
async function readNative(root, definition, evaluatedAt) {
  fields(definition,['nativeId','targetNamespace','targetAutomationId','timezone','timezoneSource']);
  need(id(definition.nativeId), 'Invalid exact native ID');
  await ordinaryDirectory(root); const selected = join(root,definition.nativeId); await ordinaryDirectory(selected);
  const bytes = await boundedBytes(join(selected,'automation.toml')); const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const status = nativeString(text,'status'); need(['ACTIVE','PAUSED'].includes(status), 'Unsupported native enabled status');
  const nativeId = nativeString(text,'id',false); need(nativeId === null || nativeId === definition.nativeId, 'Native definition ID mismatch');
  const sourceHash = createHash('sha256').update(bytes).digest('hex');
  return { data:{actor:'registration-control',targetNamespace:definition.targetNamespace,targetAutomationId:definition.targetAutomationId,nativeRef:definition.nativeId,enabled:status === 'ACTIVE',rrule:nativeString(text,'rrule'),dtstart:nativeString(text,'dtstart',false),timezone:definition.timezone,timezoneSource:definition.timezoneSource,sourceKind:'native-definition',sourceRef:`native-definition:${definition.nativeId}:sha256:${sourceHash}`,observedAt:evaluatedAt}, sourceHash };
}
function cloudSchedule(definition) {
  need(definition.timing_mode === 'exact_schedule' && typeof definition.is_enabled === 'boolean', 'Cloud definition needs actual exact schedule and enabled status');
  need(typeof definition.schedule === 'string' && definition.schedule.length <= 4000 && ['UTC','Asia/Singapore'].includes(definition.default_timezone), 'Unsupported cloud schedule or default timezone');
  const lines = definition.schedule.replace(/\r\n/g,'\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  need(lines.length === 4 && lines[0] === 'BEGIN:VEVENT' && lines[3] === 'END:VEVENT' && lines[2].startsWith('RRULE:'), 'Unsupported cloud vCalendar shape');
  const start = /^DTSTART(?:;TZID=(UTC|Asia\/Singapore))?:(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/.exec(lines[1]);
  need(start && !(start[1] && start[8]), 'Unsupported cloud DTSTART');
  const timezone = start[8] ? 'UTC' : start[1] ?? definition.default_timezone;
  need(timezone === definition.default_timezone, 'Conflicting cloud DTSTART/default timezone');
  const local = `${start[2]}-${start[3]}-${start[4]}T${start[5]}:${start[6]}:${start[7]}Z`;
  need(stamp(local), 'Invalid cloud DTSTART clock');
  const dtstart = new Date(Date.parse(local)-(timezone === 'Asia/Singapore' ? 28800000 : 0)).toISOString();
  return {rrule:lines[2].slice(6),dtstart,timezone,timezoneSource:start[8] ? 'schedule DTSTART UTC Z; default_timezone corroborated' : start[1] ? 'schedule DTSTART TZID; default_timezone corroborated' : 'actual definition default_timezone; DTSTART without TZID'};
}
async function readCloudFile(path,mappings) {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path,'Expected exact canonical cloud capture file');
  await ordinaryDirectory(dirname(path));
  const bytes = await boundedBytes(path); const capture = strictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  fields(capture,['schemaVersion','clientCapturedAt','source','definitions','limits']);
  fields(capture.source,['tool','operation','assurance','projection']);
  need(capture.schemaVersion === 1 && stamp(capture.clientCapturedAt) && Object.values(capture.source).every(value => typeof value === 'string' && value.length > 0 && value.length <= 2000), 'Invalid cloud capture identity/clock/source');
  need(Array.isArray(capture.definitions) && capture.definitions.length <= 100 && Array.isArray(capture.limits) && capture.limits.length <= 20 && capture.limits.every(value => typeof value === 'string' && value.length <= 2000),'Cloud capture inventory exceeds bound');
  const byId = new Map();
  for(const definition of capture.definitions) {
    fields(definition,['id','title','schedule','timing_mode','is_enabled','default_timezone','next_run_time','last_run_time','updated_at']);
    need(id(definition.id) && !byId.has(definition.id),'Duplicate or invalid cloud source ID');
    need(typeof definition.title === 'string' && definition.title.length <= 400 && ['next_run_time','last_run_time','updated_at'].every(key => definition[key] === null || typeof definition[key] === 'string' && definition[key].length <= 100), 'Invalid cloud source projection');
    byId.set(definition.id,definition);
  }
  const captures = []; const pending = [];
  for(const mapping of mappings) {
    const target = {targetNamespace:mapping.targetNamespace,targetAutomationId:mapping.targetAutomationId};
    try {
      const definition = byId.get(mapping.nativeId); need(definition,'Mapped cloud source definition missing');
      const schedule = cloudSchedule(definition);
      const projection = {schemaVersion:capture.schemaVersion,clientCapturedAt:capture.clientCapturedAt,source:capture.source,definition,limits:capture.limits};
      const sourceHash = createHash('sha256').update(canonical(projection)+'\n').digest('hex');
      captures.push({data:{actor:'registration-control',...target,nativeRef:definition.id,enabled:definition.is_enabled,...schedule,sourceKind:'cloud-definition',sourceRef:`cloud-selected-field-projection:sha256:${sourceHash}`,observedAt:capture.clientCapturedAt},sourceHash});
    } catch(error) { pending.push({...target,reason:error.message}); }
  }
  return {captures,pending};
}
async function ownRecords(request,evaluatedAt) {
  const records = []; let cursor = null; let total;
  do { const page = await automationReporting({action:'list',directory:request.directory,namespace:request.namespace,automationId:request.automationId,limit:200,cursor},{evaluatedAt}); need(page.scan.complete && (total === undefined || total === page.scan.records), 'Control scan incomplete or changed'); total = page.scan.records; for (const {id: ignored,...record} of page.items) records.push(record); need(records.length <= 5000 && (page.nextCursor === null || page.nextCursor !== cursor), 'Control record bound exceeded'); cursor = page.nextCursor; } while (cursor !== null);
  return records;
}
function latest(records,key) {
  const chain = records.filter(record => record.key === key); if (!chain.length) return null;
  const ordered = chain.sort((a,b) => a.revision-b.revision);
  for (let index = 0; index < ordered.length; index++) need(ordered[index].revision === index && ordered[index].previous === (index ? recordDigest(ordered[index-1]) : null), 'Conflicted or incomplete control lineage');
  return ordered.at(-1);
}
async function writeManifest(directory,filename,snapshot) {
  await ordinaryDirectory(directory); const path = join(directory,filename);
  try { const info = await lstat(path); need(info.isFile() && !info.isSymbolicLink(), 'Manifest target must be ordinary file'); } catch(error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = join(directory,`.pending-${randomUUID()}`); let handle;
  try { handle = await open(temporary,'wx',0o600); await handle.writeFile(canonical(snapshot)+'\n'); await handle.close(); handle = null; await rename(temporary,path); } finally { if(handle) await handle.close(); await unlink(temporary).catch(error => { if(error.code !== 'ENOENT') throw error; }); }
  return path;
}
export async function reconcileExpectations(request) {
  fields(request,['directory','namespace','automationId'],['nativeDirectory','nativeDefinitions','cloudCaptureFile','cloudDefinitions','captures','policy','evaluatedAt','apply','manifestDirectory']);
  need(id(request.namespace) && id(request.automationId) && (request.apply === undefined || typeof request.apply === 'boolean'), 'Explicit control identity/apply required');
  const evaluatedAt = request.evaluatedAt ?? new Date().toISOString(); need(stamp(evaluatedAt), 'Invalid control evaluation clock');
  const policy = {lookaheadDays:8,observationGraceSeconds:3600,sourceMaxAgeSeconds:172800,...request.policy};
  fields(policy,['lookaheadDays','observationGraceSeconds','sourceMaxAgeSeconds']);
  need(Number.isSafeInteger(policy.lookaheadDays) && policy.lookaheadDays > 0 && policy.lookaheadDays <= 31 && Number.isSafeInteger(policy.observationGraceSeconds) && policy.observationGraceSeconds >= 0 && policy.observationGraceSeconds <= 604800 && Number.isSafeInteger(policy.sourceMaxAgeSeconds) && policy.sourceMaxAgeSeconds > 0 && policy.sourceMaxAgeSeconds <= 604800, 'Invalid bounded control policy');
  const definitions = request.nativeDefinitions ?? []; const supplied = request.captures ?? []; const cloudDefinitions = request.cloudDefinitions ?? [];
  need(Array.isArray(definitions) && Array.isArray(supplied) && Array.isArray(cloudDefinitions) && definitions.length+supplied.length+cloudDefinitions.length <= 100, 'Capture inventory exceeds bound');
  need((request.cloudCaptureFile === undefined) === (request.cloudDefinitions === undefined), 'Cloud capture file and explicit mappings required together');
  const cloudIds = new Set(); const cloudTargets = new Set();
  for(const mapping of cloudDefinitions) { fields(mapping,['nativeId','targetNamespace','targetAutomationId']); need(id(mapping.nativeId) && id(mapping.targetNamespace) && id(mapping.targetAutomationId),'Invalid cloud mapping identity'); const target = JSON.stringify([mapping.targetNamespace,mapping.targetAutomationId]); need(!cloudIds.has(mapping.nativeId) && !cloudTargets.has(target),'Duplicate cloud mapping'); cloudIds.add(mapping.nativeId); cloudTargets.add(target); }
  const existing = await ownRecords(request,evaluatedAt); const captures = []; const pending = []; const records = []; const publications = []; const manifests = [];
  for (const definition of definitions) {
    try { captures.push(await readNative(request.nativeDirectory,definition,evaluatedAt)); }
    catch(error) { pending.push({targetNamespace:definition.targetNamespace,targetAutomationId:definition.targetAutomationId,reason:error.message}); }
  }
  if(request.cloudCaptureFile !== undefined) {
    try { const result = await readCloudFile(request.cloudCaptureFile,cloudDefinitions); captures.push(...result.captures); pending.push(...result.pending); }
    catch(error) { for(const mapping of cloudDefinitions) pending.push({targetNamespace:mapping.targetNamespace,targetAutomationId:mapping.targetAutomationId,reason:error.message}); }
  }
  for (const data of supplied) { fields(data,['actor','targetNamespace','targetAutomationId','nativeRef','enabled','rrule','dtstart','timezone','timezoneSource','sourceKind','sourceRef','observedAt']); need(data.sourceKind !== 'native-definition','Native definitions require independent native reads'); captures.push({data}); }
  const identities = new Set(); const through = new Date(Date.parse(evaluatedAt)+policy.lookaheadDays*86400000).toISOString();
  const envelope = (kind,key,data,previous=null) => ({schemaVersion:2,namespace:request.namespace,automationId:request.automationId,kind,key,revision:previous ? previous.revision+1 : 0,previous:previous ? recordDigest(previous) : null,recordedAt:evaluatedAt,data});
  for (const capture of captures) {
    const target = {targetNamespace:capture.data.targetNamespace,targetAutomationId:capture.data.targetAutomationId};
    const identity = JSON.stringify(target); need(!identities.has(identity),'Duplicate target capture'); identities.add(identity);
    try {
      const data = {...capture.data,effectiveAt:capture.data.observedAt,observationGraceSeconds:policy.observationGraceSeconds,sourceMaxAgeSeconds:policy.sourceMaxAgeSeconds}; data.fingerprint = registrationFingerprint(data);
      const key = registrationKey(data.targetNamespace,data.targetAutomationId); const prior = latest(existing,key);
      const candidate = validateControlRecord(envelope('registration',key,data,prior));
      need(!prior || Date.parse(data.observedAt) >= Date.parse(prior.data.observedAt),'Capture clock regresses');
      const registration = prior && canonical(prior.data) === canonical(data) ? prior : candidate;
      if(registration !== prior) records.push(registration);
      if (Date.parse(evaluatedAt)-Date.parse(data.observedAt) > policy.sourceMaxAgeSeconds*1000) { pending.push({...target,reason:'source-observation-stale'}); continue; }
      const slots = expandExpectedSlots(registration.data,{from:evaluatedAt,through});
      const expected = [];
      for (const scheduledFor of slots.filter(slot => Date.parse(slot)>Date.parse(evaluatedAt))) {
        const expectedData = {actor:'registration-control',registration:recordDigest(registration),...target,fingerprint:data.fingerprint,scheduledFor,observationDueAt:new Date(Date.parse(scheduledFor)+policy.observationGraceSeconds*1000).toISOString()};
        const slotKey = expectationKey(expectedData); const priorSlot = latest(existing,slotKey);
        need(!priorSlot || priorSlot.kind === 'expectation' && priorSlot.data.fingerprint === data.fingerprint && priorSlot.data.scheduledFor === scheduledFor,'Existing expectation identity mismatch');
        const record = priorSlot ?? validateControlRecord(envelope('expectation',slotKey,expectedData)); expected.push(record); if(!priorSlot) records.push(record);
      }
      const lineage = [...existing,...records].filter(record => record.kind === 'registration' && record.data.targetNamespace === target.targetNamespace && record.data.targetAutomationId === target.targetAutomationId);
      const snapshot = {schemaVersion:1,kind:'automation-expectation-binding',control:{namespace:request.namespace,automationId:request.automationId},target:{namespace:target.targetNamespace,automationId:target.targetAutomationId},evaluatedAt,validThrough:new Date(Math.min(Date.parse(through),Date.parse(data.observedAt)+policy.sourceMaxAgeSeconds*1000)).toISOString(),captureData:capture.data,records:[...new Map([...lineage,...expected].map(record => [recordDigest(record),record])).values()]};
      need(snapshot.records.length <= 256 && Buffer.byteLength(canonical(snapshot)) <= 131072,'Binding snapshot exceeds bound');
      manifests.push({...target,path:null,snapshot});
    } catch(error) { pending.push({...target,reason:error.message}); }
  }
  if(request.apply) {
    for (const record of records) publications.push(await automationReporting({action:'publish-own-record',directory:request.directory,namespace:request.namespace,record},{evaluatedAt}));
    const readback = new Set((await ownRecords(request,evaluatedAt)).map(recordDigest));
    need(records.every(record => readback.has(recordDigest(record))), 'Published control record readback missing');
    need(manifests.every(manifest => manifest.snapshot.records.every(record => readback.has(recordDigest(record)))), 'Binding snapshot dependency readback missing');
    if(request.manifestDirectory) for(const manifest of manifests) manifest.path = await writeManifest(request.manifestDirectory,`${manifest.targetNamespace}--${manifest.targetAutomationId}.json`,manifest.snapshot);
  }
  return {status:pending.length ? 'pending' : 'ready',applied:request.apply === true,evaluatedAt,captures:captures.map(capture => ({...capture.data,...(capture.sourceHash ? {sourceHash:capture.sourceHash} : {})})),pending,records,publications,manifests};
}
