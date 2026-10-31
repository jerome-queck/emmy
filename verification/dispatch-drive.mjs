import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { inspectRepository } from '../src/responsibilities.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, digest, readStore } from '../src/records.mjs';
import { effectKey } from '../src/work.mjs';

export async function driveDispatch({ root, home, run, scenario, report, bindings, target: initialTarget }) {
  const privateHome = join(home, 'dispatch-home'); await mkdir(privateHome, { recursive: true });
  const cli = (args, expected = 0, selectedHome = privateHome) => run(args, expected, selectedHome);
  const now = () => new Date().toISOString();
  let sequence = 0;
  const file = async (value, name = `dispatch-${++sequence}.json`) => {
    const path = join(privateHome, name); await writeFile(path, JSON.stringify(value)); return path;
  };
  const destinationPath = join(home, 'dispatch-target'); await mkdir(destinationPath);
  await writeFile(join(destinationPath, 'source.txt'), 'Synthetic destination source\n');
  const git = args => execFileSync('git', ['-C', destinationPath, ...args], { stdio: 'pipe' });
  git(['init', '-q']); git(['config', 'user.email', 'fixture@example.invalid']); git(['config', 'user.name', 'Synthetic destination']); git(['remote', 'add', 'origin', 'https://example.invalid/destination']); git(['add', '.']); git(['commit', '-qm', 'Synthetic destination baseline']);
  const target = { ...initialTarget, projectId: 'destination', nativeProjectId: 'native-destination', ...await inspectRepository(destinationPath) };
  const dispatcher = { threadId: 'synthetic-selected-dispatcher', hostId: target.hostId, nativeProjectId: initialTarget.nativeProjectId, selectionRef: 'synthetic-private-dispatcher-sentinel', childAccessIntent: 'full-access-inherit', authorityRef: { reference: 'Synthetic standing human request for this project and qualifying FullAccess children', action: 'dispatch-native-child', resource: target.projectId, destination: target.nativeProjectId } };
  const ownerDispatcher = { ...dispatcher, authorityRef: { ...dispatcher.authorityRef, resource: initialTarget.projectId, destination: initialTarget.nativeProjectId } };
  const selectedBindings = { ...bindings, projects: { ...bindings.projects, [initialTarget.projectId]: { ...bindings.projects[initialTarget.projectId], dispatcher: ownerDispatcher }, [target.projectId]: { label: 'Synthetic destination', hostId: target.hostId, nativeProjectId: target.nativeProjectId, path: target.path, repository: target.repository, dispatcher } } };
  const discoveryPath = join(privateHome, 'native-projects.json');
  const discovery = { schemaVersion: 1, observedAt: now(), sourceRef: 'Synthetic complete native inventory', coverage: { complete: true, gaps: [] }, projects: [
    { projectId: initialTarget.nativeProjectId, projectKind: 'local', label: 'Synthetic owner', hostId: initialTarget.hostId, path: initialTarget.path },
    { projectId: target.nativeProjectId, projectKind: 'local', label: 'Synthetic destination', hostId: target.hostId, path: target.path },
    { projectId: 'remote-native', projectKind: 'remote', label: 'Synthetic remote', hostId: 'remote-host', path: '/must-never-inspect-remote' },
    { projectId: 'chatgpt-project', projectKind: 'chatgpt', label: 'Synthetic conversation', hostId: null }
  ] };
  await writeFile(discoveryPath, JSON.stringify(discovery));
  const bindingsPath = join(privateHome, 'bindings.json'); await writeFile(bindingsPath, JSON.stringify(selectedBindings));
  const skillPath = join(privateHome, 'SKILL.md'); const skillBytes = '# Synthetic installed skill\n'; await writeFile(skillPath, skillBytes);
  const definition = { id: 'native-job', parents: [], goal: 'Repair the synthetic coding objective.', context: 'One explicit objective survives a new CLI process.', action: 'implement', resource: target.projectId, destination: target.nativeProjectId, target, authorityRef: { reference: 'Synthetic human objective authorization', action: 'implement', resource: target.projectId, destination: target.nativeProjectId }, criteria: [{ id: 'release', description: 'Inspect the actual reviewed outcome separately.', evidence: 'reported-check' }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: '2099-01-01T00:00:00Z', feature: { id: 'native-dispatch', method: 'Recover native coding context.', intendedEffect: 'Finish this one synthetic objective.', reviewAt: '2099-01-01T00:00:00Z' }, lifecycle: { status: 'active' }, dispatch: { correlationKey: 'synthetic-objective-one', dispatcher, skill: { path: skillPath, sha256: digest(skillBytes) }, requestedSettings: { model: 'gpt-6.1-sol', effort: 'high', sourceRef: 'Synthetic scoped stronger human request' } } };
  const adopt = async value => (await cli(['responsibility', '--file', await file(value)])).record;
  const adopted = await adopt(definition);
  await cli(['doctor']);
  const advise = async (expected = 0, extra = [], selectedHome = privateHome, id = adopted.id) => {
    await writeFile(discoveryPath, JSON.stringify({ ...discovery, observedAt: now() }));
    return cli(['dispatch', '--id', id, '--discovery', discoveryPath, '--as-of', now(), ...extra], expected, selectedHome);
  };
  assert.equal((await advise(3)).next, 'rediscover');
  const readback = (threadId, extra = {}) => ({ threadId, hostId: target.hostId, nativeProjectId: threadId === dispatcher.threadId ? initialTarget.nativeProjectId : target.nativeProjectId, creatorThreadId: dispatcher.threadId, pinned: true, observedAt: now(), sourceRef: 'Synthetic native inventory receipt', recordedSettings: { model: 'gpt-6.1-sol', effort: threadId === dispatcher.threadId ? 'medium' : 'high', sandboxMode: 'danger-full-access', approvalPolicy: 'never', observedAt: now(), sourceRef: 'Synthetic recorded session settings' }, ...extra });
  const observation = async (def, phase, prior = null, extra = {}) => {
    const attemptKey = extra.attemptKey ?? (phase === 'attempted' ? digest({ id: def.id, prior: prior?.hash ?? null }) : prior?.dispatch.attemptKey ?? digest(`Synthetic request ${def.id}`));
    const state = { phase, correlationKey: def.dispatch.correlationKey, dispatcher: readback(dispatcher.threadId), ...(phase !== 'absent' || prior?.dispatch.attemptKey ? { attemptKey } : {}), ...(phase === 'attempted' ? { requestDigest: digest(`Synthetic native request ${attemptKey}`) } : {}), ...extra };
    const evidence = await file({ fixture: true, state });
    const effects = phase === 'ready' ? [] : [{ key: effectKey(def), status: phase === 'absent' ? 'absent' : phase === 'uncertain' ? 'uncertain' : 'pending' }];
    return { type: 'observation', responsibilityId: def.id, subject: def.target, category: 'tasks', observedAt: now(), observer: `Synthetic native dispatch ${++sequence}`, availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], tasks: phase === 'ready' ? [{ nativeId: state.child.threadId, status: 'running', effectKey: effectKey(def) }] : [], effects, evidenceRefs: [{ path: evidence, sha256: digest(await readFile(evidence)) }], dispatch: state, ...(prior ? { supersedes: { hash: prior.hash, reason: 'Explicit synthetic native rediscovery of this same objective.' } } : {}) };
  };
  const retain = async value => {
    await cli(['reconcile', '--id', value.responsibilityId, '--import', await file({ schemaVersion: 1, records: [value] }), '--as-of', now()], 3);
    return (await readStore(privateHome)).records.find(record => record.type === 'observation' && record.observer === value.observer);
  };
  let current = await retain(await observation(adopted, 'absent'));
  const create = await advise(); assert.equal(create.next, 'create-via-dispatcher');
  assert.deepEqual(create.nativeCreateRequest.target, { type: 'project', projectId: target.nativeProjectId, environment: { type: 'local' } });
  assert.equal(create.dispatcherProject, initialTarget.projectId); assert.notEqual(create.nativeCreateRequest.target.projectId, dispatcher.nativeProjectId);
  assert.equal(create.nativeCreateRequest.model, 'gpt-6.1-sol'); assert.equal(create.nativeCreateRequest.thinking, 'high');
  assert.ok(create.nativeCreateRequest.prompt.startsWith(`[$pstack:poteto-mode](${skillPath})\n\n`));
  assert.deepEqual(Object.keys(create.nativeCreateRequest).sort(), ['model', 'prompt', 'target', 'thinking', 'title']);
  assert.equal(create.providerExecution, 'unverified'); assert.equal(create.effectiveChildAccess, 'unverified');
  const scoped = structuredClone(definition);
  scoped.id = 'coordinator-override'; scoped.dispatch.correlationKey = 'synthetic-coordinator-override';
  scoped.dispatch.coordinatorRequestedSettings = { model: 'gpt-6.1-sol', effort: 'medium', sourceRef: 'Synthetic explicit owner coordinator choice', scopedOverrideRef: 'Synthetic owner instruction for this objective coordinator', scope: { objectiveId: scoped.id, role: 'coordinator' } };
  const scopedAdopted = await adopt(scoped);
  const mediumReadback = readback(dispatcher.threadId);
  mediumReadback.recordedSettings.effort = 'medium';
  await retain(await observation(scopedAdopted, 'absent', null, { dispatcher: mediumReadback }));
  const scopedAdvice = await advise(0, [], privateHome, scoped.id);
  assert.equal(scopedAdvice.next, 'create-via-dispatcher');
  assert.equal(scopedAdvice.coordinatorRequestedSettings.effort, 'medium');
  assert.deepEqual(scopedAdvice.recordedDispatcherSettings, mediumReadback.recordedSettings);
  assert.equal(scopedAdvice.nativeCreateRequest.thinking, 'high');
  for (const [label, change] of [
    ['missing-scope', value => { delete value.dispatch.coordinatorRequestedSettings.scope; }],
    ['wrong-objective', value => { value.dispatch.coordinatorRequestedSettings.scope.objectiveId = 'foreign'; }],
    ['wrong-role', value => { value.dispatch.coordinatorRequestedSettings.scope.role = 'child'; }]
  ]) {
    const invalid = structuredClone(scoped); change(invalid);
    assert.match((await cli(['responsibility', '--file', await file(invalid)], 2)).error, /scope|objective/);
  }
  const low = structuredClone(scoped); low.parents = [scopedAdopted.hash]; low.dispatch.coordinatorRequestedSettings.effort = 'low';
  low.dispatch.coordinatorRequestedSettings.scopedOverrideRef = 'Synthetic explicit later owner correction';
  const lowAdopted = await adopt(low);
  const mismatched = await advise(3, [], privateHome, scoped.id);
  assert.ok(mismatched.reasons.includes('dispatcher-model-mismatch'));
  assert.ok(!mismatched.reasons.includes('objective-dispatch-binding-conflict'));
  assert.equal(mismatched.effectKey, scopedAdvice.effectKey);
  assert.deepEqual(lowAdopted.dispatch.dispatcher, scopedAdopted.dispatch.dispatcher);
  assert.deepEqual(lowAdopted.authorityRef, scopedAdopted.authorityRef);
  const lowReadback = structuredClone(mediumReadback); lowReadback.recordedSettings.effort = 'low';
  const scopedCurrent = (await readStore(privateHome)).records.find(record => record.type === 'observation' && record.responsibilityId === scoped.id && record.category === 'tasks');
  await retain(await observation(lowAdopted, 'absent', scopedCurrent, { dispatcher: lowReadback }));
  assert.equal((await advise(0, [], privateHome, scoped.id)).next, 'create-via-dispatcher');
  const noSource = structuredClone(low); noSource.parents = [lowAdopted.hash]; noSource.dispatch.coordinatorRequestedSettings.effort = 'medium'; delete noSource.dispatch.coordinatorRequestedSettings.scopedOverrideRef;
  assert.match((await cli(['responsibility', '--file', await file(noSource)], 2)).error, /explicit scoped override/);
  for (const role of ['child', 'coordinator']) for (const variant of ['generic', 'wrong-objective', 'wrong-role', 'wrong-model', 'wrong-effort', 'exact']) {
    const exceptional = structuredClone(definition);
    exceptional.id = `exception-${role}-${variant}`; exceptional.dispatch.correlationKey = exceptional.id;
    const settings = { model: 'gpt-6.1-sol', effort: 'xhigh', sourceRef: 'Synthetic generic or higher', scopedOverrideRef: 'Synthetic generic override' };
    if (role === 'coordinator') settings.scope = { objectiveId: exceptional.id, role };
    if (variant !== 'generic') settings.oneTimePermission = { objectiveId: exceptional.id, role, model: settings.model, effort: settings.effort, sourceRef: 'Synthetic explicit one-time owner permission' };
    if (variant.startsWith('wrong-')) settings.oneTimePermission[variant.slice(6) === 'objective' ? 'objectiveId' : variant.slice(6)] = variant === 'wrong-role' ? (role === 'child' ? 'coordinator' : 'child') : variant === 'wrong-effort' ? 'high' : 'foreign';
    exceptional.dispatch[role === 'child' ? 'requestedSettings' : 'coordinatorRequestedSettings'] = settings;
    const saved = await adopt(exceptional);
    const coordinator = readback(dispatcher.threadId);
    if (role === 'coordinator') coordinator.recordedSettings.effort = 'xhigh';
    await retain(await observation(saved, 'absent', null, { dispatcher: coordinator }));
    const result = await advise(variant === 'exact' ? 0 : 3, [], privateHome, saved.id);
    if (variant === 'exact') {
      assert.equal(result.next, 'create-via-dispatcher');
      if (role === 'child') assert.deepEqual(JSON.parse(result.nativeCreateRequest.prompt.match(/One-time permission declaration (.+?)\. This is declared/)[1]), settings.oneTimePermission);
    }
    else assert.ok(result.reasons.includes(`${role}-one-time-model-permission-needed`));
  }
  const resolve = (selector, expected = 0, path = discoveryPath) => cli(['dispatch', '--resolve', selector, '--discovery', path, '--as-of', now()], expected);
  const resolution = await resolve('name:Synthetic destination'); assert.equal(resolution.source.target.repository, target.repository); assert.equal(resolution.project, target.projectId);
  assert.equal((await resolve(`path:${target.path}`)).nativeProject.projectId, target.nativeProjectId);
  assert.equal((await resolve(`repository:${target.repository}`)).project, target.projectId);
  assert.equal((await resolve('name:missing', 3)).reasons[0], 'destination-not-found');
  assert.equal((await resolve('name:Synthetic remote', 3)).source.state, 'remote-uninspected');
  assert.equal((await resolve('name:Synthetic conversation', 3)).reasons[0], 'chatgpt-coding-membership-unsupported');
  for (const [label, change, reason] of [
    ['ambiguous', d => d.projects.push({ ...d.projects[1], projectId: 'duplicate-name-project' }), 'destination-ambiguous'],
    ['partial', d => { d.coverage.complete = false; }, 'project-discovery-partial'],
    ['stale', d => { d.observedAt = '2000-01-01T00:00:00Z'; }, 'project-discovery-not-current'],
    ['future', d => { d.observedAt = '2099-01-01T00:00:00Z'; }, 'project-discovery-not-current'],
    ['wrong-path', d => { d.projects[1].path = '/wrong-native-path'; }, 'destination-binding-needed']
  ]) { const bad = structuredClone(discovery); change(bad); const path = await file(bad); assert.ok((await resolve('name:Synthetic destination', 3, path)).reasons.includes(reason), label); }
  const duplicate = structuredClone(discovery); duplicate.projects.push(duplicate.projects[0]);
  assert.match((await cli(['dispatch', '--resolve', 'name:Synthetic destination', '--discovery', await file(duplicate), '--as-of', now()], 2)).error, /Duplicate native project IDs/);
  assert.ok((await cli(['dispatch', '--id', adopted.id, '--as-of', now()], 3)).reasons.includes('destination-project-discovery-needed'));
  const cleanSource = await readFile(join(destinationPath, 'source.txt')); await writeFile(join(destinationPath, 'source.txt'), 'Changed actual destination bytes');
  assert.ok((await advise(3)).reasons.includes('current-repository-unverified')); await writeFile(join(destinationPath, 'source.txt'), cleanSource);
  assert.equal((await advise()).next, 'create-via-dispatcher');
  const standalone = async (status, prior = null, extra = {}) => {
    const { tasks, dispatch, ...base } = await observation(adopted, 'absent');
    return { ...base, category: 'effect', effects: [{ key: effectKey(adopted), status }], ...(prior ? { supersedes: { hash: prior.hash, reason: 'Targeted standalone native effect rediscovery.' } } : {}), ...extra };
  };
  let retainedEffect;
  for (const status of ['pending', 'uncertain', 'completed']) {
    retainedEffect = await retain(await standalone(status, retainedEffect));
    assert.ok((await advise(3)).reasons.includes('native-effect-rediscovery-needed'));
    retainedEffect = await retain(await standalone('absent', retainedEffect, { coverage: { complete: false, gaps: ['Synthetic incomplete native effect discovery'] } }));
    assert.ok((await advise(3)).reasons.includes('native-effect-rediscovery-needed'));
    retainedEffect = await retain(await standalone('absent', retainedEffect));
    assert.equal((await advise()).next, 'create-via-dispatcher');
  }
  const beforeRead = canonical((await readStore(privateHome)).records); const bindingBytes = await readFile(bindingsPath);
  assert.equal((await advise()).next, create.next); assert.equal((await advise()).effectKey, create.effectKey);
  assert.equal(canonical((await readStore(privateHome)).records), beforeRead); assert.deepEqual(await readFile(bindingsPath), bindingBytes);
  current = await retain(await observation(adopted, 'attempted', current, { attemptKey: create.attemptKey, requestDigest: digest(create.nativeCreateRequest) }));
  assert.equal((await advise(3)).next, 'rediscover');
  const attemptHash = current.hash;
  const pending = await observation(adopted, 'pending', current, { clientThreadId: 'synthetic-pending-client' });
  current = await retain(pending);
  assert.equal((await advise(3)).next, 'resolve-pending'); assert.equal((await advise(3)).readyThreadId, undefined);
  const beforeDuplicate = (await readStore(privateHome)).records.filter(record => record.category === 'tasks').length;
  await retain(pending); assert.equal((await readStore(privateHome)).records.filter(record => record.category === 'tasks').length, beforeDuplicate);
  const invalid = structuredClone(pending); invalid.observer = 'Invalid client masquerading as a ready ID'; invalid.tasks = [{ nativeId: pending.dispatch.clientThreadId, status: 'running' }];
  const invalidResult = await cli(['reconcile', '--id', adopted.id, '--import', await file({ schemaVersion: 1, records: [invalid] }), '--as-of', now()], 2);
  assert.match(invalidResult.error, /cannot contain ready task IDs/);
  current = await retain(await observation(adopted, 'uncertain', current));
  assert.equal((await advise(3)).next, 'rediscover');
  current = await retain(await observation(adopted, 'absent', current));
  assert.ok((await advise(3)).reasons.includes('prior-launch-no-effect-readback-needed'));
  current = await retain(await observation(adopted, 'absent', current, { resolution: 'confirmed-no-effect' }));
  const retry = await advise(); assert.equal(retry.next, 'create-via-dispatcher'); assert.notEqual(retry.attemptKey, create.attemptKey);
  current = await retain(await observation(adopted, 'attempted', current));
  const child = readback('synthetic-ready-child', { correlationKey: adopted.dispatch.correlationKey });
  current = await retain(await observation(adopted, 'ready', current, { child, afterCursor: 'synthetic-wait-cursor' }));
  const ready = await advise(); assert.equal(ready.next, 'read-or-wait'); assert.equal(ready.readyThreadId, child.threadId); assert.equal(ready.afterCursor, 'synthetic-wait-cursor');
  assert.equal((await advise(0, ['--context-needed'])).next, 'continue-child');
  retainedEffect = await retain(await standalone('uncertain', retainedEffect));
  assert.ok((await advise(3, ['--context-needed'])).reasons.includes('native-effect-rediscovery-needed'));
  retainedEffect = await retain(await standalone('absent', retainedEffect));
  assert.equal((await advise(0, ['--context-needed'])).next, 'continue-child');
  const recovered = await cli(['dispatch', '--project', target.projectId, '--as-of', now()]);
  assert.equal(recovered.dispatcher.threadId, dispatcher.threadId); assert.deepEqual(recovered.jobs.find(job => job.id === adopted.id).readyThreadIds, [child.threadId]);
  const advance = async childChange => {
    const nextChild = readback(child.threadId, { correlationKey: adopted.dispatch.correlationKey });
    Object.assign(nextChild, childChange);
    current = await retain(await observation(adopted, 'ready', current, { child: nextChild }));
  };
  await advance({ creatorThreadId: 'different-native-creator' }); assert.ok((await advise(3)).reasons.includes('child-creator-unverified'));
  await advance({ recordedSettings: { ...child.recordedSettings, effort: 'medium' } }); assert.ok((await advise(3)).reasons.includes('child-model-mismatch'));
  await advance({ nativeProjectId: null }); assert.ok((await advise(3)).reasons.includes('child-project-unverified'));
  await advance({ nativeProjectId: 'synthetic-wrong-project' }); assert.ok((await advise(3)).reasons.includes('child-identity-mismatch'));
  await advance({ hostId: 'synthetic-wrong-host' }); assert.ok((await advise(3)).reasons.includes('child-identity-mismatch'));
  await advance({ recordedSettings: null }); assert.ok((await advise(3)).reasons.includes('child-settings-unverified'));
  await advance({ recordedSettings: { ...child.recordedSettings, observedAt: '2000-01-01T00:00:00Z' } }); assert.ok((await advise(3)).reasons.includes('child-settings-not-current'));
  await advance({ recordedSettings: { ...child.recordedSettings, model: 'gpt-6-luna' } }); assert.ok((await advise(3)).reasons.includes('child-model-mismatch'));
  await advance({ recordedSettings: { ...child.recordedSettings, sandboxMode: 'workspace-write' } }); assert.ok((await advise(3)).reasons.includes('child-policy-mismatch'));
  await advance({}); assert.equal((await advise()).readyThreadId, child.threadId);
  const wrongSelection = structuredClone(selectedBindings); wrongSelection.projects[target.projectId].dispatcher.threadId = 'synthetic-other-dispatcher';
  await writeFile(bindingsPath, JSON.stringify(wrongSelection)); assert.ok((await advise(3)).reasons.includes('dispatcher-selection-mismatch'));
  await writeFile(bindingsPath, JSON.stringify(selectedBindings));
  const expired = structuredClone(selectedBindings); expired.projects[target.projectId].dispatcher.authorityRef.expiresAt = '2000-01-01T00:00:00Z';
  await writeFile(bindingsPath, JSON.stringify(expired)); assert.ok((await advise(3)).reasons.includes('standing-dispatch-authority-needed'));
  await writeFile(bindingsPath, JSON.stringify(selectedBindings));
  const missingSkill = await readFile(skillPath); await writeFile(skillPath, 'Changed installed skill'); assert.ok((await advise(3)).reasons.includes('installed-skill-unverified')); await writeFile(skillPath, missingSkill);
  const badLineage = structuredClone(definition); badLineage.parents = [adopted.hash]; badLineage.dispatch.correlationKey = 'silently-replaced-objective';
  assert.match((await cli(['responsibility', '--file', await file(badLineage)], 2)).error, /silently replace/);
  const chainDefinition = structuredClone(definition); chainDefinition.id = 'attempt-chain-objective'; chainDefinition.dispatch.correlationKey = 'synthetic-attempt-chain';
  const chainJob = await adopt(chainDefinition); let chain = await retain(await observation(chainJob, 'absent'));
  const firstKey = digest('Synthetic native attempt A'); const laterKey = digest('Synthetic native attempt B');
  chain = await retain(await observation(chainJob, 'attempted', chain, { attemptKey: firstKey }));
  chain = await retain(await observation(chainJob, 'attempted', chain, { attemptKey: laterKey }));
  await retain(await observation(chainJob, 'ready', chain, { attemptKey: firstKey, child: readback('synthetic-chain-child', { correlationKey: chainJob.dispatch.correlationKey }) }));
  assert.ok((await advise(3, [], privateHome, chainJob.id)).reasons.includes('another-launch-unresolved'));
  const aliasDefinition = structuredClone(definition); aliasDefinition.id = 'dispatcher-alias-objective'; aliasDefinition.dispatch.correlationKey = 'synthetic-dispatcher-alias';
  const aliasJob = await adopt(aliasDefinition); let alias = await retain(await observation(aliasJob, 'absent'));
  alias = await retain(await observation(aliasJob, 'attempted', alias));
  await retain(await observation(aliasJob, 'ready', alias, { child: readback(dispatcher.threadId, { correlationKey: aliasJob.dispatch.correlationKey }) }));
  assert.ok((await advise(3, ['--context-needed'], privateHome, aliasJob.id)).reasons.includes('dispatcher-cannot-own-implementation'));
  const archive = join(home, 'dispatch-backup'); const restoredHome = join(home, 'dispatch-restored');
  const beforeArchive = await readStore(privateHome); const archived = await cli(['backup', '--to', archive]); const restored = await cli(['restore', '--from', archive, '--into', restoredHome]);
  assert.deepEqual(await readFile(join(restoredHome, 'bindings.json')), await readFile(bindingsPath));
  for (const record of beforeArchive.records) {
    for (const name of ['record.json', ...Object.keys(record.fileDigests ?? {})]) assert.deepEqual(await readFile(join(restoredHome, 'records', record.hash, name)), await readFile(join(privateHome, 'records', record.hash, name)));
  }
  assert.equal((await readStore(restoredHome)).records.some(record => record.hash === attemptHash), true);
  assert.ok((await advise(3, [], restoredHome)).reasons.includes('restored-home-suspended'));
  assert.equal((await cli(['dispatch', '--project', target.projectId, '--as-of', now()], 0, restoredHome)).dispatcher.threadId, dispatcher.threadId);
  const refresh = ['authority', 'schedule'].map(category => ({ type: 'observation', responsibilityId: adopted.id, subject: target, category, observedAt: now(), observer: `Synthetic new epoch ${category}`, availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [], homeEpoch: restored.epoch, ...(category === 'authority' ? { authority: adopted.authorityRef } : { schedules: [] }) }));
  await cli(['reconcile', '--id', adopted.id, '--import', await file({ schemaVersion: 1, records: refresh }), '--as-of', now()], 3, restoredHome);
  assert.ok((await advise(3, [], restoredHome)).reasons.includes('restored-home-suspended'));
  const wrapped = await observation(adopted, 'ready', current, { dispatcher: current.dispatch.dispatcher, child: current.dispatch.child }); wrapped.homeEpoch = restored.epoch;
  await cli(['reconcile', '--id', adopted.id, '--import', await file({ schemaVersion: 1, records: [wrapped] }), '--as-of', now()], 3, restoredHome);
  const wrappedDecision = await advise(3, [], restoredHome); assert.equal(wrappedDecision.reasons.includes('restored-home-suspended'), false); assert.ok(wrappedDecision.reasons.includes('child-readback-before-restore'));
  const wrappedRecord = (await readStore(restoredHome)).records.find(record => record.observer === wrapped.observer);
  const fresh = await observation(adopted, 'ready', wrappedRecord, { child: readback(child.threadId, { correlationKey: adopted.dispatch.correlationKey }) }); fresh.homeEpoch = restored.epoch;
  await cli(['reconcile', '--id', adopted.id, '--import', await file({ schemaVersion: 1, records: [fresh] }), '--as-of', now()], 3, restoredHome);
  assert.equal((await advise(0, ['--context-needed'], restoredHome)).next, 'continue-child');
  const legacy = structuredClone(definition); legacy.id = 'legacy-objective'; delete legacy.dispatch; await adopt(legacy);
  const legacyTask = await observation(adopted, 'ready', null, { child: readback(child.threadId, { correlationKey: adopted.dispatch.correlationKey }) });
  legacyTask.responsibilityId = legacy.id; delete legacyTask.dispatch; await retain(legacyTask);
  assert.ok((await advise(3, ['--context-needed'])).reasons.includes('child-bound-to-another-objective'));
  const second = structuredClone(definition); second.id = 'another-objective'; second.dispatch.correlationKey = 'synthetic-objective-two'; delete second.dispatch.requestedSettings;
  const secondAdopted = await adopt(second); let secondState = await retain(await observation(secondAdopted, 'absent'));
  const secondAdvice = await advise(0, [], privateHome, second.id); assert.equal(secondAdvice.next, 'create-via-dispatcher'); assert.equal(secondAdvice.nativeCreateRequest.thinking, 'high');
  secondState = await retain(await observation(secondAdopted, 'attempted', secondState));
  await retain(await observation(secondAdopted, 'ready', secondState, { child: readback(child.threadId, { correlationKey: second.dispatch.correlationKey }) }));
  assert.ok((await advise(3, [], privateHome, second.id)).reasons.includes('child-bound-to-another-objective'));
  const remoteKey = 'remote-fixture';
  const remoteTarget = { ...target, projectId: remoteKey, hostId: 'remote-host', nativeProjectId: 'remote-native', path: '/must-never-inspect-remote' };
  const remoteDispatcher = { ...dispatcher, authorityRef: { ...dispatcher.authorityRef, resource: remoteKey, destination: remoteTarget.nativeProjectId }, remoteAuthorityRef: { reference: 'Synthetic explicit existing native remote scope', action: 'dispatch-native-remote-child', resource: remoteKey, destination: remoteTarget.hostId } };
  selectedBindings.hosts['remote-host'] = { label: 'Synthetic remote host', machine: 'not-current-machine' };
  selectedBindings.projects[remoteKey] = { label: 'Synthetic remote', hostId: remoteTarget.hostId, nativeProjectId: remoteTarget.nativeProjectId, path: remoteTarget.path, repository: remoteTarget.repository, dispatcher: remoteDispatcher };
  await writeFile(bindingsPath, JSON.stringify(selectedBindings));
  const remoteDefinition = { ...structuredClone(definition), id: 'remote-native-job', target: remoteTarget, resource: remoteKey, destination: remoteTarget.nativeProjectId, authorityRef: { ...definition.authorityRef, resource: remoteKey, destination: remoteTarget.nativeProjectId }, dispatch: { ...structuredClone(definition.dispatch), correlationKey: 'synthetic-remote-objective', dispatcher: remoteDispatcher } };
  const remoteJob = await adopt(remoteDefinition); await retain(await observation(remoteJob, 'absent', null, { destinationSkill: { hostId: remoteTarget.hostId, ...remoteDefinition.dispatch.skill, observedAt: now(), sourceRef: 'Synthetic installed skill on configured remote host' } }));
  assert.ok((await advise(3, [], privateHome, remoteJob.id)).reasons.includes('remote-repository-readback-needed'));
  const remoteEvidence = await file({ synthetic: 'Attributable native remote repository source, no remote command' });
  await retain({ type: 'observation', responsibilityId: remoteJob.id, subject: remoteTarget, category: 'target', observedAt: now(), observer: 'Synthetic retained remote source', availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [{ path: remoteEvidence, sha256: digest(await readFile(remoteEvidence)) }] });
  const remoteAdvice = await advise(0, [], privateHome, remoteJob.id);
  assert.equal(remoteAdvice.nativeCreateRequest.target.projectId, remoteTarget.nativeProjectId); assert.equal(remoteAdvice.nativeRoute.coordinatorHostId, initialTarget.hostId); assert.equal(remoteAdvice.nativeRoute.destinationHostId, remoteTarget.hostId); assert.equal(remoteAdvice.repositoryAssurance, 'reported-remote');
  assert.equal((await resolve('name:Synthetic remote')).source.state, 'remote-uninspected');
  const remoteArchive = join(home, 'remote-dispatch-backup'); const remoteRestored = join(home, 'remote-dispatch-restored');
  await cli(['backup', '--to', remoteArchive]); const remoteEpoch = (await cli(['restore', '--from', remoteArchive, '--into', remoteRestored])).epoch;
  assert.ok((await advise(3, [], remoteRestored, remoteJob.id)).reasons.includes('restored-home-suspended'));
  const remoteRecords = (await readStore(privateHome)).records.filter(record => record.responsibilityId === remoteJob.id);
  const oldRemoteState = remoteRecords.find(record => record.category === 'tasks'); const oldRemoteSource = remoteRecords.find(record => record.category === 'target');
  const freshRemoteState = await observation(remoteJob, 'absent', oldRemoteState, { destinationSkill: oldRemoteState.dispatch.destinationSkill }); freshRemoteState.homeEpoch = remoteEpoch;
  const { hash: oldRemoteHash, fileDigests: remoteFileDigests, ...remoteSourceBody } = oldRemoteSource;
  const freshRemoteSource = { ...remoteSourceBody, observedAt: now(), observer: 'Synthetic fresh restored remote source', homeEpoch: remoteEpoch, supersedes: { hash: oldRemoteHash, reason: 'Explicit new epoch remote source acquisition.' } };
  const remoteRefresh = [freshRemoteState, freshRemoteSource, ...['authority', 'schedule'].map(category => ({ type: 'observation', responsibilityId: remoteJob.id, subject: remoteTarget, category, observedAt: now(), observer: `Synthetic remote epoch ${category}`, availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [], homeEpoch: remoteEpoch, ...(category === 'authority' ? { authority: remoteJob.authorityRef } : { schedules: [] }) }))];
  await cli(['reconcile', '--id', remoteJob.id, '--import', await file({ schemaVersion: 1, records: remoteRefresh }), '--as-of', now()], 3, remoteRestored);
  const remoteWrapped = await advise(3, [], remoteRestored, remoteJob.id); assert.equal(remoteWrapped.reasons.includes('restored-home-suspended'), false); assert.ok(remoteWrapped.reasons.includes('destination-skill-readback-needed'));
  const wrappedRemote = (await readStore(remoteRestored)).records.find(record => record.observer === freshRemoteState.observer);
  const freshRemoteSkill = await observation(remoteJob, 'absent', wrappedRemote, { destinationSkill: { ...oldRemoteState.dispatch.destinationSkill, observedAt: now() } }); freshRemoteSkill.homeEpoch = remoteEpoch;
  await cli(['reconcile', '--id', remoteJob.id, '--import', await file({ schemaVersion: 1, records: [freshRemoteSkill] }), '--as-of', now()], 3, remoteRestored);
  assert.equal((await advise(0, [], remoteRestored, remoteJob.id)).nativeCreateRequest.target.projectId, remoteTarget.nativeProjectId);
  delete selectedBindings.projects[remoteKey].dispatcher.remoteAuthorityRef; await writeFile(bindingsPath, JSON.stringify(selectedBindings));
  assert.ok((await advise(3, [], privateHome, remoteJob.id)).reasons.includes('remote-host-authority-needed'));
  const nonGitPath = join(home, 'non-git-project'); await mkdir(nonGitPath);
  selectedBindings.projects['non-git'] = { label: 'Synthetic non Git', hostId: target.hostId, nativeProjectId: 'non-git-native', path: nonGitPath };
  discovery.projects.push({ projectId: 'non-git-native', projectKind: 'local', label: 'Synthetic non Git', hostId: target.hostId, path: nonGitPath });
  await writeFile(bindingsPath, JSON.stringify(selectedBindings)); await writeFile(discoveryPath, JSON.stringify({ ...discovery, observedAt: now() }));
  const nonGit = await resolve('name:Synthetic non Git', 3); assert.equal(nonGit.nativeProject.projectId, 'non-git-native'); assert.ok(nonGit.reasons.includes('repository-source-needed'));
  const finalStore = await readStore(privateHome); assert.equal(finalStore.records.some(record => record.hash === attemptHash), true);
  assert.equal((await cli(['dispatch', '--project', target.projectId, '--as-of', now()])).jobs.length, 5);
  await cli(['maintain', '--write']);
  for (const path of ['docs/cli.md', 'docs/catalog.md', 'docs/briefing-guidance.json', 'docs/verification-index.json']) {
    const publicBytes = await readFile(join(root, path), 'utf8');
    for (const secret of [dispatcher.threadId, dispatcher.selectionRef, definition.dispatch.correlationKey, child.threadId]) assert.equal(publicBytes.includes(secret), false, `Private dispatch state absent from ${path}`);
  }
  report.dispatch = { privateHome, retainedAttemptHash: attemptHash, readyThreadId: child.threadId, bindingDigest: digest(await readFile(bindingsPath)), archiveManifestHash: archived.manifest.hash, restoredEpoch: restored.epoch, sourceAssurance: 'synthetic reported native evidence', providerExecution: 'unverified', effectiveChildAccess: 'unverified' };
  scenario('native-dispatch', 'Fresh-process private bootstrap recovery, exact supported request and skill, read-only decisions, attempted/pending/uncertain/no-effect/ready controls, duplicate imports, native membership/settings/policy refusal, standing scope, same-objective continuation, distinct objective reuse refusal and suspended archive restore. No native executor ran.');
}
