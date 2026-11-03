import { briefingChecksV1 as checks } from './operating-contract.mjs';
import { assessAutomationReporting } from './automation-reporting.mjs';
export { reportingCanonical } from './automation-reporting.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shape = (value, keys) => need(object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `Expected members ${keys.join(', ')}`);
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value, max = 400) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const midnight = day => new Date(`${day}T00:00:00+08:00`).toISOString();
const dayAt = at => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
const terminal = ['completed', 'failed', 'skipped'];
const executions = ['unknown', 'running', 'blocked', 'pending-approval', ...terminal];
const coverages = ['complete', 'partial', 'unavailable'];
const availabilities = ['available', 'unavailable'];


function expectedCheck(kind, asOf) {
  const rule = checks[kind]; let day = dayAt(asOf);
  const assessmentDay = day;
  if (rule.once) day = rule.start;
  else {
    for (let offset = 0; offset < 8; offset++) {
      const candidate = new Date(Date.parse(midnight(day)) + rule.minute * 60000).toISOString();
      if ((!rule.weekdays || rule.weekdays.includes(new Date(`${day}T12:00:00Z`).getUTCDay())) && Date.parse(candidate) <= Date.parse(asOf)) break;
      if (!rule.weekdays) return { kind, automationId: rule.automationId, state: 'not-due', scheduledFor: candidate, minimumSourceEnd: midnight(day), maxAgeSeconds: rule.maxAgeSeconds };
      day = dayAt(new Date(Date.parse(midnight(day)) - 1).toISOString());
    }
  }
  const scheduledFor = new Date(Date.parse(midnight(day)) + rule.minute * 60000).toISOString();
  return { kind, automationId: rule.automationId, state: rule.once && assessmentDay !== rule.start || day < rule.start || Date.parse(scheduledFor) > Date.parse(asOf) ? 'not-due' : 'due', scheduledFor, minimumSourceEnd: midnight(day), maxAgeSeconds: rule.maxAgeSeconds };
}
function assessChecks(input) {
  shape(input, ['action', 'asOf', 'results']);
  need(stamp(input.asOf) && Array.isArray(input.results) && input.results.length <= 100, 'Bounded check results and actual assessment clock required');
  const seen = new Set();
  for (const result of input.results) {
    shape(result, ['kind', 'scheduledFor', 'attemptId', 'requestId', 'state', 'execution', 'coverage', 'availability', 'sourceEnd', 'observedAt', 'recordedAt', 'snapshotDigest', 'summary']);
    need(Object.hasOwn(checks, result.kind) && stamp(result.scheduledFor) && text(result.attemptId) && text(result.requestId) && !seen.has(result.attemptId), 'Exact distinct check attempt/request identity required'); seen.add(result.attemptId);
    need(['pending', 'terminal', 'missing', 'offline', 'denied', 'owner-intervention'].includes(result.state) && executions.includes(result.execution) && coverages.includes(result.coverage) && availabilities.includes(result.availability), 'Invalid check states');
    need(result.state === 'pending' || result.execution !== 'running', 'A known-running check requires its pending follow identity, not a terminal reporting blocker');
    need([result.sourceEnd, result.observedAt, result.recordedAt].every(at => at === null || stamp(at) && Date.parse(at) <= Date.parse(input.asOf)) && (result.snapshotDigest === null || digest(result.snapshotDigest)) && typeof result.summary === 'string' && result.summary.length <= 600, 'Invalid original check clocks or compact summary');
    need(result.observedAt === null || result.recordedAt === null || Date.parse(result.observedAt) <= Date.parse(result.recordedAt), 'Check source clock follows record');
    need(result.state !== 'terminal' || terminal.includes(result.execution) || ['blocked', 'pending-approval', 'unknown'].includes(result.execution), 'Terminal check cannot remain running');
  }
  const expected = Object.keys(checks).map(kind => {
    const target = expectedCheck(kind, input.asOf);
    const attempts = input.results.filter(result => result.kind === kind && result.scheduledFor === target.scheduledFor);
    if (target.state === 'not-due' && !(kind === 'lifecycle' && attempts.length)) return { ...target, attempts, state: 'not-due', gaps: [] };
    const pending = attempts.filter(result => result.state === 'pending');
    const completed = attempts.filter(result => result.state === 'terminal');
    const gaps = [];
    if (!attempts.length) return { ...target, state: 'unstarted', attempts, snapshots: [], gaps: ['exact-occurrence-acquisition-not-started'] };
    if (attempts.some(result => ['missing', 'offline', 'denied', 'owner-intervention'].includes(result.state))) gaps.push('terminal-acquisition-blocker');
    if (completed.some(result => result.sourceEnd === null || Date.parse(result.sourceEnd) < Date.parse(target.minimumSourceEnd))) gaps.push('original-source-window-incomplete');
    if (completed.some(result => result.observedAt === null || Date.parse(input.asOf) - Date.parse(result.observedAt) > target.maxAgeSeconds * 1000)) gaps.push('original-source-stale-or-unknown');
    if (completed.some(result => result.coverage !== 'complete' || result.availability !== 'available')) gaps.push('partial-or-inaccessible-report');
    if (completed.some(result => result.snapshotDigest === null)) gaps.push('terminal-report-null-or-unbound');
    if (completed.some(result => result.execution === 'failed')) gaps.push('verified-terminal-failure');
    if (completed.some(result => ['blocked', 'pending-approval', 'unknown'].includes(result.execution))) gaps.push('verified-terminal-attention');
    const snapshots = [...new Set(completed.map(result => result.snapshotDigest).filter(Boolean))];
    if (snapshots.length > 1) gaps.push('conflicting-exact-occurrence-snapshots');
    return { ...target, state: pending.length ? 'pending' : gaps.length ? 'attention' : 'terminal', attempts, snapshots, gaps };
  });
  return { schemaVersion: 1, action: 'checks', expected, retainedAttempts: input.results, follow: input.results.filter(attempt => attempt.state === 'pending').map(attempt => ({ requestId: attempt.requestId, attemptId: attempt.attemptId, operation: 'paced-supported-read-same-request' })), acquisitionRequired: expected.filter(row => row.state === 'unstarted').map(row => ({ kind: row.kind, scheduledFor: row.scheduledFor })), readyForBriefing: !expected.some(row => row.state === 'unstarted') && !input.results.some(result => result.state === 'pending'), assurance: 'reported-captures-only', effectsAuthorized: false };
}

export function assessBriefingReporting(input) {
  need(object(input), 'Reporting request required');
  return input.action === 'checks' ? assessChecks(input) : assessAutomationReporting(input);
}
