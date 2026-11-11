import { canonical, recordDigest, validateRecord } from './automation-reporting.mjs';
import { expandExpectedSlots } from './automation-reporting-expectations.mjs';
const need = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, keys) => need(object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key)), 'Unexpected binding members');
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z','Z') === value.replace('.000Z','Z');
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(value);
export function bindExpectedOccurrence(snapshot, request) {
  fields(request,['namespace','automationId','controlNamespace','controlAutomationId','scheduledFor','nominalSlotEvidenceRef','evaluatedAt']);
  need(['namespace','automationId','controlNamespace','controlAutomationId'].every(key => id(request[key])), 'Explicit known target and control identities required');
  need(stamp(request.evaluatedAt), 'Invalid binding clock');
  fields(snapshot,['schemaVersion','kind','control','target','evaluatedAt','validThrough','captureData','records']);
  fields(snapshot.control,['namespace','automationId']); fields(snapshot.target,['namespace','automationId']);
  need(snapshot.schemaVersion === 1 && snapshot.kind === 'automation-expectation-binding', 'Invalid binding snapshot');
  need(snapshot.control.namespace === request.controlNamespace && snapshot.control.automationId === request.controlAutomationId, 'Control identity mismatch');
  need(snapshot.target.namespace === request.namespace && snapshot.target.automationId === request.automationId, 'Binding target mismatch');
  need(stamp(snapshot.evaluatedAt) && stamp(snapshot.validThrough) && Date.parse(snapshot.evaluatedAt) <= Date.parse(request.evaluatedAt) && Date.parse(request.evaluatedAt) <= Date.parse(snapshot.validThrough), 'Binding snapshot expired or future');
  need(Buffer.byteLength(canonical(snapshot)) <= 131072 && Array.isArray(snapshot.records) && snapshot.records.length > 0 && snapshot.records.length <= 256, 'Binding snapshot exceeds bounds or lacks records');
  const byDigest = new Map(); const chains = new Map();
  for (const record of snapshot.records) {
    validateRecord(record,snapshot.evaluatedAt);
    need(['registration','expectation'].includes(record.kind) && record.namespace === request.controlNamespace && record.automationId === request.controlAutomationId, 'Foreign control record');
    need(record.data.targetNamespace === request.namespace && record.data.targetAutomationId === request.automationId, 'Foreign target record');
    const digest = recordDigest(record); need(!byDigest.has(digest),'Duplicate binding record'); byDigest.set(digest,record);
    const chain = chains.get(record.key) ?? []; chain.push(record); chains.set(record.key,chain);
  }
  for (const chain of chains.values()) {
    chain.sort((a,b) => a.revision-b.revision);
    for (let index = 0; index < chain.length; index++) {
      const record = chain[index]; const prior = chain[index-1];
      need(record.revision === index && record.previous === (prior ? recordDigest(prior) : null) && (!prior || record.kind === prior.kind && Date.parse(record.recordedAt) >= Date.parse(prior.recordedAt)), 'Incomplete or conflicted binding lineage');
      if (prior && record.kind === 'expectation') need(record.data.registration === prior.data.registration, 'Expectation registration reference changes');
      if (prior && record.kind === 'registration') need(Date.parse(record.data.observedAt) >= Date.parse(prior.data.observedAt), 'Registration observation regresses');
    }
  }
  const registrations = [...chains.values()].filter(chain => chain[0].kind === 'registration');
  need(registrations.length === 1,'Exactly one registration lineage required');
  const latest = registrations[0].at(-1); const data = latest.data;
  const { effectiveAt: ignoredEffective, observationGraceSeconds: ignoredGrace, sourceMaxAgeSeconds: ignoredAge, fingerprint: ignoredFingerprint, ...capture } = data;
  need(canonical(capture) === canonical(snapshot.captureData), 'Capture differs from current registration');
  need(Date.parse(snapshot.validThrough) <= Date.parse(data.observedAt)+data.sourceMaxAgeSeconds*1000 && Date.parse(request.evaluatedAt)-Date.parse(data.observedAt) <= data.sourceMaxAgeSeconds*1000, 'Source observation stale');
  for (const record of snapshot.records.filter(record => record.kind === 'expectation')) {
    const original = byDigest.get(record.data.registration);
    need(original?.kind === 'registration' && original.data.enabled && original.data.fingerprint === record.data.fingerprint && Date.parse(original.recordedAt) <= Date.parse(record.recordedAt), 'Expectation source registration unavailable or inconsistent');
    need(Date.parse(record.data.observationDueAt) === Date.parse(record.data.scheduledFor)+original.data.observationGraceSeconds*1000, 'Expectation grace mismatch');
    need(expandExpectedSlots(original.data,{from:record.data.scheduledFor,through:record.data.scheduledFor}).length === 1, 'Expectation is not a configured nominal slot');
  }
  const base = {schemaVersion:1,namespace:request.namespace,automationId:request.automationId,control:{...snapshot.control},evaluatedAt:request.evaluatedAt,assurance:'reported-control-snapshot',execution:'not-inferred'};
  if (request.scheduledFor === null || request.nominalSlotEvidenceRef === null) return {...base,status:'scheduled-unbound',reason:'trusted-nominal-slot-unavailable',scheduledFor:null,expectation:null,registration:null,occurrenceKey:null};
  need(stamp(request.scheduledFor) && typeof request.nominalSlotEvidenceRef === 'string' && request.nominalSlotEvidenceRef.length > 0 && request.nominalSlotEvidenceRef.length <= 400, 'Exact nominal slot and evidence required');
  const matches = snapshot.records.filter(record => record.kind === 'expectation' && Date.parse(record.data.scheduledFor) === Date.parse(request.scheduledFor));
  need(matches.length === 1, 'Nominal slot absent or ambiguous');
  const expected = matches[0];
  need(data.enabled && data.fingerprint === expected.data.fingerprint, 'Current registration disabled or edited');
  return {...base,status:'bound',scheduledFor:expected.data.scheduledFor,nominalSlotEvidenceRef:request.nominalSlotEvidenceRef,expectation:recordDigest(expected),registration:expected.data.registration,currentRegistration:recordDigest(latest),occurrenceKey:`slot-${recordDigest([request.namespace,request.automationId,expected.data.scheduledFor])}`};
}
