import { canonical, digest } from './content.mjs';

const hash = value => digest(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 16384;
const fields = (value, required) => object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key));
const list = value => Array.isArray(value) && value.length <= 128;
const unique = rows => new Set(rows).size === rows.length;
const revision = value => Number.isSafeInteger(value) && value > 0;
const minute = value => Number.isSafeInteger(value) && value > 0 && value <= 1440;
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) && Number.isFinite(Date.parse(`${value.slice(0, 10)}T00:00:00Z`)) && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10) && +value.slice(11, 13) < 24 && +value.slice(14, 16) < 60 && +value.slice(17, 19) < 60;
const operations = ['create', 'change', 'complete', 'replan'];
const ruleKey = row => `${row.id}@${row.revision}`;
const scopesOverlap = (left, right) => left.scope !== null && right.scope !== null && left.scope.environment === right.scope.environment && left.scope.accountId === right.scope.accountId && (left.scope.source === right.scope.source || left.scope.source === '*' || right.scope.source === '*') && left.scope.operations.some(value => right.scope.operations.includes(value)) && left.effectiveFrom !== null && right.effectiveFrom !== null && left.effectiveUntil !== null && right.effectiveUntil !== null && Date.parse(left.effectiveFrom) < Date.parse(right.effectiveUntil) && Date.parse(right.effectiveFrom) < Date.parse(left.effectiveUntil);
const version = row => ({ id: row.id, revision: row.revision, digest: hash(row) });
const parametersValid = value => fields(value, ['minimumMinutes', 'incrementMinutes']) && minute(value.minimumMinutes) && minute(value.incrementMinutes) && value.minimumMinutes % value.incrementMinutes === 0;
const rounded = (actual, parameters) => Math.max(parameters.minimumMinutes, Math.ceil(actual / parameters.incrementMinutes) * parameters.incrementMinutes);

export function assessRoundedBooking(parameters, timing) {
  const findings = [];
  const actual = timing?.actualDurationMinutes;
  const scheduled = timing?.scheduledDurationMinutes;
  const expected = minute(actual) ? rounded(actual, parameters) : null;
  if (!minute(scheduled) || scheduled < parameters.minimumMinutes || scheduled % parameters.incrementMinutes !== 0) findings.push('scheduled-block-increment');
  if (expected !== null && scheduled !== expected) findings.push('source-duration-mismatch');
  return { findings, scheduledDurationMinutes: expected, roundingAllowanceMinutes: expected === null ? null : expected - actual };
}

function applicability(rule, context) {
  const scope = rule.scope;
  if (scope === null) return 'unresolved';
  if (scope.environment !== context.environment || scope.accountId !== context.accountId || !scope.operations.includes(context.operation)) return 'outside';
  if (scope.source !== '*' && !text(context.source)) return 'unresolved';
  if (scope.source !== '*' && scope.source !== context.source) return 'outside';
  if (rule.effectiveFrom === null || rule.effectiveUntil === null || !context.window) return 'unresolved';
  const start = Date.parse(context.window.start); const end = Date.parse(context.window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return 'unresolved';
  if (Date.parse(rule.effectiveUntil) <= start || Date.parse(rule.effectiveFrom) >= end) return 'outside';
  return Date.parse(rule.effectiveFrom) <= start && Date.parse(rule.effectiveUntil) >= end ? 'applicable' : 'unresolved';
}

function nonapplicable(timing, context) {
  const reasons = { create: 'undated-create', change: 'title-only', complete: 'completion-only' };
  return fields(timing, ['kind', 'reason', 'operationId', 'occurrenceId', 'environment', 'accountId', 'observedAt', 'evidenceRef']) && timing.kind === 'not-applicable' && reasons[context.operation] === timing.reason && timing.operationId === context.operationId && timing.occurrenceId === context.occurrenceId && timing.environment === context.environment && timing.accountId === context.accountId && stamp(timing.observedAt) && Date.parse(timing.observedAt) <= Date.parse(context.evaluatedAt) && Date.parse(context.evaluatedAt) - Date.parse(timing.observedAt) <= context.maxEvidenceAgeMs && text(timing.evidenceRef) && context.timingFieldsAbsent === true;
}

export function assessPlanningPolicy(bundle, context) {
  const findings = [];
  const add = code => { if (!findings.includes(code)) findings.push(code); };
  const selected = []; const decisions = [];
  const result = booking => ({ findings, booking, resolution: { schemaVersion: 1, policyDigest: hash(bundle ?? null), selected, decisions } });
  let zoneValid = false;
  try { zoneValid = text(bundle?.timeZone) && !/^[+-]/.test(bundle.timeZone) && !!new Intl.DateTimeFormat('en', { timeZone: bundle.timeZone }); } catch {}
  if (!fields(bundle, ['schemaVersion', 'policyId', 'revision', 'recordedAt', 'timeZone', 'sources', 'rules']) || bundle.schemaVersion !== 1 || !text(bundle.policyId) || !revision(bundle.revision) || !stamp(bundle.recordedAt) || Date.parse(bundle.recordedAt) > Date.parse(context.evaluatedAt) || !zoneValid || !list(bundle.sources) || !list(bundle.rules) || !stamp(context.evaluatedAt) || !operations.includes(context.operation)) { add('planning-policy-invalid'); return result(null); }
  const sources = new Map();
  for (const source of bundle.sources) {
    if (!fields(source, ['id', 'ownerRef', 'observedAt', 'evidenceRef']) || !text(source.id) || !text(source.ownerRef) || !text(source.evidenceRef) || !stamp(source.observedAt) || Date.parse(source.observedAt) > Date.parse(bundle.recordedAt) || sources.has(source.id)) add('planning-source-invalid');
    else sources.set(source.id, source);
  }
  const rules = new Map();
  for (const rule of bundle.rules) {
    if (!fields(rule, ['id', 'revision', 'sourceRefs', 'scope', 'strength', 'predicate', 'parameters', 'effectiveFrom', 'effectiveUntil', 'supersedes', 'priority']) || !text(rule.id) || !revision(rule.revision) || !list(rule.sourceRefs) || rule.sourceRefs.length === 0 || !rule.sourceRefs.every(ref => sources.has(ref)) || !unique(rule.sourceRefs) || !['hard', 'preference', 'estimate'].includes(rule.strength) || !text(rule.predicate) || !object(rule.parameters) || !Number.isSafeInteger(rule.priority) || !list(rule.supersedes) || !(rule.effectiveFrom === null || stamp(rule.effectiveFrom)) || !(rule.effectiveUntil === null || stamp(rule.effectiveUntil)) || rule.effectiveFrom !== null && rule.effectiveUntil !== null && Date.parse(rule.effectiveFrom) >= Date.parse(rule.effectiveUntil) || rule.scope !== null && (!fields(rule.scope, ['environment', 'accountId', 'source', 'operations']) || !['environment', 'accountId', 'source'].every(key => text(rule.scope[key])) || !list(rule.scope.operations) || rule.scope.operations.length === 0 || !unique(rule.scope.operations) || !rule.scope.operations.every(value => operations.includes(value))) || rules.has(ruleKey(rule))) { add('planning-rule-invalid'); continue; }
    rules.set(ruleKey(rule), rule);
  }
  for (const rule of rules.values()) {
    const refs = new Set();
    for (const ref of rule.supersedes) {
      const prior = rules.get(ruleKey(ref ?? {}));
      if (!fields(ref, ['id', 'revision', 'digest']) || !prior || ref.digest !== hash(prior) || prior.id !== rule.id || prior.revision >= rule.revision || prior.strength !== rule.strength || prior.predicate !== rule.predicate || !scopesOverlap(prior, rule) || refs.has(ruleKey(ref))) add('planning-supersession-invalid');
      refs.add(ruleKey(ref ?? {}));
    }
  }
  if (findings.length) return result(null);
  const statuses = new Map([...rules.values()].map(rule => [ruleKey(rule), applicability(rule, context)]));
  for (const rule of rules.values()) {
    const state = statuses.get(ruleKey(rule));
    if (state === 'outside') continue;
    if (state === 'unresolved') { add('planning-scope-unresolved'); decisions.push({ ...version(rule), status: 'unresolved' }); continue; }
    const successors = [...rules.values()].filter(next => statuses.get(ruleKey(next)) === 'applicable' && next.supersedes.some(ref => same(ref, version(rule))));
    if (successors.length > 1) add('planning-supersession-conflict');
    if (successors.length) { decisions.push({ ...version(rule), status: 'superseded' }); continue; }
    selected.push(version(rule));
  }
  const active = selected.map(ref => rules.get(ruleKey(ref)));
  for (const rule of active) {
    if (rule.predicate !== 'booking-rounded-up' || !parametersValid(rule.parameters)) add('planning-predicate-unsupported');
  }
  const hard = active.filter(rule => rule.strength === 'hard' && rule.predicate === 'booking-rounded-up' && parametersValid(rule.parameters));
  if (!hard.length) add('planning-booking-rule-required');
  if (new Set(hard.map(rule => canonical(rule.parameters))).size > 1) add('planning-hard-conflict');
  let booking = null;
  if (!findings.length) {
    if (context.timing?.kind === 'booking') {
      if (context.timingFieldsAbsent !== false || !minute(context.timing.actualDurationMinutes)) add('planning-timing-unresolved');
      else {
        booking = assessRoundedBooking(hard[0].parameters, context.timing);
        for (const code of booking.findings) add(code);
      }
    } else if (!nonapplicable(context.timing, context)) add('planning-timing-unresolved');
  }
  for (const rule of active) decisions.push({ ...version(rule), strength: rule.strength, status: findings.length ? 'refused' : rule.strength === 'hard' ? booking ? 'satisfied' : 'not-applicable-evidenced' : 'advisory' });
  selected.sort((a, b) => canonical(a).localeCompare(canonical(b))); decisions.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return result(booking);
}
