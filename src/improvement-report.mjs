const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const kinds = ['maintenance', 'suggestions', 'token-optimisation', 'project-chat-cleanup', 'weekly-upkeep', 'lifecycle-check'];
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
function shape(value, fields) { need(value && typeof value === 'object' && !Array.isArray(value) && fields.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => fields.includes(key)), `Expected members ${fields.join(', ')}`); }
function canonical(value) { return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item); }
function report(value) {
  shape(value, ['schemaVersion', 'kind', 'scheduledFor', 'runId', 'provenance', 'status', 'coverage', 'summary', 'findings', 'evidenceRefs', 'sourceWindow', 'generatedAt']);
  need(value.schemaVersion === 1 && kinds.includes(value.kind) && stamp(value.scheduledFor) && stamp(value.generatedAt), 'Invalid report identity or time');
  need(text(value.runId) && value.runId.length <= 120 && ['manual', 'scheduled'].includes(value.provenance), 'Invalid run provenance');
  need(['completed', 'failed', 'skipped'].includes(value.status) && ['complete', 'partial', 'unavailable'].includes(value.coverage), 'Invalid terminal status or coverage');
  need(typeof value.summary === 'string' && value.summary.length <= 1600 && Number.isSafeInteger(value.findings) && value.findings >= 0, 'Invalid compact summary or finding count');
  need(Array.isArray(value.evidenceRefs) && value.evidenceRefs.length <= 20 && value.evidenceRefs.every(ref => text(ref) && ref.length <= 400) && new Set(value.evidenceRefs).size === value.evidenceRefs.length, 'Invalid evidence references');
  shape(value.sourceWindow, ['start', 'end']);
  need(stamp(value.sourceWindow.start) && stamp(value.sourceWindow.end) && Date.parse(value.sourceWindow.start) < Date.parse(value.sourceWindow.end) && Date.parse(value.sourceWindow.end) <= Date.parse(value.generatedAt), 'Invalid original source window');
  need(Buffer.byteLength(canonical(value)) + 1 <= 16384, 'Report exceeds 16 KiB');
  need(value.provenance !== 'scheduled' || Date.parse(value.generatedAt) >= Date.parse(value.scheduledFor), 'Scheduled report cannot predate its occurrence');
  return value;
}

export const validateImprovementReport = report;
