import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { strictJson } from './bounded-json.mjs';
import { createHash } from 'node:crypto';

const categories = ['repeated-reads-tools', 'retries', 'coordination', 'duplicate-instructions', 'stale-contradictory-context', 'truncation', 'model-fit'];
const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1600;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|\+08:00)$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value) + (value.endsWith('Z') ? 0 : 28800000)).toISOString().slice(0, 19) === value.slice(0, 19);
function shape(value, required, optional = []) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  need(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key)), `Expected members ${required.join(', ')}`);
}
function rows(value, maximum, validate) {
  need(Array.isArray(value) && value.length <= maximum, `Expected at most ${maximum} entries`);
  value.forEach(validate);
}
function ids(value) { rows(value, 100, id => need(text(id) && id.length <= 120, 'Invalid reference')); need(new Set(value).size === value.length, 'Duplicate reference'); }
function unique(value) { need(value.every(row => row.id.length <= 120) && new Set(value.map(row => row.id)).size === value.length, 'Invalid or duplicate ID'); }
function amount(value, usage) {
  need(value && ['measured', 'estimated', 'unavailable'].includes(value.basis), 'Invalid measurement basis');
  shape(value, value.basis === 'unavailable' ? ['basis', 'reason'] : [...(usage ? ['basis', 'unit', 'input', 'cachedInput', 'output'] : ['basis', 'currency', 'unit', 'value']), ...(value.basis === 'estimated' ? ['method'] : [])]);
  if (value.basis === 'unavailable') need(text(value.reason), 'Unavailable quantity needs a reason');
  if (value.basis === 'estimated') need(text(value.method), 'Estimated quantity needs a method');
  if (value.basis === 'unavailable') return;
  need(text(value.unit) && value.unit.length <= 40, 'Measurement unit required, at most 40 characters');
  if (usage) need(value.unit === 'tokens' && [value.input, value.cachedInput, value.output].every(integer) && value.cachedInput <= value.input, 'Token counts must be nonnegative safe integers; cachedInput is a subset of input');
  else need(/^[A-Z]{3}$/.test(value.currency) && integer(value.value), 'Cost needs currency and nonnegative safe integer value');
}
function validate(capture) {
  shape(capture, ['schemaVersion', 'reviewWindow', 'maxEvidenceAgeHours', 'inventory', 'evidence', 'objectives', 'attempts', 'observations']);
  need(capture.schemaVersion === 1, 'Unsupported schemaVersion');
  shape(capture.reviewWindow, ['start', 'end', 'timeZone']);
  need(capture.reviewWindow.timeZone === 'Asia/Singapore' && [capture.reviewWindow.start, capture.reviewWindow.end].every(stamp) && Date.parse(capture.reviewWindow.start) < Date.parse(capture.reviewWindow.end), 'A valid Singapore review interval is required');
  need(integer(capture.maxEvidenceAgeHours) && capture.maxEvidenceAgeHours > 0 && capture.maxEvidenceAgeHours <= 8760, 'Invalid evidence maximum age');
  shape(capture.inventory, ['objectives', 'attempts']);
  need(Object.values(capture.inventory).every(value => ['complete', 'partial', 'unavailable'].includes(value)), 'Invalid inventory declaration');
  rows(capture.evidence, 1000, row => { shape(row, ['id', 'ref', 'observedAt', 'acquiredAt']); need(text(row.id) && text(row.ref) && stamp(row.observedAt) && stamp(row.acquiredAt), 'Invalid evidence'); });
  rows(capture.objectives, 500, row => { shape(row, ['id', 'outcome', 'evidenceIds']); need(text(row.id) && ['verified-success', 'failed', 'pending', 'unknown'].includes(row.outcome), 'Invalid objective'); ids(row.evidenceIds); });
  rows(capture.attempts, 1000, row => {
    shape(row, ['id', 'objectiveId', 'workerId', 'kind', 'evidenceIds', 'usage', 'cost']);
    need([row.id, row.objectiveId, row.workerId].every(value => text(value) && value.length <= 120) && ['worker', 'retry', 'coordination'].includes(row.kind), 'Only disjoint worker, retry and coordination attempts are supported; aggregate rows are forbidden');
    ids(row.evidenceIds); amount(row.usage, true); amount(row.cost, false);
  });
  rows(capture.observations, 100, row => { shape(row, ['id', 'category', 'summary', 'evidenceIds', 'attemptIds']); need(text(row.id) && text(row.summary) && categories.includes(row.category), 'Invalid observation'); ids(row.evidenceIds); ids(row.attemptIds); });
  for (const collection of [capture.evidence, capture.objectives, capture.attempts, capture.observations]) unique(collection);
  const evidence = new Set(capture.evidence.map(row => row.id)); const objectives = new Set(capture.objectives.map(row => row.id)); const attempts = new Set(capture.attempts.map(row => row.id));
  for (const row of [...capture.objectives, ...capture.attempts, ...capture.observations]) need(row.evidenceIds.every(id => evidence.has(id)), 'Unknown evidence ID');
  for (const row of capture.attempts) need(objectives.has(row.objectiveId), 'Unknown objective ID');
  for (const row of capture.observations) need(row.attemptIds.every(id => attempts.has(id)), 'Unknown attempt ID');
}
const sorted = rows => rows.toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function totals(attempts, field) {
  const groups = new Map();
  for (const row of attempts) {
    const value = row[field]; if (value.basis === 'unavailable') continue;
    const key = JSON.stringify([value.basis, value.currency ?? null, value.unit]);
    const group = groups.get(key) ?? { basis: value.basis, ...(field === 'cost' ? { currency: value.currency } : {}), unit: value.unit, attempts: 0, ...(field === 'cost' ? { value: 0 } : { input: 0, cachedInput: 0, output: 0, total: 0 }), coverage: 'partial' };
    group.attempts++;
    for (const name of field === 'cost' ? ['value'] : ['input', 'cachedInput', 'output']) { group[name] += value[name]; need(integer(group[name]), 'Measurement sum exceeds safe integer range'); }
    if (field === 'usage') { group.total = group.input + group.output; need(integer(group.total), 'Token sum exceeds safe integer range'); }
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);
}

export function assessTokenReview(capture, { evaluatedAt }) {
  need(Buffer.byteLength(JSON.stringify(capture)) <= 262144, 'Capture exceeds 256 KiB');
  validate(capture); need(stamp(evaluatedAt), 'Invalid evaluation instant');
  const now = Date.parse(evaluatedAt); const start = Date.parse(capture.reviewWindow.start); const end = Date.parse(capture.reviewWindow.end);
  const findings = []; const add = (code, id) => findings.push({ code, id });
  if (end > now) add('future-review-window', 'reviewWindow');
  if (now - end > capture.maxEvidenceAgeHours * 3600000) add('stale-review-window', 'reviewWindow');
  const eligible = new Set();
  for (const row of sorted(capture.evidence)) {
    const observed = Date.parse(row.observedAt); const acquired = Date.parse(row.acquiredAt);
    if (observed < start || observed >= end) add('evidence-outside-window', row.id);
    else if (observed > acquired || acquired > now) add('future-or-reversed-evidence', row.id);
    else if (now - acquired > capture.maxEvidenceAgeHours * 3600000 || now - observed > capture.maxEvidenceAgeHours * 3600000) add('stale-evidence', row.id);
    else eligible.add(row.id);
  }
  const supported = row => row.evidenceIds.length > 0 && row.evidenceIds.every(id => eligible.has(id));
  for (const [kind, value] of Object.entries(capture.inventory)) if (value !== 'complete') add('incomplete-inventory', kind);
  if (!capture.objectives.length) add('empty-cohort', 'objectives');
  let successes = 0;
  for (const row of sorted(capture.objectives)) {
    if (!supported(row)) add('outcome-evidence-needed', row.id);
    if (['pending', 'unknown'].includes(row.outcome)) add('unsettled-outcome', row.id);
    if (row.outcome === 'verified-success' && supported(row)) successes++;
    if (!capture.attempts.some(attempt => attempt.objectiveId === row.id)) add('attempt-inventory-needed', row.id);
  }
  for (const row of sorted(capture.attempts)) {
    if (!supported(row)) add('attempt-evidence-needed', row.id);
    for (const field of ['usage', 'cost']) if (row[field].basis !== 'measured') add(`${field}-${row[field].basis}`, row.id);
  }
  const usageSubtotals = totals(capture.attempts, 'usage'); const costSubtotals = totals(capture.attempts, 'cost');
  if (costSubtotals.length !== 1 && capture.attempts.length) add('incompatible-cost-data', 'attempts');
  if (!successes) add('no-verified-success', 'objectives');
  const opportunities = sorted(capture.observations).map(row => ({ id: row.id, category: row.category, summary: row.summary, evidenceIds: row.evidenceIds.toSorted(), attemptIds: row.attemptIds.toSorted(), status: supported(row) ? 'review-opportunity' : 'needs-evidence' }));
  for (const row of opportunities) if (row.status === 'needs-evidence') add('observation-evidence-needed', row.id);
  findings.sort((a, b) => `${a.code}/${a.id}` < `${b.code}/${b.id}` ? -1 : `${a.code}/${a.id}` > `${b.code}/${b.id}` ? 1 : 0);
  const complete = findings.length === 0 && capture.attempts.length > 0;
  const costPerVerifiedSuccess = complete ? { status: 'available', basis: 'supplied-measured', currency: costSubtotals[0].currency, unit: costSubtotals[0].unit, numerator: costSubtotals[0].value, denominator: successes } : { status: 'unavailable' };
  const result = { schemaVersion: 1, status: findings.length ? 'needs-evidence' : opportunities.length ? 'needs-review' : 'checked', assurance: 'supplied-declarations-only', execution: 'none', evaluatedAt, reviewWindow: { ...capture.reviewWindow }, verifiedSuccesses: successes, costPerVerifiedSuccess, usageSubtotals: usageSubtotals.slice(0, 100), costSubtotals: costSubtotals.slice(0, 100), opportunities, findings: findings.slice(0, 100), counts: { findings: findings.length, usageGroups: usageSubtotals.length, costGroups: costSubtotals.length }, tokenSavings: { status: 'unavailable' }, limits: ['Measured labels, complete inventories, outcomes, identities and source times are supplied claims, not authenticated provider truth.', 'Leaf attempt IDs must represent disjoint accounting; omitted or relabelled overlap cannot be detected. Aggregate rows are unsupported.', 'Subtotals are partial known data, grouped by basis and unit. Input includes its cached subset; total is input plus output.', 'Findings and subtotal groups are capped at 100 each; counts retain the complete quantities.', 'Observations are review opportunities, not proven waste or permission to downgrade a model. No token savings are established.', 'Duplicate decoded JSON keys, unsafe keys and excessive nesting are rejected.'] };
  need(Buffer.byteLength(JSON.stringify(result)) <= 524288, 'Assessment exceeds 512 KiB output bound');
  return result;
}

export async function tokenReview({ file }) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let bytes;
  try {
    const stat = await handle.stat(); need(stat.isFile() && stat.size <= 262144, 'Capture must be an ordinary file at most 256 KiB');
    const buffer = Buffer.alloc(262145); let count = 0;
    while (count < buffer.length) { const result = await handle.read(buffer, count, buffer.length - count, null); if (!result.bytesRead) break; count += result.bytesRead; }
    need(count <= 262144, 'Capture exceeds 256 KiB'); bytes = buffer.subarray(0, count);
  } finally { await handle.close(); }
  const capture = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return { ...assessTokenReview(capture, { evaluatedAt: new Date().toISOString() }), inputDigest: createHash('sha256').update(bytes).digest('hex') };
}
