import { planAutomation } from './automation-plan.mjs';
export { planAutomation } from './automation-plan.mjs';
import { isAbsolute } from 'node:path';
import { boundedFile } from './bounded-json.mjs';
import { strictJson } from './strict-json.mjs';
import { digest } from './content.mjs';
import { operatingContract } from './operating-contract.mjs';
import { assessAutomationReporting, validateAutomationArtifact } from './automation-reporting.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const shape = (value, keys) => need(object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `Expected members ${keys.join(', ')}`);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
async function reference(value, maxBytes = 1048576) {
  shape(value, ['path', 'sha256']); need(isAbsolute(value.path ?? '') && hash(value.sha256), 'Exact absolute artifact reference required');
  const bytes = await boundedFile(value.path, maxBytes); need(digest(bytes) === value.sha256, 'Referenced bytes changed'); return bytes;
}
export async function automationProcedure(request, { now = new Date().toISOString() } = {}) {
  if (request?.action === 'contract') { shape(request, ['action']); return { ...operatingContract, procedureContract: 'automation-procedure-v1', reportContract: 'automation-outcome', nativeCreation: 'not-performed' }; }
  need(['plan', 'report', 'read'].includes(request?.action), 'Use contract, plan, report or read');
  shape(request, ['action', 'procedure', 'configuration', ...(request.action === 'report' ? ['input'] : request.action === 'read' ? ['artifact', 'recordId', 'maxAgeSeconds'] : [])]);
  const procedureBytes = await reference(request.procedure); const configurationBytes = await reference(request.configuration);
  const parse = bytes => strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const plan = planAutomation(parse(procedureBytes), parse(configurationBytes), { procedureRef: request.procedure.path, configurationRef: request.configuration.path, procedureSha256: request.procedure.sha256, configurationSha256: request.configuration.sha256 });
  if (request.action === 'plan') return plan;
  const own = record => need(record.namespace === plan.report.namespace && record.automationId === plan.report.automationId && plan.reportEvidenceRefs.every(ref => record.data.evidenceRefs.includes(ref)), 'Report must bind exact procedure, configuration and owner');
  if (request.action === 'report') {
    need(request.input?.action === 'producer', 'Use the existing canonical producer contract');
    need(request.input.namespace === plan.report.namespace && request.input.automationId === plan.report.automationId && plan.reportEvidenceRefs.every(ref => request.input.evidenceRefs?.includes(ref)), 'Producer must bind exact procedure, configuration and owner');
    need(stamp(now) && stamp(request.input.at) && request.input.at <= now, 'Original report clock cannot be future');
    return { ...assessAutomationReporting(request.input), procedure: plan.procedure, configurationSha256: plan.configurationSha256, destination: plan.report.destination };
  }
  need(hash(request.recordId) && stamp(now) && Number.isSafeInteger(request.maxAgeSeconds) && request.maxAgeSeconds >= 0 && Number.isSafeInteger(request.maxAgeSeconds * 1000), 'Exact record identity and finite freshness required');
  const bytes = await reference(request.artifact, 32769);
  const record = validateAutomationArtifact({ id: request.recordId, bytes: new TextDecoder('utf-8', { fatal: true }).decode(bytes) });
  need(record.kind === 'run', 'Read the exact run artifact'); own(record);
  const ageMs = Date.parse(now) - Date.parse(record.recordedAt);
  return { schemaVersion: 1, status: ageMs < 0 ? 'future' : ageMs > request.maxAgeSeconds * 1000 ? 'stale' : record.data.report === null ? 'pending' : record.data.coverage === 'complete' ? 'available' : 'partial', record, ageMs, destination: plan.report.destination, effectsAuthorized: false, delivery: 'unverified', assurance: 'reported-producer-claims' };
}
