import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, opendir, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname, parse, isAbsolute } from 'node:path';
import { validateOutcomeReport, outcomeSourceTimes } from './automation-reporting-outcome.mjs';
import { validateControlRecord, expandExpectedSlots } from './automation-reporting-expectations.mjs';
import { assertNoCredentials, assertExportSafe } from './reporting-privacy.mjs';
import { strictJson } from './bounded-json.mjs';
import { validateImprovementReport } from './improvement-report.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(value);
const logicalKey = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
const kinds = ['automation', 'occurrence', 'run', 'publication', 'delivery', 'issue', 'registration', 'expectation'];
const actions = ['inspect', 'list', 'get', 'status', 'publish-own-record', 'validate', 'diagnose', 'dry-run', 'reconcile'];
const MAX_BYTES = 32768;
const MAX_FILES = 5000;
const refs = value => Array.isArray(value) && value.length <= 20 && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 400) && new Set(value).size === value.length;
function fields(value, required, optional = []) {
  need(object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key)), `Expected members ${required.join(', ')}${optional.length ? `; optional ${optional.join(', ')}` : ''}`);
}
export function canonical(value) {
  return JSON.stringify(value, (_, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
export const recordDigest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function validateRecord(record, evaluatedAt = new Date().toISOString()) {
  fields(record, ['schemaVersion', 'namespace', 'automationId', 'kind', 'key', 'revision', 'previous', 'recordedAt', 'data']);
  need(record.schemaVersion === (['registration', 'expectation'].includes(record.kind) ? 2 : 1) && id(record.namespace) && id(record.automationId) && kinds.includes(record.kind) && logicalKey(record.key), 'Invalid version or record identity');
  need(Number.isSafeInteger(record.revision) && record.revision >= 0 && record.revision <= 10000 && (record.revision === 0 ? record.previous === null : digest(record.previous)), 'Invalid revision predecessor');
  need(stamp(evaluatedAt) && stamp(record.recordedAt) && Date.parse(record.recordedAt) <= Date.parse(evaluatedAt), 'Invalid or future recordedAt');
  need(Buffer.byteLength(canonical(record)) <= MAX_BYTES, 'Record exceeds 32 KiB');
  assertNoCredentials(record);
  const data = record.data;
  switch (record.kind) {
    case 'registration':
    case 'expectation':
      validateControlRecord(record);
      break;
    case 'automation':
      fields(data, ['name', 'enabled', 'schedule', 'environment', 'nativeRef', 'model', 'destination', 'freshChat', 'archiveOnSuccess', 'sourceRef', 'observedAt']);
      need(typeof data.name === 'string' && data.name.length > 0 && data.name.length <= 200 && typeof data.enabled === 'boolean', 'Invalid automation name/enabled');
      for (const key of ['schedule', 'environment', 'nativeRef', 'model', 'destination', 'sourceRef']) need(typeof data[key] === 'string' && data[key].length > 0 && data[key].length <= 400, `Invalid automation ${key}`);
      need([true, false, null].includes(data.freshChat) && [true, false, null].includes(data.archiveOnSuccess) && stamp(data.observedAt) && Date.parse(data.observedAt) <= Date.parse(record.recordedAt), 'Invalid native configuration observation');
      break;
    case 'occurrence':
      fields(data, ['scheduledFor', 'expiresAt']);
      need(stamp(data.scheduledFor) && stamp(data.expiresAt) && Date.parse(data.expiresAt) >= Date.parse(data.scheduledFor), 'Invalid expected occurrence window');
      break;
    case 'run':
      fields(data, ['occurrenceKey', 'execution', 'coverage', 'report', 'evidenceRefs'], ['telemetry', 'timing']);
      need(data.occurrenceKey === null || logicalKey(data.occurrenceKey), 'Invalid occurrence reference');
      need(['running', 'blocked', 'pending-approval', 'completed', 'failed', 'skipped', 'unknown'].includes(data.execution) && ['complete', 'partial', 'unavailable'].includes(data.coverage) && refs(data.evidenceRefs), 'Invalid execution or evidence coverage');
      if (data.report !== null) {
        if (data.report.type === 'automation-outcome') validateOutcomeReport(data.report);
        else validateImprovementReport(data.report);
        need(data.report.runId === record.key && data.report.status === data.execution && data.report.coverage === data.coverage && Date.parse(data.report.generatedAt) <= Date.parse(record.recordedAt), 'Compact report/run identity, state or clock mismatch');
        need(data.report.schemaVersion !== 2 || data.occurrenceKey === null, 'Scheduled-unbound report cannot name an occurrence');
        need(data.report.generation?.mode !== 'retrospective' || record.revision > 0, 'Retrospective report requires an existing run predecessor');
      }
      if (data.timing !== undefined) {
        fields(data.timing, ['startedAt', 'lastHeartbeatAt', 'endedAt', 'observedAt', 'sourceRef']);
        need(stamp(data.timing.observedAt) && Date.parse(data.timing.observedAt) <= Date.parse(record.recordedAt) && typeof data.timing.sourceRef === 'string' && data.timing.sourceRef.length > 0 && data.timing.sourceRef.length <= 400, 'Invalid timing source observation');
        const values = ['startedAt', 'lastHeartbeatAt', 'endedAt'].map(key => data.timing[key]);
        need(values.every(time => time === null || stamp(time) && Date.parse(time) <= Date.parse(data.timing.observedAt)), 'Invalid actual event timestamp');
        const [start, heartbeat, end] = values.map(time => time === null ? null : Date.parse(time));
        need((start === null || heartbeat === null || start <= heartbeat) && (start === null || end === null || start <= end) && (heartbeat === null || end === null || heartbeat <= end), 'Actual run times out of order');
      }
      if (data.telemetry !== undefined) {
        fields(data.telemetry, ['runtimeMs', 'inputTokens', 'outputTokens', 'sourceRef']);
        need(['runtimeMs', 'inputTokens', 'outputTokens'].every(key => data.telemetry[key] === null || Number.isSafeInteger(data.telemetry[key]) && data.telemetry[key] >= 0) && typeof data.telemetry.sourceRef === 'string' && data.telemetry.sourceRef.length > 0 && data.telemetry.sourceRef.length <= 400, 'Telemetry needs real measured values or null and source');
      }
      break;
    case 'publication':
    case 'delivery':
      fields(data, ['subject', 'state', 'evidenceRef']);
      need(digest(data.subject) && ['pending', 'accepted', 'verified', 'failed'].includes(data.state), 'Invalid receipt subject/state');
      need(data.evidenceRef === null || typeof data.evidenceRef === 'string' && data.evidenceRef.length > 0 && data.evidenceRef.length <= 400, 'Invalid receipt reference');
      need(data.state !== 'verified' || data.evidenceRef !== null, 'Verified receipt requires exact evidence reference');
      break;
    case 'issue':
      fields(data, ['title', 'state', 'evidenceRefs']);
      need(typeof data.title === 'string' && data.title.length > 0 && data.title.length <= 400 && ['open', 'acknowledged', 'resolved'].includes(data.state) && refs(data.evidenceRefs), 'Invalid finding');
      need(data.state !== 'resolved' || data.evidenceRefs.length > 0, 'Resolved issue requires evidence');
      break;
  }
  return record;
}
export function improvementRecords(report, { namespace, automationId }) {
  validateImprovementReport(report);
  need(id(namespace) && id(automationId), 'Invalid producer adapter identity');
  const occurrenceKey = `slot-${recordDigest([namespace, automationId, report.kind, report.scheduledFor, report.provenance])}`;
  const envelope = (kind, key, data) => ({ schemaVersion: 1, namespace, automationId, kind, key, revision: 0, previous: null, recordedAt: report.generatedAt, data });
  const records = report.provenance === 'scheduled' ? [{ ...envelope('occurrence', occurrenceKey, { scheduledFor: report.scheduledFor, expiresAt: report.scheduledFor }), recordedAt: report.scheduledFor }] : [];
  records.push(envelope('run', report.runId, { occurrenceKey: report.provenance === 'scheduled' ? occurrenceKey : null, execution: report.status, coverage: report.coverage, report, evidenceRefs: report.evidenceRefs }));
  return records.map(record => validateRecord(record, report.generatedAt));
}
async function ordinary(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat(); need(stat.isFile() && stat.size <= MAX_BYTES + 1, 'Expected bounded ordinary record');
    const buffer = Buffer.alloc(MAX_BYTES + 2); let offset = 0;
    while (offset < buffer.length) { const result = await handle.read(buffer, offset, buffer.length - offset, null); if (!result.bytesRead) break; offset += result.bytesRead; }
    need(offset <= MAX_BYTES + 1, 'Record exceeds byte bound');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset));
  } finally { await handle.close(); }
}
async function directory(path) {
  need(typeof path === 'string' && isAbsolute(path) && !path.split(/[\\/]/).includes('..'), 'Select an existing absolute private directory without traversal');
  const selected = resolve(path); let current = selected;
  while (true) {
    need((await lstat(current)).isDirectory(), 'Reporting directory ancestry must contain ordinary directories');
    if (current === parse(current).root) break;
    current = dirname(current);
  }
  need(await realpath(selected) === selected, 'Symlinked reporting directory unsupported');
  return selected;
}
export async function requireExistingNamespace(selectedDirectory, namespace) {
  need(id(namespace), 'Explicit namespace required');
  const selected = await directory(selectedDirectory); const path = join(selected, namespace);
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && await realpath(path) === path, 'Verified target namespace unavailable');
  let found = false; let count = 0;
  for await (const entry of await opendir(selected)) {
    need(++count <= 200, 'Namespace inventory exceeds bound');
    if (entry.name === namespace) found = true;
  }
  need(found, 'Verified target namespace exact name unavailable');
  return path;
}
const identity = record => canonical([record.namespace, record.automationId, record.kind, record.key]);
function retrospectiveOK(record, previous) {
  if (record.kind !== 'run' || !previous) return record.data?.report?.generation?.mode !== 'retrospective';
  const report = record.data.report; const prior = previous.data.report;
  const retrospective = value => value?.schemaVersion === 2 && value.generation.mode === 'retrospective';
  if (!retrospective(report) && !retrospective(prior)) return true;
  if (!retrospective(report)) return false;
  const metadataStable = record.data.coverage === previous.data.coverage && canonical(record.data.timing ?? null) === canonical(previous.data.timing ?? null) && canonical(record.data.telemetry ?? null) === canonical(previous.data.telemetry ?? null);
  if (retrospective(prior)) return metadataStable && canonical(report) === canonical(prior);
  return metadataStable && prior === null && ['completed', 'failed', 'skipped'].includes(previous.data.execution) && report.generation.basedOn === record.previous && report.sourceEvidence.recordedAt === previous.recordedAt && [report.sourceEvidence.observedAt, report.sourceWindow?.end].every(time => time === null || time === undefined || Date.parse(time) <= Date.parse(previous.recordedAt));
}
function predecessorOK(record, previous) {
  const terminal = ['completed', 'failed', 'skipped'];
  const executionStable = record.kind !== 'run' || !previous || record.data.occurrenceKey === previous.data.occurrenceKey && (!terminal.includes(previous.data.execution) || record.data.execution === previous.data.execution);
  const receiptStable = !['publication', 'delivery'].includes(record.kind) || !previous || record.data.subject === previous.data.subject && (previous.data.state !== 'verified' || record.data.state === 'verified');
  const controlStable = !previous || (record.kind === 'registration'
    ? Date.parse(record.data.observedAt) >= Date.parse(previous.data.observedAt)
    : record.kind !== 'expectation' || record.data.registration === previous.data.registration);
  return executionStable && receiptStable && controlStable && retrospectiveOK(record, previous) && previous && identity(record) === identity(previous) && record.revision === previous.revision + 1 && Date.parse(record.recordedAt) >= Date.parse(previous.recordedAt);
}
export function aggregate(records, { evaluatedAt = new Date().toISOString(), findings = [], complete = true, maxAgeSeconds = 86400, controlAuthority = null } = {}) {
  need(stamp(evaluatedAt) && Number.isSafeInteger(maxAgeSeconds) && maxAgeSeconds >= 0 && maxAgeSeconds <= 31536000, 'Invalid evaluation clock/maximum age');
  if (controlAuthority !== null) { fields(controlAuthority, ['namespace', 'automationId']); need(id(controlAuthority.namespace) && id(controlAuthority.automationId), 'Invalid configured registration control'); }
  const problems = [...findings]; const byDigest = new Map();
  for (const record of records) { validateRecord(record, evaluatedAt); byDigest.set(recordDigest(record), record); }
  const invalid = new Set();
  for (const [hash, record] of byDigest) {
    if (record.previous !== null && !predecessorOK(record, byDigest.get(record.previous))) { invalid.add(hash); problems.push(`missing-or-invalid-predecessor:${hash}`); }
  }
  let changed;
  do { changed = false; for (const [hash, record] of byDigest) if (!invalid.has(hash) && invalid.has(record.previous)) { invalid.add(hash); changed = true; } } while (changed);
  const groups = new Map();
  for (const [hash, record] of byDigest) {
    const key = identity(record); const group = groups.get(key) ?? []; group.push({ id: hash, ...record }); groups.set(key, group);
  }
  const current = [];
  for (const group of groups.values()) {
    const referenced = new Set(group.map(record => record.previous));
    const leaves = group.filter(record => !referenced.has(record.id));
    const conflict = leaves.length !== 1;
    if (conflict) problems.push(`conflict:${identity(group[0])}`);
    for (const record of leaves) {
      const sourceTimes = [record.recordedAt, ...(['automation', 'registration'].includes(record.kind) ? [record.data.observedAt] : []), ...(record.kind === 'run' && record.data.timing ? [record.data.timing.observedAt] : []), ...(record.kind === 'run' && record.data.report ? [record.data.report.generatedAt, ...(record.data.report.sourceWindow ? [record.data.report.sourceWindow.end] : []), ...outcomeSourceTimes(record.data.report)] : [])];
      const stale = sourceTimes.some(time => Date.parse(evaluatedAt) - Date.parse(time) > maxAgeSeconds * 1000);
      if (stale) problems.push(`stale:${record.id}`);
      current.push({ ...record, conflict, valid: !invalid.has(record.id), stale });
    }
  }
  current.sort((a, b) => a.id.localeCompare(b.id));
  const usable = record => complete && record.valid && !record.conflict;
  for (const record of current.filter(record => record.kind === 'run')) {
    const occurrence = current.find(item => item.kind === 'occurrence' && item.namespace === record.namespace && item.automationId === record.automationId && item.key === record.data.occurrenceKey && usable(item));
    const report = record.data.report;
    if (record.data.occurrenceKey !== null && !occurrence || report?.provenance === 'scheduled' && (!occurrence || Date.parse(report.scheduledFor) !== Date.parse(occurrence.data.scheduledFor)) || ['manual', 'scheduled-unbound'].includes(report?.provenance) && record.data.occurrenceKey !== null) {
      record.valid = false; problems.push(`occurrence-correlation:${record.id}`);
    }
  }
  const runs = current.filter(record => record.kind === 'run').map(record => {
    const report = record.data.report; const originalTimes = outcomeSourceTimes(report);
    const evidence = report?.schemaVersion === 2 ? { invocationProvenance: 'scheduled-unbound', nominalSlot: null, sourceFreshness: !originalTimes.length ? 'unknown' : originalTimes.some(time => Date.parse(evaluatedAt) - Date.parse(time) > maxAgeSeconds * 1000) ? 'stale' : 'within-configured-age', sourceClockBasis: report.sourceEvidence.observedAt !== null ? 'reported-observation' : report.sourceEvidence.recordedAt !== null ? 'original-record' : report.sourceWindow !== null ? 'original-window' : 'unknown' } : {};
    return { ...record, ...evidence, execution: usable(record) ? record.data.execution : 'unknown', evidenceCoverage: usable(record) ? record.data.coverage : 'unavailable', reportAvailability: !usable(record) ? 'conflict-or-incomplete' : report === null ? 'missing' : report.availability ?? 'available', actualTiming: record.data.timing ?? { startedAt: null, lastHeartbeatAt: null, endedAt: null, observedAt: null, sourceRef: null }, assurance: 'reported', publication: 'pending', userDelivery: 'pending' };
  });
  const receipts = kind => current.filter(record => record.kind === kind).map(record => {
    const subject = byDigest.get(record.data.subject);
    const subjectKnown = subject?.kind === 'run' && subject.namespace === record.namespace && subject.automationId === record.automationId && !invalid.has(record.data.subject) && current.some(item => item.id === record.data.subject && usable(item)) && Date.parse(record.recordedAt) >= Date.parse(subject.recordedAt);
    if (!subjectKnown) problems.push(`missing-or-invalid-subject:${record.id}`);
    return { ...record, state: usable(record) && subjectKnown ? record.data.state : 'unknown', assurance: 'reported' };
  });
  const publications = receipts('publication'); const deliveries = receipts('delivery');
  for (const run of runs) {
    for (const [key, values] of [['publication', publications], ['userDelivery', deliveries]]) {
      const selected = values.filter(receipt => receipt.data.subject === run.id);
      run[key] = selected.length === 0 ? 'pending' : selected.length === 1 && usable(run) ? selected[0].state : 'conflict';
      if (selected.length > 1) problems.push(`conflicting-${key}:${run.id}`);
    }
    if (run.execution !== 'completed') problems.push(`execution-${run.execution}:${run.id}`);
    if (run.evidenceCoverage !== 'complete') problems.push(`coverage-${run.evidenceCoverage}:${run.id}`);
    if (run.reportAvailability !== 'available') problems.push(`report-${run.reportAvailability}:${run.id}`);
    if (run.invocationProvenance === 'scheduled-unbound') problems.push(`scheduled-unbound:${run.id}`);
    if (run.sourceFreshness === 'unknown') problems.push(`source-age-unknown:${run.id}`);
  }
  const occurrences = current.filter(record => record.kind === 'occurrence').map(record => {
    const candidates = runs.filter(run => run.namespace === record.namespace && run.automationId === record.automationId && run.data.occurrenceKey === record.key);
    const observed = candidates.filter(usable);
    const state = !usable(record) || candidates.length !== observed.length ? 'unknown' : observed.length ? 'observed' : Date.parse(evaluatedAt) > Date.parse(record.data.expiresAt) ? 'overdue' : 'expected';
    if (state === 'overdue' || state === 'unknown') problems.push(`occurrence-${state}:${record.id}`);
    return { ...record, state, runIds: observed.map(run => run.id), execution: 'not-inferred' };
  });
  const registrations = current.filter(record => record.kind === 'registration');
  const expectations = projectControlExpectations({ byDigest, invalid, current, runs, complete, evaluatedAt, controlAuthority });
  for (const expected of expectations) if (expected.state !== 'expected' && expected.state !== 'observed' && expected.state !== 'withdrawn') problems.push(`expectation-${expected.state}:${expected.id}`);
  const automations = current.filter(record => record.kind === 'automation');
  if (!automations.length) problems.push('empty-inventory');
  for (const automation of automations) {
    const observed = runs.filter(run => run.namespace === automation.namespace && run.automationId === automation.automationId);
    automation.observedRunCount = observed.length;
    automation.observationState = !usable(automation) ? 'unknown' : !automation.data.enabled ? 'disabled' : !observed.length ? 'observation-needed' : observed.some(run => !usable(run)) ? 'unknown' : 'reported-outcomes';
    const latest = observed.reduce((time, run) => Math.max(time, Date.parse(run.recordedAt)), -Infinity);
    automation.latestRecordedRunIds = observed.filter(run => Date.parse(run.recordedAt) === latest).map(run => run.id);
    if (['unknown', 'observation-needed'].includes(automation.observationState)) problems.push(`automation-${automation.observationState}:${automation.id}`);
  }
  const automationHealth = { scope: automations.length ? 'registered-only' : 'unknown-empty-inventory', observations: automations.reduce((counts, automation) => { const key = automation.observationState; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {}), latestSelection: 'newest-recorded-evidence-not-proof-of-latest-native-invocation' };
  for (const record of current.filter(record => record.kind !== 'automation')) if (!automations.some(automation => usable(automation) && automation.namespace === record.namespace && automation.automationId === record.automationId)) problems.push(`missing-automation:${record.namespace}/${record.automationId}`);
  const issues = current.filter(record => record.kind === 'issue');
  for (const issue of issues) if (issue.data.state !== 'resolved') problems.push(`issue-${issue.data.state}:${issue.id}`);
  if (!complete) problems.push('incomplete-scan');
  return { schemaVersion: 1, status: problems.length ? 'needs-attention' : 'ready', automationHealth, evaluatedAt, assurance: 'validated-recorded-claims', findings: [...new Set(problems)].sort(), scan: { complete, records: byDigest.size }, pendingPublicationQueue: runs.filter(run => run.publication !== 'verified').map(run => ({ subject: run.id, namespace: run.namespace, state: run.publication, action: 'reporting-only-parent-owned' })), inventoryCoverage: { knownAutomations: automations.length, scope: 'registered-only', unregisteredAutomations: 'unknown', nativeDiscovery: 'parent-owned', independentExpectations: expectations.length }, automations, occurrences, runs, publications, deliveries, issues, registrations, expectations, records: current, limits: ['Records do not authenticate execution, schedule firing, publication or user delivery.', 'Concurrent readers may precede later writes. This is a bounded scan, not an atomic snapshot.', 'Local publication only. Native publication, private transport and notification remain external gates.', 'Observation grace and source freshness never establish an execution deadline or execution failure.'] };
}
function projectControlExpectations({ byDigest, invalid, current, runs, complete, evaluatedAt, controlAuthority }) {
  const usable = record => complete && record && record.valid && !record.conflict;
  const ownOccurrences = new Map(current.filter(record => record.kind === 'occurrence' && usable(record)).map(record => [canonical([record.namespace, record.automationId, record.key]), record]));
  const boundRuns = runs.map(run => ({ run, ownOccurrence: ownOccurrences.get(canonical([run.namespace, run.automationId, run.data.occurrenceKey])) }));
  return current.filter(record => record.kind === 'expectation').map(record => {
    const data = record.data;
    const original = byDigest.get(data.registration);
    const targetMatches = registration => registration?.kind === 'registration' && registration.namespace === record.namespace && registration.automationId === record.automationId && registration.data.targetNamespace === data.targetNamespace && registration.data.targetAutomationId === data.targetAutomationId;
    const versions = current.filter(item => item.kind === 'registration' && targetMatches(item));
    const latest = versions.length === 1 && usable(versions[0]) ? versions[0] : null;
    let configuredSlot = false;
    try { configuredSlot = targetMatches(original) && expandExpectedSlots(original.data, { from: data.scheduledFor, through: data.scheduledFor }).length === 1; } catch {}
    const knownControl = record.namespace === controlAuthority?.namespace && record.automationId === controlAuthority?.automationId;
    const originalValid = knownControl && configuredSlot && targetMatches(original) && !invalid.has(data.registration) && original.data.enabled && original.data.fingerprint === data.fingerprint && Date.parse(original.recordedAt) <= Date.parse(record.recordedAt) && Date.parse(data.observationDueAt) === Date.parse(data.scheduledFor) + original.data.observationGraceSeconds * 1000;
    const sameConfiguration = latest && latest.data.enabled && latest.data.fingerprint === data.fingerprint;
    const withdrawn = latest && !sameConfiguration && Date.parse(data.scheduledFor) >= Date.parse(latest.data.effectiveAt);
    const sourceFresh = latest && Date.parse(evaluatedAt) - Date.parse(latest.data.observedAt) <= latest.data.sourceMaxAgeSeconds * 1000;
    const applicable = usable(record) && originalValid && latest && sameConfiguration && sourceFresh;
    const candidates = boundRuns.filter(({ run, ownOccurrence }) => run.namespace === data.targetNamespace && run.automationId === data.targetAutomationId && !['manual', 'scheduled-unbound'].includes(run.data.report?.provenance) && ownOccurrence && Date.parse(ownOccurrence.data.scheduledFor) === Date.parse(data.scheduledFor)).map(({ run }) => run);
    const observed = candidates.filter(usable);
    const state = !usable(record) || !originalValid || !latest ? 'unknown' : withdrawn ? 'withdrawn' : !applicable || observed.length !== candidates.length ? 'unknown' : observed.length ? 'observed' : Date.parse(evaluatedAt) > Date.parse(data.observationDueAt) ? 'observation-gap' : 'expected';
    return { ...record, state, applicability: state === 'withdrawn' ? 'superseded-configuration' : applicable ? 'registered-configuration' : 'unknown', sourceFreshness: sourceFresh ? 'within-configured-age' : 'stale-or-unavailable', runIds: observed.map(run => run.id), execution: 'not-inferred', assurance: 'reported-control', graceMeaning: 'observation-tolerance-only' };
  });
}
async function scan(selected, evaluatedAt) {
  const records = []; const findings = []; let count = 0; let complete = true;
  const namespaces = await opendir(selected); let namespaceCount = 0;
  outer: for await (const entry of namespaces) {
    if (++namespaceCount > 200) { complete = false; break; }
    if (entry.name.startsWith('.pending-')) continue;
    if (!id(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) { findings.push(`unexpected-root-entry-sha256:${recordDigest(entry.name)}`); complete = false; continue; }
    const namespace = join(selected, entry.name);
    need((await lstat(namespace)).isDirectory(), 'Namespace must be ordinary directory');
    for await (const file of await opendir(namespace)) {
      count++;
      if (count > MAX_FILES) { complete = false; break outer; }
      if (file.name.startsWith('.pending-')) continue;
      try {
        need(file.isFile() && /^[a-f0-9]{64}\.json$/.test(file.name), 'Unexpected namespace entry');
        const record = validateRecord(strictJson(await ordinary(join(namespace, file.name))), evaluatedAt);
        need(record.namespace === entry.name && recordDigest(record) === file.name.slice(0, -5), 'Namespace or digest mismatch');
        records.push(record);
      } catch { findings.push(`invalid-record-location-sha256:${recordDigest([entry.name, file.name])}`); complete = false; }
    }
  }
  return { records, findings, complete };
}
async function publish(selected, record, evaluatedAt, existingOnly = false) {
  const namespace = join(selected, record.namespace);
  if (existingOnly) await requireExistingNamespace(selected, record.namespace);
  else try { await mkdir(namespace, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  need((await lstat(namespace)).isDirectory() && await realpath(namespace) === namespace, 'Namespace must be ordinary directory');
  if (record.previous !== null) {
    const previous = validateRecord(strictJson(await ordinary(join(namespace, `${record.previous}.json`))), evaluatedAt);
    need(recordDigest(previous) === record.previous && predecessorOK(record, previous), 'Missing or invalid predecessor');
  }
  const bytes = `${canonical(record)}\n`; const hash = recordDigest(record);
  const temporary = join(namespace, `.pending-${randomUUID()}`);
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
  let status = 'published';
  try {
    try { await link(temporary, join(namespace, `${hash}.json`)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; need(await ordinary(join(namespace, `${hash}.json`)) === bytes, 'Digest collision or corrupt existing record'); status = 'identical'; }
    need(await ordinary(join(namespace, `${hash}.json`)) === bytes, 'Local publication readback mismatch');
  } finally { await unlink(temporary); }
  return { status, id: hash, publication: 'local-readback-verified', nativePublication: 'pending', userDelivery: 'pending', assurance: 'reported' };
}
function summaryView(result, request) {
  const limit = request.limit ?? 20;
  need(Number.isSafeInteger(limit) && limit > 0 && limit <= 200, 'Expected limit 1..200');
  need(request.findingCursor === undefined || typeof request.findingCursor === 'string' && request.findingCursor.length <= 500, 'Invalid finding cursor');
  const findings = result.findings.filter(value => !request.findingCursor || value > request.findingCursor);
  const shown = findings.slice(0, limit);
  const tally = (values, field) => values.reduce((counts, item) => { const key = item[field]; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {});
  return {
    schemaVersion: result.schemaVersion, status: result.status, evaluatedAt: result.evaluatedAt, assurance: result.assurance, automationHealth: result.automationHealth,
    counts: Object.fromEntries(['automations', 'occurrences', 'runs', 'publications', 'deliveries', 'issues', 'registrations', 'expectations'].map(key => [key, result[key].length])),
    execution: tally(result.runs, 'execution'), evidenceCoverage: tally(result.runs, 'evidenceCoverage'), reportAvailability: tally(result.runs, 'reportAvailability'),
    publication: tally(result.runs, 'publication'), userDelivery: tally(result.runs, 'userDelivery'),
    pendingPublicationCount: result.pendingPublicationQueue.length, findings: shown,
    findingPage: { total: result.findings.length, shown: shown.length, nextCursor: findings.length > limit ? shown.at(-1) : null },
    inventoryCoverage: result.inventoryCoverage, scan: result.scan, limits: result.limits,
  };
}
function detailView(result, request) {
  const summary = summaryView(result, request); const limit = request.limit ?? 50; const cursor = request.cursor ?? null;
  need(cursor === null || digest(cursor), 'Expected digest cursor');
  const pagination = {};
  for (const key of ['automations', 'occurrences', 'runs', 'publications', 'deliveries', 'issues', 'registrations', 'expectations']) {
    const values = result[key].filter(record => !cursor || record.id > cursor);
    summary[key] = values.slice(0, limit); pagination[key] = { total: result[key].length, shown: summary[key].length, nextCursor: values.length > limit ? summary[key].at(-1).id : null };
  }
  summary.pagination = pagination; return summary;
}
export async function automationReporting(request, { evaluatedAt = new Date().toISOString() } = {}) {
  need(object(request) && actions.includes(request.action), 'Unknown reporting action');
  fields(request, ['action', 'directory'], ['namespace', 'record', 'id', 'automationId', 'query', 'cursor', 'limit', 'maxAgeSeconds', 'findingCursor', 'synced', 'controlAuthority']);
  need(stamp(evaluatedAt), 'Invalid evaluation clock');
  need(request.synced === undefined || typeof request.synced === 'boolean', 'Invalid synced-store guard');
  const selected = await directory(request.directory);
  if (['validate', 'dry-run', 'publish-own-record'].includes(request.action)) {
    const record = validateRecord(request.record, evaluatedAt);
    need(id(request.namespace) && record.namespace === request.namespace, 'Producer may publish only its own namespace');
    if (request.synced) assertExportSafe(record);
    if (request.action === 'publish-own-record') return publish(selected, record, evaluatedAt, Boolean(request.synced));
    if (request.synced) await requireExistingNamespace(selected, record.namespace);
    const namespace = join(selected, record.namespace);
    try { need((await lstat(namespace)).isDirectory() && await realpath(namespace) === namespace, 'Namespace must be ordinary directory'); }
    catch (error) { if (error.code !== 'ENOENT' || record.previous !== null) throw error; }
    if (record.previous !== null) {
      const previous = validateRecord(strictJson(await ordinary(join(selected, record.namespace, `${record.previous}.json`))), evaluatedAt);
      need(recordDigest(previous) === record.previous && predecessorOK(record, previous), 'Missing or invalid predecessor');
    }
    return { status: request.action === 'validate' ? 'valid' : 'dry-run', id: recordDigest(record), writes: false, nativePublication: 'pending', userDelivery: 'pending' };
  }
  need(request.automationId === undefined || id(request.automationId), 'Invalid automation filter');
  need(request.namespace === undefined || id(request.namespace), 'Invalid namespace filter');
  const snapshot = await scan(selected, evaluatedAt);
  const ownScope = record => (!request.namespace || record.namespace === request.namespace) && (!request.automationId || record.automationId === request.automationId);
  const ownedRecords = snapshot.records.filter(ownScope);
  const result = aggregate(snapshot.records, { ...snapshot, evaluatedAt, maxAgeSeconds: request.maxAgeSeconds ?? 86400, controlAuthority: request.controlAuthority ?? null });
  if (request.namespace || request.automationId) scopeReadView(result, request, ownedRecords);
  snapshot.records = ownedRecords;
  if (['status', 'diagnose', 'reconcile'].includes(request.action)) return summaryView(result, request);
  if (request.action === 'inspect') return detailView(result, request);
  if (request.action === 'get') {
    need(digest(request.id), 'Expected exact record digest');
    const record = snapshot.records.find(record => recordDigest(record) === request.id);
    return { status: record ? result.status : 'needs-attention', record: record ?? null, findings: record ? summaryView(result, request).findings : [...summaryView(result, request).findings, 'missing-record'], findingPage: summaryView(result, request).findingPage, scan: result.scan };
  }
  const limit = request.limit ?? 50; const cursor = request.cursor ?? null;
  need(Number.isSafeInteger(limit) && limit > 0 && limit <= 200 && (cursor === null || digest(cursor)), 'Expected limit 1..200 and digest cursor');
  need(request.query === undefined || typeof request.query === 'string' && request.query.length <= 200, 'Invalid bounded search');
  need(request.automationId === undefined || id(request.automationId), 'Invalid automation filter');
  need(request.namespace === undefined || id(request.namespace), 'Invalid namespace filter');
  const candidates = [...snapshot.records].map(record => ({ id: recordDigest(record), ...record })).sort((a, b) => a.id.localeCompare(b.id)).filter(record => (!cursor || record.id > cursor) && (!request.namespace || record.namespace === request.namespace) && (!request.automationId || record.automationId === request.automationId) && (!request.query || canonical(record).toLowerCase().includes(request.query.toLowerCase())));
  const items = candidates.slice(0, limit);
  return { status: result.status, items, nextCursor: candidates.length > limit ? items.at(-1).id : null, findings: summaryView(result, request).findings, findingPage: summaryView(result, request).findingPage, scan: result.scan, limits: ['Cursor pagination is over observed immutable IDs; concurrent additions before the cursor require a fresh scan.'] };
}
function scopeReadView(result, request, ownedRecords) {
  const own = record => (!request.namespace || record.namespace === request.namespace) && (!request.automationId || record.automationId === request.automationId);
  const dependency = record => own(record) || (!request.namespace || record.data.targetNamespace === request.namespace) && (!request.automationId || record.data.targetAutomationId === request.automationId);
  for (const key of ['registrations', 'expectations']) result[key] = result[key].filter(dependency);
  for (const key of ['automations', 'occurrences', 'runs', 'publications', 'deliveries', 'issues', 'records']) result[key] = result[key].filter(own);
  result.pendingPublicationQueue = result.pendingPublicationQueue.filter(item => !request.namespace || item.namespace === request.namespace).filter(item => result.runs.some(run => run.id === item.subject));
  const hashes = new Set([...ownedRecords.map(recordDigest), ...result.registrations.map(record => record.id), ...result.expectations.map(record => record.id)]);
  const identities = new Set([...ownedRecords, ...result.registrations, ...result.expectations].map(identity));
  result.findings = result.findings.filter(finding => finding === 'incomplete-scan' || finding === 'empty-inventory' && !result.automations.length || [...hashes].some(hash => finding.includes(hash)) || finding.startsWith('conflict:') && identities.has(finding.slice('conflict:'.length)) || finding.startsWith('missing-automation:') && ownedRecords.some(record => finding === `missing-automation:${record.namespace}/${record.automationId}`));
  if (!result.automations.length && !result.findings.includes('empty-inventory')) result.findings.push('empty-inventory');
  result.findings.sort();
  result.status = result.findings.length ? 'needs-attention' : 'ready';
  result.automationHealth = { ...result.automationHealth, scope: result.automations.length ? 'registered-only' : 'unknown-empty-inventory', observations: result.automations.reduce((counts, automation) => { counts[automation.observationState] = (counts[automation.observationState] ?? 0) + 1; return counts; }, {}) };
  result.inventoryCoverage = { ...result.inventoryCoverage, knownAutomations: result.automations.length, independentExpectations: result.expectations.length };
  result.scan = { ...result.scan, records: ownedRecords.length, dependencyRecords: result.registrations.filter(record => !own(record)).length + result.expectations.filter(record => !own(record)).length };
}
