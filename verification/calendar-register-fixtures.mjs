import { canonical, digest } from '../src/records.mjs';
import { calendarSnapshotDigest } from '../src/calendar-register.mjs';

export const registerTime = '2026-10-27T00:00:00.000Z';
export const registerHash = value => digest(canonical(value));
export const registerIdentity = (nativeId = 'task-one', containerKind = 'task-list', containerId = containerKind === 'task-list' ? 'list-one' : 'calendar-one') => ({ environment: 'synthetic', accountId: 'owner@example.test', containerKind, containerId, nativeId });

export function declareRegisterPolicy(input) {
  const { snapshot, request } = input;
  const at = snapshot.acquisition.completedAt;
  const evidence = { observedAt: at, evidenceRef: 'synthetic-retained-owner-obligation' };
  request.policy = { schemaVersion: 1, scope: { environment: snapshot.scope.environment, accountId: snapshot.scope.accountId }, assignments: [], occurrences: [], bindings: [], ownerRules: [] };
  for (const source of request.sources) {
    source.assignmentId ??= 'paper-a'; source.occurrenceId ??= source.id;
    if (!request.policy.assignments.some(row => row.id === source.assignmentId)) request.policy.assignments.push({ id: source.assignmentId, reference: source.reference, orderedUnits: [], ...evidence });
    request.policy.occurrences.push({ id: source.occurrenceId, assignmentId: source.assignmentId, name: source.name, range: source.range, kind: source.kind, unitIds: [], predecessors: source.dependsOn, state: source.completed ? 'completed' : 'open', ...evidence });
    request.policy.bindings.push({ identity: structuredClone(source.identity), occurrenceId: source.occurrenceId, supersedes: null, ...evidence });
  }
  snapshot.policy = structuredClone(request.policy);
  return bindRegister(input);
}

export function bindRegister(input) {
  input.request.snapshotDigest = calendarSnapshotDigest(input.snapshot);
  if (input.request.visualReview) input.request.visualReview.snapshotDigest = input.request.snapshotDigest;
  return input;
}
export function registerAttempt(input, proposal, state = 'uncertain') {
  const prepared = structuredClone(proposal.prepared);
  return { identity: proposal.identity, effectKey: proposal.effectKey, operationDigest: registerHash({ schemaVersion: 1, ...prepared }), prepared, state, attemptedAt: new Date(Date.parse(prepared.capturedAt) + 100).toISOString(), evidenceRef: 'synthetic-retained-first-response' };
}
export function refreshRegisterEvidence(input) {
  input.snapshot.acquisition = { startedAt: input.evaluatedAt, completedAt: input.evaluatedAt };
  for (const kind of ['calendars', 'taskLists']) for (const collection of [input.snapshot.discovery[kind], ...input.snapshot[kind].map(row => row.collection)]) for (const page of collection.pages) page.acquiredAt = input.evaluatedAt;
  for (const row of input.request.taskSchedules) row.observedAt = input.evaluatedAt;
  input.request.history.completeThrough = input.evaluatedAt;
  return bindRegister(input);
}
export function registerFixture(evaluatedAt = registerTime) {
  const acquiredAt = new Date(Date.parse(evaluatedAt) - 1000).toISOString();
  const day = evaluatedAt.slice(0, 10);
  const point = clock => `${day}T${clock}:00Z`;
  const window = { start: point('08:00'), end: point('18:00'), timeZone: 'UTC' };
  const coverage = query => ({ complete: true, startedAt: acquiredAt, completedAt: acquiredAt, pages: [{ requestToken: null, nextToken: null, responseDigest: registerHash('synthetic response'), acquiredAt, query }], gaps: [] });
  const task = { id: 'task-one', title: 'Module Paper A attempt', status: 'needsAction', due: `${day}T00:00:00.000Z`, etag: 'task-etag-one', updated: acquiredAt };
  const event = (id, title, start, end, transparency = 'opaque') => ({ id, summary: title, status: 'confirmed', transparency, start: { dateTime: point(start), timeZone: 'UTC' }, end: { dateTime: point(end), timeZone: 'UTC' } });
  const snapshot = {
    schemaVersion: 1, kind: 'calendar-register', scope: { environment: 'synthetic', accountId: 'owner@example.test', window }, acquisition: { startedAt: acquiredAt, completedAt: acquiredAt },
    discovery: { calendars: { ...coverage({ showHidden: true, showDeleted: true, maxResults: 250 }), items: [{ id: 'calendar-one' }] }, taskLists: { ...coverage({ maxResults: 1000 }), items: [{ id: 'list-one' }] } },
    calendars: [{ id: 'calendar-one', title: 'Synthetic Calendar', timeZone: 'UTC', accessRole: 'owner', collection: coverage({ timeMin: window.start, timeMax: window.end, singleEvents: true, showDeleted: true, showHiddenInvitations: true, maxResults: 2500 }), events: [event('busy-one', 'Meeting', '10:00', '11:00'), event('meal-one', 'Lunch', '12:00', '13:00', 'transparent'), event('optional-one', 'Optional class', '14:00', '15:00', 'transparent')] }],
    taskLists: [{ id: 'list-one', title: 'Synthetic Tasks', collection: coverage({ maxResults: 100, showCompleted: true, showDeleted: true, showHidden: true, showAssigned: true }), tasks: [task] }], taskSchedules: [], mappings: [], sourceScopes: [], ownerDone: [],
  };
  const request = {
    schemaVersion: 1, snapshotDigest: '', window, workingIntervals: [{ start: window.start, end: window.end }], maxEvidenceAgeMs: 60000, mealPolicy: 'protect-all', protectedIdentities: [],
    taskSchedules: [{ identity: registerIdentity(), taskDigest: registerHash(task), observedAt: acquiredAt, evidenceRef: 'synthetic-exact-id-native-readback', window, complete: true, recurrence: 'none', recurrenceCovered: true, intervals: [] }], mappings: [],
    sources: [{ id: 'paper-attempt', identity: registerIdentity(), name: 'Paper A attempt', reference: 'synthetic-module-file', range: 'Paper A, actual timed attempt', kind: 'timed-attempt', actualDurationMinutes: 40, dependsOn: [], completed: false }], ownerDone: [], lifecycle: [],
    operations: [{ id: 'move-one', identity: registerIdentity(), baselineDigest: registerHash({ native: task, intervals: [] }), transport: 'calendar-native-ui', changes: { title: task.title, date: day, start: point('09:00'), end: point('10:00'), durationMinutes: 60, timeZone: 'UTC' }, sourceId: 'paper-attempt' }], attempts: [], history: { complete: true, completeThrough: evaluatedAt, evidenceRef: 'synthetic-complete-existing-responsibility-history' },
    visualReview: { snapshotDigest: '', observedAt: acquiredAt, evidenceRef: 'synthetic-native-calendar-visual-review', window, mealsProtected: true, numericCompared: true },
  };
  return declareRegisterPolicy({ snapshot, request, evaluatedAt });
}
