import { canonical, digest } from './records.mjs';

const SGT = 'Asia/Singapore';
const BANGKOK = 'Asia/Bangkok';
const same = (a, b) => canonical(a) === canonical(b);
const hash = value => digest(canonical(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 16384;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && date(value.slice(0, 10)) && +value.slice(11, 13) < 24 && +value.slice(14, 16) < 60 && +value.slice(17, 19) < 60 && Number.isFinite(Date.parse(value));
const need = (condition, message) => { if (!condition) throw new Error(message); };
const fields = (value, keys, name) => need(object(value) && Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key)), `${name}: invalid closed shape`);
const freeze = value => { if (object(value) || Array.isArray(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

function identity(value) {
  fields(value, ['environment', 'accountId', 'containerKind', 'containerId', 'nativeId'], 'native Task identity');
  need(value.containerKind === 'task-list' && Object.values(value).every(text), 'Exact native Task identity required');
}
function environment(value) {
  fields(value, ['kind', 'id', 'epoch'], 'execution environment');
  need(Object.values(value).every(text), 'Exact execution environment required');
}
function clock(value) {
  fields(value, ['date', 'time'], 'display clock');
  need(date(value.date) && typeof value.time === 'string' && /^\d{2}:\d{2}$/.test(value.time) && +value.time.slice(0, 2) < 24 && +value.time.slice(3, 5) < 60, 'Invalid display clock');
}
function targetShape(target) {
  fields(target, ['identity', 'sourceInterface', 'canonicalTimeZone', 'targetInterface', 'inputTimeZone', 'executionEnvironment'], 'timing target');
  identity(target.identity); environment(target.executionEnvironment);
  need(text(target.sourceInterface) && text(target.canonicalTimeZone) && text(target.targetInterface) && text(target.inputTimeZone), 'Invalid timing target');
}

export function calendarLocalClock(instant, timeZone) {
  need(stamp(instant) && [SGT, BANGKOK].includes(timeZone), 'Supported calendar instant and zone required');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function prepareCalendarTiming(canonicalTiming, target, observation, { evaluatedAt, maxEvidenceAgeMs, after = null } = {}) {
  fields(canonicalTiming, ['schemaVersion', 'sourceInterface', 'timeZone', 'identity', 'interval', 'durationMinutes'], 'canonical timing');
  fields(canonicalTiming.interval, ['start', 'end'], 'canonical interval');
  identity(canonicalTiming.identity); targetShape(target);
  fields(observation, ['accountId', 'targetInterface', 'inputTimeZone', 'executionEnvironment', 'systemTimeZone', 'observedAt', 'evidenceRef', 'roundTripEvidenceRef'], 'zone observation');
  environment(observation.executionEnvironment);
  need(canonicalTiming.schemaVersion === 1 && stamp(canonicalTiming.interval.start) && stamp(canonicalTiming.interval.end) && stamp(evaluatedAt) && stamp(observation.observedAt) && (after === null || stamp(after)) && Number.isSafeInteger(maxEvidenceAgeMs) && maxEvidenceAgeMs > 0 && maxEvidenceAgeMs <= 86400000, 'Invalid timing evidence');
  need(Number.isSafeInteger(canonicalTiming.durationMinutes) && canonicalTiming.durationMinutes > 0 && Date.parse(canonicalTiming.interval.end) - Date.parse(canonicalTiming.interval.start) === canonicalTiming.durationMinutes * 60000 && [canonicalTiming.interval.start, canonicalTiming.interval.end].every(value => Date.parse(value) % 60000 === 0), 'Invalid minute-aligned canonical interval');
  need(text(observation.targetInterface) && text(observation.inputTimeZone) && text(observation.systemTimeZone) && text(observation.evidenceRef) && (observation.roundTripEvidenceRef === null || text(observation.roundTripEvidenceRef)), 'Invalid zone observation');
  const findings = [];
  const add = code => { if (!findings.includes(code)) findings.push(code); };
  if (canonicalTiming.sourceInterface !== 'canonical-plan' || canonicalTiming.timeZone !== SGT || target.sourceInterface !== 'canonical-plan' || target.canonicalTimeZone !== SGT || !same(canonicalTiming.identity, target.identity)) add('canonical-sgt-target-required');
  const calendar = target.targetInterface === 'calendar-task-editor' && target.inputTimeZone === SGT;
  const standalone = target.targetInterface === 'standalone-tasks-editor' && target.inputTimeZone === BANGKOK && target.executionEnvironment.kind === 'dot-cloud';
  if (!calendar && !standalone) add('unsupported-editor-zone-route');
  if (observation.accountId !== target.identity.accountId || observation.targetInterface !== target.targetInterface || observation.inputTimeZone !== target.inputTimeZone || !same(observation.executionEnvironment, target.executionEnvironment)) add('zone-observation-target-changed');
  if (standalone && (observation.systemTimeZone !== BANGKOK || !text(observation.roundTripEvidenceRef))) add('standalone-zone-roundtrip-required');
  if (Date.parse(observation.observedAt) > Date.parse(evaluatedAt)) add('future-zone-observation');
  if (Date.parse(evaluatedAt) - Date.parse(observation.observedAt) > maxEvidenceAgeMs) add('stale-zone-observation');
  if (after !== null && Date.parse(observation.observedAt) <= Date.parse(after)) add('fresh-zone-observation-required');
  if (findings.length) return { status: 'return-to-cloud', prepared: null, findings };
  const body = structuredClone({ schemaVersion: 1, canonical: canonicalTiming, target, zoneObservation: observation, editorInput: { start: calendarLocalClock(canonicalTiming.interval.start, target.inputTimeZone), end: calendarLocalClock(canonicalTiming.interval.end, target.inputTimeZone), durationMinutes: canonicalTiming.durationMinutes }, evidenceOldestAt: observation.observedAt, maxEvidenceAgeMs, validUntil: new Date(Date.parse(observation.observedAt) + maxEvidenceAgeMs).toISOString() });
  return { status: 'timing-prepared', prepared: freeze({ ...body, preparedDigest: hash(body) }), findings };
}

export function validatePreparedCalendarTiming(prepared) {
  fields(prepared, ['schemaVersion', 'canonical', 'target', 'zoneObservation', 'editorInput', 'evidenceOldestAt', 'maxEvidenceAgeMs', 'validUntil', 'preparedDigest'], 'prepared timing');
  const recreated = prepareCalendarTiming(prepared.canonical, prepared.target, prepared.zoneObservation, { evaluatedAt: prepared.evidenceOldestAt, maxEvidenceAgeMs: prepared.maxEvidenceAgeMs });
  need(recreated.prepared && same(recreated.prepared, prepared), 'Changed original prepared timing');
  return prepared;
}

export function assessCalendarTimingReadback(prepared, receipt, { evaluatedAt, attemptedAt, after = attemptedAt, maxEvidenceAgeMs = prepared.maxEvidenceAgeMs } = {}) {
  validatePreparedCalendarTiming(prepared);
  need(Number.isSafeInteger(maxEvidenceAgeMs) && maxEvidenceAgeMs > 0 && maxEvidenceAgeMs <= prepared.maxEvidenceAgeMs, 'Readback evidence age cannot widen original preparation');
  fields(receipt, ['preparedDigest', 'submittedInput', 'readback'], 'timing receipt');
  const readback = receipt.readback;
  fields(readback, ['accountId', 'nativeIdentity', 'projectionId', 'mapping', 'targetInterface', 'timeZone', 'executionEnvironment', 'observedAt', 'evidenceRef', 'start', 'end', 'durationMinutes'], 'Calendar timing readback');
  environment(readback.executionEnvironment); clock(readback.start); clock(readback.end);
  if (readback.nativeIdentity !== null) identity(readback.nativeIdentity);
  need(stamp(evaluatedAt) && stamp(attemptedAt) && stamp(after) && stamp(readback.observedAt) && text(readback.evidenceRef) && (readback.projectionId === null || text(readback.projectionId)), 'Invalid timing receipt evidence');
  let mapped = false;
  if (readback.mapping !== null) {
    fields(readback.mapping, ['nativeIdentity', 'projectionId', 'observedAt', 'evidenceRef'], 'projection mapping');
    identity(readback.mapping.nativeIdentity);
    need(stamp(readback.mapping.observedAt) && text(readback.mapping.projectionId) && text(readback.mapping.evidenceRef), 'Invalid native Task mapping');
    mapped = same(readback.mapping.nativeIdentity, prepared.canonical.identity) && readback.mapping.projectionId === readback.projectionId && Date.parse(readback.mapping.observedAt) > Date.parse(after) && Date.parse(readback.mapping.observedAt) <= Date.parse(evaluatedAt) && Date.parse(evaluatedAt) - Date.parse(readback.mapping.observedAt) <= maxEvidenceAgeMs;
  }
  const findings = [];
  const add = code => { if (!findings.includes(code)) findings.push(code); };
  if (receipt.preparedDigest !== prepared.preparedDigest || !same(receipt.submittedInput, prepared.editorInput)) add('original-timing-input-required');
  if (Date.parse(attemptedAt) < Date.parse(prepared.evidenceOldestAt) || Date.parse(attemptedAt) > Date.parse(prepared.validUntil)) add('timing-preparation-expired');
  if (readback.accountId !== prepared.canonical.identity.accountId || readback.targetInterface !== 'calendar-task-editor' || readback.timeZone !== SGT || !same(readback.executionEnvironment, prepared.target.executionEnvironment)) add('calendar-sgt-readback-required');
  if (readback.nativeIdentity !== null ? !same(readback.nativeIdentity, prepared.canonical.identity) : !mapped) add('exact-native-task-readback-required');
  if (readback.mapping !== null && !mapped) add('projection-mapping-conflict');
  if (Date.parse(readback.observedAt) <= Date.parse(after) || Date.parse(readback.observedAt) > Date.parse(evaluatedAt) || Date.parse(evaluatedAt) - Date.parse(readback.observedAt) > maxEvidenceAgeMs) add('fresh-calendar-readback-required');
  if (!same(readback.start, calendarLocalClock(prepared.canonical.interval.start, SGT)) || !same(readback.end, calendarLocalClock(prepared.canonical.interval.end, SGT)) || readback.durationMinutes !== prepared.canonical.durationMinutes) add('calendar-sgt-interval-mismatch');
  return { status: findings.length ? 'return-to-cloud' : 'timing-verified-reported', findings, completedEffectKeys: [] };
}
