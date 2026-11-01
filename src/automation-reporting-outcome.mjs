import { validateArtifactLinks, assertNoCredentials } from './reporting-privacy.mjs';
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
const need = (ok, message) => { if (!ok) throw new Error(message); };
export function validateOutcomeReport(report) {
  const keys = ['schemaVersion', 'type', 'runId', 'provenance', 'scheduledFor', 'status', 'coverage', 'availability', 'summary', 'artifactLinks', 'sourceWindow', 'generatedAt'];
  need(report && typeof report === 'object' && !Array.isArray(report) && keys.every(key => Object.hasOwn(report, key)) && Object.keys(report).every(key => keys.includes(key)), 'Invalid generic outcome report shape');
  need(report.schemaVersion === 1 && report.type === 'automation-outcome' && typeof report.runId === 'string' && report.runId.trim().length > 0 && report.runId.length <= 120, 'Invalid generic report identity');
  need(['manual', 'scheduled'].includes(report.provenance) && (report.provenance === 'scheduled' ? stamp(report.scheduledFor) : report.scheduledFor === null), 'Invalid generic report occurrence');
  need(['unknown', 'running', 'blocked', 'pending-approval', 'completed', 'failed', 'skipped'].includes(report.status) && ['complete', 'partial', 'unavailable'].includes(report.coverage) && ['available', 'unavailable'].includes(report.availability), 'Invalid generic report states');
  need(typeof report.summary === 'string' && report.summary.length <= 600 && (report.availability !== 'available' || report.summary.trim().length > 0 || report.artifactLinks?.length > 0), 'Available generic report needs compact outcome or artifact');
  validateArtifactLinks(report.artifactLinks); assertNoCredentials(report);
  need(stamp(report.generatedAt) && (report.provenance !== 'scheduled' || Date.parse(report.generatedAt) >= Date.parse(report.scheduledFor)), 'Invalid generic report time');
  const window = report.sourceWindow;
  need(window === null || window && Object.keys(window).sort().join(',') === 'end,start' && stamp(window.start) && stamp(window.end) && Date.parse(window.start) < Date.parse(window.end) && Date.parse(window.end) <= Date.parse(report.generatedAt), 'Invalid generic original source window');
  return report;
}
