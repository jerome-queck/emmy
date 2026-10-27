import { createRequire } from 'node:module';
import { lstat, mkdir, link, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { boundedJson } from './bounded-json.mjs';
import { collectCalendarSnapshot } from './calendar-collection.mjs';
import { assessCalendarRegister, calendarSnapshotDigest, validateCalendarSnapshot } from './calendar-register.mjs';
import { assessCalendarHandoff } from './calendar-handoff.mjs';

const maxBytes = 32 * 1024 * 1024;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export async function retainCalendarSnapshot(home, snapshot) {
  validateCalendarSnapshot(snapshot);
  const snapshotDigest = calendarSnapshotDigest(snapshot);
  const bytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  requireValue(bytes.length <= maxBytes, 'Snapshot exceeds 32 MiB. Retain narrower explicit coverage; do not call it complete.');
  const directory = join(home, 'calendar-register', 'snapshots');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${snapshotDigest}.json`);
  const temporary = join(directory, `.pending-${randomUUID()}`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    try { await link(temporary, file); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const existing = await lstat(file);
    requireValue(existing.isFile() && !existing.isSymbolicLink(), 'Snapshot destination must be an ordinary file');
    requireValue((await readFile(file)).equals(bytes), 'Existing snapshot bytes disagree with their content identity');
  } finally { await rm(temporary, { force: true }); }
  return { file, snapshotDigest, bytes: bytes.length };
}

export async function createAcademicOsCalendarReader({ academicOsRoot, configFile }) {
  requireValue(typeof academicOsRoot === 'string' && typeof configFile === 'string', 'Academic OS root and existing private configuration are required');
  const config = await boundedJson(resolve(configFile), 1024 * 1024);
  const require = createRequire(join(resolve(academicOsRoot), 'package.json'));
  const { GoogleAuth } = require('google-auth-library');
  const credentials = {
    calendar: config.calendar?.credentials?.scheduledRead,
    tasks: config.tasks?.credentials?.scheduledRead,
  };
  requireValue(Object.values(credentials).every(value => typeof value === 'string' && value.startsWith('/')), 'Existing scheduled-read credentials are unavailable');
  const clients = {
    calendar: new GoogleAuth({ keyFile: credentials.calendar, scopes: ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly'] }),
    tasks: new GoogleAuth({ keyFile: credentials.tasks, scopes: ['https://www.googleapis.com/auth/tasks.readonly'] }),
  };
  return async ({ service, path, query }) => {
    requireValue(Object.hasOwn(clients, service) && typeof path === 'string' && (service === 'calendar' ? /^\/calendar\/v3\/(?:users\/me\/calendarList|calendars\/[^/]+\/events)$/.test(path) : /^\/tasks\/v1\/(?:users\/@me\/lists|lists\/[^/]+\/tasks)$/.test(path)), 'Unsupported read-only provider route');
    const origin = service === 'calendar' ? 'https://www.googleapis.com' : 'https://tasks.googleapis.com';
    const response = await clients[service].request({ url: `${origin}${path}`, method: 'GET', params: query, timeout: 15000, retry: false });
    return response.data;
  };
}

export async function calendarRegister(home, { file }) {
  const envelope = await boundedJson(file, 1024 * 1024);
  requireValue(envelope?.schemaVersion === 1 && ['refresh', 'assess', 'handoff'].includes(envelope.action), 'Use calendar-register schemaVersion 1 with action refresh, assess or handoff');
  if (envelope.action === 'refresh') {
    requireValue(Object.keys(envelope).every(key => ['schemaVersion', 'action', 'scope', 'academicOsRoot', 'configFile'].includes(key)), 'Unsupported refresh option');
    const request = await createAcademicOsCalendarReader(envelope);
    const snapshot = await collectCalendarSnapshot({ request, scope: envelope.scope });
    const retained = await retainCalendarSnapshot(home, snapshot);
    const complete = ['calendars', 'taskLists'].every(kind => snapshot.discovery[kind].complete && snapshot[kind].every(row => row.collection.complete));
    return { schemaVersion: 1, status: complete ? 'collected' : 'partial', execution: 'provider-reads-only', ...retained, calendarCount: snapshot.calendars.length, taskListCount: snapshot.taskLists.length, taskTiming: 'unsupported-by-rest-needs-native-readback', assurance: 'provider-responses-with-declared-account-scope', limits: ['No module mirror is changed. Existing Academic OS scheduled-read credentials remain on this executor.', 'Collection completeness covers the declared REST query. It cannot prove native Task time, duration, recurrence, all potentially accessible calendars or an atomic account snapshot.'] };
  }
  requireValue(Object.keys(envelope).every(key => ['schemaVersion', 'action', 'snapshotFile', 'requestFile', ...(envelope.action === 'handoff' ? ['packetFile'] : [])].includes(key)) && typeof envelope.snapshotFile === 'string' && typeof envelope.requestFile === 'string', 'Assess requires snapshotFile and requestFile');
  const snapshot = await boundedJson(resolve(envelope.snapshotFile), maxBytes);
  const request = await boundedJson(resolve(envelope.requestFile), maxBytes);
  if (envelope.action === 'handoff') {
    requireValue(typeof envelope.packetFile === 'string', 'Handoff requires packetFile');
    return assessCalendarHandoff(snapshot, request, await boundedJson(resolve(envelope.packetFile), maxBytes), { evaluatedAt: new Date().toISOString() });
  }
  return assessCalendarRegister(snapshot, request, { evaluatedAt: new Date().toISOString() });
}
