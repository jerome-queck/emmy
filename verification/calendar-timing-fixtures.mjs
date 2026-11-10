import { assessCalendarRegister } from '../src/calendar-register.mjs';
import { calendarLocalClock } from '../src/calendar-timing.mjs';
import { bindRegister, registerFixture } from './calendar-register-fixtures.mjs';

export function timingRegisterFixture(evaluatedAt) {
  const input = registerFixture(evaluatedAt);
  input.request.window.timeZone = 'Asia/Singapore';
  input.snapshot.scope.window.timeZone = 'Asia/Singapore';
  for (const schedule of input.request.taskSchedules) schedule.window.timeZone = 'Asia/Singapore';
  input.request.visualReview.window.timeZone = 'Asia/Singapore';
  for (const operation of input.request.operations) {
    for (const key of ['start', 'end']) {
      const local = calendarLocalClock(operation.changes[key], 'Asia/Singapore');
      operation.changes[key] = `${local.date}T${local.time}:00+08:00`;
    }
    operation.changes.date = calendarLocalClock(operation.changes.start, 'Asia/Singapore').date;
    operation.changes.timeZone = 'Asia/Singapore';
  }
  return bindRegister(input);
}

export const canonicalTimingFor = operation => ({ schemaVersion: 1, sourceInterface: 'canonical-plan', timeZone: operation.changes.timeZone, identity: structuredClone(operation.identity), interval: { start: operation.changes.start, end: operation.changes.end }, durationMinutes: operation.changes.durationMinutes });

export function syntheticTimingTarget(operation, targetInterface = 'calendar-task-editor') {
  return { identity: structuredClone(operation.identity), sourceInterface: 'canonical-plan', canonicalTimeZone: 'Asia/Singapore', targetInterface, inputTimeZone: targetInterface === 'standalone-tasks-editor' ? 'Asia/Bangkok' : 'Asia/Singapore', executionEnvironment: { kind: 'dot-cloud', id: 'synthetic-dot-computer', epoch: 'synthetic-epoch-one' } };
}

export function syntheticZoneObservation(target, observedAt) {
  return { accountId: target.identity.accountId, targetInterface: target.targetInterface, inputTimeZone: target.inputTimeZone, executionEnvironment: structuredClone(target.executionEnvironment), systemTimeZone: 'Asia/Bangkok', observedAt, evidenceRef: 'synthetic-fresh-editor-zone', roundTripEvidenceRef: target.targetInterface === 'standalone-tasks-editor' ? 'synthetic-reported-standalone-roundtrip' : null };
}

export function syntheticTimingReadback(prepared, observedAt) {
  return { accountId: prepared.canonical.identity.accountId, nativeIdentity: structuredClone(prepared.canonical.identity), projectionId: null, mapping: null, targetInterface: 'calendar-task-editor', timeZone: 'Asia/Singapore', executionEnvironment: structuredClone(prepared.target.executionEnvironment), observedAt, evidenceRef: 'synthetic-independent-calendar-sgt-native-task-capture', start: calendarLocalClock(prepared.canonical.interval.start, 'Asia/Singapore'), end: calendarLocalClock(prepared.canonical.interval.end, 'Asia/Singapore'), durationMinutes: prepared.canonical.durationMinutes };
}

export function syntheticTimingPacket(input, plan = null, targetInterface = 'calendar-task-editor') {
  const operations = plan?.operations ?? assessCalendarRegister(input.snapshot, input.request, { evaluatedAt: input.evaluatedAt }).proposals;
  const targets = plan?.timing?.targets ?? operations.filter(row => row.prepared.operation.identity.containerKind === 'task-list' && row.prepared.operation.changes.start).map(row => ({ operationDigest: row.operationDigest, target: syntheticTimingTarget(row.prepared.operation, targetInterface) }));
  return { schemaVersion: 1, targets: structuredClone(targets), observations: targets.map(row => {
    const operation = operations.find(operation => operation.operationDigest === row.operationDigest).prepared.operation;
    return { operationDigest: row.operationDigest, zoneObservation: syntheticZoneObservation(row.target, input.evaluatedAt), readback: syntheticTimingReadback({ canonical: canonicalTimingFor(operation), target: row.target }, input.evaluatedAt) };
  }) };
}

export const syntheticTimingReceipt = (prepared, observedAt) => ({ preparedDigest: prepared.preparedDigest, submittedInput: structuredClone(prepared.editorInput), readback: syntheticTimingReadback(prepared, observedAt) });
