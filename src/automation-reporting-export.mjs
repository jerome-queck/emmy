import { validateRecord, recordDigest } from './automation-reporting.mjs';
import { assertExportSafe, validateArtifactLinks } from './reporting-privacy.mjs';

export function exportOutcome(record, { artifactLinks = record.data?.report?.artifactLinks ?? [] } = {}) {
  validateRecord(record);
  if (record.kind !== 'run') throw new Error('Cloud outcome export requires an exact run record');
  const data = record.data; const report = data.report;
  if (report && report.summary.length > 600) throw new Error('Cloud summary exceeds 600 characters; retain publication pending');
  const timing = data.timing;
  const value = {
    schemaVersion: 1, kind: 'sanitized-automation-outcome', subject: recordDigest(record),
    automationId: record.automationId, runId: record.key, occurrenceKey: data.occurrenceKey,
    execution: data.execution, evidenceCoverage: data.coverage, reportAvailability: report ? report.availability ?? 'available' : 'missing',
    summary: report?.summary ?? '', sourceWindow: report?.sourceWindow ?? null, reportGeneratedAt: report?.generatedAt ?? null,
    actualTiming: timing ? { startedAt: timing.startedAt, lastHeartbeatAt: timing.lastHeartbeatAt, endedAt: timing.endedAt, observedAt: timing.observedAt, sourceRefDigest: recordDigest(timing.sourceRef) } : null,
    artifactLinks: validateArtifactLinks(artifactLinks), assurance: 'reported', userDelivery: 'pending',
  };
  assertExportSafe(value); return value;
}
