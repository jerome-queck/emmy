import { createHash } from 'node:crypto';
const need = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(value);
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fields = (value, keys) => need(object(value) && keys.length === Object.keys(value).length && keys.every(key => Object.hasOwn(value, key)), `Expected members ${keys.join(', ')}`);
export const registrationFingerprint = data => hash([data.nativeRef, data.enabled, data.rrule, data.dtstart, data.timezone, data.observationGraceSeconds, data.sourceMaxAgeSeconds]);
export const registrationKey = (namespace, automationId) => `registration-${hash([namespace, automationId])}`;
export const expectationKey = data => `expect-${hash([data.targetNamespace, data.targetAutomationId, data.fingerprint, data.scheduledFor])}`;
export function validateControlRecord(record) {
  fields(record, ['schemaVersion', 'namespace', 'automationId', 'kind', 'key', 'revision', 'previous', 'recordedAt', 'data']);
  need(id(record.namespace) && id(record.automationId) && Number.isSafeInteger(record.revision) && record.revision >= 0 && record.revision <= 10000 && (record.revision === 0 ? record.previous === null : digest(record.previous)), 'Invalid control envelope identity or predecessor');
  const data = record.data;
  need(record.schemaVersion === 2 && ['registration', 'expectation'].includes(record.kind), 'Invalid control version or kind');
  need(object(data) && data.actor === 'registration-control' && id(data.targetNamespace) && id(data.targetAutomationId), 'Invalid control actor or target');
  need(stamp(record.recordedAt), 'Invalid control recordedAt');
  if (record.kind === 'registration') {
    fields(data, ['actor', 'targetNamespace', 'targetAutomationId', 'nativeRef', 'enabled', 'rrule', 'dtstart', 'timezone', 'timezoneSource', 'sourceKind', 'sourceRef', 'observedAt', 'effectiveAt', 'observationGraceSeconds', 'sourceMaxAgeSeconds', 'fingerprint']);
    for (const key of ['nativeRef', 'rrule', 'timezone', 'timezoneSource', 'sourceRef']) need(typeof data[key] === 'string' && data[key].length > 0 && data[key].length <= 400, `Invalid registration ${key}`);
    need(typeof data.enabled === 'boolean' && ['native-definition', 'cloud-definition', 'owner-explicit'].includes(data.sourceKind), 'Invalid registration source or enabled');
    need(data.dtstart === null || stamp(data.dtstart), 'Invalid registration DTSTART');
    need(stamp(data.observedAt) && stamp(data.effectiveAt) && Date.parse(data.observedAt) <= Date.parse(record.recordedAt) && Date.parse(data.effectiveAt) === Date.parse(data.observedAt), 'Invalid registration observation/effective clock');
    need(Number.isSafeInteger(data.observationGraceSeconds) && data.observationGraceSeconds >= 0 && data.observationGraceSeconds <= 604800, 'Invalid observation grace');
    need(Number.isSafeInteger(data.sourceMaxAgeSeconds) && data.sourceMaxAgeSeconds >= 1 && data.sourceMaxAgeSeconds <= 604800, 'Invalid source freshness');
    need(data.fingerprint === registrationFingerprint(data) && record.key === registrationKey(data.targetNamespace, data.targetAutomationId), 'Invalid registration fingerprint or key');
  } else {
    fields(data, ['actor', 'registration', 'targetNamespace', 'targetAutomationId', 'fingerprint', 'scheduledFor', 'observationDueAt']);
    need(digest(data.registration) && digest(data.fingerprint) && stamp(data.scheduledFor) && stamp(data.observationDueAt), 'Invalid expectation reference or clock');
    need(Date.parse(record.recordedAt) < Date.parse(data.scheduledFor) && Date.parse(data.scheduledFor) <= Date.parse(data.observationDueAt) && Date.parse(data.observationDueAt)-Date.parse(data.scheduledFor) <= 604800000, 'Expectation must precede scheduled slot and observation due time');
    need(record.key === expectationKey(data), 'Invalid expectation key');
  }
  return record;
}
export function expandExpectedSlots(data, { from, through, limit = 64 }) {
  need(stamp(from) && stamp(through) && Date.parse(from) <= Date.parse(through) && Number.isSafeInteger(limit) && limit > 0 && limit <= 1024, 'Invalid bounded projection window');
  need(['UTC', 'Asia/Singapore'].includes(data.timezone), 'Unsupported recurrence timezone');
  const rule = new Map();
  for (const field of data.rrule.replace(/^RRULE:/, '').split(';')) {
    const match = /^([A-Z]+)=([^;]+)$/.exec(field);
    need(match && !rule.has(match[1]), 'Unsupported recurrence syntax'); rule.set(match[1], match[2]);
  }
  need([...rule.keys()].every(key => ['FREQ', 'INTERVAL', 'BYDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND', 'COUNT', 'UNTIL', 'WKST'].includes(key)), 'Unsupported recurrence field');
  const freq = rule.get('FREQ'); need(['DAILY', 'WEEKLY'].includes(freq), 'Unsupported recurrence frequency');
  const integer = (key, fallback, max) => { const value = rule.get(key); if (value === undefined) return fallback; need(/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max, `Unsupported recurrence ${key}`); return Number(value); };
  const interval = integer('INTERVAL', 1, 366); const count = integer('COUNT', null, 100000);
  const anchor = data.dtstart === null ? null : Date.parse(data.dtstart); need(anchor === null || stamp(data.dtstart), 'Invalid DTSTART');
  need((count === null && interval === 1) || anchor !== null, 'COUNT/INTERVAL requires actual DTSTART');
  need(!rule.has('WKST') || rule.get('WKST') === 'MO', 'Unsupported recurrence week start');
  const offset = data.timezone === 'Asia/Singapore' ? 28800000 : 0;
  const localAnchor = anchor === null ? null : new Date(anchor + offset);
  const list = (key, max, fallback) => { if (!rule.has(key)) { need(fallback !== null, `Recurrence needs actual ${key}`); return [fallback]; } const values = rule.get(key).split(','); need(values.every(value => /^\d+$/.test(value) && Number(value) <= max) && new Set(values.map(Number)).size === values.length, `Unsupported recurrence ${key}`); return values.map(Number).sort((a,b) => a-b); };
  const hours = list('BYHOUR', 23, localAnchor?.getUTCHours() ?? null); const minutes = list('BYMINUTE', 59, localAnchor?.getUTCMinutes() ?? null); const seconds = list('BYSECOND', 59, localAnchor?.getUTCSeconds() ?? 0);
  const names = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const days = rule.has('BYDAY') ? rule.get('BYDAY').split(',').map(value => { need(names.includes(value), 'Unsupported recurrence BYDAY'); return names.indexOf(value); }) : freq === 'WEEKLY' ? [localAnchor?.getUTCDay()] : null;
  need(days === null || days.every(value => value !== undefined) && new Set(days).size === days.length, 'WEEKLY needs actual BYDAY or DTSTART');
  let until = Infinity;
  if (rule.has('UNTIL')) { const match = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(rule.get('UNTIL')); need(match, 'Unsupported recurrence UNTIL'); const value = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`; need(stamp(value), 'Invalid recurrence UNTIL'); until = Date.parse(value); }
  if (!data.enabled) return [];
  const dayMs = 86400000; const dayStart = value => Math.floor((value + offset) / dayMs) * dayMs;
  const start = count === null ? dayStart(Math.max(Date.parse(from), anchor ?? -Infinity)) : dayStart(anchor);
  const end = dayStart(Date.parse(through)); need((end-start) / dayMs <= 36600, 'Recurrence expansion exceeds bounded day scan');
  const anchorDay = anchor === null ? null : dayStart(anchor);
  const monday = day => day - ((new Date(day).getUTCDay() + 6) % 7) * dayMs;
  const result = []; let seen = 0; let visited = 0;
  for (let day = start; day <= end; day += dayMs) {
    const weekday = new Date(day).getUTCDay();
    if (days && !days.includes(weekday)) continue;
    if (interval > 1 && (freq === 'DAILY' ? (day-anchorDay)/dayMs % interval : (monday(day)-monday(anchorDay))/(dayMs*7) % interval) !== 0) continue;
    for (const hour of hours) for (const minute of minutes) for (const second of seconds) {
      need(++visited <= 1000000, 'Recurrence candidate scan exceeds bound');
      const slot = day + hour*3600000 + minute*60000 + second*1000 - offset;
      if (anchor !== null && slot < anchor || slot > until) continue;
      if (count !== null && ++seen > count) return result;
      if (slot >= Date.parse(from) && slot <= Date.parse(through)) { need(result.length < limit, 'Recurrence expansion exceeds slot limit'); result.push(new Date(slot).toISOString()); }
    }
  }
  return result;
}
