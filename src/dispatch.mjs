import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { authorityStatus, currentNativeEffects, currentObservations, definitionHeads, effectKey, observationStatus, restoredState, reviewAsOf, routeTarget, sameSubject } from './work.mjs';
import { canonical, canonicalRepository, digest, dispatchEfforts as efforts, parseDefinition, parseObservation, parseProjectDiscovery, readBindings, readJson, readStore } from './records.mjs';
import { inspectRepository } from './responsibilities.mjs';

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
    if (settings.model !== requested.model || !efforts.includes(settings.effort) || (requested === ordinarySettings ? efforts.indexOf(settings.effort) < efforts.indexOf(requested.effort) : settings.effort !== requested.effort)) reasons.push(`${label}-model-mismatch`);
    if (settings.sandboxMode !== 'danger-full-access' || settings.approvalPolicy !== 'never') reasons.push(`${label}-policy-mismatch`);
  }
  return reasons;
}

function standingScope(dispatcher, target, asOf) {
  const ref = dispatcher?.authorityRef;
  return ref?.reference && ref.action === 'dispatch-native-child' && ref.resource === target.projectId && ref.destination === target.nativeProjectId
    && (!ref.expiresAt || Date.parse(ref.expiresAt) >= Date.parse(asOf)) && dispatcher.childAccessIntent === 'full-access-inherit';
}

function remoteScope(dispatcher, target, asOf) {
  const ref = dispatcher?.remoteAuthorityRef;
  return Boolean(ref?.reference && ref.action === 'dispatch-native-remote-child' && ref.resource === target.projectId && ref.destination === target.hostId && (!ref.expiresAt || Date.parse(ref.expiresAt) >= Date.parse(asOf)));
}

function projectReasons(discovery, expected, asOf, maxAgeMs, label, restoredAt = null, nativeKind = 'local') {
  if (!discovery) return [`${label}-project-discovery-needed`];
  const reasons = [];
  if (!discovery.coverage.complete || discovery.coverage.gaps.length) reasons.push('project-discovery-partial');
  if (!currentTime(discovery.observedAt, asOf, Math.min(maxAgeMs, 300000))) reasons.push('project-discovery-not-current');
  if (restoredAt && Date.parse(discovery.observedAt) < Date.parse(restoredAt)) reasons.push('project-discovery-before-restore');
  const matches = discovery.projects.filter(project => project.projectId === expected.nativeProjectId);
  if (matches.length !== 1) reasons.push(`${label}-saved-project-unverified`);
  else {
    const project = matches[0];
    if (project.projectKind === 'chatgpt') reasons.push('chatgpt-coding-membership-unsupported');
    if (project.projectKind !== nativeKind || project.hostId !== expected.hostId || project.path !== expected.path) reasons.push(`${label}-saved-project-mismatch`);
  }
  return reasons;
}

export function dispatchDecision({ id, records, bindings, catalog, machine, asOf, contextNeeded = false, skillVerified = false, discovery = null, repositoryReadback = null }) {
  const definitions = records.filter(record => record.type === 'definition' && record.id === id);
  if (!definitions.length) throw new Error(`Unknown objective ${id}`);
  const heads = definitionHeads(definitions);
  const result = { execution: 'proposal-only', id, asOf, inputHashes: records.map(record => record.hash).sort(), status: 'needs-observation', next: 'rediscover', reasons: [], providerExecution: 'unverified', effectiveChildAccess: 'unverified' };
  const stop = (...reasons) => ({ ...result, reasons: [...new Set([...result.reasons, ...reasons])] });
  if (heads.length !== 1) return stop('objective-definition-conflict');
  const definition = heads[0]; const spec = definition.dispatch;
  if (!spec) return stop('objective-dispatch-definition-needed');
  const target = definition.target; const selected = bindings.projects[target.projectId]?.dispatcher;
  const remote = target.hostId !== bindings.localHostId;
  const requested = spec.requestedSettings ?? ordinarySettings;
  const coordinatorRequested = spec.coordinatorRequestedSettings ?? ordinarySettings;
  const key = effectKey(definition);
  Object.assign(result, { correlationKey: spec.correlationKey, effectKey: key, dispatcher: spec.dispatcher, selectedDispatcher: selected ?? null, requestedSettings: requested, coordinatorRequestedSettings: coordinatorRequested, childAccessIntent: spec.dispatcher.childAccessIntent, authorityRef: definition.authorityRef });
  const stable = value => value && { correlationKey: value.correlationKey, dispatcher: value.dispatcher, skill: value.skill };
  if (definitions.some(item => item.dispatch && canonical(stable(item.dispatch)) !== canonical(stable(spec)))) result.reasons.push('objective-dispatch-binding-conflict');
  if (records.some(record => record.type === 'definition' && record.id !== id && record.dispatch?.correlationKey === spec.correlationKey)) result.reasons.push('correlation-key-bound-to-another-objective');
  if (!selected || canonical(identity(selected)) !== canonical(identity(spec.dispatcher))) result.reasons.push('dispatcher-selection-mismatch');
  if (target.executor !== 'local-codex' || spec.dispatcher.hostId !== bindings.localHostId) result.reasons.push('dispatcher-target-mismatch');
  const owners = Object.entries(bindings.projects).filter(([, binding]) => binding.hostId === spec.dispatcher.hostId && binding.nativeProjectId === spec.dispatcher.nativeProjectId);
  const owner = owners.length === 1 ? { ...owners[0][1], projectId: owners[0][0] } : null;
  result.dispatcherProject = owner?.projectId ?? null;
  result.destination = target;
  result.nativeRoute = { kind: 'studio-saved-project', coordinatorHostId: spec.dispatcher.hostId, destinationHostId: target.hostId, nativeProjectId: target.nativeProjectId, environment: 'local' };
  if (!owner || canonical(identity(owner.dispatcher)) !== canonical(identity(spec.dispatcher)) || !standingScope(owner.dispatcher, owner, asOf)) result.reasons.push('dispatcher-owner-unverified');
  if (!owner || owner.hostId !== bindings.localHostId || bindings.hosts[owner.hostId]?.machine !== machine) result.reasons.push('dispatcher-host-unverified');
  result.reasons.push(...routeTarget(definition, { bindings, catalog, machine }).reasons.filter(reason => !(remote && reason === 'local-host-unverified')));
  if (remote && (!remoteScope(selected, target, asOf) || !remoteScope(spec.dispatcher, target, asOf))) result.reasons.push('remote-host-authority-needed');
  if (!standingScope(selected, target, asOf) || !standingScope(spec.dispatcher, target, asOf)) result.reasons.push('standing-dispatch-authority-needed');
  if (!authorityStatus(definition, asOf).eligible) result.reasons.push('objective-authority-needed');
  if (definition.resource !== target.projectId || definition.destination !== target.nativeProjectId) result.reasons.push('objective-destination-authority-needed');
  let repositoryVerified = !remote && repositoryReadback && sameSubject({ ...target, ...repositoryReadback }, target);
  if (!remote && !repositoryVerified) result.reasons.push('current-repository-unverified');
  if (definition.lifecycle.status !== 'active') result.reasons.push('objective-inactive');
  if ((requested.model !== ordinarySettings.model || efforts.indexOf(requested.effort) < efforts.indexOf('high')) && !requested.scopedOverrideRef) result.reasons.push('scoped-model-override-needed');
  if (spec.coordinatorRequestedSettings && (coordinatorRequested.scope?.objectiveId !== id || coordinatorRequested.scope?.role !== 'coordinator')) result.reasons.push('coordinator-model-scope-mismatch');
  if ((coordinatorRequested.model !== ordinarySettings.model || efforts.indexOf(coordinatorRequested.effort) < efforts.indexOf('high')) && !coordinatorRequested.scopedOverrideRef) result.reasons.push('coordinator-scoped-model-override-needed');
  if (!remote && !skillVerified) result.reasons.push('installed-skill-unverified');

  const observations = records.filter(record => record.type === 'observation' && record.responsibilityId === id);
  if (remote) {
    const current = currentObservations(definition, observations.filter(record => record.category === 'target'), asOf);
    repositoryVerified = current.length > 0 && current.every(record => record.origin === 'reported' && record.evidenceRefs.length > 0 && observationStatus(record, target, asOf, definition.freshness.maxAgeMs).eligible);
    if (!repositoryVerified) result.reasons.push('remote-repository-readback-needed');
  }
  result.repositoryAssurance = repositoryVerified ? remote ? 'reported-remote' : 'observed-local' : 'unverified';
  const tasks = observations.filter(record => record.category === 'tasks');
  const knownIds = [...new Set(tasks.flatMap(record => record.tasks.map(task => task.nativeId)))].sort();
  result.knownReadyThreadIds = knownIds;
  const objectiveIds = new Set(records.filter(record => record.type === 'definition' && record.id !== id).map(record => record.id));
  if (records.some(record => record.type === 'observation' && objectiveIds.has(record.responsibilityId) && record.category === 'tasks' && record.tasks.some(task => knownIds.includes(task.nativeId)))) result.reasons.push('child-bound-to-another-objective');
  if (knownIds.length > 1) result.reasons.push('multiple-native-child-bindings');
  const epoch = records.filter(record => record.type === 'epoch').sort((a, b) => a.restoredAt.localeCompare(b.restoredAt) || a.hash.localeCompare(b.hash)).at(-1);
  result.reasons.push(...projectReasons(discovery, target, asOf, definition.freshness.maxAgeMs, 'destination', epoch?.restoredAt, remote ? 'remote' : 'local'));
  if (owner) result.reasons.push(...projectReasons(discovery, owner, asOf, definition.freshness.maxAgeMs, 'dispatcher', epoch?.restoredAt));
  result.projectDiscovery = discovery ? { observedAt: discovery.observedAt, sourceRef: discovery.sourceRef, sha256: digest(discovery), assurance: 'reported' } : null;
  if (restoredState(epoch, observations, definition, asOf, { nativeRemote: remote }).suspended) result.reasons.push('restored-home-suspended');
  const active = currentObservations(definition, tasks, asOf);
  if (active.length !== 1) return stop(active.length ? 'native-observation-conflict' : 'native-discovery-needed');
  const observation = active[0]; const state = observation.dispatch;
  const otherEffects = currentNativeEffects(definition, observations, asOf).filter(event => event.hash !== observation.hash);
  if (otherEffects.some(event => event.tasks?.some(task => !task.effectKey || task.effectKey === key) || event.effects?.some(effect => effect.key === key && effect.status !== 'absent'))) result.reasons.push('native-effect-rediscovery-needed');
  result.observationHash = observation.hash;
  result.reasons.push(...observationStatus(observation, target, asOf, definition.freshness.maxAgeMs).reasons);
  if (!state || state.correlationKey !== spec.correlationKey) return stop('native-correlation-needed');
  if (remote) {
    const skill = state.destinationSkill;
    if (!skill || skill.hostId !== target.hostId || skill.path !== spec.skill.path || skill.sha256 !== spec.skill.sha256 || !currentTime(skill.observedAt, asOf, Math.min(definition.freshness.maxAgeMs, 300000)) || epoch && Date.parse(skill.observedAt) < Date.parse(epoch.restoredAt)) result.reasons.push('destination-skill-readback-needed');
  }
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
  result.reasons.push(...readbackReasons(state.dispatcher, spec.dispatcher, coordinatorRequested, asOf, definition.freshness.maxAgeMs, 'dispatcher', epoch?.restoredAt));
  if (['attempted', 'pending', 'uncertain'].includes(state.phase)) {
    Object.assign(result, { next: state.phase === 'pending' ? 'resolve-pending' : 'rediscover', clientThreadId: state.clientThreadId ?? null, attemptKey: state.attemptKey });
    return stop('native-launch-unresolved');
  }
  if (state.phase === 'absent') {
    if (knownIds.length) return stop('existing-child-requires-rediscovery');
    if (result.reasons.length) return stop();
    const attemptKey = digest({ objective: id, correlationKey: spec.correlationKey, effectKey: key, discovery: observation.hash });
    const prompt = `[$pstack:poteto-mode](${spec.skill.path})\n\n${definition.goal}\n\n${definition.context}\n\nObjective ${definition.id}. Correlation ${spec.correlationKey}. Effect ${key}. Attempt ${attemptKey}.\nTarget repository ${target.repository}. Host ${target.hostId}. Saved native project ${target.nativeProjectId}. Checkout ${target.path}. Revision ${target.revision}. Dirty digest ${target.dirtyDigest}.\nRequested model ${requested.model} at ${requested.effort}. Source ${requested.scopedOverrideRef ?? requested.sourceRef}. Honor scoped human helper overrides in the task context.\nSource authority ${definition.authorityRef.reference}. Standing FullAccess-child intent ${spec.dispatcher.authorityRef.reference}. Preserve global defaults, other threads and separate connector/Computer Use grants. Retain actual first-turn policy/model readbacks separately from provider execution and effective access.\nFinish evidence ${definition.criteria.map(item => item.description).join(' ')}\nKeep private identifiers and receipts in ignored private state. Read and follow this destination's actual AGENTS.md, installed skills and verification requirements. Preserve its project defaults. Complete independent review and protected delivery where required. Parent owns native read/wait progress; do not depend on child callbacks.`;
    const words = definition.id.split('-').slice(0, 5); if (words.length === 1) words.push('objective');
    return { ...result, status: 'advice-ready', next: 'create-via-dispatcher', attemptKey, beforeNativeCall: 'Retain attempted state with this attempt key and the exact request digest through reconcile --import, then use this pinned proposal once. Rediscover any uncertain result before retry.', nativeCreateRequest: { target: { type: 'project', projectId: target.nativeProjectId, environment: { type: 'local' } }, model: requested.model, thinking: requested.effort, title: `${bindings.projects[target.projectId].label} · ${words.join(' ')} 🟡`, prompt } };
  }
  const task = observation.tasks[0];
  if (task.nativeId === spec.dispatcher.threadId || task.nativeId === selected?.threadId) result.reasons.push('dispatcher-cannot-own-implementation');
  Object.assign(result, { readyThreadId: task.nativeId, actualHostId: state.child?.hostId ?? null, afterCursor: state.afterCursor ?? null, observedNativeStatus: task.status, recordedChildSettings: state.child?.recordedSettings ?? null });
  result.reasons.push(...readbackReasons(state.child, { threadId: task.nativeId, hostId: target.hostId, nativeProjectId: target.nativeProjectId }, requested, asOf, definition.freshness.maxAgeMs, 'child', epoch?.restoredAt));
  if (state.child?.correlationKey !== spec.correlationKey) result.reasons.push('child-correlation-unverified');
  if (state.child?.creatorThreadId !== spec.dispatcher.threadId) result.reasons.push('child-creator-unverified');
  if (result.reasons.length) return { ...stop(), next: 'inspect-existing-child' };
  return { ...result, status: 'advice-ready', next: contextNeeded ? 'continue-child' : task.status === 'completed' ? 'inspect-outcome' : 'read-or-wait', supervision: 'Parent uses supported read_thread or bounded wait_threads, carries afterCursor and backs off unchanged state.' };
}

async function resolveDestination(query, discovery, bindings, machine, asOf) {
  const separator = query.indexOf(':'); const by = query.slice(0, separator); const value = query.slice(separator + 1);
  if (separator < 1 || !value || !['key', 'id', 'name', 'path', 'repository'].includes(by)) throw new Error('Use an explicit key:, id:, name:, path: or repository: destination');
  const result = { execution: 'proposal-only', status: 'needs-observation', next: 'resolve-destination', reasons: [], asOf, nativeProject: null, project: null, source: { state: 'unavailable' } };
  if (!discovery) return { ...result, reasons: ['destination-project-discovery-needed'] };
  result.projectDiscovery = { observedAt: discovery.observedAt, sourceRef: discovery.sourceRef, sha256: digest(discovery), assurance: 'reported' };
  const entries = Object.entries(bindings.projects);
  const candidates = discovery.projects.filter(native => {
    if (by === 'id') return native.projectId === value;
    if (by === 'name') return native.label === value;
    if (by === 'path') return native.path === value;
    return entries.some(([key, binding]) => binding.hostId === native.hostId && binding.nativeProjectId === native.projectId && (by === 'key' ? key === value : binding.repository && canonicalRepository(binding.repository) === canonicalRepository(value)));
  });
  if (candidates.length !== 1) return { ...result, candidates, reasons: [candidates.length ? 'destination-ambiguous' : 'destination-not-found'] };
  const native = candidates[0]; result.nativeProject = native;
  if (native.projectKind === 'chatgpt') return { ...result, reasons: ['chatgpt-coding-membership-unsupported'] };
  const matches = entries.filter(([, binding]) => binding.hostId === native.hostId && binding.nativeProjectId === native.projectId);
  const binding = matches.length === 1 ? matches[0][1] : null;
  result.project = matches.length === 1 ? matches[0][0] : null;
  const remote = native.projectKind === 'remote' || native.hostId !== bindings.localHostId;
  result.reasons.push(...projectReasons(discovery, { hostId: native.hostId, nativeProjectId: native.projectId, path: native.path }, asOf, 300000, 'destination', null, remote ? 'remote' : 'local'));
  if (!binding || binding.path !== native.path) result.reasons.push('destination-binding-needed');
  if (remote) {
    const target = { projectId: result.project, hostId: native.hostId };
    if (!remoteScope(binding?.dispatcher, target, asOf) || !standingScope(binding?.dispatcher, { ...target, nativeProjectId: native.projectId }, asOf)) result.reasons.push('remote-host-authority-needed');
    return { ...result, status: result.reasons.length ? 'needs-observation' : 'resolved', next: result.reasons.length ? 'resolve-destination' : 'recover-project', proposedScope: { hostId: native.hostId, nativeProjectId: native.projectId, path: native.path, action: 'dispatch-native-remote-child', execution: 'native-create-unverified' }, source: { state: 'remote-uninspected' } };
  }
  if (bindings.hosts[native.hostId]?.machine !== machine) result.reasons.push('local-host-unverified');
  if (result.reasons.length) return result;
  try {
    const source = await inspectRepository(native.path);
    result.source = { state: 'observed-local', target: { projectId: result.project, executor: 'local-codex', hostId: native.hostId, nativeProjectId: native.projectId, ...source }, observedAt: new Date().toISOString() };
    if (!binding.repository || canonicalRepository(binding.repository) !== source.repository || binding.path !== source.path) result.reasons.push('repository-binding-mismatch');
  } catch { result.reasons.push('repository-source-needed'); }
  result.asOf = reviewAsOf(asOf, new Date().toISOString());
  result.reasons.push(...projectReasons(discovery, { hostId: native.hostId, nativeProjectId: native.projectId, path: native.path }, result.asOf, 300000, 'destination'));
  result.reasons = [...new Set(result.reasons)];
  return { ...result, status: result.reasons.length ? 'needs-observation' : 'resolved', next: result.reasons.length ? 'resolve-destination' : 'recover-project' };
}

export async function dispatch(home, { id, project, resolve: query, discoveryFile, asOf, contextNeeded, catalog }) {
  if (query && (id || project || contextNeeded) || !id && contextNeeded) throw new Error('Choose destination resolution, project recovery, or objective advice');
  const [{ records }, bindings] = await Promise.all([readStore(home), readBindings(home)]);
  const discovery = discoveryFile ? parseProjectDiscovery(await readJson(discoveryFile)) : null;
  for (const record of records) {
    if (record.type === 'definition' && record.dispatch) parseDefinition(record);
    if (record.type === 'observation' && record.dispatch) parseObservation(record);
  }
  const effectiveTime = reviewAsOf(asOf, new Date().toISOString());
  if (query) return resolveDestination(query, discovery, bindings, hostname(), effectiveTime);
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
  if (heads.length === 1 && heads[0].dispatch && heads[0].target.hostId === bindings.localHostId) {
    const skill = heads[0].dispatch.skill;
    try { skillVerified = digest(await readFile(skill.path)) === skill.sha256; }
    catch (error) { if (!['ENOENT', 'EACCES'].includes(error.code)) throw error; }
  }
  let repositoryReadback = null;
  if (heads.length === 1 && !routeTarget(heads[0], { bindings, catalog, machine: hostname() }).reasons.length && heads[0].target.executor === 'local-codex' && !projectReasons(discovery, heads[0].target, effectiveTime, heads[0].freshness.maxAgeMs, 'destination').length) {
    try { repositoryReadback = await inspectRepository(heads[0].target.path); }
    catch {}
  }
  return dispatchDecision({ id, records, bindings, catalog, machine: hostname(), asOf: reviewAsOf(asOf, new Date().toISOString()), contextNeeded, skillVerified, discovery, repositoryReadback });
}
