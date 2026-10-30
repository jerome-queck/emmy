import { canonical, digest } from './records.mjs';
import { assessCalendarRegister, calendarSnapshotDigest } from './calendar-register.mjs';
import { prepareCalendarTiming, validatePreparedCalendarTiming, assessCalendarTimingReadback } from './calendar-timing.mjs';

const same = (a, b) => canonical(a) === canonical(b);
const hash = value => digest(canonical(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 16384;
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const need = (condition, message) => { if (!condition) throw new Error(message); };
const fields = (value, keys, name) => need(object(value) && Object.keys(value).every(key => keys.includes(key)), `${name}: unsupported field`);
const intent = request => ({ window: request.window, workingIntervals: request.workingIntervals, mealPolicy: request.mealPolicy, protectedIdentities: request.protectedIdentities, sources: request.sources, ownerDone: request.ownerDone, lifecycle: request.lifecycle, policy: request.policy ?? null });
const itemType = identity => identity.containerKind === 'task-list' ? 'task' : 'event';
const timed = operation => ['date', 'start', 'end', 'durationMinutes', 'timeZone'].some(key => Object.hasOwn(operation.changes, key));
const completeTiming = operation => ['start', 'end', 'durationMinutes', 'timeZone'].every(key => Object.hasOwn(operation.changes, key));
const canonicalTiming = operation => ({ schemaVersion: 1, sourceInterface: 'canonical-plan', timeZone: operation.changes.timeZone, identity: operation.identity, interval: { start: operation.changes.start, end: operation.changes.end }, durationMinutes: operation.changes.durationMinutes });

function timingPacket(value) {
  if (value === undefined) return null;
  fields(value, ['schemaVersion', 'targets', 'observations'], 'handoff timing');
  need(value.schemaVersion === 1 && Array.isArray(value.targets) && Array.isArray(value.observations) && value.targets.length <= 2000 && value.observations.length <= 2000, 'Invalid handoff timing contract');
  for (const [entries, name, keys] of [[value.targets, 'timing selector', ['operationDigest', 'target']], [value.observations, 'timing observation', ['operationDigest', 'zoneObservation', 'readback']]]) {
    const ids = new Set();
    for (const row of entries) {
      fields(row, keys, name);
      need(sha(row.operationDigest) && !ids.has(row.operationDigest), 'Invalid or duplicate timing operation selector');
      ids.add(row.operationDigest);
    }
  }
  return value;
}

export function assessCalendarHandoff(snapshot, request, packet, { evaluatedAt = new Date().toISOString() } = {}) {
  fields(packet, ['schemaVersion', 'stage', 'executor', 'policyDigest', 'coordinationDefinitionHash', 'plan', 'operationDigest', 'preflights', 'receipts', 'timing'], 'handoff');
  need(packet.schemaVersion === 1 && ['plan', 'preflight', 'accept'].includes(packet.stage) && sha(packet.policyDigest) && sha(packet.coordinationDefinitionHash) && stamp(evaluatedAt), 'Invalid versioned handoff');
  need(packet.executor === (packet.stage === 'preflight' ? 'local-executor' : 'dot-cloud'), 'Cloud plans and accepts; a local executor only preflights an exact plan');
  const assessment = assessCalendarRegister(snapshot, request, { evaluatedAt });
  const findings = [];
  const add = code => { if (!findings.includes(code)) findings.push(code); };
  const timing = timingPacket(packet.timing);
  const timedOperations = request.operations.filter(timed);
  if (timedOperations.some(operation => itemType(operation.identity) !== 'task')) add('unsupported-timing-interface');
  if (timedOperations.some(operation => !completeTiming(operation))) add('complete-canonical-timing-required');
  if (timedOperations.length && (!timing || request.window.timeZone !== 'Asia/Singapore')) add('timing-contract-required');
  const outcome = (status, plan, reports = [], preflight = null) => ({ schemaVersion: 1, kind: 'calendar-handoff', stage: packet.stage, status, execution: 'none', assurance: 'declared-exact-plan-and-reported-native-evidence', policyAssurance: 'digest-binding-only-external-policy-validation-required', evaluatedAt, snapshotDigest: calendarSnapshotDigest(snapshot), plan, reports, preflight, findings, assessment, next: status === 'preflight-ready' ? 'A separately authorized local executor may implement only this exact retained operation after cloud policy validation; this result grants no authority.' : status === 'accepted-reported' ? 'Retain original attempts, local receipts and this independent final-window assessment.' : 'Return gaps, changed intent or live errors to Emmy/cloud. Do not improvise or retry uncertain effects.', limits: ['All native captures, executor labels, policy digests, retained preflight reports and complete history remain reported; this checker authenticates none of them.', 'This boundary applies existing native-ID operations only and supplies no creator, writer, dispatcher, scheduler or complete preference engine.'] });
  if (packet.stage === 'plan') {
    need(packet.plan === undefined && packet.receipts === undefined && packet.preflights === undefined && packet.operationDigest === undefined, 'A new cloud plan cannot borrow execution receipts');
    if (assessment.status !== 'proposed' || assessment.proposals.length === 0 || assessment.proposals.some(row => row.status !== 'proposed')) add('cloud-assessment-not-ready');
    const required = assessment.proposals.filter(row => row.prepared && timed(row.prepared.operation) && completeTiming(row.prepared.operation) && itemType(row.identity) === 'task');
    if (timing && (!same(timing.targets.map(row => row.operationDigest).sort(), required.map(row => row.operationDigest).sort()) || timing.observations.some(row => !required.some(operation => row.operationDigest === operation.operationDigest)))) add('timing-targets-changed');
    if (timing) for (const row of required) {
      const target = timing.targets.find(entry => entry.operationDigest === row.operationDigest)?.target;
      const observation = timing.observations.find(entry => entry.operationDigest === row.operationDigest)?.zoneObservation;
      if (!target || !observation) { add('timing-contract-required'); continue; }
      for (const code of prepareCalendarTiming(canonicalTiming(row.prepared.operation), target, observation, { evaluatedAt, maxEvidenceAgeMs: request.maxEvidenceAgeMs }).findings) add(code);
    }
    if (findings.length) return outcome('return-to-cloud', null);
    const body = structuredClone({ schemaVersion: 1, coordinatorExecutor: 'dot-cloud', coordinationDefinitionHash: packet.coordinationDefinitionHash, snapshotDigest: assessment.snapshotDigest, policyDigest: packet.policyDigest, issuedAt: evaluatedAt, maxEvidenceAgeMs: request.maxEvidenceAgeMs, window: request.window, contextDigest: hash(intent(request)), operations: assessment.proposals.map(row => ({ prepared: row.prepared, operationDigest: row.operationDigest, effectKey: row.effectKey, itemType: itemType(row.identity) })), ...(required.length ? { timing: { schemaVersion: 1, targets: timing.targets } } : {}) });
    return outcome('cloud-plan-ready', { ...body, planDigest: hash(body) });
  }
  const plan = packet.plan;
  fields(plan, ['schemaVersion', 'coordinatorExecutor', 'coordinationDefinitionHash', 'snapshotDigest', 'policyDigest', 'issuedAt', 'maxEvidenceAgeMs', 'window', 'contextDigest', 'operations', 'planDigest', 'timing'], 'plan');
  const { planDigest, ...body } = plan;
  need(plan.schemaVersion === 1 && plan.coordinatorExecutor === 'dot-cloud' && sha(plan.coordinationDefinitionHash) && sha(planDigest) && planDigest === hash(body) && sha(plan.snapshotDigest) && sha(plan.policyDigest) && sha(plan.contextDigest) && stamp(plan.issuedAt) && Number.isSafeInteger(plan.maxEvidenceAgeMs) && plan.maxEvidenceAgeMs > 0 && plan.maxEvidenceAgeMs <= 86400000 && Array.isArray(plan.operations) && plan.operations.length > 0 && plan.operations.length <= 2000, 'Invalid retained cloud plan');
  const ids = new Set();
  for (const row of plan.operations) {
    fields(row, ['prepared', 'operationDigest', 'effectKey', 'itemType'], 'planned operation');
    fields(row.prepared, ['snapshotDigest', 'operation', 'baseline', 'capturedAt', 'intentDigest'], 'prepared operation');
    const operation = row.prepared?.operation;
    need(object(operation) && text(operation.id) && object(operation.identity) && ['calendar', 'task-list'].includes(operation.identity.containerKind) && !ids.has(operation.id), 'Invalid or duplicate planned identity');
    ids.add(operation.id);
    need(stamp(row.prepared.capturedAt) && Date.parse(row.prepared.capturedAt) <= Date.parse(plan.issuedAt) && object(row.prepared.baseline) && hash(row.prepared.baseline) === operation.baselineDigest && sha(row.prepared.intentDigest) && row.operationDigest === hash({ schemaVersion: 1, ...row.prepared }) && row.prepared.snapshotDigest === plan.snapshotDigest && row.itemType === itemType(operation.identity) && row.effectKey === hash({ identity: operation.identity, changes: operation.changes, sourceId: operation.sourceId }), 'Changed prepared operation or representation');
  }
  const requiredTiming = plan.operations.filter(row => timed(row.prepared.operation));
  if (requiredTiming.length && (!plan.timing || !timing)) add('timing-contract-required');
  if (requiredTiming.some(row => !completeTiming(row.prepared.operation))) add('complete-canonical-timing-required');
  if (requiredTiming.some(row => row.itemType !== 'task')) add('unsupported-timing-interface');
  if (plan.timing) {
    fields(plan.timing, ['schemaVersion', 'targets'], 'planned timing');
    need(plan.timing.schemaVersion === 1 && Array.isArray(plan.timing.targets), 'Invalid retained timing selectors');
    if (!same(plan.timing.targets.map(row => row.operationDigest).sort(), requiredTiming.map(row => row.operationDigest).sort()) || !same(plan.timing.targets, timing?.targets)) add('timing-targets-changed');
    if (timing?.observations.some(row => !plan.timing.targets.some(target => target.operationDigest === row.operationDigest))) add('timing-targets-changed');
  }
  if (plan.policyDigest !== packet.policyDigest || plan.contextDigest !== hash(intent(request)) || plan.coordinationDefinitionHash !== packet.coordinationDefinitionHash) add('policy-or-context-changed');
  if (request.maxEvidenceAgeMs > plan.maxEvidenceAgeMs) add('evidence-age-widened');
  if (!same(request.window, plan.window) || !same(request.operations, plan.operations.map(row => row.prepared.operation))) add('exact-plan-changed');
  if (Date.parse(plan.issuedAt) > Date.parse(snapshot.acquisition.startedAt) || Date.parse(plan.issuedAt) > Date.parse(evaluatedAt)) add('preflight-predates-plan');
  if (!assessment.availability.complete || assessment.findings.length) add('current-assessment-not-ready');
  const receipts = packet.receipts ?? [];
  const preflights = packet.preflights ?? [];
  need(Array.isArray(preflights) && preflights.length <= 2000, 'Invalid retained preflights');
  for (const preflight of preflights) {
    fields(preflight, ['schemaVersion', 'status', 'planDigest', 'operationDigest', 'snapshotDigest', 'policyDigest', 'coordinationDefinitionHash', 'baselineDigest', 'observedAt', 'evidenceOldestAt', 'maxEvidenceAgeMs', 'validUntil', 'assessmentDigest', 'preflightDigest', 'timing'], 'preflight');
    const { preflightDigest, ...body } = preflight;
    const row = plan.operations.find(row => row.operationDigest === preflight.operationDigest);
    need(preflight.schemaVersion === 1 && preflight.status === 'preflight-ready' && preflight.preflightDigest === hash(body) && preflight.planDigest === planDigest && row && preflight.baselineDigest === row.prepared.operation.baselineDigest && preflight.policyDigest === plan.policyDigest && preflight.coordinationDefinitionHash === plan.coordinationDefinitionHash && sha(preflight.snapshotDigest) && sha(preflight.assessmentDigest) && stamp(preflight.observedAt) && stamp(preflight.evidenceOldestAt) && stamp(preflight.validUntil) && Number.isSafeInteger(preflight.maxEvidenceAgeMs) && preflight.maxEvidenceAgeMs > 0 && preflight.maxEvidenceAgeMs <= plan.maxEvidenceAgeMs && Date.parse(preflight.evidenceOldestAt) <= Date.parse(preflight.observedAt) && Date.parse(preflight.observedAt) >= Date.parse(plan.issuedAt) && Date.parse(preflight.validUntil) >= Date.parse(preflight.observedAt) && Date.parse(preflight.validUntil) === Date.parse(preflight.evidenceOldestAt) + preflight.maxEvidenceAgeMs, 'Invalid exact-operation preflight');
    if (timed(row.prepared.operation)) {
      if (!preflight.timing) add('timing-contract-required');
      else {
        validatePreparedCalendarTiming(preflight.timing);
        if (!same(preflight.timing.canonical, canonicalTiming(row.prepared.operation)) || !same(preflight.timing.target, plan.timing?.targets.find(target => target.operationDigest === row.operationDigest)?.target) || preflight.timing.maxEvidenceAgeMs !== preflight.maxEvidenceAgeMs || Date.parse(preflight.timing.evidenceOldestAt) < Date.parse(preflight.evidenceOldestAt) || Date.parse(preflight.timing.evidenceOldestAt) > Date.parse(preflight.observedAt)) add('original-timing-preparation-required');
      }
    }
  }
  need(Array.isArray(receipts) && receipts.length <= 10000, 'Invalid local receipts');
  const reports = [];
  const verified = new Set();
  const latest = new Map();
  const refs = new Map();
  const attemptTimes = new Map();
  let previousTime = -Infinity;
  for (const receipt of receipts) {
    fields(receipt, ['planDigest', 'operationDigest', 'preflightDigest', 'identity', 'itemType', 'outcome', 'attemptedAt', 'observedAt', 'completedEffectKeys', 'evidenceRef', 'reason', 'timing'], 'receipt');
    need(receipt.planDigest === planDigest && ['verified', 'failed', 'denied', 'pending', 'uncertain'].includes(receipt.outcome) && stamp(receipt.attemptedAt) && stamp(receipt.observedAt) && Date.parse(receipt.attemptedAt) >= Date.parse(plan.issuedAt) && Date.parse(receipt.attemptedAt) <= Date.parse(receipt.observedAt) && Date.parse(receipt.observedAt) <= Date.parse(evaluatedAt) && Date.parse(receipt.observedAt) >= previousTime && text(receipt.evidenceRef) && Array.isArray(receipt.completedEffectKeys) && new Set(receipt.completedEffectKeys).size === receipt.completedEffectKeys.length && receipt.completedEffectKeys.every(key => plan.operations.some(row => row.effectKey === key)), 'Invalid correlated local receipt');
    const priorReportTime = previousTime;
    previousTime = Date.parse(receipt.observedAt);
    need(!refs.has(receipt.evidenceRef) || refs.get(receipt.evidenceRef) === hash(receipt), 'A retained receipt reference changed');
    refs.set(receipt.evidenceRef, hash(receipt));
    const row = plan.operations.find(row => row.operationDigest === receipt.operationDigest);
    const preflight = preflights.find(entry => entry.preflightDigest === receipt.preflightDigest && entry.operationDigest === receipt.operationDigest);
    if (!preflight || Date.parse(receipt.attemptedAt) < Date.parse(preflight.observedAt) || Date.parse(receipt.attemptedAt) > Date.parse(preflight.validUntil)) add('successful-preflight-required');
    if (!request.attempts.some(entry => entry.operationDigest === receipt.operationDigest && entry.attemptedAt === receipt.attemptedAt)) add('original-before-state-attempt-required');
    if (!attemptTimes.has(receipt.operationDigest)) {
      if (preflight && (Date.parse(preflight.observedAt) <= priorReportTime || Date.parse(preflight.evidenceOldestAt) <= Math.max(priorReportTime, Date.parse(plan.issuedAt))) || Date.parse(receipt.attemptedAt) <= priorReportTime) add('preflight-predates-prior-local-effect');
      if ([...latest.values()].some(entry => entry.outcome !== 'verified')) add('unresolved-prior-effect-before-attempt');
    }
    if (attemptTimes.has(receipt.operationDigest) && attemptTimes.get(receipt.operationDigest) !== receipt.attemptedAt) add('new-local-attempt-requires-cloud-plan');
    attemptTimes.set(receipt.operationDigest, receipt.attemptedAt);
    if (!row || !same(row.prepared.operation.identity, receipt.identity) || row.itemType !== receipt.itemType) add('receipt-target-or-type-changed');
    if (receipt.outcome !== 'verified') need(text(receipt.reason), 'A local failure requires its exact reason');
    let timingVerified = true;
    if (row && timed(row.prepared.operation) && receipt.outcome === 'verified') {
      if (!preflight?.timing || !receipt.timing) { add('timing-receipt-required'); timingVerified = false; }
      else {
        const result = assessCalendarTimingReadback(preflight.timing, receipt.timing, { evaluatedAt: receipt.observedAt, attemptedAt: receipt.attemptedAt });
        result.findings.forEach(add); timingVerified = result.status === 'timing-verified-reported';
      }
    }
    reports.push({ operationId: row?.prepared.operation.id ?? null, operationDigest: receipt.operationDigest, target: receipt.identity, itemType: receipt.itemType, outcome: receipt.outcome, attemptedAt: receipt.attemptedAt, completedEffectKeys: timingVerified ? receipt.completedEffectKeys : [], evidenceRef: receipt.evidenceRef, reason: receipt.reason ?? null });
    if (row) latest.set(row.operationDigest, receipt);
    if (receipt.outcome === 'denied') add('local-denied');
    if (row && receipt.outcome === 'verified' && timingVerified) verified.add(row.operationDigest);
    for (const key of receipt.completedEffectKeys) if (!plan.operations.some(row => row.effectKey === key && verified.has(row.operationDigest))) add('completed-effect-not-yet-verified');
    for (const key of receipt.completedEffectKeys) if (!assessment.proposals.some(proposal => proposal.effectKey === key && proposal.status === 'already-saved')) add('completed-effect-readback-unverified');
  }
  for (const receipt of latest.values()) if (receipt.outcome !== 'verified') add(`local-${receipt.outcome}`);
  for (const attempt of request.attempts.filter(attempt => plan.operations.some(row => row.operationDigest === attempt.operationDigest) && attempt.state === 'uncertain')) {
    if (!receipts.some(receipt => receipt.outcome === 'uncertain' && receipt.operationDigest === attempt.operationDigest && receipt.attemptedAt === attempt.attemptedAt && receipt.evidenceRef === attempt.evidenceRef)) add('original-uncertain-receipt-missing');
  }
  if (packet.stage === 'preflight') {
    const cutoff = Math.max(Date.parse(plan.issuedAt), ...receipts.map(row => Date.parse(row.observedAt)));
    if (Date.parse(snapshot.acquisition.startedAt) <= cutoff) add('fresh-preflight-window-required');
    if (Date.parse(request.visualReview?.observedAt ?? '') <= cutoff || assessment.visualReview !== 'reported-current') add('fresh-preflight-visual-review-required');
    for (const entry of [...snapshot.taskSchedules, ...request.taskSchedules, ...snapshot.mappings, ...request.mappings]) if (Date.parse(entry.observedAt) <= cutoff) add('fresh-preflight-native-readback-required');
    need(sha(packet.operationDigest) && plan.operations.some(row => row.operationDigest === packet.operationDigest), 'Preflight names one exact planned operationDigest');
    const selected = plan.operations.find(row => row.operationDigest === packet.operationDigest);
    let preparedTiming = null;
    if (timed(selected.prepared.operation) && completeTiming(selected.prepared.operation) && selected.itemType === 'task') {
      const target = plan.timing?.targets.find(row => row.operationDigest === selected.operationDigest)?.target;
      const observation = timing?.observations.find(row => row.operationDigest === selected.operationDigest)?.zoneObservation;
      if (!target || !observation) add('timing-contract-required');
      else {
        const result = prepareCalendarTiming(canonicalTiming(selected.prepared.operation), target, observation, { evaluatedAt, maxEvidenceAgeMs: Math.min(request.maxEvidenceAgeMs, plan.maxEvidenceAgeMs), after: new Date(cutoff).toISOString() });
        result.findings.forEach(add); preparedTiming = result.prepared;
      }
    }
    const proposal = assessment.proposals.find(row => row.id === selected.prepared.operation.id);
    if (proposal?.status !== 'proposed' || receipts.some(row => row.operationDigest === packet.operationDigest) || request.attempts.some(row => row.operationDigest === packet.operationDigest)) add('preflight-not-unapplied');
    for (const proposal of assessment.proposals.filter(row => row.status === 'already-saved')) if (!plan.operations.some(row => row.prepared.operation.id === proposal.id && verified.has(row.operationDigest))) add('completed-effect-receipt-required');
    if (findings.length) return outcome('return-to-cloud', plan, reports);
    const collections = [...Object.values(snapshot.discovery), ...snapshot.calendars.map(row => row.collection), ...snapshot.taskLists.map(row => row.collection)];
    const evidenceTimes = [snapshot.acquisition.startedAt, snapshot.acquisition.completedAt, request.history.completeThrough, request.visualReview.observedAt, ...collections.flatMap(row => row.pages.map(page => page.acquiredAt)), ...[...snapshot.taskSchedules, ...request.taskSchedules, ...snapshot.mappings, ...request.mappings].map(row => row.observedAt), ...(preparedTiming ? [preparedTiming.evidenceOldestAt] : [])];
    const evidenceOldestAt = new Date(Math.min(...evidenceTimes.map(Date.parse))).toISOString();
    const preflight = { schemaVersion: 1, status: 'preflight-ready', planDigest, operationDigest: selected.operationDigest, snapshotDigest: assessment.snapshotDigest, policyDigest: plan.policyDigest, coordinationDefinitionHash: plan.coordinationDefinitionHash, baselineDigest: selected.prepared.operation.baselineDigest, observedAt: evaluatedAt, evidenceOldestAt, maxEvidenceAgeMs: request.maxEvidenceAgeMs, validUntil: new Date(Date.parse(evidenceOldestAt) + request.maxEvidenceAgeMs).toISOString(), assessmentDigest: hash(assessment), ...(preparedTiming ? { timing: preparedTiming } : {}) };
    return outcome('preflight-ready', plan, reports, { ...preflight, preflightDigest: hash(preflight) });
  }
  need(packet.operationDigest === undefined, 'Root acceptance covers the entire plan');
  if (verified.size !== plan.operations.length || assessment.proposals.some(row => row.status !== 'already-saved')) add('same-id-saved-readback-required');
  const lastAttempt = Math.max(...receipts.map(row => Date.parse(row.observedAt)), Date.parse(plan.issuedAt));
  if (Date.parse(snapshot.acquisition.startedAt) <= lastAttempt || Date.parse(request.visualReview?.observedAt ?? '') <= lastAttempt || assessment.visualReview !== 'reported-current') add('fresh-final-window-review-required');
  for (const entry of [...snapshot.taskSchedules, ...request.taskSchedules, ...snapshot.mappings, ...request.mappings]) if (Date.parse(entry.observedAt) <= lastAttempt) add('fresh-final-native-readback-required');
  for (const row of plan.operations.filter(row => row.itemType === 'task')) {
    const identity = row.prepared.operation.identity;
    if (![...snapshot.taskSchedules, ...request.taskSchedules].some(entry => same(entry.identity, identity) && Date.parse(entry.observedAt) > lastAttempt)) add('fresh-final-native-readback-required');
    if ([...snapshot.mappings, ...request.mappings].some(entry => same(entry.taskIdentity, identity) && Date.parse(entry.observedAt) <= lastAttempt)) add('fresh-final-projection-readback-required');
    if (timed(row.prepared.operation)) {
      const receipt = latest.get(row.operationDigest);
      const preflight = preflights.find(entry => entry.preflightDigest === receipt?.preflightDigest);
      const readback = timing?.observations.find(entry => entry.operationDigest === row.operationDigest)?.readback;
      const zoneObservation = timing?.observations.find(entry => entry.operationDigest === row.operationDigest)?.zoneObservation;
      const target = plan.timing?.targets.find(entry => entry.operationDigest === row.operationDigest)?.target;
      if (!target || !zoneObservation) add('timing-contract-required');
      else if (completeTiming(row.prepared.operation)) prepareCalendarTiming(canonicalTiming(row.prepared.operation), target, zoneObservation, { evaluatedAt, maxEvidenceAgeMs: Math.min(request.maxEvidenceAgeMs, plan.maxEvidenceAgeMs), after: new Date(lastAttempt).toISOString() }).findings.forEach(add);
      if (!preflight?.timing || !receipt?.timing || !readback) add('final-timing-readback-required');
      else assessCalendarTimingReadback(preflight.timing, { ...receipt.timing, readback }, { evaluatedAt, attemptedAt: receipt.attemptedAt, after: new Date(lastAttempt).toISOString(), maxEvidenceAgeMs: Math.min(request.maxEvidenceAgeMs, plan.maxEvidenceAgeMs, preflight.timing.maxEvidenceAgeMs) }).findings.forEach(add);
    }
  }
  return outcome(findings.length ? 'return-to-cloud' : 'accepted-reported', plan, reports);
}
