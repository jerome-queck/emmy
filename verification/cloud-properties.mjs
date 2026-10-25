import { cloudConfig } from '../src/cloud-schema.mjs';

export const cloudBounds = { evaluatedAt: '2026-10-25T12:00:00.000Z', capacityStates: ['available', 'pressure', 'unknown', 'suspended', 'dead'], agesMs: [-1, 0, 30000, 30001], priorities: ['interactive', 'morning', 'heavy'], pendingCounts: [0, 1, 2, 3, 4], duplicateStatuses: ['queued', 'running', 'retry-wait', 'finished', 'dead'], retryFailures: [0, 1, 2, 3], cases: 106, assumptions: ['Independent finite partitions of actual production functions, not a full product or liveness theorem.', 'Domain-valid immutable journal snapshots, supplied clock and measured or explicitly synthetic capacity are assumed.', 'Filesystem publication, turn ownership, process death, parser/bytes/clock acquisition, archive/restore and notification delivery require separate real CLI controls.', 'Built-in pure workload has one committed logical terminal effect; uncommitted computation may repeat. No external exactly-once or global provider enforcement.'] };
export function verifyCloudPolicy({ cloud }, check) {
  const at = cloudBounds.evaluatedAt; const time = offset => new Date(Date.parse(at) + offset).toISOString(); const config = cloudConfig({ backoffMs: 100, maxBackoffMs: 1000, maxAttempts: 3 }); const key = 'a'.repeat(64);
  let executed = 0;
  const verify = (name, condition, input = {}) => { executed++; check('cloud-admission', { case: name, ...input }, condition, name); };
  const job = (id = 'one', priority = 'heavy', units = 2, transientFailures = 0) => ({ id, priority, payload: 'bounded', units, transientFailures });
  const submit = (state, value) => cloud.cloudTransition(state, { operation: 'submit', job: value }, config, at, key);
  const tick = (state, change = {}, clock = at) => cloud.cloudTransition(state, { operation: 'tick', sample: { synthetic: true, state: 'available', observedAt: clock }, ...change }, config, clock, key);
  const fresh = () => cloud.emptyCloudState();
  for (const state of cloudBounds.capacityStates) for (const age of cloudBounds.agesMs) {
    const result = cloud.capacityDecision({ synthetic: true, state, observedAt: time(-age) }, config, at);
    verify(`capacity/${state}/${age}`, result.eligible === (state === 'available' && age >= 0 && age <= 30000));
  }
  for (const load of [0, 0.8, 0.81]) for (const memory of [0, 67108864, 67108865]) for (const disk of [0, 16777216, 16777217]) {
    const result = cloud.capacityDecision({ origin: 'observed-process', observedAt: at, loadPerCpu: load, freeMemoryBytes: memory, freeDiskBytes: disk }, config, at);
    verify(`measured/${load}/${memory}/${disk}`, result.eligible === (load <= .8 && memory >= 67108864 && disk >= 16777216));
  }
  for (const priority of cloudBounds.priorities) for (const count of cloudBounds.pendingCounts) {
    let state = fresh(); for (let n = 0; n < count; n++) state = submit(state, job(`existing-${n}`, 'interactive')).state;
    const result = submit(state, job('candidate', priority)); const allowance = { interactive: 4, morning: 3, heavy: 2 }[priority];
    verify(`reservation/${priority}/${count}`, result.outcome === (count < allowance ? 'accepted' : 'backpressure') && result.state.jobs.length <= config.maxPending);
  }
  for (const status of cloudBounds.duplicateStatuses) for (const conflict of [false, true]) {
    const initial = submit(fresh(), job()).state; initial.jobs[0].status = status;
    const duplicate = submit(initial, { ...job(), ...(conflict ? { payload: 'changed' } : {}) });
    verify(`duplicate/${status}/${conflict}`, duplicate.outcome === (conflict ? 'identity-conflict' : 'coalesced') && duplicate.state.jobs.length === 1 && duplicate.state.jobs[0].status === status);
  }
  for (const order of [['heavy', 'morning', 'interactive'], ['heavy', 'interactive', 'morning'], ['morning', 'heavy', 'interactive'], ['morning', 'interactive', 'heavy'], ['interactive', 'heavy', 'morning'], ['interactive', 'morning', 'heavy']]) {
    let state = fresh(); for (const priority of order) state = submit(state, job(priority, priority)).state;
    const result = tick(state); verify(`priority/${order.join('-')}`, result.state.jobs.find(value => value.completedUnits === 1)?.input.priority === 'interactive' && result.state.jobs.filter(value => value.status === 'running').length === 1);
  }
  for (const failures of cloudBounds.retryFailures) {
    const state = submit(fresh(), job('one', 'heavy', 2, 8)).state; state.jobs[0].failures = failures;
    const result = tick(state); const current = result.state.jobs[0];
    verify(`retry/bound/${failures}`, current.status === (failures + 1 >= config.maxAttempts ? 'dead' : 'retry-wait') && current.completedUnits === 0);
    verify(`retry/backoff/${failures}`, Date.parse(current.nextEligibleAt) === Date.parse(at) + Math.min(1000, 100 * 2 ** failures));
  }
  let state = submit(fresh(), job()).state;
  const first = tick(state); verify('checkpoint/one', first.state.jobs[0].completedUnits === 1 && first.state.jobs[0].output === null && first.state.jobs[0].status === 'running');
  const second = tick(first.state); verify('checkpoint/terminal', second.state.jobs[0].completedUnits === 2 && second.state.jobs[0].output === second.state.jobs[0].accumulator && second.state.jobs[0].status === 'finished');
  const repeat = tick(second.state); verify('checkpoint/finished-no-repeat', repeat.outcome === 'idle' && JSON.stringify(repeat.state.jobs) === JSON.stringify(second.state.jobs));
  const waiting = submit(fresh(), job('retry', 'heavy', 2, 1)).state; const failed = tick(waiting); const early = tick(failed.state, {}, time(99)); verify('retry/not-eligible', early.outcome === 'backoff' && early.state.jobs[0].failures === 1);
  const later = tick(failed.state, {}, time(100)); verify('retry/resumes', later.outcome === 'checkpointed' && later.state.jobs[0].completedUnits === 1);
  const unknown = tick(state, { sample: { synthetic: true, state: 'unknown', observedAt: at } }); const again = tick(unknown.state, { sample: { synthetic: true, state: 'unknown', observedAt: at } });
  verify('alert/deduplicated', unknown.newEscalations.length === 1 && again.newEscalations.length === 0 && again.state.escalations.length === 1 && again.state.escalations[0].delivery === 'pending');
  const suspended = cloud.cloudTransition(state, { operation: 'suspend', reason: 'explicit' }, config, at, key); const stopped = tick(suspended.state); verify('lifecycle/suspended', stopped.outcome === 'suspended' && stopped.state.jobs[0].completedUnits === 0);
  const resumed = cloud.cloudTransition(suspended.state, { operation: 'resume', reason: 'explicit' }, config, at, key); verify('lifecycle/resumed', tick(resumed.state).outcome === 'checkpointed');
  const recovered = cloud.cloudTransition(first.state, { operation: 'recover' }, config, at, key); verify('checkpoint/recovered', recovered.state.jobs[0].status === 'queued' && recovered.state.jobs[0].completedUnits === 1 && recovered.state.jobs[0].accumulator === first.state.jobs[0].accumulator);
  const pressure = tick(first.state, { sample: { synthetic: true, state: 'pressure', observedAt: at } }); verify('capacity/no-execution', pressure.outcome === 'deferred' && JSON.stringify(pressure.state.jobs) === JSON.stringify(first.state.jobs) && pressure.newEscalations.length === 0);
  const report = { operation: 'health', issue: { code: 'signin-blocked', scope: 'one', sourceRef: 'reported-fixture' } }; const blocked = cloud.cloudTransition(state, report, config, at, key); const blockedAgain = cloud.cloudTransition(blocked.state, report, config, at, key); verify('alert/signin-deduplicated', blocked.newEscalations.length === 1 && blockedAgain.newEscalations.length === 0 && blockedAgain.state.escalations[0].delivery === 'pending');
  const root = { type: 'cloud-request', responsibilityId: 'one', hash: '1'.repeat(64) };
  const child = { type: 'cloud-step', responsibilityId: 'one', rootHash: root.hash, parentHash: root.hash, hash: '2'.repeat(64), state: fresh() };
  verify('lineage/unconfigured', cloud.cloudState([], 'one').status === 'unconfigured');
  verify('lineage/root', cloud.cloudState([root], 'one').head.hash === root.hash);
  verify('lineage/child', cloud.cloudState([root, child], 'one').head.hash === child.hash);
  verify('lineage/wrong-controller', cloud.cloudState([root], 'other').status === 'wrong-controller');
  verify('lineage/root-conflict', cloud.cloudState([root, { ...root, hash: '3'.repeat(64), responsibilityId: 'two' }], 'one').status === 'conflict');
  verify('lineage/branch-conflict', cloud.cloudState([root, child, { ...child, hash: '3'.repeat(64) }], 'one').status === 'conflict');
  verify('lineage/permutation', JSON.stringify(cloud.cloudState([root, child], 'one')) === JSON.stringify(cloud.cloudState([child, root], 'one')));
  const small = cloudConfig({ maxPendingBytes: 9 }); const one = cloud.cloudTransition(fresh(), { operation: 'submit', job: job() }, small, at, key); const overflow = cloud.cloudTransition(one.state, { operation: 'submit', job: job('two') }, small, at, key); verify('queue/bytes', overflow.outcome === 'backpressure' && overflow.state.jobs.length === 1);
  const otherEffect = cloud.cloudTransition(fresh(), { operation: 'submit', job: job() }, config, at, 'b'.repeat(64)); verify('identity/effect-binding', otherEffect.key !== submit(fresh(), job()).key);
  return { cases: executed };
}
