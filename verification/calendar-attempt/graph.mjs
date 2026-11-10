import assert from 'node:assert/strict';
import { registerFixture, registerAttempt, refreshRegisterEvidence, registerHash } from '../calendar-register-fixtures.mjs';

export const rules = ['UncertainHeld', 'NoEffectExact', 'SavedExact', 'TerminalHeld'];
export const limits = { depth: 3, nodes: 64, edges: 64, attempts: 1 };
const good = () => Object.fromEntries(rules.map(rule => [rule, true]));
const copy = value => structuredClone(value);

function choices(path) {
  if (!path.length) return ['initial'];
  if (path.length === 1) return ['uncertain'];
  if (path.length === 2) return ['unresolved', 'no-effect', 'rebased', 'old-snapshot', 'partial', 'stale-schedule', 'wrong-schedule-id', 'saved', 'wrong-end', 'protected-drift', 'denied', 'consumed'];
  return [];
}

export function evidence(input, choice, proposal) {
  if (choice === 'uncertain') input.request.attempts.push(registerAttempt(input, proposal));
  if (['no-effect', 'rebased', 'old-snapshot', 'partial', 'stale-schedule', 'wrong-schedule-id', 'saved', 'wrong-end', 'protected-drift'].includes(choice)) {
    const attempt = input.request.attempts[0];
    const old = input.request.snapshotDigest;
    if (choice === 'rebased') {
      const task = input.snapshot.taskLists[0].tasks[0];
      task.title = 'Owner changed this task';
      input.request.taskSchedules[0].taskDigest = registerHash(task);
      input.request.operations[0].baselineDigest = registerHash({ native: task, intervals: [] });
    }
    if (['saved', 'wrong-end', 'protected-drift'].includes(choice)) {
      input.request.taskSchedules[0].intervals = [{ start: proposal.changes.start, end: choice === 'wrong-end' ? '2026-10-27T10:30:00Z' : proposal.changes.end }];
      const task = input.snapshot.taskLists[0].tasks[0];
      task.etag = 'synthetic-after-save'; task.updated = input.evaluatedAt;
      if (choice === 'protected-drift') {
        task.notes = 'unrequested drift';
      }
      input.request.taskSchedules[0].taskDigest = registerHash(task);
    }
    if (choice === 'partial') input.snapshot.discovery.calendars.complete = false;
    refreshRegisterEvidence(input);
    if (choice === 'stale-schedule') input.request.taskSchedules[0].observedAt = attempt.prepared.capturedAt;
    if (choice === 'wrong-schedule-id') input.request.taskSchedules[0].identity.nativeId = 'other-task';
    attempt.resolution = { kind: ['saved', 'wrong-end', 'protected-drift'].includes(choice) ? 'saved' : 'no-effect', snapshotDigest: choice === 'old-snapshot' ? old : input.request.snapshotDigest, evidenceRef: 'synthetic-declared-evidence' };
  }
  if (choice === 'denied' || choice === 'consumed') {
    refreshRegisterEvidence(input);
    input.request.attempts[0].state = choice;
    input.request.attempts[0].resolution = { kind: 'no-effect', snapshotDigest: input.request.snapshotDigest, evidenceRef: 'synthetic-declared-evidence' };
  }
  return input;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function witnesses(input) {
  const attempt = input.request.attempts[0], operation = input.request.operations[0];
  if (!attempt) return { attempt: false };
  const row = input.snapshot.taskLists[0].tasks[0], schedule = input.request.taskSchedules[0];
  const baseline = { native: row, intervals: schedule.intervals.map(interval => ({ start: new Date(interval.start).toISOString(), end: new Date(interval.end).toISOString() })) };
  const exactIdentity = same(attempt.identity, operation.identity) && same(schedule.identity, operation.identity) && row.id === operation.identity.nativeId;
  const effect = registerHash({ identity: operation.identity, changes: operation.changes, sourceId: operation.sourceId });
  const matchingEffect = attempt.effectKey === effect && same(attempt.prepared.operation.changes, operation.changes);
  const complete = input.snapshot.discovery.calendars.complete && input.snapshot.discovery.taskLists.complete && input.snapshot.calendars.every(c => c.collection.complete) && input.snapshot.taskLists.every(c => c.collection.complete) && schedule.complete;
  const later = Date.parse(input.snapshot.acquisition.startedAt) > Date.parse(attempt.attemptedAt) && Date.parse(schedule.observedAt) > Date.parse(attempt.attemptedAt);
  const current = attempt.resolution?.snapshotDigest === input.request.snapshotDigest;
  const evidence = Boolean(attempt.resolution?.evidenceRef) && exactIdentity && matchingEffect && complete && later && current;
  const before = same(attempt.prepared.baseline, baseline) && operation.baselineDigest === registerHash(baseline);
  const changes = operation.changes;
  const exactInterval = schedule.intervals.length === 1 && Date.parse(schedule.intervals[0].start) === Date.parse(changes.start) && Date.parse(schedule.intervals[0].end) === Date.parse(changes.end) && (Date.parse(changes.end) - Date.parse(changes.start)) / 60000 === changes.durationMinutes;
  const protectedFields = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['etag', 'updated', 'title', 'due'].includes(key)));
  const saved = exactInterval && row.title === changes.title && row.due.slice(0, 10) === changes.date && same(protectedFields(attempt.prepared.baseline.native), protectedFields(row));
  return { attempt: true, terminal: ['denied', 'consumed'].includes(attempt.state), noEffect: evidence && attempt.resolution?.kind === 'no-effect' && before, saved: evidence && attempt.resolution?.kind === 'saved' && saved, exactIdentity, matchingEffect, complete, later, current, before, exactInterval };
}

export function graph(api) {
  const states = [{ input: registerFixture(), path: [], rules: good() }], edges = [];
  let frontier = [0];
  for (let depth = 0; depth < limits.depth; depth++) {
    const next = [];
    for (const from of frontier) for (const choice of choices(states[from].path)) {
      const prior = states[from]; const input = evidence(copy(prior.input), choice, prior.proposal);
      assert.ok(input.request.attempts.length <= limits.attempts, 'attempt bound exceeded');
      const before = copy(input);
      const result = api.assessCalendarRegister(input.snapshot, input.request, { evaluatedAt: input.evaluatedAt });
      assert.deepEqual(input, before);
      const proposal = result.proposals[0]; assert.ok(proposal && result.execution === 'none');
      const checks = good(), facts = witnesses(input), attempt = input.request.attempts[0];
      if (facts.attempt && !facts.terminal && !attempt.resolution) checks.UncertainHeld = proposal.status === 'blocked' && proposal.findings.includes('reconcile-uncertain-effect');
      if (facts.attempt && !facts.terminal && attempt.resolution?.kind === 'no-effect' && !facts.noEffect) checks.NoEffectExact = proposal.status === 'blocked' && proposal.findings.includes('reconcile-uncertain-effect');
      if (facts.attempt && !facts.terminal && attempt.resolution?.kind === 'saved' && !facts.saved) checks.SavedExact = proposal.status === 'blocked' && proposal.findings.includes('reconcile-uncertain-effect');
      if (facts.terminal) checks.TerminalHeld = proposal.status === 'blocked' && proposal.findings.includes('terminal-attempt');
      if (!facts.terminal && facts.noEffect) assert.equal(proposal.status, 'proposed', 'exact no-effect evidence');
      if (!facts.terminal && facts.saved) assert.equal(proposal.status, 'already-saved', 'exact saved evidence');
      if (['initial', 'no-effect'].includes(choice)) assert.equal(proposal.status, 'proposed', choice);
      if (choice === 'saved') assert.equal(proposal.status, 'already-saved');
      const to = states.length; states.push({ input, proposal, facts, path: [...prior.path, choice], rules: checks });
      edges.push({ from, to, choice });
      assert.ok(states.length <= limits.nodes && edges.length <= limits.edges, 'graph bound exceeded');
      if (Object.values(checks).every(Boolean)) next.push(to);
    }
    frontier = next;
  }
  return { states, edges, limits };
}

export function spec(g) {
  const successors = g.states.map(() => []);
  for (const edge of g.edges) successors[edge.from].push(edge.to + 1);
  return `---- MODULE CalendarAttempt ----\nEXTENDS Naturals, Sequences\nVARIABLE node\nSuccessors == <<${successors.map((s, i) => `{${(s.length ? s : [i + 1]).join(',')}}`).join(',')}>>\nInit == node = 1\nStep == node' \\in Successors[node]\nNext == Step\n${rules.map(rule => `${rule} == node \\notin {${g.states.flatMap((s, i) => s.rules[rule] ? [] : [i + 1]).join(',')}}`).join('\n')}\n====\n`;
}
export const cfg = `INIT Init\nNEXT Next\n${rules.map(rule => `INVARIANT ${rule}`).join('\n')}\n`;
