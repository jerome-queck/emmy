import { bindRegister, registerFixture, registerHash } from './calendar-register-fixtures.mjs';

export function bindPolicy(input) { input.snapshot.policy = structuredClone(input.request.policy); return bindRegister(input); }
export function questionPolicy(input, units = ['q3']) {
  const source = input.request.sources[0]; const policy = input.request.policy;
  source.kind = 'whole-source'; source.name = 'Worksheet'; source.range = units.join(',');
  input.request.operations[0].changes.title = 'Module Worksheet';
  policy.assignments[0].orderedUnits = ['q1', 'q2', 'q3'];
  Object.assign(policy.occurrences[0], { name: source.name, range: source.range, kind: source.kind, unitIds: units });
  for (const id of ['q1', 'q2'].filter(id => !units.includes(id))) policy.occurrences.push({ ...structuredClone(policy.occurrences[0]), id, unitIds: [id], state: 'completed' });
  return bindPolicy(input);
}
export function ownerMovePolicy(input) {
  const day = input.request.window.start.slice(0, 10);
  const intervals = [{ start: `${day}T16:00:00Z`, end: `${day}T17:00:00Z` }];
  input.request.taskSchedules[0].intervals = intervals;
  input.request.operations[0].baselineDigest = registerHash({ native: input.snapshot.taskLists[0].tasks[0], intervals: intervals.map(row => ({ start: new Date(row.start).toISOString(), end: new Date(row.end).toISOString() })) });
  input.request.policy.ownerRules.push({ id: 'owner-move', identity: structuredClone(input.request.operations[0].identity), occurrenceId: input.request.sources[0].occurrenceId, changes: intervals[0], observedAt: input.snapshot.acquisition.completedAt, evidenceRef: 'synthetic-owner-manual-move', supersedes: null });
  return bindPolicy(input);
}
export function correctionPolicy(input, foreign = false) {
  const source = input.request.sources[0]; const policy = input.request.policy;
  Object.assign(source, { name: 'Paper A correction', range: 'Q3 correction', kind: 'correction', actualDurationMinutes: 15, dependsOn: ['attempt-source'] });
  Object.assign(input.request.operations[0].changes, { title: 'Module Paper A correction', end: `${input.request.window.start.slice(0, 10)}T09:30:00Z`, durationMinutes: 30 });
  policy.assignments[0].orderedUnits = ['q1', 'q2', 'q3'];
  Object.assign(policy.occurrences[0], { name: source.name, range: source.range, kind: source.kind, unitIds: ['q3'], predecessors: ['original-attempt'] });
  if (foreign) policy.assignments.push({ ...policy.assignments[0], id: 'other-assignment', reference: 'other-paper' });
  const attempt = { ...policy.occurrences[0], id: 'original-attempt', assignmentId: foreign ? 'other-assignment' : source.assignmentId, kind: 'timed-attempt', unitIds: foreign ? ['q1', 'q2', 'q3'] : ['q1'], predecessors: [], state: 'completed' };
  policy.occurrences.push(attempt);
  input.request.sources.push({ ...source, id: 'attempt-source', occurrenceId: attempt.id, assignmentId: attempt.assignmentId, identity: { ...source.identity, nativeId: 'original-attempt' }, kind: 'timed-attempt', dependsOn: [], completed: true });
  return bindPolicy(input);
}

export const calendarPolicyCases = [
  ['correction-foreign-assignment', input => correctionPolicy(input, true), 'correction-attempt-policy-required'],
  ['correction-unattempted-question', input => correctionPolicy(input), 'correction-attempt-policy-required'],
  ['owner-invalid-date', input => { calendarPolicyPositives.find(row => row[0] === 'owner-explicit-supersession')[1](input); input.request.policy.ownerRules.at(-1).changes.start = '2026-02-30T09:00:00Z'; bindPolicy(input); }, 'owner-rule-invalid'],
  ['owner-invalid-hour', input => { calendarPolicyPositives.find(row => row[0] === 'owner-explicit-supersession')[1](input); input.request.policy.ownerRules.at(-1).changes.start = `${input.request.window.start.slice(0, 10)}T24:00:00Z`; bindPolicy(input); }, 'owner-rule-invalid'],
  ['owner-different-instant', input => { calendarPolicyPositives.find(row => row[0] === 'owner-explicit-supersession')[1](input); const changes = input.request.policy.ownerRules.at(-1).changes; for (const key of ['start', 'end']) changes[key] = new Date(Date.parse(changes[key]) + 3600000).toISOString(); bindPolicy(input); }, 'owner-policy-protected'],
  ['policy-missing', input => { delete input.request.policy; }, 'calendar-policy-required'],
  ['policy-baseline', input => { input.request.policy.occurrences[0].evidenceRef = 'different-policy-revision'; }, 'calendar-policy-baseline-mismatch'],
  ['semantic-repurpose', input => { Object.assign(input.request.sources[0], { name: 'Worksheet Q5', range: 'Q5' }); input.request.operations[0].changes.title = 'Module Worksheet Q5'; }, 'source-semantic-mismatch'],
  ['generic-filler', input => { Object.assign(input.request.sources[0], { name: 'Catch-up prep', range: 'generic catch-up', kind: 'whole-source' }); input.request.operations[0].changes.title = 'Module Catch-up prep'; }, 'source-semantic-mismatch'],
  ['question-gap', input => { questionPolicy(input, ['q1', 'q3']); }, 'question-group-not-contiguous'],
  ['question-order', input => { questionPolicy(input); input.request.policy.occurrences.find(row => row.id === 'q2').state = 'open'; bindPolicy(input); }, 'ordered-question-dependency-unmet'],
  ['question-completion-spoof', input => { questionPolicy(input); input.request.sources[0].completed = true; }, 'source-completion-policy-mismatch'],
  ['binding-duplicate', input => { input.request.policy.bindings.push({ ...input.request.policy.bindings[0], identity: { ...input.request.operations[0].identity, nativeId: 'second-task' } }); bindPolicy(input); }, 'ambiguous-source-binding'],
  ['binding-native-change', input => { input.request.policy.bindings[0].identity.nativeId = 'other-task'; bindPolicy(input); }, 'source-binding-mismatch'],
  ['owner-move-reversal', ownerMovePolicy, 'owner-policy-protected'],
  ['owner-move-missing-rule', input => { ownerMovePolicy(input); input.request.policy.ownerRules = []; bindPolicy(input); }, 'existing-interval-change-needs-owner-policy'],
  ['owner-implicit-supersession', input => { ownerMovePolicy(input); const old = input.request.policy.ownerRules[0]; input.request.policy.ownerRules.push({ ...old, id: 'new-rule', changes: { start: input.request.operations[0].changes.start, end: input.request.operations[0].changes.end }, observedAt: new Date(Date.parse(old.observedAt) + 1).toISOString(), supersedes: null }); bindPolicy(input); }, 'owner-policy-protected'],
  ['owner-foreign-supersession', input => { ownerMovePolicy(input); const old = input.request.policy.ownerRules[0]; input.request.policy.ownerRules.push({ ...old, id: 'new-rule', identity: { ...old.identity, nativeId: 'other-task' }, changes: { start: input.request.operations[0].changes.start, end: input.request.operations[0].changes.end }, observedAt: new Date(Date.parse(old.observedAt) + 1).toISOString(), supersedes: registerHash(old) }); bindPolicy(input); }, 'owner-rule-supersession-invalid'],
];
export const calendarPolicyPositives = [
  ...['utc', 'offset'].map(format => [`owner-equivalent-${format}`, input => { calendarPolicyPositives.find(row => row[0] === 'owner-explicit-supersession')[1](input); const changes = input.request.policy.ownerRules.at(-1).changes; for (const key of ['start', 'end']) changes[key] = format === 'utc' ? new Date(changes[key]).toISOString() : new Date(Date.parse(changes[key]) + 8 * 3600000).toISOString().replace('Z', '+08:00'); bindPolicy(input); }]),
  ['semantic-stable-title', input => { input.request.operations[0].changes.title += ' revised'; }],
  ['question-contiguous', input => questionPolicy(input, ['q1', 'q2', 'q3'])],
  ['question-predecessors-completed', input => questionPolicy(input)],
  ['owner-explicit-supersession', input => { ownerMovePolicy(input); const old = input.request.policy.ownerRules[0]; input.request.policy.ownerRules.push({ ...old, id: 'new-rule', changes: { start: input.request.operations[0].changes.start, end: input.request.operations[0].changes.end }, observedAt: new Date(Date.parse(old.observedAt) + 1).toISOString(), evidenceRef: 'synthetic-exact-owner-replan', supersedes: registerHash(old) }); bindPolicy(input); }],
];
export function calendarPolicyFixture(mutate) { const input = registerFixture(); mutate(input); return input; }
