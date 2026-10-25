import { createHash } from 'node:crypto';
import { canonical } from '../src/records.mjs';
import { bindCalendar, calendarChange, calendarFields, calendarFixture, calendarIdentity } from './calendar-fixtures.mjs';

const evaluatedAt = '2026-10-25T12:00:00.000Z';
const epoch = Date.parse(evaluatedAt);
const time = offset => new Date(epoch + offset).toISOString();
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const fixture = () => calendarFixture(epoch);
const fieldNames = ['type', 'title', 'date', 'start', 'end', 'durationMinutes', 'timeZone', 'deadline', 'completed', 'recurrence', 'notes'];
const sequenceKeys = ['complete', 'closedAt', 'reloadedAt', 'reopenedAt'];
const notes = 'Source café α\r\nhttps://example.invalid/source?q=one&part=two\nRead the whole source.  ';
const rawValues = [notes, `${notes} `, notes.slice(0, -1), notes.replace('\r\n', '\n'), notes.normalize('NFD'), ''];
const capture = value => calendarFields({ field: value }).field;
const field = (result, name = 'notes', itemKey = 'one') => result.fieldResults.find(entry => entry.itemKey === itemKey && entry.field === name);
const has = (result, code) => result.findings.some(entry => entry.code === code);
const queue = result => result.planStatus.queuedChanges[0];
const targetCases = {
  supersession: ['unsuperseded-conflict', 'explicit-exact', 'unreadable', 'editor-draft', 'popup', 'notes-only-title-conflict', 'future-replacement', 'stale-replacement'],
  queue: ['missing-plan', 'missing-baseline', 'changed-intent-token', 'current-token-old-desired', 'authorized-same-operation', 'completion-reopen', 'type-conversion', 'date-removal', 'partial-date-removal', 'claimed-plan-digest', 'claimed-operation-digest', 'baseline-digest', 'inventory-digest', 'wrong-source', 'unauthorized-field', ...fieldNames.map(name => `protected-drift-${name}`)],
  inventory: ['taskLists-missing', 'calendars-missing', ...['taskLists', 'calendars'].flatMap(name => ['available', 'complete', 'gaps', 'cursorExhausted', ...(name === 'taskLists' ? ['timed', 'untimed', 'allStatuses', 'synthetic'] : ['allDay', 'transparency'])].map(flag => `${name}-${flag}`)), 'wrong-target', 'wrong-window', 'future', 'stale', 'exact-duplicate', 'conflicting-duplicate', 'untimed-ambiguity', 'synthetic-ambiguity', 'missing-intended', 'free-busy-only'],
  allocation: ['outside-window', 'duration-increment', 'deadline', 'adjacent', 'declared-buffer', 'padded-allocation-pair', 'allocation-pair', 'safe-integer-buffer', 'wrong-source-kind', 'unsolicited-deliverable', 'all-day-busy', 'missing-mandatory-event', 'midnight-budget', 'morning-overlap-gap'],
  history: ['failed-unresolved', 'uncertain-unresolved', 'unknown-identity', 'saved-resolution', 'partial-resolution-inventory', 'wrong-resolution-identity', 'pre-attempt-resolution', 'no-effect-resolution', 'no-effect-partial-inventory', 'denied', 'consumed', 'denied-retry', 'consumed-retry', 'denied-queued', 'consumed-queued', 'unrelated-denied', 'unrelated-consumed', 'unrelated-uncertain', 'unrelated-field-uncertain', 'aggregate-count', 'history-gap', 'history-cutoff', 'owner-correction', 'latest-relevant-correction', 'current-attempt-intent', 'current-attempt-plan', 'resolved-failure-retained'],
  clocks: ['same', 'disagree', 'unknown-instant', 'unknown-zone', 'unknown-offset', 'stale', 'future', 'wrong-zone-resolution', 'partial-resolution', 'pre-capture-resolution', 'resolved'],
  permutation: ['green', 'conflict', 'historical'],
};

export const calendarBounds = {
  evaluatedAt,
  maxEvidenceAgeMs: 60000,
  shapeMaximums: { intendedItems: 2, sources: 1, budgets: 1, mornings: 1, allocations: 2, inventories: 2, taskListsPerInventory: 1, calendarsPerInventory: 1, itemsPerContainer: 2, readbacks: 3, queuedChanges: 1, attempts: 2, corrections: 2, clocks: 2 },
  timeZones: { validIntervals: ['UTC'], mismatchControls: ['Asia/Singapore'], localDayBoundary: 'UTC only' },
  bufferMinutes: [0, 1, 10, Number.MAX_SAFE_INTEGER],
  partitions: {
    fieldEligibility: { identities: ['exact', 'environment', 'accountId', 'containerKind', 'containerId', 'nativeId'], origins: ['saved-field', 'label', 'popup', 'editor-draft', 'acknowledgement', 'unreadable'], agesMs: [-1, 0, 60000, 60001], cases: 144 },
    rawPersistence: { rawCases: ['exact', 'added-trailing-space', 'removed-trailing-space', 'changed-newline', 'unicode-normalization', 'blank'], sequences: sequenceKeys, cases: 24 },
    requestedFields: { fields: fieldNames, captures: ['exact', 'absent', 'mismatch'], cases: 33 },
    extraction: { cases: 1 },
    supersession: { cases: targetCases.supersession.length, names: targetCases.supersession },
    queue: { cases: targetCases.queue.length, names: targetCases.queue },
    inventory: { cases: targetCases.inventory.length, names: targetCases.inventory },
    timedTasks: { labels: ['open', 'completed', 'cancelled', 'unknown'], synthetic: [false, true], completed: [false, true], intervals: ['overlap', 'adjacent', 'absent'], cases: 48 },
    events: { transparency: ['busy', 'transparent', 'unknown'], mandatory: [false, true], intervals: ['overlap', 'adjacent', 'absent'], cases: 18 },
    sources: { kinds: ['whole-source', 'ongoing-research'], sessions: [0, 1, 2], minutesPerSession: [30, 60, 90], minimumMinutes: 60, cases: 18 },
    sourceNames: { modes: ['exact', 'generic', 'research-generic'], cases: 3 },
    budgets: { scopes: ['day', 'source', 'campaign'], caps: [30, 60, 90], allocatedMinutes: 60, cases: 9 },
    mornings: { windowMinutes: [60, 90], allocatedMinutes: [60, 90], minimumMinutes: 60, cases: 4 },
    allocation: { cases: targetCases.allocation.length, names: targetCases.allocation },
    history: { cases: targetCases.history.length, names: targetCases.history },
    clocks: { cases: targetCases.clocks.length, names: targetCases.clocks },
    permutation: { scenarios: targetCases.permutation, orders: ['readbacks', 'inventories', 'attempts', 'allocations', 'all'], cases: targetCases.permutation.length * 5 },
  },
  assumptions: ['Independent finite partitions, not a complete Cartesian product or an unbounded theorem.', 'assessCalendar receives a validated envelope, a fixed supplied evaluation clock and a supplied input digest.', 'Capture authenticity, native identity, acquisition times, complete omitted history and inventory truth remain declared.', 'Parser, file/UTF-8 acquisition, live clock acquisition, executor/network refusal and evidence retention require the actual CLI driver.', 'Status labels are four representatives; every supplied timed Task interval blocks independently of these labels.', 'Scheduled source coverage does not prove material completion, mastery, actual saved Calendar state or authority.'],
};
calendarBounds.cases = Object.values(calendarBounds.partitions).reduce((sum, partition) => sum + partition.cases, 0);

function clearPlanRequirements(input) {
  input.intent.sources = []; input.intent.budgets = []; input.intent.morningRequirements = [];
  input.plan.allocations = [];
  return bindCalendar(input);
}
function sessions(kind, count, duration = 60, gap = 30) {
  const input = fixture(); const base = structuredClone(input.intent.items[0]); const date = base.expected.date;
  input.intent.items = []; input.readbacks = []; input.inventories[0].taskLists[0].items = []; input.plan.allocations = [];
  input.intent.sources[0].kind = kind; input.intent.sources[0].requiredMinutes = 60; input.intent.sources[0].requiredSessions = 1;
  input.intent.budgets = []; input.intent.morningRequirements = [];
  for (let index = 0; index < count; index++) {
    const identity = calendarIdentity(`task-${index + 1}`); const key = index === 0 ? 'one' : `item-${index + 1}`;
    const start = new Date(Date.parse(`${date}T09:00:00Z`) + index * (duration + gap) * 60000).toISOString(); const end = new Date(Date.parse(start) + duration * 60000).toISOString();
    const expected = { ...base.expected, title: kind === 'whole-source' ? input.intent.sources[0].name : `Synthetic source session ${index + 1}`, start, end, durationMinutes: duration };
    input.intent.items.push({ ...base, key, identity, expected });
    input.plan.allocations.push({ itemKey: key, identity, sourceId: 'source-one', sourceKind: kind, start, end });
    input.readbacks.push({ id: index === 0 ? 'baseline-one' : `baseline-${index + 1}`, identity, acquiredAt: time(-500), attribution: 'Synthetic saved source session.', forOperation: null, sequence: { closedAt: time(-3000), reloadedAt: time(-2000), reopenedAt: time(-1000) }, fields: calendarFields(expected) });
    input.inventories[0].taskLists[0].items.push({ identity, type: 'task', title: expected.title, synthetic: false, completed: false, status: 'open', interval: { start, end, timeZone: 'UTC', allDay: false }, raw: 'Synthetic source session.' });
  }
  return bindCalendar(input);
}
function blocker(input, { type = 'task', interval = 'overlap', transparency = 'busy', mandatory = false, status = 'open', synthetic = false, completed = false } = {}) {
  const date = input.intent.items[0].expected.date; const identity = calendarIdentity(`blocker-${type}`, type);
  const span = interval === 'absent' ? null : { start: `${date}T${interval === 'overlap' ? '09:30' : '10:00'}:00Z`, end: `${date}T${interval === 'overlap' ? '10:30' : '11:00'}:00Z`, timeZone: 'UTC', allDay: false };
  input.inventories[0][type === 'task' ? 'taskLists' : 'calendars'][0].items.push({ identity, type, title: 'Independent synthetic blocker', synthetic, completed, status, interval: span, raw: 'Synthetic independent inventory capture.', ...(type === 'event' ? { transparency } : {}) });
  if (mandatory) input.intent.eventConstraints.push({ identity, mandatory: true, instruction: 'Synthetic explicit required attendance.' });
  return bindCalendar(input);
}
function savedChange(input, fields, action = 'update') {
  calendarChange(input, fields); const change = input.plan.queuedChanges[0]; change.action = action;
  const baseline = input.readbacks[0]; baseline.acquiredAt = time(-6000); baseline.sequence = { closedAt: time(-9000), reloadedAt: time(-8000), reopenedAt: time(-7000) };
  input.attempts.push({ id: 'attempt-one', operationId: change.id, effectScope: action === 'update' && Object.keys(fields).length === 1 ? Object.keys(fields)[0] : action, identity: change.identity, attemptedAt: time(-5000), outcome: 'saved', raw: 'Synthetic original Save receipt.' });
  input.readbacks.push({ ...structuredClone(baseline), id: 'saved-one', acquiredAt: time(-500), forOperation: change.id, sequence: { savedAt: time(-4000), closedAt: time(-3000), reloadedAt: time(-2000), reopenedAt: time(-1000) }, fields: calendarFields(input.intent.items[0].expected), supersedes: { readbackId: baseline.id, fields: fieldNames } });
  return bindCalendar(input);
}
function resolutionInput(kind = 'saved') {
  const input = fixture(); savedChange(input, { notes: input.intent.items[0].expected.notes });
  input.attempts[0].outcome = 'uncertain';
  input.attempts[0].resolution = { kind, readbackIds: ['saved-one'], inventoryId: 'inventory-one', raw: 'Synthetic explicit scoped resolution after duplicate discovery.' };
  return bindCalendar(input);
}
function semantic(value) {
  if (Array.isArray(value)) return value.map(semantic).sort((left, right) => canonical(left).localeCompare(canonical(right)));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['pointer', 'pointers', 'inputDigest', 'intentDigest', 'planDigest', 'suppliedIntentDigest', 'operationDigest', 'digest'].includes(key)).map(([key, entry]) => [key, semantic(entry)]));
  return value;
}

export function verifyCalendarPolicy({ calendar }, check) {
  const executed = {};
  const run = (partition, name, input, assertion, expectation) => {
    const result = calendar.assessCalendar(input, { evaluatedAt, inputDigest: hash('synthetic finite calendar bytes') });
    executed[partition] = (executed[partition] ?? 0) + 1;
    check('calendar-acceptance', { case: `${partition}/${name}`, evaluatedAt, expected: expectation, input, result }, result.execution === 'none' && result.assurance === 'declared-calendar-evidence' && result.evaluatedAt === evaluatedAt && result.inputDigest === hash('synthetic finite calendar bytes') && assertion(result), expectation);
    return result;
  };
  const domain = calendarBounds.partitions;
  for (const identity of domain.fieldEligibility.identities) for (const origin of domain.fieldEligibility.origins) for (const ageMs of domain.fieldEligibility.agesMs) {
    const input = fixture(); const readback = input.readbacks[0];
    if (identity !== 'exact') readback.identity = { ...readback.identity, [identity]: identity === 'containerKind' ? 'calendar' : `other-${identity}` };
    readback.acquiredAt = time(-ageMs); readback.sequence = { closedAt: time(-ageMs - 3), reloadedAt: time(-ageMs - 2), reopenedAt: time(-ageMs - 1) }; readback.fields.notes.origin = origin;
    if (origin === 'unreadable') readback.fields.notes.value = null;
    const exact = identity === 'exact' && origin === 'saved-field' && ageMs >= 0 && ageMs <= 60000;
    run('fieldEligibility', `${identity}/${origin}/${ageMs}`, input, result => (field(result).status === 'exact') === exact, 'Only exact identity, saved provenance and inclusive current age establish exact notes.');
  }
  for (const [rawIndex, value] of rawValues.entries()) for (const sequence of sequenceKeys) {
    const input = fixture(); input.intent.items[0].expected.notes = notes; input.readbacks[0].fields.notes = capture(value);
    if (sequence !== 'complete') input.readbacks[0].sequence[sequence] = null;
    bindCalendar(input);
    const same = value === notes; const firstDifference = same ? null : [...Array(Math.min(notes.length, value.length)).keys()].find(index => notes[index] !== value[index]) ?? Math.min(notes.length, value.length);
    run('rawPersistence', `${rawIndex}/${sequence}`, input, result => {
      const entry = field(result);
      return sequence !== 'complete' ? entry.status !== 'exact' && entry.savedDigest === null : entry.status === (same ? 'exact' : 'mismatch') && entry.expectedDigest === hash(notes) && entry.savedDigest === hash(value) && entry.expectedLength === notes.length && entry.savedLength === value.length && entry.firstDifference === firstDifference && entry.trailingWhitespaceDelta === value.length - value.trimEnd().length - (notes.length - notes.trimEnd().length);
    }, 'Raw UTF-16 notes, hashes, first difference and whitespace deltas remain exact; persistence steps cannot be borrowed.');
  }
  const mismatches = { type: 'event', title: 'Changed title', date: '2026-10-28', start: '2026-10-26T11:00:00Z', end: '2026-10-26T11:00:00Z', durationMinutes: 30, timeZone: 'Asia/Singapore', deadline: { kind: 'date', value: '2026-10-28' }, completed: true, recurrence: { kind: 'rule', frequency: 'weekly', interval: 1 }, notes: 'Changed notes' };
  for (const name of fieldNames) for (const mode of domain.requestedFields.captures) {
    const input = fixture();
    if (mode === 'absent') delete input.readbacks[0].fields[name];
    if (mode === 'mismatch') input.readbacks[0].fields[name] = capture(mismatches[name]);
    run('requestedFields', `${name}/${mode}`, input, result => field(result, name)?.status === (mode === 'exact' ? 'exact' : mode === 'mismatch' ? 'mismatch' : 'unreadable') && field(result, name === 'notes' ? 'title' : 'notes').status === 'exact', 'Each requested field has an independent exact, missing or mismatching result.');
  }
  {
    const input = fixture(); const expected = input.intent.items[0].expected.notes; const prefix = 'Description\n'; input.readbacks[0].fields.notes = { origin: 'saved-field', raw: `${prefix}${expected}\nClose`, value: expected, extraction: { start: prefix.length, end: prefix.length + expected.length } };
    run('extraction', 'raw-wrapper', input, result => field(result).status === 'exact' && field(result).savedLength === expected.length, 'A declared valid exact raw extraction can establish saved notes. Extraction validation remains a CLI boundary.');
  }
  for (const name of targetCases.supersession) {
    const input = fixture(); const later = structuredClone(input.readbacks[0]); later.id = 'later'; later.acquiredAt = time(-100); later.fields.notes = capture('Changed saved notes');
    if (name !== 'unsuperseded-conflict') later.supersedes = { readbackId: 'baseline-one', fields: ['notes'] };
    if (['unreadable', 'editor-draft', 'popup'].includes(name)) later.fields.notes = { origin: name, raw: input.intent.items[0].expected.notes, value: name === 'unreadable' ? null : input.intent.items[0].expected.notes };
    if (name === 'notes-only-title-conflict') later.fields.title = capture('Later conflicting title');
    if (name === 'future-replacement') later.acquiredAt = time(1);
    if (name === 'stale-replacement') { input.readbacks[0].acquiredAt = time(-60002); later.acquiredAt = time(-60001); input.readbacks[0].sequence = { closedAt: time(-60005), reloadedAt: time(-60004), reopenedAt: time(-60003) }; later.sequence = { closedAt: time(-60004), reloadedAt: time(-60003), reopenedAt: time(-60002) }; }
    input.readbacks.push(later);
    const expected = name === 'unsuperseded-conflict' ? 'conflict' : name === 'unreadable' || name === 'stale-replacement' ? 'unreadable' : ['editor-draft', 'popup'].includes(name) ? 'wrong-provenance' : name === 'future-replacement' ? 'exact' : 'mismatch';
    run('supersession', name, input, result => field(result).status === expected && (name !== 'notes-only-title-conflict' || field(result, 'title').status === 'conflict'), 'Only fresh explicit field-scoped supersession replaces a prior capture; ineligible replacements cannot borrow earlier green.');
  }
  for (const name of targetCases.queue) {
    const input = fixture(); calendarChange(input); let expected = 'current'; let code;
    if (name === 'missing-plan') input.plan = null;
    else if (name === 'missing-baseline') { input.plan.queuedChanges[0].baselineReadbackId = null; input.plan.queuedChanges[0].baselineDigest = null; }
    else if (name === 'changed-intent-token') { input.intent.ownerInstruction += ' New owner correction.'; expected = 'invalid'; code = 'operation-binding-mismatch'; }
    else if (name === 'current-token-old-desired') { input.intent.items[0].expected.notes += ' Current owner text.'; bindCalendar(input); expected = 'invalid'; code = 'stale-desired-field'; }
    else if (name === 'authorized-same-operation') { input.plan.queuedChanges = []; input.intent.items[0].expected.notes += ' Authorized new text.'; savedChange(input, { notes: input.intent.items[0].expected.notes }); }
    else if (name === 'completion-reopen') { input.plan.queuedChanges = []; input.readbacks[0].fields.completed = capture(true); input.intent.items[0].authorizedFields.push('completed'); savedChange(input, { completed: false }); expected = 'invalid'; code = 'completed-work-reopen'; }
    else if (name === 'type-conversion') {
      const identity = calendarIdentity('task-one', 'event'); input.intent.items[0].identity = identity; input.intent.items[0].expected.type = 'event'; input.intent.items[0].authorizedFields.push('type'); input.readbacks[0].identity = identity; input.plan.allocations[0].identity = identity;
      const item = input.inventories[0].taskLists[0].items.pop(); input.inventories[0].calendars[0].items.push({ ...item, identity, type: 'event', transparency: 'transparent' }); input.plan.queuedChanges = []; savedChange(input, { type: 'event' }); expected = 'invalid'; code = 'implicit-type-conversion';
    } else if (['date-removal', 'partial-date-removal'].includes(name)) {
      clearPlanRequirements(input); input.plan.queuedChanges = []; const values = Object.fromEntries(['date', 'start', 'end', 'durationMinutes', 'timeZone'].map(key => [key, null])); Object.assign(input.intent.items[0].expected, values); input.intent.items[0].authorizedFields = Object.keys(values); input.inventories[0].taskLists[0].items[0].interval = null;
      savedChange(input, values, 'remove-date');
      if (name === 'partial-date-removal') { delete input.plan.queuedChanges[0].fields.end; input.readbacks[1].fields.end = structuredClone(input.readbacks[0].fields.end); expected = 'invalid'; code = 'operation-field-missing'; }
      bindCalendar(input);
    } else if (name === 'claimed-plan-digest') { input.plan.digest = '0'.repeat(64); code = 'plan-binding-mismatch'; }
    else if (name === 'claimed-operation-digest') { input.plan.queuedChanges[0].operationDigest = '0'.repeat(64); expected = 'invalid'; code = 'operation-digest-mismatch'; }
    else if (name === 'baseline-digest') { input.plan.queuedChanges[0].baselineDigest = '0'.repeat(64); expected = 'invalid'; code = 'baseline-binding-mismatch'; }
    else if (name === 'inventory-digest') { input.plan.queuedChanges[0].inventoryDigests['inventory-one'] = '0'.repeat(64); expected = 'invalid'; code = 'inventory-binding-mismatch'; }
    else if (name === 'wrong-source') { input.plan.queuedChanges[0].sourceId = 'wrong-source'; expected = 'invalid'; code = 'operation-source-mismatch'; }
    else if (name === 'unauthorized-field') { input.intent.items[0].authorizedFields = []; bindCalendar(input); expected = 'invalid'; code = 'stale-desired-field'; }
    else if (name.startsWith('protected-drift-')) {
      const key = name.slice('protected-drift-'.length); const later = structuredClone(input.readbacks[0]); later.id = 'owner-edited'; later.acquiredAt = time(-100); later.fields[key] = capture(mismatches[key]); later.supersedes = { readbackId: 'baseline-one', fields: [key] }; input.readbacks.push(later); expected = 'invalid'; code = 'baseline-drift';
    }
    run('queue', name, input, result => name === 'missing-plan' ? result.planStatus.status === 'needs-evidence' && result.planDigest === null && result.sourceResults === null && has(result, 'plan-missing') : name === 'missing-baseline' ? queue(result).status === 'needs-evidence' && queue(result).operationDigest === null && has(result, 'baseline-missing') : queue(result).status === expected && (!code || has(result, code)) && (name !== 'date-removal' || result.status === 'checked'), 'Queued advice binds actual desired content, protected saved fields and explicit operation scope without crashing on missing evidence.');
  }
  for (const name of targetCases.inventory) {
    const input = fixture(); const inventory = input.inventories[0]; let complete = false;
    const [source, flag] = name.split('-');
    if (['taskLists', 'calendars'].includes(source)) {
      if (flag === 'missing') inventory[source] = [];
      else { const row = inventory[source][0]; if (flag === 'gaps') row.gaps = ['Synthetic missing page']; else if (Object.hasOwn(row.coverage, flag)) row.coverage[flag] = false; else row[flag] = false; }
    } else if (name === 'wrong-target') inventory.target = { ...inventory.target, accountId: 'other-account' };
    else if (name === 'wrong-window') inventory.window = { ...inventory.window, end: '2026-10-27T23:59:00Z' };
    else if (name === 'future' || name === 'stale') inventory.acquiredAt = time(name === 'future' ? 1 : -60001);
    else if (name === 'free-busy-only') { inventory.taskLists = []; inventory.calendars[0].coverage.transparency = false; }
    else {
      complete = true; const original = inventory.taskLists[0].items[0];
      if (name === 'missing-intended') inventory.taskLists[0].items = [];
      else { const duplicate = structuredClone(original); if (name === 'conflicting-duplicate') duplicate.completed = true; if (name.endsWith('ambiguity')) { duplicate.identity.nativeId = 'ambiguous-item'; duplicate.interval = null; duplicate.synthetic = name === 'synthetic-ambiguity'; } inventory.taskLists[0].items.push(duplicate); }
    }
    bindCalendar(input);
    run('inventory', name, input, result => (result.inventoryResults[0].status === 'complete') === complete && result.status !== 'checked' && (name === 'exact-duplicate' ? has(result, 'inventory-duplicate') : name === 'conflicting-duplicate' ? has(result, 'inventory-conflict') : name.endsWith('ambiguity') ? has(result, 'ambiguous-item') : name === 'missing-intended' ? has(result, 'item-not-inventoried') : true), 'Every exact Task/Event container needs complete fresh coverage, untimed and synthetic identity discovery and unambiguous intended membership.');
  }
  for (const status of domain.timedTasks.labels) for (const synthetic of domain.timedTasks.synthetic) for (const completed of domain.timedTasks.completed) for (const interval of domain.timedTasks.intervals) {
    const input = blocker(fixture(), { status, synthetic, completed, interval });
    run('timedTasks', `${status}/${synthetic}/${completed}/${interval}`, input, result => has(result, 'calendar-collision') === (interval === 'overlap') && (result.status === 'checked') === (interval !== 'overlap'), 'Only the actual half-open interval determines timed Task blocking, including synthetic, completed and cancelled labels.');
  }
  for (const transparency of domain.events.transparency) for (const mandatory of domain.events.mandatory) for (const interval of domain.events.intervals) {
    const input = blocker(fixture(), { type: 'event', transparency, mandatory, interval }); const collision = interval === 'overlap' && (transparency !== 'transparent' || mandatory);
    run('events', `${transparency}/${mandatory}/${interval}`, input, result => has(result, 'calendar-collision') === collision && has(result, 'event-transparency-unknown') === (transparency === 'unknown') && has(result, 'mandatory-event-interval-missing') === (mandatory && interval === 'absent') && (transparency === 'transparent' && !mandatory ? result.status === 'checked' : true), 'Busy and explicitly mandatory Events block; optional transparent Events remain valid and unknown transparency stays unresolved.');
  }
  for (const kind of domain.sources.kinds) for (const count of domain.sources.sessions) for (const duration of domain.sources.minutesPerSession) {
    const input = sessions(kind, count, duration); const covered = (kind === 'ongoing-research' ? count >= 1 : count === 1) && count * duration >= 60;
    run('sources', `${kind}/${count}/${duration}`, input, result => result.sourceResults[0].minutes === count * duration && result.sourceResults[0].sessions === count && (result.sourceResults[0].status === 'covered') === covered && (kind === 'ongoing-research' && count === 2 && duration === 30 ? result.status === 'checked' : true), 'Whole sources occur once continuously with declared minimums; legitimate repeated research can pass.');
  }
  for (const mode of domain.sourceNames.modes) {
    const input = fixture(); const title = mode === 'exact' ? input.intent.sources[0].name : 'General revision'; input.intent.items[0].expected.title = title; input.readbacks[0].fields.title = capture(title); input.inventories[0].taskLists[0].items[0].title = title;
    if (mode === 'research-generic') { input.intent.sources[0].kind = 'ongoing-research'; input.plan.allocations[0].sourceKind = 'ongoing-research'; }
    bindCalendar(input);
    run('sourceNames', mode, input, result => (result.sourceResults[0].status === 'covered') === (mode !== 'generic') && (result.status === 'checked') === (mode !== 'generic'), 'Whole-source saved titles retain the exact declared material name; ongoing research keeps its legitimate title flexibility.');
  }
  for (const scope of domain.budgets.scopes) for (const cap of domain.budgets.caps) {
    const input = fixture(); input.intent.budgets = [{ scope, key: scope === 'day' ? input.intent.items[0].expected.date : scope === 'source' ? 'source-one' : 'campaign', maxMinutes: cap }]; bindCalendar(input);
    run('budgets', `${scope}/${cap}`, input, result => result.budgetResults[0].minutes === 60 && result.budgetResults[0].status === (cap < 60 ? 'exceeded' : 'within') && has(result, 'budget-exceeded') === (cap < 60), 'Day, source and campaign budgets use actual allocated minutes and inclusive caps.');
  }
  for (const required of domain.mornings.windowMinutes) for (const allocated of domain.mornings.allocatedMinutes) {
    const input = sessions('whole-source', 1, allocated); const start = input.plan.allocations[0].start; input.intent.morningRequirements = [{ date: input.intent.items[0].expected.date, start, end: new Date(Date.parse(start) + required * 60000).toISOString(), minMinutes: 60 }]; bindCalendar(input);
    run('mornings', `${required}/${allocated}`, input, result => result.morningResults[0].coveredMinutes === Math.min(required, allocated) && result.morningResults[0].status === (allocated >= required ? 'covered' : 'gap'), 'The entire declared morning window must be covered even when its minimum is smaller.');
  }
  for (const name of targetCases.allocation) {
    let input = fixture(); let code; let absent = false;
    if (name === 'outside-window') { input.plan.allocations[0].start = '2026-10-25T23:00:00Z'; code = 'allocation-outside-window'; }
    else if (name === 'duration-increment') { input = sessions('whole-source', 1, 45); input.intent.sources[0].requiredMinutes = 30; code = 'duration-increment'; }
    else if (name === 'deadline') { input.intent.items[0].expected.deadline = { kind: 'instant', value: input.intent.items[0].expected.start }; input.readbacks[0].fields.deadline = capture(input.intent.items[0].expected.deadline); code = 'deadline-exceeded'; }
    else if (name === 'adjacent') { blocker(input, { interval: 'adjacent' }); code = 'calendar-collision'; absent = true; }
    else if (name === 'declared-buffer') { blocker(input, { interval: 'adjacent' }); input.intent.buffers.afterMinutes = 1; code = 'calendar-collision'; }
    else if (['allocation-pair', 'padded-allocation-pair', 'morning-overlap-gap'].includes(name)) {
      input = sessions('ongoing-research', 2, 30, name === 'allocation-pair' ? -15 : name === 'padded-allocation-pair' ? 15 : -30); code = name === 'morning-overlap-gap' ? 'morning-gap' : 'allocation-collision';
      if (name === 'padded-allocation-pair') input.intent.buffers = { beforeMinutes: 10, afterMinutes: 10 };
      if (name === 'morning-overlap-gap') input.intent.morningRequirements = [{ date: input.intent.items[0].expected.date, start: input.plan.allocations[0].start, end: new Date(Date.parse(input.plan.allocations[0].start) + 60 * 60000).toISOString(), minMinutes: 60 }];
    } else if (name === 'safe-integer-buffer') { input.intent.buffers = { beforeMinutes: Number.MAX_SAFE_INTEGER, afterMinutes: Number.MAX_SAFE_INTEGER }; code = 'buffer-outside-window'; }
    else if (name === 'wrong-source-kind') { input.plan.allocations[0].sourceKind = 'ongoing-research'; code = 'allocation-source-mismatch'; }
    else if (name === 'unsolicited-deliverable') { input.intent.requestedDeliverables.push('coursework-document'); code = 'unsolicited-deliverable'; }
    else if (name === 'all-day-busy') { blocker(input, { type: 'event' }); const item = input.inventories[0].calendars[0].items[0]; item.interval = { ...input.intent.window, end: '2026-10-27T00:00:00Z', allDay: true }; code = 'calendar-collision'; }
    else if (name === 'missing-mandatory-event') { input.intent.eventConstraints.push({ identity: calendarIdentity('missing-event', 'event'), mandatory: true, instruction: 'Synthetic explicit attendance.' }); code = 'event-constraint-not-inventoried'; }
    else if (name === 'midnight-budget') {
      input = sessions('whole-source', 1, 60); const item = input.intent.items[0]; item.expected.start = `${item.expected.date}T23:30:00Z`; item.expected.end = '2026-10-27T00:30:00Z'; input.plan.allocations[0].start = item.expected.start; input.plan.allocations[0].end = item.expected.end; input.intent.window.end = '2026-10-27T23:59:00Z'; input.readbacks[0].fields = calendarFields(item.expected); input.inventories[0].taskLists[0].items[0].interval = { start: item.expected.start, end: item.expected.end, timeZone: 'UTC', allDay: false }; input.intent.budgets = [{ scope: 'day', key: item.expected.date, maxMinutes: 30 }];
    }
    bindCalendar(input);
    run('allocation', name, input, result => name === 'midnight-budget' ? result.budgetResults[0].minutes === 30 && result.budgetResults[0].status === 'within' && result.status === 'checked' : has(result, code) !== absent && (name !== 'padded-allocation-pair' || !has(result, 'calendar-collision')) && (name !== 'adjacent' || result.status === 'checked'), 'Allocation bounds, 30-minute increments, deadlines, half-open collisions, padded pairs, full morning union and local-day totals follow the declared plan.');
  }
  for (const name of targetCases.history) {
    let input = fixture(); let code; let resolved = false; let unrelated = false;
    const attempt = { id: 'historical-one', operationId: 'historical-operation', effectScope: 'notes', identity: input.intent.items[0].identity, attemptedAt: time(-4000), outcome: 'uncertain', raw: 'Synthetic original failed or uncertain native receipt.' };
    if (name.includes('resolution') || name === 'resolved-failure-retained') {
      input = resolutionInput(name.startsWith('no-effect') ? 'no-effect' : 'saved'); resolved = !['partial-resolution-inventory', 'wrong-resolution-identity', 'pre-attempt-resolution', 'no-effect-partial-inventory'].includes(name);
      if (name.includes('partial')) input.inventories[0].taskLists[0].cursorExhausted = false;
      if (name === 'wrong-resolution-identity') { input.readbacks[1].identity = calendarIdentity('wrong-native'); delete input.readbacks[1].supersedes; }
      if (name === 'pre-attempt-resolution') input.inventories[0].acquiredAt = time(-5500);
      if (name === 'resolved-failure-retained') input.attempts[0].outcome = 'failed';
      bindCalendar(input);
    } else if (['history-gap', 'history-cutoff', 'owner-correction', 'latest-relevant-correction', 'aggregate-count'].includes(name)) {
      if (name === 'history-gap') { input.history.gaps = ['Missing final ledger bytes']; code = 'history-incomplete'; }
      if (name === 'history-cutoff') { input.history.completeThrough = time(-6000); code = 'history-cutoff-gap'; }
      if (name === 'aggregate-count') { input.attempts.push({ ...attempt, outcome: 'failed' }, { ...attempt, id: 'historical-two', operationId: 'historical-operation-two', outcome: 'failed' }); input.history.aggregateReports.push({ outcome: 'failed', count: 3, attemptIds: input.attempts.map(entry => entry.id), raw: 'Synthetic three-versus-two report without absent native ledger bytes.' }); code = 'aggregate-count-gap'; }
      if (name.endsWith('correction')) {
        input.history.corrections.push({ id: 'relevant-correction', revision: 'other-owner-revision', acquiredAt: name === 'owner-correction' ? time(-1000) : time(-6000), raw: 'Synthetic scoped owner correction.', itemKeys: ['one'], fields: ['notes'] });
        if (name === 'latest-relevant-correction') input.history.corrections.push({ id: 'later-unrelated', revision: input.intent.revision, acquiredAt: time(-500), raw: 'Synthetic correction to another item.', itemKeys: ['unrelated-item'], fields: ['notes'] });
        code = 'owner-intent-outdated';
      }
    } else if (name.startsWith('current-attempt-')) {
      input = resolutionInput(); input.attempts[0][name.endsWith('intent') ? 'intentDigest' : 'planDigest'] = '0'.repeat(64); code = 'attempt-binding-mismatch';
    } else {
      if (name === 'failed-unresolved') attempt.outcome = 'failed';
      if (name === 'unknown-identity') attempt.identity = null;
      if (name.startsWith('unrelated-')) { unrelated = true; attempt.identity = name === 'unrelated-field-uncertain' ? input.intent.items[0].identity : calendarIdentity('other-native'); attempt.outcome = name.endsWith('denied') ? 'denied' : name.endsWith('consumed') ? 'consumed' : 'uncertain'; if (name === 'unrelated-field-uncertain') { input.intent.items[0].expected = { notes: input.intent.items[0].expected.notes }; attempt.effectScope = 'title'; clearPlanRequirements(input); } }
      else if (name.startsWith('denied')) attempt.outcome = 'denied';
      else if (name.startsWith('consumed')) attempt.outcome = 'consumed';
      input.attempts.push(attempt);
      if (name.endsWith('retry')) input.attempts.push({ ...attempt, id: 'later-retry', operationId: 'retry-operation', attemptedAt: time(-1000), retryOf: attempt.id, outcome: 'saved', raw: 'Synthetic later retry cannot clear terminal scope.' });
      if (name.endsWith('queued')) { calendarChange(input); input.plan.queuedChanges[0].id = attempt.operationId; }
      code = name.endsWith('retry') ? 'terminal-effect-retry' : name.endsWith('queued') ? 'terminal-effect-queued' : attempt.outcome === 'denied' ? 'effect-denied' : attempt.outcome === 'consumed' ? 'effect-consumed' : attempt.identity === null ? 'unknown-item-attempt' : 'attempt-unresolved';
    }
    run('history', name, input, result => {
      if (unrelated) return result.status === 'checked' && result.historyResults[0].relevant === false && result.historyResults[0].rawDigest === hash(input.attempts[0].raw) && (input.attempts[0].outcome === 'uncertain' || result.next.some(entry => entry.action === `stop-${input.attempts[0].outcome}`));
      if (name.includes('resolution') || name === 'resolved-failure-retained') return result.historyResults.length === 1 && result.historyResults[0].status === (resolved ? 'resolved' : 'unresolved') && result.historyResults[0].outcome === input.attempts[0].outcome && result.historyResults[0].rawDigest === hash(input.attempts[0].raw) && (resolved || result.next.some(entry => entry.action === 'inspect-and-rediscover'));
      return has(result, code) && (!name.startsWith('denied') && !name.startsWith('consumed') || result.next[0]?.action === (name.startsWith('denied') ? 'stop-denied' : 'stop-consumed')) && (input.attempts.length === 0 || result.historyResults.length === input.attempts.length);
    }, 'History remains retained and scoped; exact post-attempt evidence and complete duplicate discovery resolve uncertainty, while terminal barriers and current bindings cannot be erased.');
  }
  for (const name of targetCases.clocks) {
    const input = fixture(); const identity = input.intent.items[0].identity; const start = input.intent.items[0].expected.start;
    input.clocks = ['calendar', 'embedded-task'].map((surface, index) => ({ id: `clock-${index}`, identity, surface, raw: `Synthetic ${surface} clock display.`, acquiredAt: time(-500), timeZone: 'UTC', offset: '+00:00', instant: start }));
    if (name === 'disagree' || name.includes('resolution') || name === 'resolved') input.clocks[1].instant = new Date(Date.parse(start) + 3600000).toISOString();
    if (name.startsWith('unknown-')) input.clocks[1][name.slice('unknown-'.length) === 'zone' ? 'timeZone' : name.slice('unknown-'.length)] = null;
    if (name === 'stale') input.clocks[1].acquiredAt = time(-60001);
    if (name === 'future') input.clocks[1].acquiredAt = time(1);
    if (name.includes('resolution') || name === 'resolved') input.clockResolution = { clockIds: input.clocks.map(clock => clock.id), source: 'owner', raw: 'Synthetic scoped owner clock resolution.', acquiredAt: time(-100), settledInstant: start, timeZone: 'UTC' };
    if (name === 'wrong-zone-resolution') input.clockResolution.timeZone = 'Asia/Singapore';
    if (name === 'partial-resolution') input.clockResolution.clockIds.pop();
    if (name === 'pre-capture-resolution') input.clockResolution.acquiredAt = time(-1000);
    const pending = !['same', 'resolved'].includes(name);
    run('clocks', name, input, result => result.planStatus.timingStatus === (pending ? 'pending' : 'checked') && has(result, 'clock-disagreement') === pending && ['notes', 'type', 'durationMinutes'].every(key => field(result, key).status === 'exact'), 'Unresolved displays keep timing pending without changing independently exact notes, type or duration.');
  }
  for (const scenario of targetCases.permutation) {
    let original = sessions('ongoing-research', 2, 30); original.inventories.push({ ...structuredClone(original.inventories[0]), id: 'inventory-two' }); original.plan.inventoryIds.push('inventory-two');
    if (scenario === 'conflict') { const replacement = structuredClone(original.readbacks[0]); replacement.id = 'conflicting'; replacement.fields.notes = capture('Conflicting saved value'); original.readbacks.push(replacement); }
    if (scenario === 'historical') original.attempts.push(...['denied', 'consumed'].map((outcome, index) => ({ id: `retained-${index}`, operationId: `old-operation-${index}`, effectScope: 'notes', identity: calendarIdentity(`other-${index}`), attemptedAt: time(-4000), outcome, raw: `Synthetic retained ${outcome}.` })));
    bindCalendar(original); const expected = calendar.assessCalendar(original, { evaluatedAt, inputDigest: hash('original synthetic bytes') });
    for (const order of domain.permutation.orders) {
      const input = structuredClone(original);
      for (const name of ['readbacks', 'inventories', 'attempts', 'allocations']) if (order === name || order === 'all') (name === 'allocations' ? input.plan.allocations : input[name]).reverse();
      bindCalendar(input);
      run('permutation', `${scenario}/${order}`, input, result => canonical(semantic(result)) === canonical(semantic(expected)), 'Semantic acceptance and retained results are independent of input order after intentional content digest rebinding.');
    }
  }
  for (const [partition, expected] of Object.entries(domain)) if (executed[partition] !== expected.cases) throw new Error(`Declared calendar ${partition} bounds differ from executed predicates: ${expected.cases} versus ${executed[partition]}`);
  const total = Object.values(executed).reduce((sum, count) => sum + count, 0);
  if (total !== calendarBounds.cases) throw new Error(`Declared calendar total differs from executed predicates: ${calendarBounds.cases} versus ${total}`);
  return { partitions: executed, cases: total };
}
