import { bindRegister, refreshRegisterEvidence, registerFixture, registerHash, registerIdentity } from './calendar-register-fixtures.mjs';
import { calendarPolicyCases, calendarPolicyPositives } from './calendar-policy-fixtures.mjs';

function retainedAttempt(input) {
  const row = input.request.operations[0];
  const prepared = { snapshotDigest: input.request.snapshotDigest, operation: structuredClone(row), baseline: { native: structuredClone(input.snapshot.taskLists[0].tasks[0]), intervals: [] }, capturedAt: input.snapshot.acquisition.completedAt, intentDigest: registerHash({ ...input.request, attempts: [] }) };
  const attempt = { identity: row.identity, effectKey: registerHash({ identity: row.identity, changes: row.changes, sourceId: row.sourceId }), operationDigest: registerHash({ schemaVersion: 1, ...prepared }), prepared, state: 'uncertain', attemptedAt: '2026-10-26T23:59:59.500Z', evidenceRef: 'lost-write-response' };
  input.request.attempts.push(attempt); return attempt;
}

const negative = [
  ...calendarPolicyCases,
  ['snapshot-binding', input => { input.request.snapshotDigest = '0'.repeat(64); }, 'snapshot-digest-mismatch'],
  ['snapshot-stale', input => { input.evaluatedAt = '2026-10-27T00:01:00Z'; }, 'stale-snapshot'],
  ['page-stale', input => { input.snapshot.taskLists[0].collection.pages[0].acquiredAt = '2026-10-26T00:00:00Z'; }, 'stale-source-page'],
  ['partial-discovery', input => { input.snapshot.discovery.calendars.complete = false; }, 'partial-collection'],
  ['partial-tasks', input => { input.snapshot.taskLists[0].collection.gaps.push('read-failed'); }, 'partial-collection'],
  ['assigned-omitted', input => { delete input.snapshot.taskLists[0].collection.pages[0].query.showAssigned; }, 'query-coverage-mismatch'],
  ['filtered-tasks', input => { input.snapshot.taskLists[0].collection.pages[0].query.dueMin = '2026-10-27T00:00:00Z'; }, 'query-coverage-mismatch'],
  ['filtered-events', input => { input.snapshot.calendars[0].collection.pages[0].query.updatedMin = '2026-10-26T00:00:00Z'; }, 'query-coverage-mismatch'],
  ['pre-acquisition-offset', input => { input.snapshot.taskLists[0].collection.pages[0].acquiredAt = '2026-10-27T00:59:58+01:00'; }, 'stale-source-page'],
  ['pagination-open', input => { input.snapshot.taskLists[0].collection.pages[0].nextToken = 'still-more'; }, 'pagination-not-exhausted'],
  ['page-query-token', input => { const c = input.snapshot.taskLists[0].collection; c.pages[0].nextToken = 'next'; c.pages.push({ ...structuredClone(c.pages[0]), requestToken: 'next', nextToken: null }); }, 'page-request-token-mismatch'],
  ['new-container', input => { input.snapshot.discovery.calendars.items.push({ id: 'new-owner-calendar' }); }, 'container-discovery-mismatch'],
  ['task-unknown', input => { input.request.taskSchedules = []; }, 'unknown-task-timing'],
  ['protected-absent', input => { input.request.protectedIdentities.push(registerIdentity('missing-meal', 'calendar')); }, 'protected-identity-missing'],
  ['history-partial', input => { input.request.history.complete = false; }, 'retained-history-incomplete'],
  ['task-stale', input => { input.request.taskSchedules[0].observedAt = '2026-10-26T00:00:00Z'; }, 'task-schedule-unverified'],
  ['task-wrong-id', input => { input.request.taskSchedules[0].identity.nativeId = 'other-task'; }, 'unknown-task-timing'],
  ['task-recurrence-unknown', input => { input.request.taskSchedules[0].recurrenceCovered = false; }, 'task-schedule-unverified'],
  ['native-recurring-single', input => { input.request.taskSchedules[0].recurrence = 'recurring'; }, 'recurrence-operation-unsupported'],
  ['native-recurrence-unknown', input => { input.request.taskSchedules[0].recurrence = 'unknown'; }, 'recurrence-operation-unsupported'],
  ['task-raw-changed', input => { input.snapshot.taskLists[0].tasks[0].etag = 'changed-etag'; }, 'task-schedule-unverified'],
  ['wrong-operation-id', input => { input.request.operations[0].identity.nativeId = 'lecture-wrong-id'; }, 'wrong-native-identity'],
  ['wrong-operation-list', input => { input.request.operations[0].identity.containerId = 'wrong-list'; }, 'wrong-native-identity'],
  ['baseline-changed', input => { input.request.operations[0].baselineDigest = '0'.repeat(64); }, 'baseline-mismatch'],
  ['task-api-duration', input => { input.request.operations[0].transport = 'google-tasks-rest'; }, 'unsupported-provider-operation'],
  ['academic-api-duration', input => { input.request.operations[0].transport = 'academic-os-mcp'; }, 'unsupported-provider-operation'],
  ['end-not-persisted', input => { input.request.operations[0].changes.end = '2026-10-27T10:30:00Z'; }, 'end-time-duration-mismatch'],
  ['block-not-rounded', input => { input.request.operations[0].changes.durationMinutes = 40; input.request.operations[0].changes.end = '2026-10-27T09:40:00Z'; }, 'scheduled-block-increment'],
  ['wrong-date', input => { input.request.operations[0].changes.date = '2026-10-28'; }, 'schedule-date-zone-mismatch'],
  ['meal-free-protected', input => { Object.assign(input.request.operations[0].changes, { start: '2026-10-27T12:00:00Z', end: '2026-10-27T13:00:00Z' }); }, 'overlap'],
  ['busy-overlap', input => { Object.assign(input.request.operations[0].changes, { start: '2026-10-27T10:00:00Z', end: '2026-10-27T11:00:00Z' }); }, 'overlap'],
  ['owner-done', input => { input.request.ownerDone.push({ identity: registerIdentity(), observedAt: '2026-10-20T00:00:00Z', evidenceRef: 'owner-done' }); }, 'terminal-or-owner-done'],
  ['native-completed', input => { input.snapshot.taskLists[0].tasks[0].status = 'completed'; input.request.taskSchedules = []; }, 'terminal-or-owner-done'],
  ['completed-timing-unknown', input => { input.snapshot.taskLists[0].tasks[0].status = 'completed'; input.request.taskSchedules = []; }, 'unknown-task-timing'],
  ['native-deleted', input => { input.snapshot.taskLists[0].tasks[0].deleted = true; input.request.taskSchedules = []; }, 'terminal-or-owner-done'],
  ['owner-dismissed', input => { input.request.lifecycle.push({ identity: registerIdentity(), state: 'dismissed', observedAt: '2026-10-20T00:00:00Z', evidenceRef: 'owner-dismissed', replacements: [] }); }, 'owner-dismissed-or-superseded'],
  ['owner-superseded', input => { input.request.lifecycle.push({ identity: registerIdentity(), state: 'superseded', observedAt: '2026-10-20T00:00:00Z', evidenceRef: 'owner-superseded', replacements: [registerIdentity('replacement-one')] }); }, 'owner-dismissed-or-superseded'],
  ['future-lifecycle', input => { input.request.lifecycle.push({ identity: registerIdentity(), state: 'dismissed', observedAt: '2026-10-28T00:00:00Z', evidenceRef: 'future-owner-claim', replacements: [] }); }, 'future-lifecycle-evidence'],
  ['reopen', input => { input.request.operations[0].changes.completed = false; }, 'reopening-not-supported'],
  ['source-title', input => { input.request.operations[0].changes.title = 'Generic catch-up'; }, 'source-scope-missing-from-title'],
  ['source-title-prefix', input => { input.request.operations[0].changes.title = 'Module Paper A attempt50'; }, 'source-scope-missing-from-title'],
  ['source-native-id', input => { input.request.sources[0].identity.nativeId = 'another-task'; }, 'source-native-identity-mismatch'],
  ['source-done', input => { input.request.sources[0].completed = true; }, 'source-already-completed'],
  ['source-duration', input => { input.request.sources[0].actualDurationMinutes = 90; }, 'source-duration-mismatch'],
  ['source-absent', input => { input.request.operations[0].sourceId = null; }, 'explicit-source-required'],
  ['event-date-only', input => {
    const native = input.snapshot.calendars[0].events[0];
    input.request.operations = [{ id: 'event-date-only', identity: registerIdentity(native.id, 'calendar'), baselineDigest: registerHash({ native, intervals: [{ start: new Date(native.start.dateTime).toISOString(), end: new Date(native.end.dateTime).toISOString() }] }), transport: 'google-calendar-rest', changes: { date: '2026-10-27' }, sourceId: null }];
  }, 'end-time-duration-mismatch'],
  ['source-dependency', input => { input.request.sources[0].dependsOn = ['missing-attempt']; }, 'source-dependency-unmet'],
  ['visual-missing', input => { delete input.request.visualReview; }, 'visual-calendar-review-required'],
  ['visual-wrong-snapshot', input => { input.request.visualReview.numericCompared = false; }, 'visual-calendar-review-required'],
  ['uncertain-save', input => {
    retainedAttempt(input);
  }, 'reconcile-uncertain-effect'],
  ['no-effect-rebase', input => {
    const attempt = retainedAttempt(input);
    input.snapshot.taskLists[0].tasks[0].title = 'Owner changed native task';
    input.request.taskSchedules[0].taskDigest = registerHash(input.snapshot.taskLists[0].tasks[0]);
    input.request.operations[0].baselineDigest = registerHash({ native: input.snapshot.taskLists[0].tasks[0], intervals: [] });
    refreshRegisterEvidence(input); attempt.resolution = { kind: 'no-effect', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'rebased-after-state' };
  }, 'reconcile-uncertain-effect'],
  ['saved-protected-drift', input => {
    input.request.operations[0].changes = { title: 'Module Paper A attempt revised' };
    const attempt = retainedAttempt(input);
    input.snapshot.taskLists[0].tasks[0].title = input.request.operations[0].changes.title;
    input.request.taskSchedules[0].taskDigest = registerHash(input.snapshot.taskLists[0].tasks[0]);
    input.request.taskSchedules[0].intervals = [{ start: '2026-10-27T15:00:00Z', end: '2026-10-27T16:00:00Z' }];
    refreshRegisterEvidence(input); attempt.resolution = { kind: 'saved', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'title-saved-with-protected-drift' };
  }, 'reconcile-uncertain-effect'],
];
const positives = ['base-40-minute-attempt', 'transparent-optional-class', 'cancelled-occurrence', 'source-permutation', 'verified-self-projection', 'provider-utc-event-zone'];

export const registerBounds = { evaluatedAt: '2026-10-27T00:00:00Z', maxEvidenceAgeMs: 60000, negativeCases: negative.map(row => row[0]), positiveCases: [...positives, ...calendarPolicyPositives.map(row => row[0])], cases: negative.length + positives.length + calendarPolicyPositives.length, assumptions: ['Fixed finite synthetic domain, not an unbounded proof.', 'Provider truth, account identity, owner intent and native visual/schedule captures remain reported.', 'Collection, bounded files, credentials, live clock, immutable exports and real CLI execution are behavioral boundaries.', 'Native writes and automatic invocation are excluded.'] };

export function verifyRegisterPolicy({ register }, check) {
  let cases = 0;
  const run = (name, input, assertion, expectation) => {
    const result = register.assessCalendarRegister(input.snapshot, input.request, { evaluatedAt: input.evaluatedAt }); cases++;
    check('calendar-register', { case: name, input, result }, result.execution === 'none' && assertion(result), expectation);
  };
  for (const [name, mutate, code] of negative) {
    const input = registerFixture(); mutate(input); if (name !== 'snapshot-binding') bindRegister(input);
    run(name, input, result => result.findings.some(row => row.code === code) && result.proposals.every(row => row.status !== 'proposed'), `Refuse ${code} before proposing an action.`);
  }
  for (const name of positives) {
    const input = registerFixture();
    if (name === 'transparent-optional-class') Object.assign(input.request.operations[0].changes, { start: '2026-10-27T14:00:00Z', end: '2026-10-27T15:00:00Z' });
    if (name === 'cancelled-occurrence') input.snapshot.calendars[0].events.push({ id: 'cancelled-occurrence', status: 'cancelled', recurringEventId: 'series-one', originalStartTime: { dateTime: '2026-10-27T09:00:00Z' } });
    if (name === 'source-permutation') input.snapshot.calendars[0].events.reverse();
    if (name === 'provider-utc-event-zone') for (const event of input.snapshot.calendars[0].events) for (const endpoint of [event.start, event.end]) endpoint.timeZone = 'Asia/Singapore';
    if (name === 'verified-self-projection') {
      const operation = input.request.operations[0]; const intervals = [{ start: operation.changes.start, end: operation.changes.end }]; const task = input.snapshot.taskLists[0].tasks[0];
      input.request.taskSchedules[0].intervals = intervals;
      operation.baselineDigest = registerHash({ native: task, intervals: intervals.map(row => ({ start: new Date(row.start).toISOString(), end: new Date(row.end).toISOString() })) });
      const event = { id: 'verified-task-projection', summary: task.title, status: 'confirmed', start: { dateTime: operation.changes.start }, end: { dateTime: operation.changes.end } };
      input.snapshot.calendars[0].events.push(event);
      input.request.mappings.push({ taskIdentity: operation.identity, eventIdentity: registerIdentity(event.id, 'calendar'), taskDigest: registerHash(task), eventDigest: registerHash(event), observedAt: input.snapshot.acquisition.completedAt, evidenceRef: 'native-exact-id-projection-proof' });
    }
    bindRegister(input);
    run(name, input, result => result.status === 'proposed' && result.proposals[0].status === 'proposed' && result.availability.freeIntervals.length === 3 && result.proposals[0].changes.durationMinutes === 60 && result.proposals[0].sourceTiming.actualDurationMinutes === 40, 'Exact 40-minute attempt and optional Free class remain possible while meals block.');
  }
  for (const [name, mutate] of calendarPolicyPositives) { const input = registerFixture(); mutate(input); run(name, input, result => result.status === 'proposed', 'Legitimate source policy and exact owner supersession remain possible.'); }
  return { cases };
}

export const registerMutations = [
  { id: 'policy-ignore-current-baseline', property: 'calendar-register', source: 'src/calendar-policy.mjs', counterexample: 'policy-baseline', edits: [["if (!same(policy, baseline)) add('calendar-policy-baseline-mismatch');", "if (false) add('calendar-policy-baseline-mismatch');"]] },
  { id: 'policy-repurpose-source', property: 'calendar-register', source: 'src/calendar-policy.mjs', counterexample: 'semantic-repurpose', edits: [["if (!assignment || source.name !== occurrence.name || source.reference !== assignment.reference || source.range !== occurrence.range || source.kind !== occurrence.kind) add('source-semantic-mismatch', selector.id);", "if (false) add('source-semantic-mismatch', selector.id);"]] },
  { id: 'policy-ignore-question-group', property: 'calendar-register', source: 'src/calendar-policy.mjs', counterexample: 'question-gap', edits: [["if (indices.some((index, i) => index < 0 || i > 0 && index !== indices[i - 1] + 1) || assignment.orderedUnits.length > 0 && row.unitIds.length === 0) add('question-group-not-contiguous', row.id);", "if (false) add('question-group-not-contiguous', row.id);"]] },
  { id: 'policy-ignore-question-order', property: 'calendar-register', source: 'src/calendar-policy.mjs', counterexample: 'question-order', edits: [["if (!predecessor) add('ordered-question-dependency-unmet', selector.id);", "if (!predecessor) void 0;"]] },
  { id: 'policy-ignore-native-association', property: 'calendar-register', source: 'src/calendar-policy.mjs', counterexample: 'binding-native-change', edits: [["if (selector.create ? activeBindings.some(row => row.occurrenceId === occurrence.id) : !activeBindings.some(row => row.occurrenceId === occurrence.id && same(row.identity, selector.identity))) add('source-binding-mismatch', selector.id);", "if (false) add('source-binding-mismatch', selector.id);"]] },
  { id: 'policy-reverse-owner-move', property: 'calendar-register', source: 'src/calendar-policy.mjs', counterexample: 'owner-move-reversal', edits: [["if (Object.entries(rule.changes).some(([key, value]) => Object.hasOwn(selector.changes, key) && !same(selector.changes[key], value))) add('owner-policy-protected', selector.id);", "if (false) add('owner-policy-protected', selector.id);"]] },
  { id: 'register-reject-provider-utc', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'provider-utc-event-zone', edits: [["if (endpoint.timeZone !== undefined && !zone(endpoint.timeZone)) return null;", "if (endpoint.timeZone !== undefined && !zone(endpoint.timeZone)) return null;\n    if (endpoint.timeZone !== undefined && !wallClockMatches(endpoint.dateTime, endpoint.timeZone)) return null;"]] },
  { id: 'register-free-meals', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'meal-free-protected', edits: [["const busy = native.transparency !== 'transparent' || protectedMeal;", "const busy = native.transparency !== 'transparent';"]] },
  { id: 'register-forget-task-timing', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'task-unknown', edits: [["if (!scheduleById.has(identityKey(row.identity))) add('unknown-task-timing', row.identity);", "if (false) add('unknown-task-timing', row.identity);"]] },
  { id: 'register-stale-wrapper', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'snapshot-stale', edits: [["if (!fresh(snapshot.acquisition.startedAt, evaluatedAt, age) || !fresh(snapshot.acquisition.completedAt, evaluatedAt, age)) add('stale-snapshot');", "if (false) add('stale-snapshot');"]] },
  { id: 'register-ignore-baseline', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'baseline-changed', edits: [["if (row && operation.baselineDigest !== baselineDigest) refuse('baseline-mismatch');", "if (false) refuse('baseline-mismatch');"]] },
  { id: 'register-unsupported-duration', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'task-api-duration', edits: [["if (Object.keys(changes).some(key => !supported.includes(key))) refuse('unsupported-provider-operation');", "if (false) refuse('unsupported-provider-operation');"]] },
  { id: 'register-ignore-lost-save', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'uncertain-save', edits: [["refuse('reconcile-uncertain-effect');", "void 0;"]] },
  { id: 'register-rebase-before-state', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'no-effect-rebase', edits: [["hash(attempt.prepared.baseline) === baselineDigest", "true"]] },
  { id: 'register-ignore-protected-interval', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'saved-protected-drift', edits: [["const protectedIntervalsMatch = scheduled ? row?.intervals.length === 1 && row.intervals[0].start === ms(changes.start) && row.intervals[0].end === ms(changes.end) : changes.completed === true || same(attempt.prepared.baseline.intervals, baseline?.intervals);", "const protectedIntervalsMatch = true;"]] },
  { id: 'register-ignore-owner-dismissal', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'owner-dismissed', edits: [["if (request.lifecycle.some(entry => same(entry.identity, operation.identity))) refuse('owner-dismissed-or-superseded');", "if (false) refuse('owner-dismissed-or-superseded');"]] },
  { id: 'register-unbound-query-cursor', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'page-query-token', edits: [["if (index === 0 ? Object.hasOwn(q, 'pageToken') : q.pageToken !== page.requestToken) add('page-request-token-mismatch', `${kind}/${containerId}`);", "if (false) add('page-request-token-mismatch', `${kind}/${containerId}`);"]] },
  { id: 'register-collide-own-projection', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'verified-self-projection', edits: [[" && counterparts.get(identityKey(operation.identity)) !== identityKey(blocker.identity)", ""]] },
  { id: 'register-event-date-only', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'event-date-only', edits: [[" || operation.identity.containerKind === 'calendar' && 'date' in changes", ""]] },
  { id: 'register-ignore-native-recurrence', property: 'calendar-register', source: 'src/calendar-register.mjs', counterexample: 'native-recurring-single', edits: [["if (task && (scheduled || 'date' in changes) && scheduleById.get(identityKey(operation.identity))?.recurrence !== 'none') refuse('recurrence-operation-unsupported');", "if (false) refuse('recurrence-operation-unsupported');"]] },
];
