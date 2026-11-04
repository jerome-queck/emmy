import { studioDiscovery } from './studio-discovery.mjs';

const states = ['planned', 'attempted', 'pending', 'uncertain', 'known', 'running', 'completed', 'failed'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const texts = value => Array.isArray(value) && value.every(text);
const sameScope = (left, right) => left.hostId === right.hostId && left.projectId === right.projectId;
const scopeValid = value => object(value) && text(value.hostId) && text(value.projectId);
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction = '') => `.${fraction.padEnd(3, '0')}Z`);
  return Number.isFinite(time) && new Date(time).toISOString() === normalized ? time : NaN;
}
const reference = value => object(value) && text(value.ref) && Number.isFinite(instant(value.acquiredAt));
const fresh = (value, now, maxAgeMs) => reference(value) && now >= instant(value.acquiredAt) && now - instant(value.acquiredAt) <= maxAgeMs;

function validateRecord(record) {
  requireValue(object(record) && text(record.objectiveId) && text(record.owner) && scopeValid(record.scope), 'Task requires original objectiveId, owner and exact host/project scope');
  requireValue(['prepare', 'monitor', 'review'].includes(record.phase), 'Unknown task phase');
  if (record.skills !== undefined) requireValue(Array.isArray(record.skills) && record.skills.every(skill => object(skill) && text(skill.name) && /^[a-zA-Z0-9:_-]+$/.test(skill.name) && typeof skill.path === 'string' && /^\/[^\n\r]*(?:\/)SKILL\.md$/.test(skill.path)), 'Skills require exact names and resolved absolute SKILL.md paths');
  const { native, sections } = record;
  requireValue(object(native) && states.includes(native.state) && (native.taskId === null || text(native.taskId)) && (native.clientThreadId === null || text(native.clientThreadId)) && Array.isArray(native.readbacks), 'Task requires explicit native state, nullable taskId/clientThreadId and readbacks');
  for (const row of native.readbacks) requireValue(reference(row) && text(row.hostId) && (row.projectId === null || text(row.projectId)) && text(row.taskId) && states.includes(row.state), 'Invalid original native readback');
  requireValue(object(sections) && text(sections.goal) && texts(sections.subgoals) && texts(sections.output) && sections.output.length > 0, 'Missing Goal, Subgoals or Output section');
  const { verification, boundaries, delegation } = sections;
  requireValue(object(verification) && Array.isArray(verification.criteria) && verification.criteria.length > 0 && texts(verification.checks) && typeof verification.independentReview === 'boolean', 'Missing structured Verification section');
  const ids = new Set();
  for (const criterion of verification.criteria) {
    requireValue(object(criterion) && text(criterion.id) && text(criterion.text) && !ids.has(criterion.id), 'Verification criteria require unique IDs and text'); ids.add(criterion.id);
  }
  requireValue(object(boundaries) && texts(boundaries.authorized) && texts(boundaries.excluded) && text(boundaries.sourceRef), 'Missing structured Boundaries section');
  requireValue(object(delegation) && text(delegation.parent) && texts(delegation.helpers), 'Missing structured Delegation section');
  if (record.review !== undefined) {
    const review = record.review;
    requireValue(reference(review) && text(review.reviewer) && Array.isArray(review.criteria), 'Review requires reviewer, original reference/acquisition and criteria');
    const reviewed = new Set();
    for (const row of review.criteria) {
      requireValue(object(row) && ids.has(row.id) && !reviewed.has(row.id) && ['passed', 'failed', 'unknown'].includes(row.outcome) && Array.isArray(row.evidence) && row.evidence.every(reference), 'Review must map unique known criteria to outcomes and original evidence references'); reviewed.add(row.id);
    }
  }
  return record;
}

function render(record) {
  const { sections: s } = record;
  const list = values => values.length ? values.map(value => `- ${value}`).join('\n') : '- None declared.';
  return (record.skills ?? []).map(skill => `[$${skill.name}](${skill.path.split('/').map(part => encodeURIComponent(part).replaceAll('(', '%28').replaceAll(')', '%29')).join('/')})\n`).join('') + [
    `# Goal\n${s.goal}\n\nObjective: ${record.objectiveId}\nOwner: ${record.owner}\nHost: ${record.scope.hostId}\nProject: ${record.scope.projectId}`,
    `# Verification\n${list(s.verification.criteria.map(value => `[${value.id}] ${value.text}`))}\n\nChecks:\n${list(s.verification.checks)}\nIndependent review: ${s.verification.independentReview ? 'required' : 'not required'}.`,
    `# Subgoals\n${list(s.subgoals)}`,
    `# Boundaries\nSource: ${s.boundaries.sourceRef}\nAuthorized:\n${list(s.boundaries.authorized)}\nExcluded:\n${list(s.boundaries.excluded)}`,
    `# Output\n${list(s.output)}`,
    `# Delegation\nMonitoring parent: ${s.delegation.parent}\nHelpers:\n${list(s.delegation.helpers)}`
  ].join('\n\n') + '\n';
}

function assess(record, now, maxAgeMs) {
  const { native, review, sections } = record; const gaps = [];
  const add = reason => gaps.push(reason);
  const unresolved = ['attempted', 'pending', 'uncertain'].includes(native.state);
  const planned = native.state === 'planned';
  if (unresolved) add('unresolved-native-attempt');
  if (planned && (native.taskId !== null || native.clientThreadId !== null || native.readbacks.length)) add('planned-state-has-native-identity');
  if (!planned && !unresolved && !text(native.taskId)) add('native-task-id-missing');
  if (!planned && !unresolved && native.clientThreadId !== null) add('pending-client-id-unresolved');
  if (!planned && !unresolved) {
    if (!native.readbacks.length) add('native-readback-missing');
    for (const row of native.readbacks) {
      if (!sameScope(row, record.scope) || row.taskId !== native.taskId) add('native-identity-or-membership-mismatch');
      if (!fresh(row, now, maxAgeMs)) add('native-readback-not-current');
      if (row.state !== native.state) add('contradictory-native-state');
    }
  }
  if (record.phase === 'prepare' && !planned) add('prepare-requires-planned-state');
  if (record.phase !== 'prepare' && planned) add('native-identity-not-yet-known');
  if (native.state === 'failed') add('native-failure-retained');
  const criteria = sections.verification.criteria.map(criterion => {
    const result = review?.criteria.find(row => row.id === criterion.id);
    return { id: criterion.id, outcome: result?.outcome ?? 'unknown', evidence: result?.evidence ?? [], complete: result?.outcome === 'passed' && result.evidence.length > 0 && result.evidence.every(row => fresh(row, now, maxAgeMs)) };
  });
  if (record.phase === 'review') {
    if (native.state !== 'completed') add('native-completion-not-reported');
    if (!review || !fresh(review, now, maxAgeMs)) add('original-review-not-current');
    if (review && sections.verification.independentReview && review.reviewer === record.owner) add('independent-review-missing');
    if (criteria.some(row => !row.complete)) add('criterion-evidence-gaps');
  }
  const reasons = [...new Set(gaps)].sort();
  const rediscover = unresolved || reasons.some(value => /native|pending-client|planned-state|contradictory/.test(value));
  const status = rediscover ? 'rediscovery-only' : reasons.length ? 'evidence-gaps' : record.phase === 'prepare' ? 'prepared' : record.phase === 'review' ? 'reported-review-complete' : 'reported-native-known';
  return { objectiveId: record.objectiveId, owner: record.owner, scope: record.scope, phase: record.phase, native: { state: native.state, taskId: native.taskId, clientThreadId: native.clientThreadId }, status, gaps: reasons, criteria, prompt: render(record), next: rediscover ? ['Rediscover this exact original objective, attempt and native identity through supported native reads. Do not retry creation.'] : status === 'prepared' ? ['Parent separately checks authority, skills, destination and settings before a supported native call. Retain its response and membership readback separately.'] : ['Parent reviews original native and artifact evidence within the declared scope.'], accepted: false, automaticRetry: false };
}

export function taskWorkflow(input) {
  requireValue(object(input) && input.schemaVersion === 1 && ['assess', 'project'].includes(input.action) && Number.isFinite(instant(input.evaluatedAt)) && Number.isSafeInteger(input.maxAgeMs) && input.maxAgeMs >= 0, 'Expected task-workflow schema 1, assess/project action, UTC evaluatedAt and safe nonnegative maxAgeMs');
  const base = { schemaVersion: 1, type: 'task-workflow-assessment', action: input.action, evaluatedAt: input.evaluatedAt, maxAgeMs: input.maxAgeMs, execution: 'none', assurance: 'supplied-declarations-only', accepted: false, automaticRetry: false,
    limits: ['Schema and evidence-reference consistency are enforced. Supplied claims, clocks and references are not authenticated or read.', 'Native product remains authoritative. No task is created, retried, adopted, persisted or accepted.', 'Agent judgment, actual authority, skill/model settings, artifact correctness, deployment and ordinary adoption require separate parent review.'] };
  const now = instant(input.evaluatedAt);
  if (input.action === 'assess') return { ...base, ...assess(validateRecord(input.record), now, input.maxAgeMs) };
  requireValue(scopeValid(input.scope) && Array.isArray(input.records), 'Project projection requires exact scope and supplied records');
  const index = studioDiscovery(input.discovery);
  requireValue(sameScope(index.scope, input.scope) && index.evaluatedAt === input.evaluatedAt && index.maxAgeMs === input.maxAgeMs, 'Discovery must bind the same scope and original assessment clock/age limit');
  const records = input.records.map(validateRecord);
  const selected = records.filter(record => sameScope(record.scope, input.scope));
  requireValue(new Set(selected.map(record => record.objectiveId)).size === selected.length, 'Conflicting original objective records require explicit resolution');
  const nativeIds = selected.map(record => record.native.taskId).filter(text);
  requireValue(new Set(nativeIds).size === nativeIds.length, 'One native task cannot represent different supplied objectives');
  const assessments = selected.map(record => {
    const result = assess(record, now, input.maxAgeMs);
    if (record.native.state === 'planned') return result;
    const task = index.tasks.find(task => task.id === record.native.taskId);
    const consistent = task && !task.conflict && !task.overlap && task.observations.every(row => sameScope(row.task, input.scope) && row.captures.every(capture => capture.freshness === 'fresh'));
    if (!consistent) return { ...result, status: 'rediscovery-only', gaps: [...result.gaps, 'supplied-index-identity-unresolved'].sort(), next: ['Rediscover this exact original objective and native identity. Index absence or conflict cannot authorize retry.'] };
    return result;
  });
  return { ...base, status: index.status === 'partial' || assessments.some(result => ['rediscovery-only', 'evidence-gaps'].includes(result.status)) ? 'projected-partial' : 'projected', scope: input.scope, index, records: assessments, excludedRecords: records.filter(record => !sameScope(record.scope, input.scope)).map(record => ({ objectiveId: record.objectiveId, scope: record.scope, taskId: record.native.taskId })), independentNativeTasks: index.tasks.filter(task => !selected.some(record => record.native.taskId === task.id)).map(task => ({ hostId: task.hostId, taskId: task.id })), intervention: 'none' };
}
