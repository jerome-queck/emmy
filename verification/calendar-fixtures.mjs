import { digest } from '../src/records.mjs';

export const calendarIdentity = (nativeId = 'task-one', type = 'task') => ({ environment: 'synthetic-cloud', accountId: 'synthetic-account', containerKind: type === 'task' ? 'task-list' : 'calendar', containerId: type === 'task' ? 'synthetic-list' : 'synthetic-calendar', nativeId });
export const calendarFields = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { origin: 'saved-field', raw: typeof value === 'string' ? value : JSON.stringify(value), value }]));
export function bindCalendar(input) {
  input.plan.intentDigest = digest(input.intent);
  const { queuedChanges, ...plan } = input.plan;
  const planDigest = digest(plan);
  for (const change of queuedChanges) {
    change.intentDigest = digest(input.intent); change.planDigest = planDigest;
    change.baselineDigest = digest(input.readbacks.find(readback => readback.id === change.baselineReadbackId).fields);
  }
  return input;
}
export function calendarFixture(clock = Date.now()) {
  const time = offset => new Date(clock + offset).toISOString();
  const date = new Date(clock + 86400000).toISOString().slice(0, 10);
  const start = `${date}T09:00:00+00:00`; const end = `${date}T10:00:00+00:00`;
  const identity = calendarIdentity();
  const target = { environment: identity.environment, accountId: identity.accountId, taskListIds: [identity.containerId], calendarIds: ['synthetic-calendar'] };
  const window = { start: `${date}T00:00:00+00:00`, end: `${date}T23:59:00+00:00`, timeZone: 'UTC' };
  const expected = { type: 'task', title: 'Synthetic whole source', date, start, end, durationMinutes: 60, timeZone: 'UTC', deadline: null, completed: false, recurrence: null, notes: 'Synthetic source α\nhttps://example.invalid/source?q=one&part=two\nRead the whole source.  ' };
  const sequence = { closedAt: time(-3000), reloadedAt: time(-2000), reopenedAt: time(-1000) };
  const raw = 'Synthetic complete Task and Event inventory, including untimed, synthetic and all statuses.';
  const item = { identity, type: 'task', title: expected.title, synthetic: false, completed: false, status: 'open', interval: { start, end, timeZone: 'UTC', allDay: false }, raw };
  const input = {
    schemaVersion: 1,
    intent: { revision: 'owner-correction-1', acquiredAt: time(-5000), ownerInstruction: 'Synthetic declared owner request. Schedule one whole source, preserve notes exactly.', target, window, maxEvidenceAgeMs: 60000, items: [{ key: 'one', identity, expected, authorizedFields: ['date', 'start', 'end', 'durationMinutes', 'notes'] }], sources: [{ sourceId: 'source-one', name: 'Synthetic source α', kind: 'whole-source', requiredMinutes: 60, requiredSessions: 1, instruction: 'One continuous whole-source allocation.' }], budgets: [{ scope: 'campaign', key: 'campaign', maxMinutes: 90 }], morningRequirements: [{ date, start: `${date}T09:00:00+00:00`, end: `${date}T12:00:00+00:00`, minMinutes: 60 }], eventConstraints: [], buffers: { beforeMinutes: 0, afterMinutes: 0 }, allowedDeliverables: ['calendar'], requestedDeliverables: ['calendar'] },
    plan: { intentDigest: '', inventoryIds: ['inventory-one'], allocations: [{ itemKey: 'one', identity, sourceId: 'source-one', sourceKind: 'whole-source', start, end }], queuedChanges: [] },
    inventories: [{ id: 'inventory-one', target, window, acquiredAt: time(-500), attribution: raw, taskLists: [{ containerId: identity.containerId, available: true, complete: true, gaps: [], cursorExhausted: true, coverage: { timed: true, untimed: true, allStatuses: true, synthetic: true }, items: [item] }], calendars: [{ containerId: 'synthetic-calendar', available: true, complete: true, gaps: [], cursorExhausted: true, coverage: { allDay: true, transparency: true }, items: [] }] }],
    readbacks: [{ id: 'baseline-one', identity, acquiredAt: time(-500), attribution: 'Synthetic same-ID reopened saved fields.', forOperation: null, sequence, fields: calendarFields(expected) }],
    attempts: [], history: { corrections: [], completeThrough: time(-100), complete: true, gaps: [], aggregateReports: [] }, clocks: []
  };
  return bindCalendar(input);
}
export function calendarChange(input, fields = { notes: input.intent.items[0].expected.notes }) {
  input.plan.queuedChanges.push({ id: 'operation-one', identity: input.intent.items[0].identity, action: 'update', fields, intentDigest: '', planDigest: '', baselineReadbackId: 'baseline-one', baselineDigest: '' });
  return bindCalendar(input);
}
export function calendarSaved(input) {
  calendarChange(input);
  const attemptedAt = input.intent.acquiredAt;
  input.attempts.push({ id: 'attempt-one', operationId: 'operation-one', effectScope: 'notes', identity: input.intent.items[0].identity, attemptedAt, outcome: 'saved', raw: 'Synthetic Save receipt.', intentDigest: input.plan.intentDigest, planDigest: input.plan.queuedChanges[0].planDigest });
  input.readbacks.push({ ...structuredClone(input.readbacks[0]), id: 'saved-one', forOperation: 'operation-one', sequence: { savedAt: new Date(Date.parse(attemptedAt) + 1000).toISOString(), ...input.readbacks[0].sequence }, supersedes: { readbackId: 'baseline-one', fields: Object.keys(input.readbacks[0].fields) } });
  return input;
}
