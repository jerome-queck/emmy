import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { digest } from '../src/records.mjs';
import { bindRegister, registerFixture } from './calendar-register-fixtures.mjs';

export async function driveCalendarRegister({ home, run, scenario, report }) {
  const directory = join(home, 'calendar/register');
  await mkdir(directory, { recursive: true });
  const input = registerFixture(new Date().toISOString());
  const providerData = join(directory, 'provider-data.json');
  const providerLog = join(directory, 'provider-requests.jsonl');
  await writeFile(providerData, JSON.stringify(input.snapshot));
  const academicOsRoot = join(directory, 'academic-os-fixture');
  const packageDirectory = join(academicOsRoot, 'node_modules/google-auth-library');
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(join(academicOsRoot, 'package.json'), '{"name":"synthetic-academic-os"}\n');
  await writeFile(join(packageDirectory, 'package.json'), '{"main":"index.cjs"}\n');
  await writeFile(join(packageDirectory, 'index.cjs'), `const fs = require('node:fs');
module.exports.GoogleAuth = class {
  constructor(options) { this.options = options; }
  async request(options) {
    if (options.method !== 'GET') throw new Error('Non-read refused');
    fs.appendFileSync(process.env.EMMY_REGISTER_PROVIDER_LOG, JSON.stringify({ options, scopes: this.options.scopes })+'\\n');
    const s = JSON.parse(fs.readFileSync(process.env.EMMY_REGISTER_PROVIDER_DATA));
    const path = new URL(options.url).pathname;
    if (path.endsWith('/calendarList')) return { data: { items: s.calendars.map(c => ({id:c.id,summary:c.title,timeZone:c.timeZone,accessRole:c.accessRole})) } };
    if (path.endsWith('/users/@me/lists')) return { data: { items: s.taskLists.map(c => ({id:c.id,title:c.title})) } };
    if (path.endsWith('/events')) return { data: { items: s.calendars[0].events } };
    if (path.endsWith('/tasks')) { if(process.env.EMMY_REGISTER_PROVIDER_FAULT) throw new Error('synthetic request failure'); return { data: { items: s.taskLists[0].tasks } }; }
    throw new Error('Unknown fixture route');
  }
};\n`);
  const configFile = join(directory, 'academic-os.config.json');
  await writeFile(configFile, JSON.stringify({ calendar: { credentials: { scheduledRead: join(directory, 'synthetic-calendar-read.credentials.json') } }, tasks: { credentials: { scheduledRead: join(directory, 'synthetic-tasks-read.credentials.json') } } }));
  const refreshFile = join(directory, 'refresh.json');
  await writeFile(refreshFile, JSON.stringify({ schemaVersion: 1, action: 'refresh', scope: input.snapshot.scope, academicOsRoot, configFile }));
  const env = { EMMY_REGISTER_PROVIDER_DATA: providerData, EMMY_REGISTER_PROVIDER_LOG: providerLog };
  const refresh = await run(['calendar-register', '--file', refreshFile], 0, home, env);
  assert.equal(refresh.status, 'collected'); assert.equal(refresh.execution, 'provider-reads-only'); assert.equal(refresh.taskTiming, 'unsupported-by-rest-needs-native-readback');
  input.snapshot = JSON.parse(await readFile(refresh.file, 'utf8'));
  const snapshotFile = join(directory, 'assessed-snapshot.json');
  const requestFile = join(directory, 'request.json');
  const envelopeFile = join(directory, 'assess.json');
  await writeFile(envelopeFile, JSON.stringify({ schemaVersion: 1, action: 'assess', snapshotFile, requestFile }));
  const assess = async (name, expected, mutate, assertion) => {
    const candidate = structuredClone(input); mutate(candidate); candidate.request.history.completeThrough = new Date().toISOString(); bindRegister(candidate);
    await writeFile(snapshotFile, JSON.stringify(candidate.snapshot)); await writeFile(requestFile, JSON.stringify(candidate.request));
    const before = [digest(await readFile(snapshotFile)), digest(await readFile(requestFile))];
    const result = await run(['calendar-register', '--file', envelopeFile], expected);
    assert.equal(result.execution, 'none'); assertion(result);
    assert.deepEqual([digest(await readFile(snapshotFile)), digest(await readFile(requestFile))], before);
    await writeFile(join(directory, `${name}.result.json`), JSON.stringify(result, null, 2));
    return result;
  };
  const baseline = await assess('proposed', 0, () => {}, result => {
    assert.equal(result.status, 'proposed'); assert.equal(result.proposals[0].sourceTiming.actualDurationMinutes, 40);
    assert.equal(result.proposals[0].changes.durationMinutes, 60); assert.equal(result.availability.freeIntervals.length, 3);
  });
  await assess('unknown-task-timing', 3, candidate => { candidate.request.taskSchedules = []; }, result => assert.equal(result.availability.freeIntervals, null));
  await assess('new-owner-event', 3, candidate => {
    candidate.snapshot.calendars[0].events.push({ id: 'new-owner-event', summary: 'New owner event', status: 'confirmed', start: { dateTime: candidate.request.operations[0].changes.start }, end: { dateTime: candidate.request.operations[0].changes.end } });
  }, result => assert.ok(result.findings.some(row => row.code === 'overlap')));
  await assess('protected-free-meal', 3, candidate => {
    const date = candidate.request.window.start.slice(0, 10);
    Object.assign(candidate.request.operations[0].changes, { start: `${date}T12:00:00Z`, end: `${date}T13:00:00Z` });
  }, result => assert.ok(result.proposals[0].findings.includes('overlap')));
  await assess('unsupported-api-duration', 3, candidate => { candidate.request.operations[0].transport = 'academic-os-mcp'; }, result => assert.ok(result.proposals[0].findings.includes('unsupported-provider-operation')));
  await assess('visual-review-missing', 3, candidate => { delete candidate.request.visualReview; }, result => assert.equal(result.visualReview, 'required'));
  const partial = await run(['calendar-register', '--file', refreshFile], 3, home, { ...env, EMMY_REGISTER_PROVIDER_FAULT: 'partial' });
  assert.equal(partial.status, 'partial'); assert.notEqual(partial.snapshotDigest, refresh.snapshotDigest);
  await writeFile(join(directory, 'partial-refresh.result.json'), JSON.stringify(partial));
  const requests = (await readFile(providerLog, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(requests.every(row => row.options.method === 'GET' && row.scopes.every(scope => scope.endsWith('.readonly'))));
  assert.ok(requests.some(row => row.options.params.showAssigned === true));
  await writeFile(envelopeFile, '{"schemaVersion":1,"schemaVersion":1}'); await run(['calendar-register', '--file', envelopeFile], 2);
  const retain = async path => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) await retain(target);
      else { const bytes = await readFile(target); report.calendar.retainedFiles.push({ path: relative(join(home, 'calendar'), target), bytes: bytes.length, sha256: digest(bytes) }); }
    }
  };
  await retain(directory);
  for (const path of [refresh.file, partial.file]) {
    const bytes = await readFile(path); const destination = join(directory, `${digest(bytes)}.snapshot.json`); await writeFile(destination, bytes);
    report.calendar.retainedFiles.push({ path: relative(join(home, 'calendar'), destination), bytes: bytes.length, sha256: digest(bytes) });
  }
  report.calendarRegister = { snapshotDigest: refresh.snapshotDigest, baselineOperationDigest: baseline.proposals[0].operationDigest, nativeWrites: 0, requests: requests.length, assurance: 'synthetic transport and actual CLI' };
  scenario('calendar-register', 'Fresh real CLI processes collect through a synthetic Academic OS GoogleAuth dependency, retain immutable snapshots, reject partial/native-unknown/overlap/unsupported/visual gaps, preserve input bytes and retain evidence after teardown. No live provider or native operation.');
}
