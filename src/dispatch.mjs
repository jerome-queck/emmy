import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { authorityStatus, currentObservations, definitionHeads, effectKey, observationStatus, restoredState, reviewAsOf, routeTarget } from './work.mjs';
import { canonical, digest, dispatchEfforts as efforts, parseDefinition, parseObservation, readBindings, readStore } from './records.mjs';

const identity = value => [value?.threadId, value?.hostId, value?.nativeProjectId];
const ordinarySettings = { model: 'gpt-6.1-sol', effort: 'high', sourceRef: 'Standing ordinary-session policy' };
const currentTime = (value, asOf, maxAgeMs) => Date.parse(value) <= Date.parse(asOf) && Date.parse(asOf) - Date.parse(value) <= maxAgeMs;

function readbackReasons(readback, expected, requested, asOf, maxAgeMs, label, restoredAt = null) {
  if (!readback) return [`${label}-readback-needed`];
  const reasons = [];
  if (readback.threadId !== expected.threadId || readback.hostId !== null && readback.hostId !== expected.hostId || readback.nativeProjectId !== null && readback.nativeProjectId !== expected.nativeProjectId) reasons.push(`${label}-identity-mismatch`);
  if (readback.hostId === null) reasons.push(`${label}-host-unverified`);
  if (readback.nativeProjectId === null) reasons.push(`${label}-project-unverified`);
  if (!currentTime(readback.observedAt, asOf, maxAgeMs)) reasons.push(`${label}-readback-not-current`);
  if (restoredAt && Date.parse(readback.observedAt) < Date.parse(restoredAt)) reasons.push(`${label}-readback-before-restore`);
  if (label === 'dispatcher' && readback.pinned !== true) reasons.push('dispatcher-pin-unverified');
  const settings = readback.recordedSettings;
  if (!settings) reasons.push(`${label}-settings-unverified`);
  else {
    if (!currentTime(settings.observedAt, asOf, maxAgeMs)) reasons.push(`${label}-settings-not-current`);
    if (restoredAt && Date.parse(settings.observedAt) < Date.parse(restoredAt)) reasons.push(`${label}-settings-before-restore`);
    if (settings.model !== requested.model || !efforts.includes(settings.effort) || efforts.indexOf(settings.effort) < efforts.indexOf(requested.effort)) reasons.push(`${label}-model-mismatch`);
    if (settings.sandboxMode !== 'danger-full-access' || settings.approvalPolicy !== 'never') reasons.push(`${label}-policy-mismatch`);
  }
  return reasons;
}

function standingScope(dispatcher, target, asOf) {
  const ref = dispatcher?.authorityRef;
  return ref?.reference && ref.action === 'dispatch-native-child' && ref.resource === target.projectId && ref.destination === target.nativeProjectId
    && (!ref.expiresAt || Date.parse(ref.expiresAt) >= Date.parse(asOf)) && dispatcher.childAccessIntent === 'full-access-inherit';
}

export function dispatchDecision({ id, records, bindings, catalog, machine, asOf, contextNeeded = false, skillVerified = false }) {
  const definitions = records.filter(record => record.type === 'definition' && record.id === id);
  if (!definitions.length) throw new Error(`Unknown objective ${id}`);
  const heads = definitionHeads(definitions);
  const result = { execution: 'proposal-only', id, asOf, inputHashes: records.map(record => record.hash).sort(), status: 'needs-observation', next: 'rediscover', reasons: [], providerExecution: 'unverified', effectiveChildAccess: 'unverified' };
  const stop = (...reasons) => ({ ...result, reasons: [...new Set([...result.reasons, ...reasons])] });
  if (heads.length !== 1) return stop('objective-definition-conflict');
  const definition = heads[0]; const spec = definition.dispatch;
  if (!spec) return stop('objective-dispatch-definition-needed');
  const target = definition.target; const selected = bindings.projects[target.projectId]?.dispatcher;
  const requested = spec.requestedSettings ?? ordinarySettings;
  const key = effectKey(definition);
  Object.assign(result, { correlationKey: spec.correlationKey, effectKey: key, dispatcher: spec.dispatcher, selectedDispatcher: selected ?? null, requestedSettings: requested, childAccessIntent: spec.dispatcher.childAccessIntent, authorityRef: definition.authorityRef });
  const stable = value => value && { correlationKey: value.correlationKey, dispatcher: value.dispatcher, skill: value.skill };
  if (definitions.some(item => item.dispatch && canonical(stable(item.dispatch)) !== canonical(stable(spec)))) result.reasons.push('objective-dispatch-binding-conflict');
  if (records.some(record => record.type === 'definition' && record.id !== id && record.dispatch?.correlationKey === spec.correlationKey)) result.reasons.push('correlation-key-bound-to-another-objective');
  if (!selected || canonical(identity(selected)) !== canonical(identity(spec.dispatcher))) result.reasons.push('dispatcher-selection-mismatch');
  if (target.executor !== 'local-codex' || spec.dispatcher.hostId !== target.hostId || spec.dispatcher.nativeProjectId !== target.nativeProjectId) result.reasons.push('dispatcher-target-mismatch');
  result.reasons.push(...routeTarget(definition, { bindings, catalog, machine }).reasons);
  if (!standingScope(selected, target, asOf) || !standingScope(spec.dispatcher, target, asOf)) result.reasons.push('standing-dispatch-authority-needed');
  if (!authorityStatus(definition, asOf).eligible) result.reasons.push('objective-authority-needed');
  if (definition.lifecycle.status !== 'active') result.reasons.push('objective-inactive');
  if ((requested.model !== ordinarySettings.model || efforts.indexOf(requested.effort) < efforts.indexOf('high')) && !requested.scopedOverrideRef) result.reasons.push('scoped-model-override-needed');
  if (!skillVerified) result.reasons.push('installed-skill-unverified');

  const observations = records.filter(record => record.type === 'observation' && record.responsibilityId === id);
  const tasks = observations.filter(record => record.category === 'tasks');
  const knownIds = [...new Set(tasks.flatMap(record => record.tasks.map(task => task.nativeId)))].sort();
  result.knownReadyThreadIds = knownIds;
  const objectiveIds = new Set(records.filter(record => record.type === 'definition' && record.dispatch && record.id !== id).map(record => record.id));
  if (records.some(record => record.type === 'observation' && objectiveIds.has(record.responsibilityId) && record.category === 'tasks' && record.tasks.some(task => knownIds.includes(task.nativeId)))) result.reasons.push('child-bound-to-another-objective');
  if (knownIds.length > 1) result.reasons.push('multiple-native-child-bindings');
  const epoch = records.filter(record => record.type === 'epoch').sort((a, b) => a.restoredAt.localeCompare(b.restoredAt) || a.hash.localeCompare(b.hash)).at(-1);
  if (restoredState(epoch, observations, definition, asOf).suspended) result.reasons.push('restored-home-suspended');
  const active = currentObservations(definition, tasks, asOf);
  if (active.length !== 1) return stop(active.length ? 'native-observation-conflict' : 'native-discovery-needed');
  const observation = active[0]; const state = observation.dispatch;
  result.observationHash = observation.hash;
  result.reasons.push(...observationStatus(observation, target, asOf, definition.freshness.maxAgeMs).reasons);
  if (!state || state.correlationKey !== spec.correlationKey) return stop('native-correlation-needed');
  if (!observation.evidenceRefs.length) result.reasons.push('native-source-evidence-needed');
  if (observation.tasks.some(task => task.effectKey !== key) || (observation.effects ?? []).some(effect => effect.key !== key)) result.reasons.push('native-effect-correlation-mismatch');
  const ancestors = new Set([observation.hash]); const byHash = new Map(tasks.map(record => [record.hash, record]));
  const chain = [observation];
  let predecessor = observation.supersedes?.hash;
  while (predecessor && !ancestors.has(predecessor)) { ancestors.add(predecessor); const prior = byHash.get(predecessor); if (prior) chain.push(prior); predecessor = prior?.supersedes?.hash; }
  if (state.phase !== 'absent' && state.phase !== 'attempted' && !tasks.some(record => ancestors.has(record.hash) && record.dispatch?.phase === 'attempted' && record.dispatch.attemptKey === state.attemptKey && record.dispatch.correlationKey === spec.correlationKey)) result.reasons.push('launch-attempt-correlation-needed');
  const unsettled = new Set();
  for (const event of chain.reverse()) {
    const item = event.dispatch;
    if (!item || item.correlationKey !== spec.correlationKey) continue;
    if (['attempted', 'pending', 'uncertain'].includes(item.phase)) unsettled.add(item.attemptKey);
    if (item.phase === 'ready') unsettled.delete(item.attemptKey);
    if (item.phase === 'absent' && item.resolution === 'confirmed-no-effect' && event.availability === 'available' && event.coverage.complete && !event.coverage.gaps.length && event.evidenceRefs.length && Date.parse(event.observedAt) <= Date.parse(asOf)) unsettled.delete(item.attemptKey);
  }
  if (!['attempted', 'pending', 'uncertain'].includes(state.phase) && unsettled.size) result.reasons.push(state.phase === 'absent' ? 'prior-launch-no-effect-readback-needed' : 'another-launch-unresolved');
  result.phase = state.phase;
  result.recordedDispatcherSettings = state.dispatcher?.recordedSettings ?? null;
  result.reasons.push(...readbackReasons(state.dispatcher, spec.dispatcher, ordinarySettings, asOf, definition.freshness.maxAgeMs, 'dispatcher', epoch?.restoredAt));
  if (['attempted', 'pending', 'uncertain'].includes(state.phase)) {
    Object.assign(result, { next: state.phase === 'pending' ? 'resolve-pending' : 'rediscover', clientThreadId: state.clientThreadId ?? null, attemptKey: state.attemptKey });
    return stop('native-launch-unresolved');
  }
  if (state.phase === 'absent') {
    if (knownIds.length) return stop('existing-child-requires-rediscovery');
    if (result.reasons.length) return stop();
    const attemptKey = digest({ objective: id, correlationKey: spec.correlationKey, effectKey: key, discovery: observation.hash });
    const prompt = `[$pstack:poteto-mode](${spec.skill.path})\n\n${definition.goal}\n\n${definition.context}\n\nObjective ${definition.id}. Correlation ${spec.correlationKey}. Effect ${key}. Attempt ${attemptKey}.\nTarget repository ${target.repository}. Host ${target.hostId}. Saved native project ${target.nativeProjectId}. Checkout ${target.path}. Revision ${target.revision}. Dirty digest ${target.dirtyDigest}.\nRequested model ${requested.model} at ${requested.effort}. Source ${requested.scopedOverrideRef ?? requested.sourceRef}. Honor scoped human helper overrides in the task context.\nSource authority ${definition.authorityRef.reference}. Standing FullAccess-child intent ${spec.dispatcher.authorityRef.reference}. Preserve global defaults, other threads and separate connector/Computer Use grants. Retain actual first-turn policy/model readbacks separately from provider execution and effective access.\nFinish evidence ${definition.criteria.map(item => item.description).join(' ')}\nKeep private identifiers and receipts in ignored private state. Follow current AGENTS.md, verification, independent review and protected delivery. Parent owns native read/wait progress; do not depend on child callbacks.`;
    const words = definition.id.split('-').slice(0, 5); if (words.length === 1) words.push('objective');
    return { ...result, status: 'advice-ready', next: 'create-via-dispatcher', attemptKey, beforeNativeCall: 'Retain attempted state with this attempt key and the exact request digest through reconcile --import, then use this pinned proposal once. Rediscover any uncertain result before retry.', nativeCreateRequest: { target: { type: 'project', projectId: target.nativeProjectId, environment: { type: 'local' } }, model: requested.model, thinking: requested.effort, title: `${bindings.projects[target.projectId].label} · ${words.join(' ')} 🟡`, prompt } };
  }
  const task = observation.tasks[0];
  if (task.nativeId === spec.dispatcher.threadId || task.nativeId === selected?.threadId) result.reasons.push('dispatcher-cannot-own-implementation');
  Object.assign(result, { readyThreadId: task.nativeId, actualHostId: state.child?.hostId ?? null, afterCursor: state.afterCursor ?? null, observedNativeStatus: task.status, recordedChildSettings: state.child?.recordedSettings ?? null });
  result.reasons.push(...readbackReasons(state.child, { threadId: task.nativeId, hostId: target.hostId, nativeProjectId: target.nativeProjectId }, requested, asOf, definition.freshness.maxAgeMs, 'child', epoch?.restoredAt));
  if (state.child?.correlationKey !== spec.correlationKey) result.reasons.push('child-correlation-unverified');
  if (result.reasons.length) return { ...stop(), next: 'inspect-existing-child' };
  return { ...result, status: 'advice-ready', next: contextNeeded ? 'continue-child' : task.status === 'completed' ? 'inspect-outcome' : 'read-or-wait', supervision: 'Parent uses supported read_thread or bounded wait_threads, carries afterCursor and backs off unchanged state.' };
}

export async function dispatch(home, { id, project, asOf, contextNeeded, catalog }) {
  const [{ records }, bindings] = await Promise.all([readStore(home), readBindings(home)]);
  for (const record of records) {
    if (record.type === 'definition' && record.dispatch) parseDefinition(record);
    if (record.type === 'observation' && record.dispatch) parseObservation(record);
  }
  const effectiveTime = reviewAsOf(asOf, new Date().toISOString());
  if (!id) {
    if (!project || contextNeeded) throw new Error('Use --id, or --project for bootstrap recovery');
    const binding = bindings.projects[project];
    if (!binding?.dispatcher) throw new Error(`No selected dispatcher for project ${project}`);
    const jobs = [...new Set(records.filter(record => record.type === 'definition' && record.target.projectId === project && record.dispatch).map(record => record.id))].sort().map(objective => ({ id: objective, heads: definitionHeads(records.filter(record => record.type === 'definition' && record.id === objective)).map(record => ({ definitionHash: record.hash, correlationKey: record.dispatch?.correlationKey })), readyThreadIds: [...new Set(records.filter(record => record.type === 'observation' && record.responsibilityId === objective && record.category === 'tasks').flatMap(record => record.tasks.map(task => task.nativeId)))].sort() }));
    return { execution: 'proposal-only', status: 'recovered', next: 'select-objective', project, dispatcher: binding.dispatcher, jobs, asOf: effectiveTime, providerExecution: 'unverified', effectiveChildAccess: 'unverified' };
  }
  const heads = definitionHeads(records.filter(record => record.type === 'definition' && record.id === id));
  if (project && heads.some(record => record.target.projectId !== project)) throw new Error('Objective belongs to a different project');
  let skillVerified = false;
  if (heads.length === 1 && heads[0].dispatch) {
    const skill = heads[0].dispatch.skill;
    try { skillVerified = digest(await readFile(skill.path)) === skill.sha256; }
    catch (error) { if (!['ENOENT', 'EACCES'].includes(error.code)) throw error; }
  }
  return dispatchDecision({ id, records, bindings, catalog, machine: hostname(), asOf: reviewAsOf(asOf, new Date().toISOString()), contextNeeded, skillVerified });
}
