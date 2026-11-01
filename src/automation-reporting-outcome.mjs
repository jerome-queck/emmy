import { validateArtifactLinks, assertNoCredentials } from './reporting-privacy.mjs';
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
const need = (ok, message) => { if (!ok) throw new Error(message); };
export function validateOutcomeReport(report) {
  const unbound = report?.schemaVersion === 2;
  const keys = ['schemaVersion', 'type', 'runId', 'provenance', 'scheduledFor', 'status', 'coverage', 'availability', 'summary', 'artifactLinks', 'sourceWindow', 'generatedAt', ...(unbound ? ['sourceEvidence', 'generation'] : [])];
  need(report && typeof report === 'object' && !Array.isArray(report) && keys.every(key => Object.hasOwn(report, key)) && Object.keys(report).every(key => keys.includes(key)), 'Invalid generic outcome report shape');
  need([1, 2].includes(report.schemaVersion) && report.type === 'automation-outcome' && typeof report.runId === 'string' && report.runId.trim().length > 0 && report.runId.length <= 120, 'Invalid generic report identity');
  need(unbound ? report.provenance === 'scheduled-unbound' && report.scheduledFor === null : ['manual', 'scheduled'].includes(report.provenance) && (report.provenance === 'scheduled' ? stamp(report.scheduledFor) : report.scheduledFor === null), 'Invalid generic report occurrence');
  need(['unknown', 'running', 'blocked', 'pending-approval', 'completed', 'failed', 'skipped'].includes(report.status) && ['complete', 'partial', 'unavailable'].includes(report.coverage) && ['available', 'unavailable'].includes(report.availability), 'Invalid generic report states');
  need(typeof report.summary === 'string' && report.summary.length <= 600 && (report.availability !== 'available' || report.summary.trim().length > 0 || report.artifactLinks?.length > 0), 'Available generic report needs compact outcome or artifact');
  validateArtifactLinks(report.artifactLinks); assertNoCredentials(report);
  need(stamp(report.generatedAt) && (report.provenance !== 'scheduled' || Date.parse(report.generatedAt) >= Date.parse(report.scheduledFor)), 'Invalid generic report time');
  const window = report.sourceWindow;
  need(window === null || window && Object.keys(window).sort().join(',') === 'end,start' && stamp(window.start) && stamp(window.end) && Date.parse(window.start) < Date.parse(window.end) && Date.parse(window.end) <= Date.parse(report.generatedAt), 'Invalid generic original source window');
  if (unbound) {
    const source = report.sourceEvidence; const generation = report.generation;
    need(source && typeof source === 'object' && !Array.isArray(source) && Object.keys(source).sort().join(',') === 'observedAt,recordedAt' && [source.observedAt, source.recordedAt].every(time => time === null || stamp(time) && Date.parse(time) <= Date.parse(report.generatedAt)), 'Invalid original evidence clocks');
    need(source.observedAt === null || source.recordedAt === null || Date.parse(source.observedAt) <= Date.parse(source.recordedAt), 'Original observation follows evidence record');
    need(generation && typeof generation === 'object' && !Array.isArray(generation) && Object.keys(generation).sort().join(',') === 'attestedBy,basedOn,mode' && ['producer', 'retrospective'].includes(generation.mode) && typeof generation.attestedBy === 'string' && generation.attestedBy.trim().length > 0 && generation.attestedBy.length <= 120 && !/[\u0000-\u001f\u007f]/.test(generation.attestedBy), 'Invalid report generation provenance');
    need(generation.mode === 'producer' ? generation.basedOn === null : typeof generation.basedOn === 'string' && /^[a-f0-9]{64}$/.test(generation.basedOn) && source.recordedAt !== null, 'Invalid retrospective evidence basis');
  }
  return report;
}

export function outcomeSourceTimes(report) {
  return report?.schemaVersion === 2 ? [report.sourceEvidence.observedAt, report.sourceEvidence.recordedAt, report.sourceWindow?.end].filter(time => time !== null && time !== undefined) : [];
}
