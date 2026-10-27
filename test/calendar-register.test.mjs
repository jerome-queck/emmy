import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessCalendarRegister, validateCalendarRequest, validateCalendarSnapshot } from '../src/calendar-register.mjs';
import { retainCalendarSnapshot } from '../src/calendar-register-io.mjs';
import { bindRegister, registerAttempt, refreshRegisterEvidence, registerFixture, registerHash, registerIdentity } from '../verification/calendar-register-fixtures.mjs';

const assess = input => assessCalendarRegister(input.snapshot, input.request, { evaluatedAt: input.evaluatedAt });
const found = (result, code) => result.findings.some(row => row.code === code);

test('deterministic half-open availability protects Free meals and permits optional Free classes', () => {
  const input = registerFixture(); const result = assess(input);
  assert.equal(result.status, 'proposed'); assert.equal(result.proposals[0].status, 'proposed');
  assert.deepEqual(result.availability.freeIntervals.map(row => [row.start.slice(11, 16), row.end.slice(11, 16)]), [['08:00', '10:00'], ['11:00', '12:00'], ['13:00', '18:00']]);
  assert.equal(result.proposals[0].changes.durationMinutes, 60);
  const before = JSON.stringify(input); input.snapshot.calendars[0].events.reverse(); bindRegister(input);
  const reversed = assess(input);
  assert.deepEqual(reversed.availability.freeIntervals, result.availability.freeIntervals);
  assert.deepEqual(reversed.availability.blockers, result.availability.blockers);
  assert.notEqual(JSON.stringify(input), before);
});

test('unknown Task timing never becomes a free interval, even when API due is absent', () => {
  const input = registerFixture(); input.request.taskSchedules = []; delete input.snapshot.taskLists[0].tasks[0].due; bindRegister(input);
  const result = assess(input); assert.equal(result.availability.freeIntervals, null); assert.ok(found(result, 'unknown-task-timing'));
});

test('combined register retains the exact snapshot supplements consumed by assessment', () => {
  const input = registerFixture(); input.snapshot.taskSchedules = input.request.taskSchedules; input.request.taskSchedules = []; bindRegister(input);
  const result = assess(input); assert.equal(result.status, 'proposed'); assert.deepEqual(result.register.taskSchedules, input.snapshot.taskSchedules);
  assert.equal(result.counts.executed, 0);
});

test('one recurring occurrence or unknown recurrence cannot authorize a Task end-time edit', () => {
  for (const recurrence of ['recurring', 'unknown']) {
    const input = registerFixture(); input.request.taskSchedules[0].recurrence = recurrence;
    input.request.taskSchedules[0].intervals = [{ start: '2026-10-27T09:00:00Z', end: '2026-10-27T10:00:00Z' }];
    input.request.operations[0].baselineDigest = registerHash({ native: input.snapshot.taskLists[0].tasks[0], intervals: [{ start: '2026-10-27T09:00:00.000Z', end: '2026-10-27T10:00:00.000Z' }] });
    assert.ok(found(assess(input), 'recurrence-operation-unsupported'));
  }
});

test('underlying page timestamps and full query coverage cannot be refreshed by a new wrapper time', () => {
  for (const change of ['stale', 'future', 'assigned', 'filter', 'partial', 'page-chain', 'new-calendar']) {
    const input = registerFixture(); const row = input.snapshot.taskLists[0].collection;
    if (change === 'stale') row.pages[0].acquiredAt = '2026-10-26T00:00:00Z';
    if (change === 'future') input.snapshot.acquisition.completedAt = '2026-10-28T00:00:00Z';
    if (change === 'assigned') delete row.pages[0].query.showAssigned;
    if (change === 'filter') row.pages[0].query.dueMin = '2026-10-27T00:00:00Z';
    if (change === 'partial') row.complete = false;
    if (change === 'page-chain') row.pages[0].nextToken = 'more';
    if (change === 'new-calendar') input.snapshot.discovery.calendars.items.push({ id: 'new-user-calendar' });
    bindRegister(input); const result = assess(input);
    assert.equal(result.availability.freeIntervals, null, change); assert.equal(result.proposals[0].status, 'blocked', change);
  }
});

test('owner-done and native completion/cancellation are preserved across stale open mirrors', () => {
  for (const state of ['owner-done', 'completed', 'deleted']) {
    const input = registerFixture();
    if (state === 'owner-done') input.request.ownerDone.push({ identity: registerIdentity(), observedAt: '2026-10-20T00:00:00Z', evidenceRef: 'owner-done-earlier' });
    else if (state === 'completed') input.snapshot.taskLists[0].tasks[0].status = 'completed';
    else input.snapshot.taskLists[0].tasks[0].deleted = true;
    input.request.taskSchedules = []; bindRegister(input);
    const result = assess(input); assert.ok(found(result, 'terminal-or-owner-done'), state);
  }
});

test('dismissed and superseded open Tasks remain terminal without changing native status', () => {
  for (const state of ['dismissed', 'superseded']) {
    const input = registerFixture(); input.request.lifecycle.push({ identity: registerIdentity(), state, observedAt: '2026-10-20T00:00:00Z', evidenceRef: 'durable-owner-decision', replacements: state === 'superseded' ? [registerIdentity('replacement-one')] : [] });
    const result = assess(input); assert.ok(found(result, 'owner-dismissed-or-superseded')); assert.equal(input.snapshot.taskLists[0].tasks[0].status, 'needsAction');
    assert.equal(result.proposals[0].status, 'blocked');
    input.request.taskSchedules = []; assert.equal(assess(input).availability.freeIntervals, null, 'Dismissal cannot prove an absent native interval');
  }
});

test('continuation request tokens must match the retained page chain', () => {
  const input = registerFixture(); const collection = input.snapshot.taskLists[0].collection;
  collection.pages[0].nextToken = 'next'; collection.pages.push({ ...structuredClone(collection.pages[0]), requestToken: 'next', nextToken: null });
  bindRegister(input); assert.ok(found(assess(input), 'page-request-token-mismatch'));
  collection.pages[1].query.pageToken = 'next'; bindRegister(input); assert.equal(assess(input).availability.complete, true);
});

test('Event date-only changes and Task dates outside collected coverage refuse', () => {
  const input = registerFixture(); const eventIdentity = registerIdentity('busy-one', 'calendar');
  const baselineDigest = assess(input).baselines.find(row => row.identity.nativeId === 'busy-one').baselineDigest;
  input.request.operations = [{ id: 'date-only-event', identity: eventIdentity, baselineDigest, transport: 'google-calendar-rest', changes: { date: '2026-10-28' }, sourceId: null }];
  assert.ok(found(assess(input), 'end-time-duration-mismatch'));
  const task = registerFixture(); task.request.operations[0].changes = { date: '2026-10-28' };
  assert.ok(found(assess(task), 'date-outside-collected-window'));
});

test('wrong Task ID, changed baseline, unsupported duration and end-time mismatch all refuse', () => {
  for (const [name, mutate, code] of [
    ['wrong ID', input => { input.request.operations[0].identity.nativeId = 'lecture-not-ureca'; }, 'wrong-native-identity'],
    ['baseline', input => { input.snapshot.taskLists[0].tasks[0].title = 'Owner changed title'; }, 'baseline-mismatch'],
    ['API duration', input => { input.request.operations[0].transport = 'academic-os-mcp'; }, 'unsupported-provider-operation'],
    ['end time', input => { input.request.operations[0].changes.end = '2026-10-27T10:30:00Z'; }, 'end-time-duration-mismatch'],
    ['date', input => { input.request.operations[0].changes.date = '2026-10-28'; }, 'schedule-date-zone-mismatch'],
    ['meal overlap', input => { Object.assign(input.request.operations[0].changes, { start: '2026-10-27T12:00:00Z', end: '2026-10-27T13:00:00Z' }); }, 'overlap'],
  ]) {
    const input = registerFixture(); mutate(input); bindRegister(input); const result = assess(input);
    assert.ok(found(result, code), name); assert.equal(result.proposals[0].status, 'blocked', name);
  }
});

test('actual attempt and correction durations stay separate inside rounded scheduled blocks', () => {
  const input = registerFixture();
  const correction = { ...input.snapshot.taskLists[0].tasks[0], id: 'correction-one', title: 'Module Paper A correction' };
  input.snapshot.taskLists[0].tasks.push(correction);
  input.request.taskSchedules.push({ ...input.request.taskSchedules[0], identity: registerIdentity('correction-one'), taskDigest: registerHash(correction) });
  input.request.sources.push({ id: 'paper-correction', identity: registerIdentity('correction-one'), name: 'Paper A correction', reference: 'synthetic-module-file', range: 'Paper A, corrections only', kind: 'correction', actualDurationMinutes: 15, dependsOn: ['paper-attempt'], completed: false });
  input.request.operations.push({ id: 'correction', identity: registerIdentity('correction-one'), baselineDigest: registerHash({ native: correction, intervals: [] }), transport: 'calendar-native-ui', changes: { title: correction.title, date: '2026-10-27', start: '2026-10-27T11:00:00Z', end: '2026-10-27T11:30:00Z', durationMinutes: 30, timeZone: 'UTC' }, sourceId: 'paper-correction' });
  bindRegister(input); assert.equal(assess(input).status, 'proposed');
  input.request.operations[1].changes.start = '2026-10-27T08:40:00Z'; input.request.operations[1].changes.end = '2026-10-27T08:55:00Z';
  assert.ok(found(assess(input), 'source-dependency-unmet'));
  Object.assign(input.request.operations[0].changes, { start: '2026-10-27T12:00:00Z', end: '2026-10-27T13:00:00Z' });
  Object.assign(input.request.operations[1].changes, { start: '2026-10-27T13:00:00Z', end: '2026-10-27T13:30:00Z' });
  assert.ok(assess(input).proposals.every(row => row.status === 'blocked'));
});

test('all-day exclusive end follows source timezone and DST length', () => {
  const input = registerFixture('2026-11-01T00:00:00Z');
  input.request.operations = []; input.request.taskSchedules = []; input.snapshot.taskLists[0].tasks = [];
  const window = { start: '2026-11-01T04:00:00Z', end: '2026-11-02T05:00:00Z', timeZone: 'America/New_York' };
  Object.assign(input.snapshot.scope, { window }); Object.assign(input.request, { window, workingIntervals: [window] });
  Object.assign(input.request.visualReview, { window });
  const calendar = input.snapshot.calendars[0]; calendar.timeZone = 'America/New_York';
  calendar.events = [{ id: 'all-day', summary: 'Busy day', status: 'confirmed', start: { date: '2026-11-01' }, end: { date: '2026-11-02' } }];
  Object.assign(calendar.collection.pages[0].query, { timeMin: window.start, timeMax: window.end }); bindRegister(input);
  const result = assess(input); assert.deepEqual(result.availability.freeIntervals, []); assert.equal(result.availability.blockedIntervals[0].durationMinutes, 1500);
});

test('cancelled recurring exception stays a tombstone while unexpanded series blocks coverage', () => {
  const input = registerFixture(); input.snapshot.calendars[0].events.push({ id: 'cancelled-instance', status: 'cancelled', recurringEventId: 'series', originalStartTime: { dateTime: '2026-10-27T09:00:00Z' } }); bindRegister(input);
  assert.equal(assess(input).availability.complete, true);
  input.snapshot.calendars[0].events.push({ id: 'series', recurrence: ['RRULE:FREQ=DAILY'], status: 'confirmed' }); bindRegister(input);
  const result = assess(input); assert.equal(result.availability.freeIntervals, null); assert.ok(found(result, 'unexpanded-recurrence'));
});

test('duplicate projections require exact-ID mappings, and stale mappings cannot deduplicate', () => {
  const input = registerFixture(); const calendar = input.snapshot.calendars[0]; const task = input.snapshot.taskLists[0].tasks[0];
  for (const nativeId of ['projection-one', 'projection-two']) {
    const event = { id: nativeId, summary: task.title, status: 'confirmed', transparency: 'transparent', start: { dateTime: '2026-10-27T09:00:00Z' }, end: { dateTime: '2026-10-27T09:40:00Z' } }; calendar.events.push(event);
    input.request.mappings.push({ taskIdentity: registerIdentity(), eventIdentity: registerIdentity(nativeId, 'calendar'), taskDigest: registerHash(task), eventDigest: registerHash(event), observedAt: input.snapshot.acquisition.completedAt, evidenceRef: 'native-mapping-capture' });
  }
  bindRegister(input); const result = assess(input); assert.ok(found(result, 'duplicate-projection')); assert.equal(result.availability.freeIntervals, null);
});

test('lost write responses hold retry until current same-ID post-attempt evidence resolves them', () => {
  const input = registerFixture(); const first = assess(input).proposals[0];
  input.request.attempts.push(registerAttempt(input, first));
  assert.ok(found(assess(input), 'reconcile-uncertain-effect'));
  refreshRegisterEvidence(input);
  input.request.attempts[0].resolution = { kind: 'no-effect', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'fresh-exact-before-state-and-complete-discovery' };
  assert.equal(assess(input).proposals[0].status, 'proposed');
  input.request.attempts[0].state = 'denied';
  assert.ok(found(assess(input), 'terminal-attempt'));
});

test('uncertain no-effect cannot be rebased to an owner-changed before-state', () => {
  const input = registerFixture(); const first = assess(input).proposals[0];
  input.request.attempts.push(registerAttempt(input, first));
  input.snapshot.taskLists[0].tasks[0].title = 'Owner changed this task';
  input.request.taskSchedules[0].taskDigest = registerHash(input.snapshot.taskLists[0].tasks[0]);
  input.request.operations[0].baselineDigest = registerHash({ native: input.snapshot.taskLists[0].tasks[0], intervals: [] });
  refreshRegisterEvidence(input);
  input.request.attempts[0].resolution = { kind: 'no-effect', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'rebased-current-state-is-not-the-before-state' };
  assert.ok(found(assess(input), 'reconcile-uncertain-effect'));
  input.request.attempts[0].operationDigest = 'a'.repeat(64);
  assert.throws(() => assess(input), /digest or before-state/);
});

test('same-ID reopened exact schedule resolves once while mismatched saved end remains held', () => {
  const input = registerFixture(); const before = assess(input).proposals[0]; input.request.attempts.push(registerAttempt(input, before));
  input.request.taskSchedules[0].intervals = [{ start: before.changes.start, end: before.changes.end }];
  refreshRegisterEvidence(input); input.request.attempts[0].resolution = { kind: 'saved', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'same-id-reopened-saved-fields-and-calendar-projection' };
  assert.equal(assess(input).proposals[0].status, 'already-saved');
  input.request.taskSchedules[0].intervals[0].end = '2026-10-27T10:30:00Z';
  assert.ok(found(assess(input), 'reconcile-uncertain-effect'));
});

test('verified same-Task projection does not collide with its saved target or move', () => {
  const input = registerFixture(); const before = assess(input).proposals[0]; input.request.attempts.push(registerAttempt(input, before));
  input.request.taskSchedules[0].intervals = [{ start: before.changes.start, end: before.changes.end }];
  const projection = { id: 'task-projection', summary: before.changes.title, status: 'confirmed', start: { dateTime: before.changes.start }, end: { dateTime: before.changes.end } };
  input.snapshot.calendars[0].events.push(projection); refreshRegisterEvidence(input);
  input.request.mappings.push({ taskIdentity: before.identity, eventIdentity: registerIdentity(projection.id, 'calendar'), taskDigest: registerHash(input.snapshot.taskLists[0].tasks[0]), eventDigest: registerHash(projection), observedAt: input.evaluatedAt, evidenceRef: 'native-same-task-projection-identity' });
  input.request.attempts[0].resolution = { kind: 'saved', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'same-id-reopened-and-independent-projection' };
  assert.equal(assess(input).proposals[0].status, 'already-saved');
  input.request.attempts = []; input.request.operations[0].baselineDigest = assess(input).baselines.find(row => row.identity.nativeId === 'task-one').baselineDigest;
  assert.equal(assess(input).proposals[0].status, 'proposed');
  input.request.mappings = [];
  assert.ok(found(assess(input), 'overlap'));
});

test('title-only saved resolution cannot ignore unrelated schedule drift', () => {
  const input = registerFixture(); input.request.operations[0].changes = { title: 'Module Paper A attempt revised' };
  const before = assess(input).proposals[0]; input.request.attempts.push(registerAttempt(input, before));
  input.snapshot.taskLists[0].tasks[0].title = before.changes.title;
  input.request.taskSchedules[0].taskDigest = registerHash(input.snapshot.taskLists[0].tasks[0]);
  input.request.taskSchedules[0].intervals = [{ start: '2026-10-27T15:00:00Z', end: '2026-10-27T15:40:00Z' }];
  refreshRegisterEvidence(input); input.request.attempts[0].resolution = { kind: 'saved', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'save-with-unrelated-drift' };
  assert.ok(found(assess(input), 'reconcile-uncertain-effect'));
});

test('event updatedMin filtering and timezone wall-clock mismatch cannot certify availability', () => {
  const input = registerFixture(); input.snapshot.calendars[0].collection.pages[0].query.updatedMin = '2026-10-26T00:00:00Z'; bindRegister(input);
  assert.equal(assess(input).availability.freeIntervals, null);
  const zoneMismatch = registerFixture(); zoneMismatch.snapshot.calendars[0].events[0].start.timeZone = 'Asia/Singapore'; bindRegister(zoneMismatch);
  assert.ok(found(assess(zoneMismatch), 'unreadable-blocking-event'));
});

test('missing protected identities and pre-acquisition offset timestamps hold availability', () => {
  const input = registerFixture(); input.request.protectedIdentities.push(registerIdentity('missing-meal', 'calendar'));
  assert.ok(found(assess(input), 'protected-identity-missing'));
  const offset = registerFixture(); offset.snapshot.taskLists[0].collection.pages[0].acquiredAt = '2026-10-27T00:59:58+01:00'; bindRegister(offset);
  assert.ok(found(assess(offset), 'stale-source-page'));
});

test('title-only reconciliation needs a post-attempt protected schedule readback', () => {
  const input = registerFixture(); input.request.operations[0].changes = { title: 'Module Paper A attempt revised' };
  const before = assess(input).proposals[0]; input.request.attempts.push(registerAttempt(input, before));
  input.snapshot.taskLists[0].tasks[0].title = before.changes.title;
  input.request.taskSchedules[0].taskDigest = registerHash(input.snapshot.taskLists[0].tasks[0]);
  input.request.taskSchedules[0].observedAt = '2026-10-26T23:59:57Z';
  bindRegister(input); input.request.attempts[0].resolution = { kind: 'saved', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'title-saved-with-stale-protected-schedule' };
  assert.ok(found(assess(input), 'reconcile-uncertain-effect'));
});

test('visual review must bind the exact snapshot and compare numeric intervals', () => {
  const input = registerFixture(); delete input.request.visualReview;
  const result = assess(input); assert.equal(result.availability.complete, true); assert.ok(found(result, 'visual-calendar-review-required')); assert.equal(result.proposals[0].status, 'blocked');
});

test('no Task descriptions or unsupported fields enter new planning operations', () => {
  const input = registerFixture(); input.request.operations[0].changes.notes = 'bloated source notes';
  assert.throws(() => validateCalendarRequest(input.request), /unsupported field/);
  const duplicate = registerFixture(); duplicate.snapshot.taskLists[0].tasks.push(duplicate.snapshot.taskLists[0].tasks[0]);
  assert.throws(() => validateCalendarSnapshot(duplicate.snapshot), /Duplicate/);
});

test('immutable snapshot export is idempotent and ignores interrupted temporary files', async () => {
  const home = await mkdtemp(join(tmpdir(), 'emmy-register-'));
  try {
    const input = registerFixture(); const first = await retainCalendarSnapshot(home, input.snapshot);
    await writeFile(join(home, 'calendar-register/snapshots/.pending-crashed-writer'), 'partial');
    const second = await retainCalendarSnapshot(home, input.snapshot);
    assert.deepEqual(first, second); assert.equal(JSON.parse(await readFile(first.file, 'utf8')).kind, 'calendar-register');
    assert.equal((await readdir(join(home, 'calendar-register/snapshots'))).filter(name => name.endsWith('.json')).length, 1);
    await writeFile(first.file, 'corrupted');
    await assert.rejects(retainCalendarSnapshot(home, input.snapshot), /disagree/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
