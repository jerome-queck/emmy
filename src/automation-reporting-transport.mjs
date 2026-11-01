import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { automationReporting, aggregate, validateRecord, recordDigest, requireExistingNamespace } from './automation-reporting.mjs';
import { validateOutcomeReport } from './automation-reporting-outcome.mjs';
import { exportOutcome } from './automation-reporting-export.mjs';
import { assertExportSafe } from './reporting-privacy.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const ref = value => `sha256:${recordDigest(value)}`;
const receipt = record => ['publication', 'delivery'].includes(record.kind);
function validateHistory(records, evaluatedAt) {
  const view = aggregate(records, { evaluatedAt });
  need(!view.findings.some(finding => finding.startsWith('missing-or-invalid-predecessor:')), 'Invalid record ancestry; publication pending');
  return view;
}

export function sanitizeRecords(records, { namespace, evaluatedAt = new Date().toISOString() } = {}) {
  need(typeof namespace === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(namespace), 'Explicit namespace required');
  need(Array.isArray(records) && records.length <= 5000, 'Expected bounded complete record history');
  const unique = new Map();
  for (const record of records) {
    validateRecord(record, evaluatedAt);
    need(record.namespace === namespace, 'Source record outside own namespace');
    unique.set(recordDigest(record), record);
  }
  const sourceView = validateHistory([...unique.values()], evaluatedAt);
  const mapping = []; const projected = []; const hashes = new Map();
  const skipped = { publication: 0, delivery: 0 };
  const manualNominalSlotOmittedSourceRetained = [];
  const ordered = [...unique.entries()].sort(([a, left], [b, right]) => left.revision - right.revision || a.localeCompare(b));
  for (const [sourceDigest, record] of ordered) {
    if (receipt(record)) { skipped[record.kind]++; continue; }
    const original = record.data; let data;
    switch (record.kind) {
      case 'registration':
      case 'expectation':
        data = structuredClone(original);
        break;
      case 'automation':
        data = { name: original.name, enabled: original.enabled, schedule: original.schedule, environment: original.environment, nativeRef: original.nativeRef, model: original.model, destination: original.destination, freshChat: original.freshChat, archiveOnSuccess: original.archiveOnSuccess, sourceRef: ref(original.sourceRef), observedAt: original.observedAt };
        break;
      case 'occurrence': data = { scheduledFor: original.scheduledFor, expiresAt: original.expiresAt }; break;
      case 'issue': data = { title: original.title, state: original.state, evidenceRefs: original.evidenceRefs.map(ref) }; break;
      case 'run': {
        exportOutcome(record);
        const report = original.report;
        const normalizeManual = report !== null && report.type !== 'automation-outcome' && report.provenance === 'manual';
        if (normalizeManual) manualNominalSlotOmittedSourceRetained.push({ sourceDigest, originalScheduledFor: report.scheduledFor });
        let compact;
        if (report?.schemaVersion === 2) {
          const basedOn = report.generation.basedOn === null ? null : hashes.get(report.generation.basedOn);
          need(basedOn !== undefined, 'Missing projected retrospective report basis');
          compact = validateOutcomeReport({ ...structuredClone(report), generation: { ...report.generation, basedOn } });
        } else compact = report === null ? null : validateOutcomeReport({ schemaVersion: 1, type: 'automation-outcome', runId: report.runId, provenance: report.provenance, scheduledFor: normalizeManual ? null : report.scheduledFor, status: report.status, coverage: report.coverage, availability: report.availability ?? 'available', summary: report.summary, artifactLinks: report.artifactLinks ?? [], sourceWindow: report.sourceWindow, generatedAt: report.generatedAt });
        data = { occurrenceKey: original.occurrenceKey, execution: original.execution, coverage: original.coverage, report: compact, evidenceRefs: [`source-record-sha256:${sourceDigest}`] };
        if (original.timing !== undefined) data.timing = { startedAt: original.timing.startedAt, lastHeartbeatAt: original.timing.lastHeartbeatAt, endedAt: original.timing.endedAt, observedAt: original.timing.observedAt, sourceRef: ref(original.timing.sourceRef) };
        if (original.telemetry !== undefined) data.telemetry = { runtimeMs: original.telemetry.runtimeMs, inputTokens: original.telemetry.inputTokens, outputTokens: original.telemetry.outputTokens, sourceRef: ref(original.telemetry.sourceRef) };
        break;
      }
    }
    const previous = record.previous === null ? null : hashes.get(record.previous);
    need(previous !== undefined, 'Missing projected predecessor');
    const value = { schemaVersion: record.schemaVersion, namespace: record.namespace, automationId: record.automationId, kind: record.kind, key: record.key, revision: record.revision, previous, recordedAt: record.recordedAt, data };
    assertExportSafe(value); validateRecord(value, evaluatedAt);
    const targetDigest = recordDigest(value);
    hashes.set(sourceDigest, targetDigest); projected.push(value); mapping.push({ sourceDigest, targetDigest });
  }
  validateHistory(projected, evaluatedAt);
  return { records: projected, mapping, skipped, conflictedCurrentRecords: sourceView.records.filter(record => record.conflict).length, normalizations: { manualNominalSlotOmittedSourceRetained } };
}

async function readHistory(directory, namespace, evaluatedAt) {
  const records = new Map(); let cursor = null; let total;
  do {
    const page = await automationReporting({ action: 'list', directory, namespace, limit: 200, cursor }, { evaluatedAt });
    need(page.scan.complete, 'Incomplete source or target scan; publication pending');
    need(total === undefined || total === page.scan.records, 'History changed during pagination; retry publication');
    total = page.scan.records;
    for (const { id, ...record } of page.items) {
      need(!records.has(id), 'Repeated history page'); records.set(id, record);
    }
    need(records.size <= 5000 && (page.nextCursor === null || page.nextCursor !== cursor), 'History scan bound exceeded');
    cursor = page.nextCursor;
  } while (cursor !== null);
  need(records.size === total, 'Incomplete paginated history; publication pending');
  return [...records.values()];
}

export async function transportAutomationReporting({ sourceDirectory, directory, namespace, dryRun = false }, { evaluatedAt = new Date().toISOString() } = {}) {
  need(typeof namespace === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(namespace), 'Explicit namespace required');
  need(typeof dryRun === 'boolean', 'Invalid dry-run flag');
  need(typeof sourceDirectory === 'string' && typeof directory === 'string', 'Source and target directories required');
  const sourcePath = await realpath(resolve(sourceDirectory));
  const targetPath = await realpath(resolve(directory));
  need(sourcePath !== targetPath, 'Source fallback and synced target must differ');
  await requireExistingNamespace(directory, namespace);
  const source = await readHistory(sourceDirectory, namespace, evaluatedAt);
  const projection = sanitizeRecords(source, { namespace, evaluatedAt });
  const target = await readHistory(directory, namespace, evaluatedAt);
  const targetView = validateHistory([...target, ...projection.records], evaluatedAt);
  const results = [];
  if (!dryRun) for (const record of projection.records) results.push(await automationReporting({ action: 'publish-own-record', directory, namespace, record, synced: true }, { evaluatedAt }));
  return { schemaVersion: 1, status: dryRun ? 'dry-run' : 'local-synced-store-readback-verified', writes: !dryRun && results.some(result => result.status === 'published'), records: projection.records.length, mapping: projection.mapping, skipped: projection.skipped, normalizations: projection.normalizations, conflicts: { sourceCurrentRecords: projection.conflictedCurrentRecords, projectedTargetCurrentRecords: targetView.records.filter(record => record.conflict).length }, publication: 'pending-remote-verification', userDelivery: 'pending', evidencePolicy: 'Each projected run binds its exact original source record digest; raw evidence references remain in the local fallback.', receiptPolicy: 'Original exact-subject publication and delivery receipts skipped; create target receipts after actual remote readback.', results };
}
