import { digest } from '../src/records.mjs';
import { fleetCapture, fleetEntities, fleetJob, fleetReceipt, fleetRoot, fleetTime } from './fleet-fixtures.mjs';

export const fleetBounds = { conditions: 10, agesMs: [-1, 0, 300000, 300001], coverage: ['complete', 'partial'], pendingSlots: [0, 1, 2, 3, 4], priorities: ['interactive', 'morning', 'heavy'], cases: 73, assumptions: 'Parsed journal, attributable but unauthenticated parent captures, cooperative caller follows each ticket once, no native tools or sender.' };
export function verifyFleetPolicy({ fleet }, check) {
  let cases = 0;
  const expect = (name, ok, message) => { cases++; check('fleet-contract', { case: name }, ok, message); };
  const rejects = work => { try { work(); return false; } catch { return true; } };
  const initial = () => fleet.fleetInitial(fleetRoot);
  const transition = (state, action, at = fleetTime) => fleet.fleetTransition(state, action, fleetRoot, at);
  const green = () => transition(initial(), { operation: 'assess', captures: fleetEntities.map(entity => fleetCapture(entity.id)) }).state;
  for (const condition of ['login-expired', 'denied-action', 'unavailable-tool', 'timeout', 'resource-pressure', 'monitoring-failed', 'workflow-failed', 'suspended', 'unknown', 'pending']) {
    const state = green(); const got = fleet.captureCondition(state.entities[1], fleetCapture('protected', condition), state, { maxAgeMs: 300000 }, fleetTime);
    expect(`condition/${condition}`, got.condition === condition, 'Fresh failure classifications stay distinct.');
  }
  for (const age of fleetBounds.agesMs) for (const complete of [true, false]) {
    const state = green(); const at = new Date(Date.parse(fleetTime) + age).toISOString(); const capture = fleetCapture('protected'); capture.receipt.coverage = { complete, gaps: complete ? [] : ['unread page'] };
    const got = fleet.captureCondition(state.entities[1], capture, state, { maxAgeMs: 300000 }, at);
    const expected = age < 0 ? 'unknown' : age > 300000 ? 'stale-source' : complete ? 'healthy' : 'unknown';
    expect(`age/${age}/${complete}`, got.condition === expected, 'Underlying source age and incomplete coverage gate current health.');
  }
  const monitor = green(); monitor.entities[0].capture = fleetCapture('monitor', 'monitoring-failed');
  expect('monitor/failure', fleet.captureCondition(monitor.entities[1], monitor.entities[1].capture, monitor, { maxAgeMs: 300000 }, fleetTime).condition === 'unknown', 'A failed monitor cannot establish dependent health.');
  const revision = { operation: 'inventory', entities: [{ ...fleetEntities[1], maxAgeMs: 1000 }], sourceRef: 'owner', reason: 'Tighten this exact source.' };
  expect('inventory/revise', transition(green(), revision).state.entities[1].expected.maxAgeMs === 1000, 'Explicit inventory revisions preserve the same controller.');
  expect('inventory/scope', rejects(() => transition(green(), { ...revision, entities: [{ ...fleetEntities[1], scope: { ...fleetEntities[1].scope, account: 'other' } }] })), 'An inventory ID cannot be rebound to another account.');
  expect('inventory/freshness', rejects(() => transition(green(), { ...revision, entities: [{ ...fleetEntities[1], maxAgeMs: 300001 }] })), 'Entity freshness cannot weaken controller age.');
  expect('schedule/window', fleet.captureCondition(green().entities[2], fleetCapture('routine', 'healthy', fleetTime, { runDueAt: '2026-10-25T11:00:00.000Z' }), green(), { maxAgeMs: 300000 }, fleetTime).issueKey === 'missed-run', 'A previous run cannot satisfy the current expected window.');
  const source = { ...green().entities[0], expected: { ...fleetEntities[0], kind: 'installed', expectedDigest: digest('artifact') } };
  const sourceCapture = { ...fleetCapture('monitor'), actualDigest: digest('artifact') };
  expect('source/digest-match', fleet.captureCondition(source, sourceCapture, green(), { maxAgeMs: 300000 }, fleetTime).condition === 'healthy', 'Matching declared source bytes establish only their scoped reported health.');
  expect('source/digest-drift', fleet.captureCondition(source, { ...sourceCapture, actualDigest: digest('older') }, green(), { maxAgeMs: 300000 }, fleetTime).condition === 'stale-source', 'Installed source identity drift stays stale despite fresh acquisition.');
  expect('source/missing-actual', fleet.captureCondition(source, fleetCapture('monitor'), green(), { maxAgeMs: 300000 }, fleetTime).condition === 'unknown', 'Missing actual source identity stays unknown.');
  expect('source/missing-expected', fleet.captureCondition({ ...source, expected: { ...source.expected, expectedDigest: undefined } }, sourceCapture, green(), { maxAgeMs: 300000 }, fleetTime).condition === 'unknown', 'Missing expected source identity stays unknown.');
  expect('source/revision-drift', fleet.captureCondition({ ...source, expected: { ...source.expected, expectedRevision: 'a'.repeat(40) } }, { ...sourceCapture, actualRevision: 'b'.repeat(40) }, green(), { maxAgeMs: 300000 }, fleetTime).condition === 'stale-source', 'Source revision drift stays separate from source age.');
  for (const [change, issue] of [[{ enabled: false }, 'disabled-run'], [{ runRef: undefined }, 'missed-run'], [{ outcomeRef: undefined }, 'outcome-missing'], [{ deliveryRef: undefined }, 'delivery-unverified']]) {
    const state = green(); expect(`schedule/${issue}`, fleet.captureCondition(state.entities[2], fleetCapture('routine', 'healthy', fleetTime, change), state, { maxAgeMs: 300000 }, fleetTime).issueKey === issue, 'Actual run, outcome and delivery remain independent.');
  }
  let failed = transition(green(), { operation: 'assess', captures: [fleetCapture('protected', 'denied-action', '2026-10-25T12:00:01.000Z')] }, '2026-10-25T12:00:01.000Z').state;
  const repeated = transition(failed, { operation: 'assess', captures: [fleetCapture('protected', 'denied-action', '2026-10-25T12:00:02.000Z')] }, '2026-10-25T12:00:02.000Z').state;
  expect('alert/unchanged', repeated.alerts.length === failed.alerts.length, 'Unchanged failure receipts cannot create another alert.');
  const dismissed = transition(failed, { operation: 'dismiss', alertId: failed.alerts[0].id, sourceRef: 'owner', reason: 'Exact episode.' }, '2026-10-25T12:00:02.000Z').state;
  expect('alert/dismiss', dismissed.alerts[0].disposition !== null && dismissed.entities[1].condition === 'denied-action', 'Dismissal preserves the original failure receipt.');
  const recovered = transition(failed, { operation: 'assess', captures: [fleetCapture('protected', 'healthy', '2026-10-25T12:00:02.000Z')] }, '2026-10-25T12:00:02.000Z').state;
  expect('alert/recovered', recovered.alerts.at(-1).condition === 'recovered', 'Fresh same-scope proof creates one recovery.');
  const recurred = transition(recovered, { operation: 'assess', captures: [fleetCapture('protected', 'denied-action', '2026-10-25T12:00:03.000Z')] }, '2026-10-25T12:00:03.000Z').state;
  expect('alert/recurrence', recurred.alerts.length === 3 && recurred.alerts[0].id !== recurred.alerts.at(-1).id, 'A later recurrence is a fresh episode.');
  const changedScope = fleetCapture(); changedScope.receipt.scope = { ...changedScope.receipt.scope, account: 'another-owner' };
  expect('scope/capture', rejects(() => transition(green(), { operation: 'assess', captures: [changedScope] })), 'Capture cannot cross account scope.');
  for (const priority of fleetBounds.priorities) for (const count of fleetBounds.pendingSlots) {
    const state = green(); state.jobs = Array.from({ length: count }, (_, index) => ({ key: digest(index), input: fleetJob(`pending-${index}`), inputDigest: digest(fleetJob(`pending-${index}`)), status: 'queued', order: index }));
    const out = transition(state, { operation: 'submit', job: fleetJob('new-job', priority) }); const capacity = priority === 'heavy' ? 2 : priority === 'morning' ? 3 : 4;
    expect(`admission/${priority}/${count}`, (out.outcome === 'backpressure') === (count >= capacity), 'Pending jobs include all reserved priority capacity.');
  }
  const request = { operation: 'submit', job: fleetJob() }; const queued = transition(green(), request).state;
  expect('job/duplicate', transition(queued, request).state.jobs.length === 1, 'Equal requests retain one stable logical job.');
  expect('job/conflict', rejects(() => transition(queued, { ...request, job: fleetJob('read-one', 'heavy') })), 'Changed contents under one identity refuse.');
  const admitted = transition(queued, { operation: 'claim', ownerRef: 'parent' }); const job = admitted.state.jobs[0];
  expect('job/admit', admitted.ticket?.ticket === job.ticket && job.status === 'attempted', 'Admission commits one parent attempt ticket.');
  const uncertain = structuredClone(admitted.state); uncertain.jobs[0].status = 'uncertain';
  uncertain.jobs.push({ ...queued.jobs[0], key: digest('other-job'), input: fleetJob('other-job'), inputDigest: digest(fleetJob('other-job')), order: 1 });
  expect('job/uncertain', transition(uncertain, { operation: 'claim', ownerRef: 'parent' }).ticket === null, 'Uncertain parent reads block fresh admission.');
  const completion = { operation: 'result', jobKey: job.key, ticket: job.ticket, checkpoint: 1, outcome: 'completed', usage: { reads: 1, bytes: 4096 }, receipt: fleetReceipt() };
  expect('job/uncertain-result', rejects(() => transition(uncertain, completion)), 'Lost outcomes need explicit reconciliation.');
  const twoStep = transition(transition(green(), { operation: 'submit', job: fleetJob('two-step', 'interactive', { steps: 2, maxReads: 2 }) }).state, { operation: 'claim', ownerRef: 'parent' }).state;
  expect('job/checkpoint', rejects(() => transition(twoStep, { ...completion, jobKey: twoStep.jobs[0].key, ticket: twoStep.jobs[0].ticket, checkpoint: 2 })), 'Result cannot skip a checkpoint.');
  expect('job/result-scope', rejects(() => transition(admitted.state, { ...completion, receipt: fleetReceipt('protected', fleetTime, { scope: { ...fleetReceipt().scope, account: 'other' } }) })), 'Result binds the admitted exact account scope.');
  expect('job/budget/reads', rejects(() => transition(admitted.state, { ...completion, usage: { reads: 2, bytes: 4096 } })), 'Cumulative declared reads cannot exceed the job budget.');
  expect('job/budget/bytes', rejects(() => transition(admitted.state, { ...completion, usage: { reads: 1, bytes: 4097 } })), 'Cumulative declared output cannot exceed the job byte budget.');
  const completed = transition(admitted.state, completion).state;
  expect('job/terminal', completed.jobs[0].status === 'completed' && transition(completed, request).state.jobs.length === 1, 'Terminal acquisition and effect identity survive repeat submit.');
  expect('job/result-dedup', transition(completed, completion).outcome === 'coalesced', 'Identical terminal results coalesce.');
  const pressure = green(); pressure.entities[0].capture = fleetCapture('monitor', 'resource-pressure'); pressure.jobs = queued.jobs;
  expect('job/pressure', transition(pressure, { operation: 'claim', ownerRef: 'parent' }).ticket === null, 'Explicit pressure defers monitoring reads.');
  let priority = transition(green(), { operation: 'submit', job: fleetJob('heavy', 'heavy') }).state;
  priority = transition(priority, { operation: 'submit', job: fleetJob('interactive', 'interactive') }).state;
  expect('job/priority', transition(priority, { operation: 'claim', ownerRef: 'parent' }).ticket.input.priority === 'interactive', 'Interactive reads precede queued heavy reads.');
  let retry = queued; let tick = Date.parse(fleetTime);
  for (let attempt = 0; attempt < 3; attempt++) {
    const at = new Date(tick).toISOString(); retry = transition(retry, { operation: 'claim', ownerRef: 'parent' }, at).state; const current = retry.jobs[0];
    retry = transition(retry, { operation: 'result', jobKey: current.key, ticket: current.ticket, checkpoint: 0, outcome: 'known-unexecuted', reason: 'Attributable no-start readback.', usage: { reads: 0, bytes: 32 }, receipt: fleetReceipt('protected', at) }, at).state;
    tick = Date.parse(retry.jobs[0].nextAt);
  }
  expect('job/retry-bound', retry.jobs[0].status === 'dead' && retry.jobs[0].failures === 3, 'Known-unexecuted retries stop after the configured failed-attempt bound.');
  const send = { operation: 'send-intent', alertId: failed.alerts[0].id, bodyDigest: digest('body'), sendRef: 'send' };
  const sending = transition(failed, send, '2026-10-25T12:00:02.000Z').state;
  expect('send/uncertain', sending.alerts[0].delivery === 'uncertain', 'Intent cannot claim delivered notification.');
  expect('send/no-repeat', rejects(() => transition(sending, send)), 'Uncertain sends cannot repeat.');
  expect('send/readback', rejects(() => transition(sending, { ...send, operation: 'send-ack', readbackRef: 'send' })), 'Separate parent readback is required.');
  const ack = transition(sending, { ...send, operation: 'send-ack', readbackRef: 'separate-readback' }, '2026-10-25T12:00:03.000Z').state;
  expect('send/ack', ack.alerts[0].delivery === 'delivered', 'Exact send and separate readback acknowledge reported delivery.');
  const root = { ...fleetRoot, hash: digest('root') }; const head = { type: 'fleet-step', hash: digest('head'), rootHash: root.hash, parentHash: root.hash, state: green() };
  expect('journal/fork', fleet.fleetState([root, head, { ...head, hash: digest('competing') }], root.responsibilityId).status === 'unknown', 'Concurrent heads remain unknown.');
  const restored = fleet.fleetView([root, head, { type: 'epoch', hash: digest('epoch'), restoredAt: fleetTime }], root.responsibilityId, fleetTime);
  expect('journal/restore', restored.status === 'suspended' && restored.inventory.every(row => row.condition === 'unknown'), 'Restored old receipts cannot establish current health.');
  expect('journal/permutation', JSON.stringify(fleet.fleetState([head, root], root.responsibilityId)) === JSON.stringify(fleet.fleetState([root, head], root.responsibilityId)), 'Projection is independent of input order.');
  return { cases };
}
