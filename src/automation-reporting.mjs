import { createHash } from 'node:crypto';
import { strictJson } from './strict-json.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shape = (value, keys) => need(object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `Expected members ${keys.join(', ')}`);
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value, max = 400) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const reportingCanonical = value => JSON.stringify(value, (_, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const recordDigest = value => hash(reportingCanonical(value));
const terminal = ['completed', 'failed', 'skipped'];
const executions = ['unknown', 'running', 'blocked', 'pending-approval', ...terminal];
const coverages = ['complete', 'partial', 'unavailable'];
const availabilities = ['available', 'unavailable'];


function safeExport(value) {
  if (typeof value === 'string') {
    need(!/(?:\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+[A-Za-z0-9._~+/-]{12,}|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|[?&](?:access_token|api[_-]?key|token|password|client_secret|signature|sig)=|\/(?:Users|Volumes|home|private|tmp)\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:^|\n)(?:Message-ID|Authorization|Cookie|Set-Cookie):)/i.test(value), 'Private payload refused in reporting export');
    for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      const url = new URL(match[0]);
      need(!url.username && !url.password && ![...url.searchParams.keys()].some(key => ['accesstoken', 'apikey', 'token', 'password', 'clientsecret', 'signature', 'sig'].includes(key.toLowerCase().replace(/[-_]/g, ''))), 'Credential-bearing reporting URL refused');
    }
  } else if (Array.isArray(value)) value.forEach(safeExport);
  else if (object(value)) Object.values(value).forEach(safeExport);
}
function artifactLinks(value) {
  need(Array.isArray(value) && value.length <= 20, 'Bounded safe artifact links required');
  for (const link of value) {
    shape(link, ['label', 'url']); need(text(link.label, 120) && text(link.url), 'Invalid artifact link');
    const url = new URL(link.url);
    need(url.protocol === 'https:' && !url.username && !url.password && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) && ![...url.searchParams.keys()].some(key => ['accesstoken', 'apikey', 'token', 'password', 'clientsecret', 'signature', 'sig'].includes(key.toLowerCase().replace(/[-_]/g, ''))), 'Unsafe artifact URL');
  }
  safeExport(value);
}
function sourceEvidence(value, generatedAt) {
  shape(value, ['observedAt', 'recordedAt']);
  need(Object.values(value).every(at => at === null || stamp(at) && Date.parse(at) <= Date.parse(generatedAt)), 'Original evidence clocks must be null or actual prior clocks');
  need(value.observedAt === null || value.recordedAt === null || Date.parse(value.observedAt) <= Date.parse(value.recordedAt), 'Source observation follows record');
}
function sourceWindow(value, generatedAt) {
  if (value === null) return;
  shape(value, ['start', 'end']);
  need(stamp(value.start) && stamp(value.end) && Date.parse(value.start) < Date.parse(value.end) && Date.parse(value.end) <= Date.parse(generatedAt), 'Invalid original source window');
}
function validateRecord(record, namespace, automationId, runId, at) {
  shape(record, ['schemaVersion', 'namespace', 'automationId', 'kind', 'key', 'revision', 'previous', 'recordedAt', 'data']);
  need(record.schemaVersion === 1 && record.namespace === namespace && record.automationId === automationId && record.kind === 'run' && record.key === runId, 'Own exact run predecessor required');
  need(Number.isSafeInteger(record.revision) && record.revision >= 0 && record.revision <= 10000 && (record.revision === 0 ? record.previous === null : digest(record.previous)) && stamp(record.recordedAt) && Date.parse(record.recordedAt) <= Date.parse(at), 'Invalid predecessor revision or original clock');
  const data = record.data;
  const fields = ['occurrenceKey', 'execution', 'coverage', 'report', 'evidenceRefs'];
  need(object(data) && fields.every(key => Object.hasOwn(data, key)) && Object.keys(data).every(key => [...fields, 'timing', 'telemetry'].includes(key)) && (data.occurrenceKey === null || text(data.occurrenceKey, 120)) && executions.includes(data.execution) && coverages.includes(data.coverage) && Array.isArray(data.evidenceRefs) && data.evidenceRefs.length <= 20 && data.evidenceRefs.every(ref => text(ref)), 'Invalid predecessor run data');
  if (data.report !== null) {
    const report = data.report; const unbound = report.schemaVersion === 2;
    shape(report, ['schemaVersion', 'type', 'runId', 'provenance', 'scheduledFor', 'status', 'coverage', 'availability', 'summary', 'artifactLinks', 'sourceWindow', 'generatedAt', ...(unbound ? ['sourceEvidence', 'generation'] : [])]);
    need([1, 2].includes(report.schemaVersion) && report.type === 'automation-outcome' && report.runId === runId && report.status === data.execution && report.coverage === data.coverage && availabilities.includes(report.availability), 'Predecessor report identity or state differs');
    need(unbound ? report.provenance === 'scheduled-unbound' && report.scheduledFor === null && data.occurrenceKey === null : ['manual', 'scheduled'].includes(report.provenance) && (report.provenance === 'manual' ? report.scheduledFor === null && data.occurrenceKey === null : stamp(report.scheduledFor) && data.occurrenceKey !== null), 'Predecessor report occurrence differs');
    need(stamp(report.generatedAt) && Date.parse(report.generatedAt) <= Date.parse(record.recordedAt) && (report.provenance !== 'scheduled' || Date.parse(report.generatedAt) >= Date.parse(report.scheduledFor)) && typeof report.summary === 'string' && report.summary.length <= 600, 'Predecessor report clock or summary invalid');
    artifactLinks(report.artifactLinks); sourceWindow(report.sourceWindow, report.generatedAt);
    if (unbound) {
      sourceEvidence(report.sourceEvidence, report.generatedAt); shape(report.generation, ['mode', 'attestedBy', 'basedOn']);
      need(report.generation.mode === 'producer' && report.generation.attestedBy === namespace && report.generation.basedOn === null, 'Retrospective attachment is not authorized');
    }
  }
  safeExport(record);
  need(Buffer.byteLength(reportingCanonical(record)) <= 32768, 'Predecessor record exceeds byte bound');
}
function assessProducer(input) {
  shape(input, ['action', 'namespace', 'automationId', 'invocation', 'origin', 'binding', 'predecessorChain', 'at', 'execution', 'coverage', 'availability', 'summary', 'artifactLinks', 'sourceWindow', 'sourceEvidence', 'timing', 'telemetry', 'evidenceRefs']);
  need(text(input.namespace, 120) && text(input.automationId, 120) && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(input.namespace) && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(input.automationId), 'Own namespace and automation ID required');
  shape(input.invocation, ['id', 'source']);
  need(text(input.invocation.id, 120) && ['provider', 'producer-generated'].includes(input.invocation.source), 'Retained invocation identity and explicit provenance required');
  need(['manual', 'scheduled'].includes(input.origin) && stamp(input.at) && executions.includes(input.execution) && coverages.includes(input.coverage) && availabilities.includes(input.availability), 'Invalid producer origin, clock or states');
  need(typeof input.summary === 'string' && input.summary.length <= 600 && (input.availability !== 'available' || input.summary.trim() || input.artifactLinks?.length), 'Available outcome needs compact summary or artifact');
  artifactLinks(input.artifactLinks); sourceWindow(input.sourceWindow, input.at); sourceEvidence(input.sourceEvidence, input.at);
  need(Array.isArray(input.evidenceRefs) && input.evidenceRefs.length <= 20 && input.evidenceRefs.every(ref => text(ref)), 'Bounded evidence references required');
  let binding = null;
  if (input.binding !== null) {
    shape(input.binding, ['scheduledFor', 'occurrenceKey', 'observationDueAt', 'nominalSlotEvidenceRef', 'observedAt', 'validThrough']);
    const value = input.binding;
    need(input.origin === 'scheduled' && [value.scheduledFor, value.observationDueAt, value.observedAt, value.validThrough].every(stamp) && text(value.occurrenceKey, 120) && text(value.nominalSlotEvidenceRef), 'Binding requires trusted nominal slot and original snapshot clocks');
    need(value.occurrenceKey === `slot-${recordDigest([input.namespace, input.automationId, value.scheduledFor])}`, 'Binding occurrence key differs from exact own nominal identity');
    need(Date.parse(value.observationDueAt) - Date.parse(value.scheduledFor) === 3600000 && Date.parse(value.observedAt) <= Date.parse(input.at), 'Binding grace or source clock invalid');
    if (Date.parse(input.at) <= Date.parse(value.validThrough) && Date.parse(input.at) - Date.parse(value.observedAt) <= 172800000) binding = value;
  }
  const provenance = input.origin === 'manual' ? 'manual' : binding ? 'scheduled' : 'scheduled-unbound';
  need(Array.isArray(input.predecessorChain) && input.predecessorChain.length <= 10001, 'Bounded complete own predecessor chain required');
  let previous = null;
  for (const record of input.predecessorChain) {
    validateRecord(record, input.namespace, input.automationId, input.invocation.id, input.at);
    need(record.revision === (previous ? previous.revision + 1 : 0) && record.previous === (previous ? recordDigest(previous) : null) && (!previous || Date.parse(record.recordedAt) >= Date.parse(previous.recordedAt)), 'Incomplete or conflicting own predecessor chain');
    need(!previous || record.data.occurrenceKey === previous.data.occurrenceKey && (!terminal.includes(previous.data.execution) || record.data.execution === previous.data.execution), 'Predecessor occurrence or terminal execution changed');
    previous = record;
  }
  const occurrenceKey = binding?.occurrenceKey ?? null;
  need(!previous || previous.data.occurrenceKey === occurrenceKey && (!terminal.includes(previous.data.execution) || input.execution === previous.data.execution), 'Invocation occurrence or terminal execution is immutable');
  need(!previous || Date.parse(input.at) >= Date.parse(previous.recordedAt), 'Actual record clock regresses');
  need(!previous || !terminal.includes(previous.data.execution) || previous.data.report !== null, 'Retrospective attachment to terminal report:null is not authorized');
  const report = terminal.includes(input.execution) && (!binding || Date.parse(input.at) >= Date.parse(binding.scheduledFor)) ? { schemaVersion: provenance === 'scheduled-unbound' ? 2 : 1, type: 'automation-outcome', runId: input.invocation.id, provenance, scheduledFor: binding?.scheduledFor ?? null, status: input.execution, coverage: input.coverage, availability: input.availability, summary: input.summary, artifactLinks: input.artifactLinks, sourceWindow: input.sourceWindow, generatedAt: input.at, ...(provenance === 'scheduled-unbound' ? { sourceEvidence: input.sourceEvidence, generation: { mode: 'producer', attestedBy: input.namespace, basedOn: null } } : {}) } : null;
  const envelope = (kind, key, data) => ({ schemaVersion: 1, namespace: input.namespace, automationId: input.automationId, kind, key, revision: 0, previous: null, recordedAt: input.at, data });
  const records = binding && !previous ? [envelope('occurrence', occurrenceKey, { scheduledFor: binding.scheduledFor, expiresAt: binding.observationDueAt })] : [];
  const data = { occurrenceKey, execution: input.execution, coverage: input.coverage, report, evidenceRefs: input.evidenceRefs };
  if (input.timing !== null) {
    shape(input.timing, ['startedAt', 'lastHeartbeatAt', 'endedAt', 'observedAt', 'sourceRef']);
    need(stamp(input.timing.observedAt) && Date.parse(input.timing.observedAt) <= Date.parse(input.at) && text(input.timing.sourceRef) && ['startedAt', 'lastHeartbeatAt', 'endedAt'].every(key => input.timing[key] === null || stamp(input.timing[key]) && Date.parse(input.timing[key]) <= Date.parse(input.timing.observedAt)), 'Actual timing evidence invalid');
    const times = ['startedAt', 'lastHeartbeatAt', 'endedAt'].map(key => input.timing[key]).filter(Boolean); need(times.every((time, index) => index === 0 || Date.parse(time) >= Date.parse(times[index - 1])), 'Actual timing order invalid'); data.timing = input.timing;
  }
  if (input.telemetry !== null) {
    shape(input.telemetry, ['runtimeMs', 'inputTokens', 'outputTokens', 'sourceRef']);
    need(text(input.telemetry.sourceRef) && ['runtimeMs', 'inputTokens', 'outputTokens'].every(key => input.telemetry[key] === null || Number.isSafeInteger(input.telemetry[key]) && input.telemetry[key] >= 0), 'Measured telemetry or explicit null required'); data.telemetry = input.telemetry;
  }
  records.push({ ...envelope('run', input.invocation.id, data), revision: previous ? previous.revision + 1 : 0, previous: previous ? recordDigest(previous) : null });
  const artifacts = records.map(record => {
    safeExport(record); const canonical = reportingCanonical(record); need(Buffer.byteLength(canonical) <= 32768, 'Reporting record exceeds byte bound');
    const sha256 = hash(canonical); const bytes = `${canonical}\n`;
    return { record, id: sha256, filename: `${sha256}.json`, bytes, byteSha256: hash(bytes), byteCount: Buffer.byteLength(bytes) };
  });
  return { schemaVersion: 1, action: 'producer', invocation: input.invocation, provenance, scheduledFor: binding?.scheduledFor ?? null, occurrenceKey, artifacts, publication: 'unverified', delivery: 'unverified', effectsAuthorized: false, assurance: 'reported-producer-claims' };
}
export function validateAutomationArtifact(artifact) {
  shape(artifact, ['id', 'bytes']);
  need(digest(artifact.id) && typeof artifact.bytes === 'string' && Buffer.byteLength(artifact.bytes) <= 32769, 'Bounded exact canonical artifact required');
  const record = strictJson(artifact.bytes);
  need(artifact.bytes === `${reportingCanonical(record)}\n` && recordDigest(record) === artifact.id, 'Canonical artifact bytes or digest differ'); safeExport(record);
  shape(record, ['schemaVersion', 'namespace', 'automationId', 'kind', 'key', 'revision', 'previous', 'recordedAt', 'data']);
  need(text(record.namespace) && text(record.automationId) && text(record.key, 120) && stamp(record.recordedAt), 'Prepared reporting envelope required for publication assessment');
  if (record.kind === 'run') validateRecord(record, record.namespace, record.automationId, record.key, record.recordedAt);
  else {
    need(record.kind === 'occurrence' && record.schemaVersion === 1 && record.revision === 0 && record.previous === null, 'Only own prepared run or initial occurrence may be assessed');
    shape(record.data, ['scheduledFor', 'expiresAt']);
    need(stamp(record.data.scheduledFor) && stamp(record.data.expiresAt) && record.data.expiresAt > record.data.scheduledFor && record.key === `slot-${recordDigest([record.namespace, record.automationId, record.data.scheduledFor])}`, 'Occurrence publication identity differs');
  }
  return record;
}
function assessPublication(input) {
  shape(input, ['action', 'parentId', 'artifact', 'attempt', 'readback']);
  need(text(input.parentId), 'Exact intended publication parent required');
  validateAutomationArtifact(input.artifact);
  shape(input.attempt, ['state', 'nativeId']);
  need(['not-started', 'accepted', 'uncertain', 'failed'].includes(input.attempt.state) && (input.attempt.nativeId === null || text(input.attempt.nativeId)), 'Retained upload attempt required');
  need(input.attempt.state !== 'accepted' || input.attempt.nativeId !== null, 'Accepted upload needs retained exact native ID');
  if (input.readback !== null) {
    shape(input.readback, ['nativeId', 'parentId', 'bytes', 'observedAt', 'acquiredAt']);
    const readback = input.readback;
    need(input.attempt.nativeId !== null && readback.nativeId === input.attempt.nativeId && readback.parentId === input.parentId && readback.bytes === input.artifact.bytes && stamp(readback.observedAt) && stamp(readback.acquiredAt) && Date.parse(readback.observedAt) <= Date.parse(readback.acquiredAt), 'Exact-ID parent/raw-byte publication readback differs');
    return { schemaVersion: 1, action: 'publication', state: 'verified', nativeId: readback.nativeId, subject: input.artifact.id, byteSha256: hash(readback.bytes), readback, delivery: 'unverified', effectsAuthorized: false };
  }
  return { schemaVersion: 1, action: 'publication', state: input.attempt.state === 'not-started' ? 'prepared-only' : input.attempt.state, next: input.attempt.nativeId === null ? input.attempt.state === 'not-started' ? 'parent-authorized-upload-gate' : 'hold-rediscover-retained-exact-id-never-create' : { operation: 'read-exact-id', nativeId: input.attempt.nativeId, parentId: input.parentId }, subject: input.artifact.id, publication: 'unverified', delivery: 'unverified', effectsAuthorized: false };
}
export function assessAutomationReporting(input) {
  need(object(input), 'Reporting request required');
  if (input.action === 'producer') return assessProducer(input);
  if (input.action === 'publication') return assessPublication(input);
  throw new Error('Use producer or publication');
}
