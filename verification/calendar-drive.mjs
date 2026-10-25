import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest } from '../src/records.mjs';
import { bindCalendar, calendarChange, calendarFields, calendarFixture, calendarIdentity, calendarSaved } from './calendar-fixtures.mjs';

const codes = result => result.findings.map(finding => finding.code);
const expectCode = code => result => assert.ok(codes(result).includes(code), `Expected ${code}, received ${codes(result).join(', ')}`);
const notesResult = result => result.fieldResults.find(field => field.itemKey === 'one' && field.field === 'notes');
function extraTask(input, { nativeId = 'task-two', start, end, sourceId = 'source-two', kind = 'whole-source' } = {}) {
  const original = input.intent.items[0]; const identity = calendarIdentity(nativeId); const expected = { ...original.expected, title: `${input.intent.sources.find(source => source.sourceId === sourceId)?.name ?? `Synthetic ${sourceId}`} (${nativeId})`, notes: `Synthetic ${nativeId} notes.`, start: start ?? original.expected.end, end: end ?? original.expected.end.replace('T10:', 'T11:') };
  expected.durationMinutes = (Date.parse(expected.end) - Date.parse(expected.start)) / 60000;
  input.intent.items.push({ ...original, key: nativeId, identity, expected });
  input.plan.allocations.push({ itemKey: nativeId, identity, sourceId, sourceKind: kind, start: expected.start, end: expected.end });
  if (!input.intent.sources.some(source => source.sourceId === sourceId)) input.intent.sources.push({ sourceId, name: `Synthetic ${sourceId}`, kind, requiredMinutes: expected.durationMinutes, requiredSessions: 1, instruction: 'Synthetic declared complete source.' });
  input.readbacks.push({ ...structuredClone(input.readbacks[0]), id: `${nativeId}-readback`, identity, fields: calendarFields(expected) });
  input.inventories[0].taskLists[0].items.push({ ...structuredClone(input.inventories[0].taskLists[0].items[0]), identity, title: expected.title, interval: { start: expected.start, end: expected.end, timeZone: 'UTC', allDay: false } });
  input.intent.budgets = [];
  return bindCalendar(input);
}
function commitment(input, type = 'task', change = {}) {
  const item = { ...structuredClone(input.inventories[0].taskLists[0].items[0]), identity: calendarIdentity(`blocking-${type}`, type), type, title: `Synthetic blocking ${type}`, ...change };
  if (type === 'event') { item.transparency ??= 'busy'; input.inventories[0].calendars[0].items.push(item); }
  else input.inventories[0].taskLists[0].items.push(item);
  return item;
}
function attempt(input, outcome = 'uncertain', change = {}) {
  const value = { id: 'attempt-one', operationId: 'historical-operation', effectScope: 'notes', identity: input.intent.items[0].identity, attemptedAt: input.intent.acquiredAt, outcome, raw: 'Synthetic retained first attempt receipt.', ...change };
  input.attempts.push(value); return value;
}
function correctedReadback(input, field, value) {
  const prior = input.readbacks[0]; const current = structuredClone(prior);
  prior.acquiredAt = new Date(Date.parse(prior.acquiredAt) - 1000).toISOString();
  prior.sequence = Object.fromEntries(Object.entries(prior.sequence).map(([key, time]) => [key, new Date(Date.parse(time) - 1000).toISOString()]));
  current.id = 'current-readback'; current.fields[field] = calendarFields({ [field]: value })[field]; current.supersedes = { readbackId: prior.id, fields: [field] }; input.readbacks.push(current); return current;
}

export async function verifyCalendarRetention(directory, files) {
  for (const file of files) {
    const bytes = await readFile(join(directory, file.path));
    assert.equal(bytes.length, file.bytes, `Retained Calendar size ${file.path}`);
    assert.equal(digest(bytes), file.sha256, `Retained Calendar bytes ${file.path}`);
  }
}

export async function driveCalendar({ home, run, scenario, report }) {
  const directory = join(home, 'calendar'); const privateHome = join(directory, 'private-home'); const records = join(privateHome, 'records');
  await mkdir(records, { recursive: true }); await writeFile(join(records, 'retained.bin'), 'Synthetic register bytes remain unchanged.\n');
  const sentinel = join(directory, 'executor-invoked'); const loaded = join(directory, 'guard-loaded'); const guard = join(directory, 'guards.mjs');
  await writeFile(guard, `import { appendFileSync } from 'node:fs';\nimport childProcess from 'node:child_process';\nimport net from 'node:net';\nimport { syncBuiltinESMExports } from 'node:module';\nappendFileSync(${JSON.stringify(loaded)}, String(process.pid) + '\\n');\nconst blocked = () => { appendFileSync(${JSON.stringify(sentinel)}, 'attempt\\n'); throw new Error('Calendar fixture forbids executor and network calls'); };\nfor (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[name] = blocked;\nnet.Socket.prototype.connect = blocked; globalThis.fetch = blocked; syncBuiltinESMExports();\n`);
  const env = { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${guard}` };
  const originalRegister = await readFile(join(records, 'retained.bin')); const before = await readdir(records);
  report.calendar = { provenance: 'synthetic', controls: [], retainedFiles: [{ path: 'private-home/records/retained.bin', bytes: originalRegister.length, sha256: digest(originalRegister) }], registerDigest: digest(originalRegister), limitations: ['Retained-shape controls are synthetic analogues of retained notes evidence.', 'Handoff-derived controls establish local semantics only. They invent no native ledger or execution.'] };
  const retain = async path => { const bytes = await readFile(path); report.calendar.retainedFiles.push({ path: path.slice(directory.length + 1), bytes: bytes.length, sha256: digest(bytes) }); };
  await retain(guard);
  const check = async (name, input, expected, verify = () => {}, basis = 'handoff-derived') => {
    const file = join(directory, `${name}.json`); const bytes = `${JSON.stringify(input, null, 2)}\n`; await writeFile(file, bytes); await retain(file);
    const result = await run(['calendar', '--file', file], expected, privateHome, env);
    assert.equal(await readFile(file, 'utf8'), bytes, 'Calendar input bytes stay unchanged');
    if (expected !== 2) {
      assert.equal(result.inputDigest, digest(bytes)); assert.equal(result.execution, 'none'); assert.equal(result.assurance, 'declared-calendar-evidence');
      assert.equal(result.intentDigest, digest(input.intent)); assert.ok(Date.parse(result.evaluatedAt) >= Date.parse(input.intent.acquiredAt) || codes(result).includes('evidence-future'));
      assert.equal(JSON.stringify(result).includes(input.intent.items[0]?.expected.notes ?? 'private-notes-missing'), false, 'Raw requested notes stay private in the input');
    }
    await verify(result);
    report.calendar.controls.push({ name, basis, exit: expected, status: result.status ?? 'invalid-input', findings: result.findings ? codes(result) : [], inputDigest: result.inputDigest ?? digest(bytes) });
    assert.deepEqual(await readdir(records), before); assert.deepEqual(await readFile(join(records, 'retained.bin')), originalRegister, 'Calendar assessment writes no journal bytes');
    return result;
  };
  const control = async (name, mutate, code, expected = 3, basis) => {
    const input = calendarFixture(); await mutate(input); return check(name, input, expected, expected === 2 ? () => {} : expectCode(code), basis);
  };
  await check('exact-notes', calendarFixture(), 0, result => { assert.equal(notesResult(result).status, 'exact'); assert.equal(notesResult(result).firstDifference, null); assert.equal(result.morningResults[0].status, 'covered'); }, 'retained-notes-shape');
  await check('post-save-same-id', calendarSaved(calendarFixture()), 0, result => { assert.equal(result.historyResults[0].status, 'resolved'); assert.equal(result.planStatus.queuedChanges[0].status, 'current'); }, 'retained-notes-shape');
  for (const [name, value] of [['blank', ''], ['truncated', 'Synthetic source α'], ['trailing-space', calendarFixture().intent.items[0].expected.notes + ' '], ['unicode', calendarFixture().intent.items[0].expected.notes.replace('α', 'a')]]) {
    const result = await control(`notes-${name}`, input => { input.readbacks[0].fields.notes = calendarFields({ notes: value }).notes; }, 'field-mismatch', 3, 'retained-notes-shape');
    assert.equal(notesResult(result).savedDigest, digest(value)); assert.equal(result.fieldResults.find(field => field.field === 'end').status, 'exact');
    if (name === 'trailing-space') { assert.equal(notesResult(result).trailingWhitespaceDelta, 1); assert.equal(notesResult(result).firstDifference, notesResult(result).expectedLength); }
  }
  for (const origin of ['label', 'popup', 'editor-draft', 'acknowledgement']) await control(`notes-${origin}`, input => { input.readbacks[0].fields.notes = { origin, raw: 'Description: Close', value: 'Description: Close' }; }, 'field-wrong-provenance', 3, 'retained-notes-shape');
  for (const origin of ['label', 'popup', 'editor-draft', 'acknowledgement']) await control(`exact-value-wrong-origin-${origin}`, input => { input.readbacks[0].fields.notes.origin = origin; }, 'field-wrong-provenance');
  await control('notes-unreadable', input => { input.readbacks[0].fields.notes = { origin: 'unreadable', raw: 'Synthetic unreadable field.', value: null }; }, 'field-unreadable', 3, 'retained-notes-shape');
  const extracted = calendarFixture(); const content = extracted.intent.items[0].expected.notes; extracted.readbacks[0].fields.notes.raw = `Description:\n${content}\nClose`; extracted.readbacks[0].fields.notes.extraction = { start: 13, end: 13 + content.length };
  await check('exact-ui-extraction', extracted, 0, result => assert.equal(notesResult(result).status, 'exact'), 'retained-notes-shape');
  await control('invalid-ui-extraction', input => { input.readbacks[0].fields.notes.extraction = { start: 1, end: 2 }; }, null, 2);
  await control('normalized-newline-refused', input => { input.readbacks[0].fields.notes = calendarFields({ notes: input.intent.items[0].expected.notes.replaceAll('\n', '\r\n') }).notes; }, 'field-mismatch');
  for (const field of ['notes', 'date', 'end']) await control(`missing-${field}`, input => { delete input.readbacks[0].fields[field]; }, 'field-unreadable');
  await control('wrong-native-id', input => { input.readbacks[0].identity = calendarIdentity('other-task'); }, 'field-unreadable');
  for (const field of ['environment', 'accountId', 'containerId']) await control(`wrong-${field}`, input => { input.readbacks[0].identity = { ...input.readbacks[0].identity, [field]: 'wrong-scope' }; }, 'field-unreadable');
  await control('missing-reload', input => { input.readbacks[0].sequence.reloadedAt = null; }, 'persistence-unverified');
  await control('impossible-order', input => { input.readbacks[0].sequence.reloadedAt = new Date(Date.parse(input.readbacks[0].acquiredAt) + 1).toISOString(); }, null, 2);
  await control('retained-old-date', input => { input.readbacks[0].fields.date = calendarFields({ date: '2000-01-01' }).date; }, 'field-mismatch');
  await control('date-only-cannot-prove-start', input => { input.readbacks[0].fields.start = calendarFields({ start: null }).start; input.readbacks[0].fields.end = calendarFields({ end: null }).end; }, 'field-mismatch');
  await control('replaced-control-no-saved-field', input => { input.readbacks[0].fields.notes = { origin: 'editor-draft', raw: 'Synthetic reacquired replacement control.', value: 'Synthetic reacquired replacement control.' }; attempt(input, 'uncertain', { raw: 'Synthetic replaced control, input sent, Save uncertain.' }); }, 'attempt-unresolved');
  await control('stale-capture', input => { const prior = input.readbacks[0]; prior.acquiredAt = new Date(Date.now() - 120000).toISOString(); prior.sequence = { closedAt: new Date(Date.now() - 123000).toISOString(), reloadedAt: new Date(Date.now() - 122000).toISOString(), reopenedAt: new Date(Date.now() - 121000).toISOString() }; }, 'evidence-stale');
  await control('future-capture', input => { input.readbacks[0].acquiredAt = new Date(Date.now() + 60000).toISOString(); }, 'evidence-future');
  await control('stale-intent', input => { input.intent.acquiredAt = new Date(Date.now() - 120000).toISOString(); bindCalendar(input); }, 'evidence-stale');
  for (const field of ['available', 'complete', 'cursorExhausted']) await control(`inventory-${field}`, input => { input.inventories[0].taskLists[0][field] = false; }, 'inventory-incomplete');
  await control('inventory-pagination-gap', input => { input.inventories[0].taskLists[0].gaps.push('Synthetic next page unavailable.'); }, 'inventory-incomplete');
  for (const field of ['timed', 'untimed', 'allStatuses', 'synthetic']) await control(`task-coverage-${field}`, input => { input.inventories[0].taskLists[0].coverage[field] = false; }, 'inventory-incomplete');
  await control('free-busy-only', input => { input.inventories[0].calendars[0].coverage.transparency = false; }, 'inventory-incomplete');
  await control('all-day-coverage-missing', input => { input.inventories[0].calendars[0].coverage.allDay = false; }, 'inventory-incomplete');
  await control('wrong-inventory-window', input => { input.inventories[0].window = { ...input.inventories[0].window, timeZone: 'Asia/Singapore' }; }, 'inventory-incomplete');
  await control('stale-inventory', input => { input.inventories[0].acquiredAt = new Date(Date.now() - 120000).toISOString(); }, 'inventory-incomplete');
  await control('missing-final-ledger', input => { input.plan = null; }, 'plan-missing');
  const missingPlan = calendarFixture(); missingPlan.plan = null;
  await check('missing-plan-derived-values', missingPlan, 3, result => { assert.equal(result.status, 'needs-evidence'); for (const key of ['planDigest', 'sourceResults', 'budgetResults', 'morningResults', 'conflictResults']) assert.equal(result[key], null); });
  await control('null-operation-baseline', input => { calendarChange(input); input.plan.queuedChanges[0].baselineReadbackId = null; input.plan.queuedChanges[0].baselineDigest = null; }, 'baseline-missing');
  await control('no-baseline-inventory', input => { input.plan.inventoryIds = []; }, 'baseline-missing');
  await control('native-duplicate', input => { input.inventories[0].taskLists[0].items.push(structuredClone(input.inventories[0].taskLists[0].items[0])); }, 'inventory-duplicate');
  await control('synthetic-duplicate-candidate', input => { commitment(input, 'task', { title: input.intent.items[0].expected.title, synthetic: true, interval: null }); }, 'ambiguous-item');
  const untimed = calendarFixture(); commitment(untimed, 'task', { interval: null, synthetic: true });
  await check('untimed-backlog-preserved', untimed, 0, result => assert.deepEqual(result.conflictResults, []));
  for (const status of ['open', 'completed', 'cancelled']) await control(`timed-task-blocks-${status}`, input => { commitment(input, 'task', { status, completed: status === 'completed', synthetic: status !== 'open' }); }, 'calendar-collision');
  const transparent = calendarFixture(); commitment(transparent, 'event', { transparency: 'transparent' });
  await check('optional-transparent-event-overlap', transparent, 0);
  await control('busy-event-blocks', input => { commitment(input, 'event'); }, 'calendar-collision');
  await control('mandatory-transparent-event-blocks', input => { const event = commitment(input, 'event', { transparency: 'transparent' }); input.intent.eventConstraints.push({ identity: event.identity, mandatory: true, instruction: 'Synthetic explicit attendance requirement.' }); bindCalendar(input); }, 'calendar-collision');
  await control('unknown-event-transparency', input => { commitment(input, 'event', { transparency: 'unknown' }); }, 'event-transparency-unknown');
  await control('all-day-event-blocks', input => { const date = input.intent.items[0].expected.date; commitment(input, 'event', { interval: { start: `${date}T00:00:00Z`, end: input.intent.window.end, timeZone: 'UTC', allDay: true } }); }, 'calendar-collision');
  await control('allocation-overlap', input => { extraTask(input, { start: input.plan.allocations[0].start, end: input.plan.allocations[0].end }); }, 'allocation-collision');
  const padded = calendarFixture(); const day = padded.intent.items[0].expected.date; extraTask(padded, { start: `${day}T10:15:00+00:00`, end: `${day}T11:15:00+00:00` }); padded.intent.buffers = { beforeMinutes: 10, afterMinutes: 10 }; bindCalendar(padded);
  await check('padded-allocation-pairs-only', padded, 3, result => { expectCode('allocation-collision')(result); assert.equal(codes(result).includes('calendar-collision'), false); });
  const adjacent = extraTask(calendarFixture());
  await check('half-open-adjacent-allocations', adjacent, 0);
  await control('buffer-blocks-adjacent', input => { extraTask(input); input.intent.buffers.afterMinutes = 15; bindCalendar(input); }, 'calendar-collision');
  await control('large-declared-buffer', input => { input.intent.buffers.beforeMinutes = Number.MAX_SAFE_INTEGER; bindCalendar(input); }, 'buffer-outside-window');
  await control('half-hour-increment', input => { input.plan.allocations[0].end = input.plan.allocations[0].end.replace('T10:00:', 'T09:45:'); }, 'duration-increment');
  await control('allocation-window', input => { input.plan.allocations[0].start = input.intent.window.start.replace('T00:', 'T00:'); input.plan.allocations[0].end = input.intent.window.end.replace('T23:59:', 'T23:59:'); input.intent.window.start = input.plan.allocations[0].start.replace('T00:', 'T01:'); bindCalendar(input); }, 'allocation-outside-window');
  await control('deadline', input => { input.intent.items[0].expected.deadline = { kind: 'instant', value: input.plan.allocations[0].start }; input.readbacks[0].fields.deadline = calendarFields({ deadline: input.intent.items[0].expected.deadline }).deadline; bindCalendar(input); }, 'deadline-exceeded');
  for (const scope of ['campaign', 'source', 'day']) await control(`budget-${scope}`, input => { input.intent.budgets = [{ scope, key: scope === 'campaign' ? 'campaign' : scope === 'source' ? 'source-one' : input.intent.items[0].expected.date, maxMinutes: 30 }]; bindCalendar(input); }, 'budget-exceeded');
  await control('morning-60-of-90-is-gap', input => { input.intent.morningRequirements[0].end = input.intent.morningRequirements[0].end.replace('T10:00:', 'T10:30:'); input.intent.morningRequirements[0].minMinutes = 60; bindCalendar(input); }, 'morning-gap');
  await control('second-planning-day-morning', input => { const next = new Date(Date.parse(input.intent.items[0].expected.start) + 86400000).toISOString().slice(0, 10); input.intent.morningRequirements.push({ date: next, start: `${next}T09:00:00Z`, end: `${next}T10:00:00Z`, minMinutes: 60 }); bindCalendar(input); }, 'morning-gap');
  const morning90 = calendarFixture(); morning90.intent.items[0].expected.end = morning90.intent.items[0].expected.end.replace('T10:00:', 'T10:30:'); morning90.intent.items[0].expected.durationMinutes = 90; morning90.readbacks[0].fields = calendarFields(morning90.intent.items[0].expected); morning90.inventories[0].taskLists[0].items[0].interval.end = morning90.intent.items[0].expected.end; morning90.plan.allocations[0].end = morning90.intent.items[0].expected.end; morning90.intent.sources[0].requiredMinutes = 90; morning90.intent.morningRequirements[0].end = morning90.intent.items[0].expected.end; morning90.intent.morningRequirements[0].minMinutes = 90; bindCalendar(morning90);
  await check('whole-90-minute-morning', morning90, 0, result => assert.equal(result.morningResults[0].coveredMinutes, 90));
  await control('whole-source-name-missing-from-title', input => { input.intent.items[0].expected.title = 'General revision'; input.readbacks[0].fields.title = calendarFields({ title: 'General revision' }).title; input.inventories[0].taskLists[0].items[0].title = 'General revision'; bindCalendar(input); }, 'source-name-mismatch');
  const sourceNamed = calendarFixture(); const namedTitle = `Read ${sourceNamed.intent.sources[0].name}`; sourceNamed.intent.items[0].expected.title = namedTitle; sourceNamed.readbacks[0].fields.title = calendarFields({ title: namedTitle }).title; sourceNamed.inventories[0].taskLists[0].items[0].title = namedTitle; bindCalendar(sourceNamed);
  await check('whole-source-name-in-saved-title', sourceNamed, 0);
  await control('source-minimum', input => { input.intent.sources[0].requiredMinutes = 90; bindCalendar(input); }, 'source-minimum');
  await control('whole-source-split', input => { extraTask(input, { sourceId: 'source-one' }); }, 'whole-source-continuity');
  await control('unknown-substituted-material', input => { input.plan.allocations[0].sourceId = 'substituted-old-year-source'; }, 'allocation-source-mismatch');
  const research = calendarFixture(); research.intent.sources[0].kind = 'ongoing-research'; research.intent.sources[0].requiredSessions = 2; research.plan.allocations[0].sourceKind = 'ongoing-research'; extraTask(research, { sourceId: 'source-one', kind: 'ongoing-research' });
  for (const [index, item] of research.intent.items.entries()) { const title = `General ongoing research ${index + 1}`; item.expected.title = title; research.readbacks.find(readback => readback.identity.nativeId === item.identity.nativeId).fields.title = calendarFields({ title }).title; research.inventories[0].taskLists[0].items.find(entry => entry.identity.nativeId === item.identity.nativeId).title = title; }
  bindCalendar(research);
  await check('repeated-ongoing-research', research, 0, result => assert.equal(result.sourceResults[0].sessions, 2));
  for (const deliverable of ['document', 'formula-sheet', 'release-label']) await control(`unsolicited-${deliverable}`, input => { input.intent.requestedDeliverables.push(deliverable); bindCalendar(input); }, 'unsolicited-deliverable');
  await control('changed-owner-intent', input => { calendarChange(input); input.intent.revision = 'owner-correction-2'; input.intent.items[0].expected.notes = 'Synthetic corrected owner instruction.'; }, 'intent-binding-mismatch');
  await control('new-token-stale-desired-fields', input => { calendarChange(input); input.intent.revision = 'owner-correction-2'; input.intent.items[0].expected.notes = 'Synthetic corrected owner instruction.'; input.readbacks[0].fields.notes = calendarFields({ notes: input.intent.items[0].expected.notes }).notes; bindCalendar(input); }, 'stale-desired-field');
  await control('new-token-stale-source', input => { calendarChange(input); input.plan.queuedChanges[0].sourceId = 'old-source'; bindCalendar(input); }, 'operation-source-mismatch');
  for (const origin of ['unreadable', 'editor-draft', 'popup']) await control(`superseding-${origin}-cannot-borrow-green`, input => { const current = correctedReadback(input, 'notes', 'Synthetic unavailable current value.'); current.fields.notes.origin = origin; if (origin === 'unreadable') current.fields.notes.value = null; }, origin === 'unreadable' ? 'field-unreadable' : 'field-wrong-provenance');
  for (const [field, value] of [['notes', 'Synthetic owner edit.'], ['completed', true], ['type', 'event']]) await control(`owner-drift-${field}`, input => { calendarChange(input); correctedReadback(input, field, value); bindCalendar(input); }, 'baseline-drift');
  await control('owner-completed-inventory', input => { input.inventories[0].taskLists[0].items[0].completed = true; }, 'inventory-field-mismatch');
  await control('stale-inventory-token', input => { calendarChange(input); input.inventories[0].taskLists[0].items[0].raw += ' Synthetic owner update.'; }, 'inventory-binding-mismatch');
  await control('baseline-token-mismatch', input => { calendarChange(input); input.plan.queuedChanges[0].baselineDigest = '0'.repeat(64); }, 'baseline-binding-mismatch');
  await control('current-plan-token-mismatch', input => { calendarChange(input); input.plan.queuedChanges[0].planDigest = '0'.repeat(64); }, 'operation-binding-mismatch');
  await control('operation-token-mismatch', input => { calendarChange(input); input.plan.queuedChanges[0].operationDigest = '0'.repeat(64); }, 'operation-digest-mismatch');
  await control('saved-attempt-old-intent-binding', input => { calendarSaved(input); input.attempts[0].intentDigest = '0'.repeat(64); }, 'attempt-binding-mismatch');
  await control('saved-attempt-old-plan-binding', input => { calendarSaved(input); input.attempts[0].planDigest = '0'.repeat(64); }, 'attempt-binding-mismatch');
  const selfDigest = calendarFixture(); selfDigest.plan.digest = digest(Object.fromEntries(Object.entries(selfDigest.plan).filter(([key]) => key !== 'queuedChanges'))); bindCalendar(selfDigest);
  await check('claimed-plan-self-digest', selfDigest, 0, result => assert.equal(result.planDigest, selfDigest.plan.digest));
  await control('claimed-plan-self-digest-mismatch', input => { input.plan.digest = '0'.repeat(64); }, 'plan-binding-mismatch');
  const completedReopen = calendarSaved(calendarFixture()); completedReopen.intent.items[0].authorizedFields.push('completed'); completedReopen.plan.queuedChanges[0].fields = { completed: false }; completedReopen.readbacks[0].fields.completed.value = true; completedReopen.readbacks[0].fields.completed.raw = 'true'; bindCalendar(completedReopen); completedReopen.attempts[0].intentDigest = completedReopen.plan.intentDigest; completedReopen.attempts[0].planDigest = completedReopen.plan.queuedChanges[0].planDigest;
  await check('completed-item-cannot-reopen', completedReopen, 3, expectCode('completed-work-reopen'));
  const convertedType = calendarSaved(calendarFixture()); convertedType.intent.items[0].authorizedFields.push('type'); convertedType.plan.queuedChanges[0].fields = { type: 'task' }; convertedType.readbacks[0].fields.type = calendarFields({ type: 'event' }).type; bindCalendar(convertedType); convertedType.attempts[0].intentDigest = convertedType.plan.intentDigest; convertedType.attempts[0].planDigest = convertedType.plan.queuedChanges[0].planDigest;
  await check('owner-type-cannot-convert-back', convertedType, 3, expectCode('implicit-type-conversion'));
  const conversionInput = calendarFixture(); conversionInput.intent.items[0].authorizedFields.push('timeZone'); const conversion = calendarSaved(conversionInput); conversion.plan.queuedChanges[0].action = 'move'; conversion.plan.queuedChanges[0].fields = Object.fromEntries(['date', 'start', 'end', 'durationMinutes', 'timeZone'].map(field => [field, conversion.intent.items[0].expected[field]])); Object.assign(conversion.readbacks[0].fields, calendarFields({ date: null, start: null, end: null, durationMinutes: null, timeZone: null })); bindCalendar(conversion);
  await check('untimed-to-timed-same-task-id', conversion, 0, result => { assert.equal(result.planStatus.queuedChanges[0].status, 'current'); assert.equal(result.fieldResults.find(field => field.field === 'type').status, 'exact'); });
  await control('owner-correction-not-applied', input => { input.history.corrections.push({ id: 'correction-one', revision: 'owner-correction-2', acquiredAt: input.readbacks[0].acquiredAt, raw: 'Synthetic later owner correction.', itemKeys: ['one'], fields: ['notes'] }); }, 'owner-intent-outdated');
  await control('unrelated-correction-cannot-hide-current-revision', input => { input.history.corrections.push({ id: 'relevant-correction', revision: 'owner-correction-2', acquiredAt: new Date(Date.parse(input.intent.acquiredAt) - 1000).toISOString(), raw: 'Synthetic known correction with stale revision in later intent acquisition.', itemKeys: ['one'], fields: ['notes'] }, { id: 'unrelated-correction', revision: 'other-revision', acquiredAt: input.readbacks[0].acquiredAt, raw: 'Synthetic later unrelated correction.', itemKeys: ['other-item'], fields: ['notes'] }); }, 'owner-intent-outdated');
  await control('history-gap', input => { input.history.complete = false; input.history.gaps.push('Synthetic missing final ledger bytes.'); }, 'history-incomplete');
  await control('uncertain-update', input => { attempt(input); }, 'attempt-unresolved');
  await control('uncertain-creation-unknown-id', input => { attempt(input, 'uncertain', { identity: null, effectScope: 'historical-create' }); }, 'unknown-item-attempt');
  const resolved = calendarSaved(calendarFixture()); resolved.attempts[0].outcome = 'uncertain'; resolved.attempts[0].resolution = { kind: 'saved', readbackIds: ['saved-one'], inventoryId: 'inventory-one', raw: 'Synthetic fresh same-ID saved evidence and complete duplicate discovery.' };
  await check('scoped-uncertainty-resolution', resolved, 0, result => { assert.equal(result.historyResults[0].status, 'resolved'); assert.equal(result.historyResults[0].outcome, 'uncertain'); });
  const unresolvedInventory = structuredClone(resolved); unresolvedInventory.inventories[0].taskLists[0].cursorExhausted = false;
  await check('uncertainty-resolution-incomplete-discovery', unresolvedInventory, 3, expectCode('attempt-unresolved'));
  const noEffect = calendarChange(calendarFixture()); attempt(noEffect); noEffect.attempts[0].operationId = 'operation-one'; noEffect.attempts[0].resolution = { kind: 'no-effect', readbackIds: ['baseline-one'], inventoryId: 'inventory-one', raw: 'Synthetic same-ID unchanged readback and complete post-attempt discovery.' };
  await check('scoped-no-effect-resolution', noEffect, 0, result => assert.equal(result.historyResults[0].status, 'resolved'));
  const failedThenSaved = calendarSaved(calendarFixture()); failedThenSaved.attempts[0].id = 'later-saved'; failedThenSaved.attempts[0].retryOf = 'first-failure'; failedThenSaved.attempts.unshift({ id: 'first-failure', operationId: 'operation-one', effectScope: 'notes', identity: failedThenSaved.intent.items[0].identity, attemptedAt: failedThenSaved.intent.acquiredAt, outcome: 'failed', raw: 'Synthetic retained first save failure.', resolution: { kind: 'saved', readbackIds: ['saved-one'], inventoryId: 'inventory-one', raw: 'Synthetic explicit later same-ID resolution.' } });
  await check('later-pass-retains-first-failure', failedThenSaved, 0, result => { assert.equal(result.historyResults.find(entry => entry.id === 'first-failure').outcome, 'failed'); assert.equal(result.historyResults.find(entry => entry.id === 'first-failure').status, 'resolved'); assert.equal(result.historyResults.find(entry => entry.id === 'later-saved').outcome, 'saved'); });
  await control('old-uncertainty-survives-new-plan', input => { attempt(input); input.intent.revision = 'owner-correction-2'; bindCalendar(input); }, 'attempt-unresolved');
  await control('denied-scope-stop', input => { attempt(input, 'denied'); }, 'effect-denied');
  const deniedRetry = calendarChange(calendarFixture()); attempt(deniedRetry, 'denied', { id: 'first-denied' }); attempt(deniedRetry, 'saved', { id: 'denied-retry', retryOf: 'first-denied' });
  await check('denied-retry-barrier', deniedRetry, 3, result => { expectCode('terminal-effect-retry')(result); assert.equal(result.next[0].action, 'stop-denied'); assert.equal(result.historyResults.find(entry => entry.id === 'first-denied').status, 'denied'); });
  for (const outcome of ['denied', 'consumed', 'uncertain']) {
    const unrelated = calendarFixture(); attempt(unrelated, outcome, { identity: calendarIdentity('unrelated-task') });
    await check(`unrelated-${outcome}-retained`, unrelated, 0, result => { assert.equal(result.historyResults[0].outcome, outcome); assert.equal(result.historyResults[0].relevant, false); assert.equal(result.historyResults[0].rawDigest, digest(unrelated.attempts[0].raw)); });
  }
  await control('consumed-marker-stays-consumed', input => { attempt(input, 'consumed'); }, 'effect-consumed');
  await control('three-versus-two-count-gap', input => { attempt(input, 'failed'); attempt(input, 'failed', { id: 'second-failure' }); input.history.aggregateReports.push({ outcome: 'failed', count: 3, attemptIds: ['attempt-one', 'second-failure'], raw: 'Synthetic contradictory aggregate count, no invented third identity.' }); }, 'aggregate-count-gap');
  const removalInput = calendarFixture(); const priorFields = structuredClone(removalInput.readbacks[0].fields); const absent = { date: null, start: null, end: null, durationMinutes: null, timeZone: null }; Object.assign(removalInput.intent.items[0].expected, absent); removalInput.intent.items[0].authorizedFields = Object.keys(absent); removalInput.plan.allocations = []; removalInput.intent.sources = []; removalInput.intent.morningRequirements = []; removalInput.readbacks[0].fields = calendarFields(removalInput.intent.items[0].expected); removalInput.inventories[0].taskLists[0].items[0].interval = null; bindCalendar(removalInput); const removal = calendarSaved(removalInput); removal.readbacks[0].fields = priorFields; removal.plan.queuedChanges[0].action = 'remove-date'; removal.plan.queuedChanges[0].fields = absent; removal.plan.queuedChanges[0].sourceId = null; bindCalendar(removal);
  await check('same-id-date-removal', removal, 0);
  const retainedEnd = structuredClone(removal); retainedEnd.readbacks[1].fields.end = calendarFields({ end: calendarFixture().intent.items[0].expected.end }).end;
  await check('date-removal-retained-end', retainedEnd, 3, expectCode('field-mismatch'));
  const draftRemoval = structuredClone(removal); draftRemoval.readbacks[1].fields.date.origin = 'editor-draft';
  await check('date-removal-hidden-draft', draftRemoval, 3, result => assert.notEqual(result.status, 'checked'));
  const clocks = calendarFixture(); const expected = clocks.intent.items[0].expected; clocks.clocks = [{ id: 'calendar-clock', identity: clocks.intent.items[0].identity, surface: 'Synthetic Calendar', raw: 'Synthetic displayed 09:00 UTC.', acquiredAt: clocks.readbacks[0].acquiredAt, timeZone: 'UTC', offset: 'Z', instant: expected.start }, { id: 'embedded-clock', identity: clocks.intent.items[0].identity, surface: 'Synthetic embedded Task', raw: 'Synthetic displayed 10:00 UTC.', acquiredAt: clocks.readbacks[0].acquiredAt, timeZone: 'UTC', offset: 'Z', instant: expected.end }];
  await check('independent-clock-disagreement', clocks, 3, result => { expectCode('clock-disagreement')(result); assert.equal(notesResult(result).status, 'exact'); assert.equal(result.planStatus.timingStatus, 'pending'); });
  const settled = structuredClone(clocks); settled.clockResolution = { clockIds: clocks.clocks.map(clock => clock.id), source: 'native', raw: 'Synthetic attributable native resolution of both displays.', acquiredAt: settled.history.completeThrough, settledInstant: expected.start, timeZone: 'UTC' };
  await check('attributed-clock-resolution', settled, 0);
  const wrongClockScope = structuredClone(settled); wrongClockScope.clockResolution.clockIds = ['calendar-clock'];
  await check('partial-clock-resolution', wrongClockScope, 3, expectCode('clock-disagreement'));
  const shiftedClock = structuredClone(settled); shiftedClock.clockResolution.settledInstant = expected.end;
  await check('clock-resolution-cannot-shift-plan', shiftedClock, 3, expectCode('clock-disagreement'));
  const zoned = calendarFixture();
  zoned.intent.window.timeZone = 'Asia/Singapore';
  for (const key of ['start', 'end']) zoned.intent.window[key] = zoned.intent.window[key].replace('+00:00', '+08:00');
  for (const key of ['start', 'end']) zoned.intent.items[0].expected[key] = zoned.intent.items[0].expected[key].replace('+00:00', '+08:00');
  zoned.intent.items[0].expected.timeZone = 'Asia/Singapore'; zoned.readbacks[0].fields = calendarFields(zoned.intent.items[0].expected);
  Object.assign(zoned.plan.allocations[0], { start: zoned.intent.items[0].expected.start, end: zoned.intent.items[0].expected.end });
  Object.assign(zoned.inventories[0].taskLists[0].items[0].interval, { start: zoned.intent.items[0].expected.start, end: zoned.intent.items[0].expected.end, timeZone: 'Asia/Singapore' });
  for (const key of ['start', 'end']) zoned.intent.morningRequirements[0][key] = zoned.intent.morningRequirements[0][key].replace('+00:00', '+08:00');
  zoned.intent.budgets.push({ scope: 'day', key: zoned.intent.items[0].expected.date, maxMinutes: 60 }); bindCalendar(zoned);
  await check('named-zone-and-explicit-offset', zoned, 0, result => assert.equal(result.budgetResults.find(budget => budget.scope === 'day').minutes, 60));
  const wrongOffset = structuredClone(zoned); wrongOffset.plan.allocations[0].start = wrongOffset.plan.allocations[0].start.replace('+08:00', '+07:00');
  await check('offset-zone-disagreement', wrongOffset, 3, expectCode('time-zone-mismatch'));
  await control('unsupported-recurrence', input => { const value = { kind: 'unsupported', raw: 'Synthetic provider-specific recurrence.' }; input.intent.items[0].expected.recurrence = value; input.readbacks[0].fields.recurrence = calendarFields({ recurrence: value }).recurrence; bindCalendar(input); }, 'field-unreadable');
  for (const [name, mutate] of [
    ['unknown-member', input => { input.intent.matched = true; }],
    ['invalid-local-date', input => { input.intent.items[0].expected.date = '2026-02-30'; }],
    ['invalid-zone', input => { input.intent.window.timeZone = 'Synthetic/Unknown'; }],
    ['offset-is-not-named-zone', input => { input.intent.window.timeZone = '+08:00'; }],
    ['unsafe-number', input => { input.intent.maxEvidenceAgeMs = Number.MAX_SAFE_INTEGER + 1; }],
    ['unknown-origin', input => { input.readbacks[0].fields.notes.origin = 'generic-pass'; }],
    ['arbitrary-field-object', input => { input.readbacks[0].fields.notes.value = { matched: true }; }],
    ['duplicate-readback-id', input => { input.readbacks.push(structuredClone(input.readbacks[0])); }],
    ['dangling-supersession', input => { input.readbacks[0].supersedes = { readbackId: 'absent-readback', fields: ['notes'] }; }],
    ['wrong-scope-supersession', input => { const current = correctedReadback(input, 'notes', 'Synthetic replacement.'); current.identity = calendarIdentity('wrong-item'); }],
    ['dangling-inventory', input => { input.plan.inventoryIds.push('absent-inventory'); }],
    ['collection-limit', input => { input.clocks = Array.from({ length: 2001 }, () => ({})); }]
  ]) await control(name, mutate, null, 2);
  const validFile = join(directory, 'exact-notes.json'); const malformed = join(directory, 'malformed.json'); const utf8 = join(directory, 'invalid-utf8.json'); const oversized = join(directory, 'oversized.json'); const linked = join(directory, 'symlink.json'); const fifo = join(directory, 'fifo');
  await writeFile(malformed, '{'); await writeFile(utf8, Buffer.from([0xc3, 0x28])); await writeFile(oversized, ' '.repeat(2 * 1024 * 1024 + 1)); await symlink(validFile, linked); execFileSync('mkfifo', [fifo]);
  for (const file of [malformed, utf8, oversized, linked, fifo, directory]) {
    const beforeBytes = [malformed, utf8, oversized].includes(file) ? await readFile(file) : null; if (beforeBytes) await retain(file);
    await run(['calendar', '--file', file], 2, privateHome, env);
    if (beforeBytes) assert.deepEqual(await readFile(file), beforeBytes);
    report.calendar.controls.push({ name: file.slice(directory.length + 1) || 'directory', basis: 'boundary', exit: 2, status: 'invalid-input' });
  }
  const repeatedKeys = join(directory, 'duplicate-json-key.json'); const duplicateInput = calendarFixture(); const duplicateBytes = JSON.stringify(duplicateInput).replace('"schemaVersion":1', '"schemaVersion":0,"schemaVersion":1'); await writeFile(repeatedKeys, duplicateBytes); await retain(repeatedKeys);
  const lastValue = await run(['calendar', '--file', repeatedKeys], 0, privateHome, env); assert.equal(lastValue.inputDigest, digest(duplicateBytes)); assert.ok(lastValue.limits.includes('JSON.parse uses the last value for duplicate decoded object keys.'));
  report.calendar.controls.push({ name: 'standard-json-duplicate-key-semantics', basis: 'boundary', exit: 0, status: 'checked', inputDigest: lastValue.inputDigest });
  assert.equal((await readdir(directory)).includes('executor-invoked'), false, 'No calendar executor or network guard fired');
  report.calendar.guardedCommands = (await readFile(loaded, 'utf8')).trim().split('\n').length; await retain(loaded);
  const retentionControl = join(directory, 'retention-control'); await mkdir(retentionControl); const retainedControl = join(retentionControl, 'input.json'); const controlBytes = '{"synthetic":"original"}'; const controlFiles = [{ path: 'input.json', bytes: Buffer.byteLength(controlBytes), sha256: digest(controlBytes) }];
  await writeFile(retainedControl, controlBytes); await verifyCalendarRetention(retentionControl, controlFiles); await writeFile(retainedControl, '{"synthetic":"changed!"}');
  await assert.rejects(() => verifyCalendarRetention(retentionControl, controlFiles), error => error.code === 'ERR_ASSERTION' && error.message.includes('Retained Calendar'));
  report.calendar.retentionNegativeControl = { status: 'caught', expected: controlFiles[0], actualDigest: digest(await readFile(retainedControl)) };
  assert.deepEqual(await readdir(records), before); assert.deepEqual(await readFile(join(records, 'retained.bin')), originalRegister);
  await cp(directory, join(report.evidenceDir, 'calendar'), { recursive: true, filter: path => path !== fifo });
  scenario('calendar-acceptance', 'Real read-only CLI checks synthetic exact fields, current bindings, retained attempts, full inventory, source budgets, mornings, every timed Task and independent clocks. No native acceptance or executor call.');
}
