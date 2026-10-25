export function verifyDispatchPolicy({ dispatch, records, work }, check) {
  const asOf = '2026-10-24T12:00:00.000Z'; const machine = 'synthetic-host';
  const target = { projectId: 'fixture', repository: 'https://example.invalid/fixture', executor: 'local-codex', hostId: 'local', nativeProjectId: 'native-project', path: '/synthetic/project', revision: 'a'.repeat(40), dirtyDigest: records.digest('clean') };
  const selected = { threadId: 'selected-dispatcher', hostId: target.hostId, nativeProjectId: 'dispatcher-own-project', selectionRef: 'Synthetic selected dispatcher', childAccessIntent: 'full-access-inherit', authorityRef: { reference: 'Synthetic standing human scope', action: 'dispatch-native-child', resource: target.projectId, destination: target.nativeProjectId } };
  const bindings = { schemaVersion: 1, localHostId: 'local', hosts: { local: { label: 'Synthetic local', machine } }, projects: { coordination: { label: 'Synthetic coordinator', hostId: 'local', nativeProjectId: selected.nativeProjectId, path: '/synthetic/coordinator', dispatcher: { ...selected, authorityRef: { ...selected.authorityRef, resource: 'coordination', destination: selected.nativeProjectId } } }, fixture: { label: 'Synthetic project', hostId: 'local', nativeProjectId: target.nativeProjectId, path: target.path, repository: target.repository, dispatcher: selected } } };
  const definition = records.recordPayload(records.parseDefinition({ id: 'dispatch-objective', parents: [], goal: 'Complete one synthetic coding objective.', context: 'Bounded dispatch domain.', target, action: 'implement', resource: 'fixture', destination: 'native-project', authorityRef: { reference: 'Synthetic human objective', action: 'implement', resource: 'fixture', destination: 'native-project' }, criteria: [{ id: 'outcome', description: 'Separate actual outcome review.', evidence: 'reported-check' }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: asOf, feature: { id: 'dispatch', method: 'Recover context.', intendedEffect: 'Finish this objective.', reviewAt: asOf }, lifecycle: { status: 'active' }, dispatch: { correlationKey: 'bounded-objective-one', dispatcher: selected, skill: { path: '/synthetic/SKILL.md', sha256: records.digest('skill') } } }));
  const readback = (threadId, observedAt) => ({ threadId, hostId: 'local', nativeProjectId: threadId === selected.threadId ? selected.nativeProjectId : target.nativeProjectId, creatorThreadId: selected.threadId, pinned: true, correlationKey: definition.dispatch.correlationKey, observedAt, sourceRef: 'Synthetic supported readback', recordedSettings: { model: 'gpt-6.1-sol', effort: 'high', sandboxMode: 'danger-full-access', approvalPolicy: 'never', observedAt, sourceRef: 'Synthetic recorded session' } });
  const make = ({ phase = 'ready', complete = true, availability = 'available', age = 0 } = {}) => {
    const observedAt = new Date(Date.parse(asOf) - age).toISOString();
    const priorAt = new Date(Math.min(Date.parse(asOf) - 1, Date.parse(observedAt) - 1)).toISOString();
    const attemptKey = records.digest('Synthetic exact native request');
    const common = { type: 'observation', responsibilityId: definition.id, subject: target, category: 'tasks', observer: 'Synthetic bounded native source', availability, coverage: { complete, gaps: complete ? [] : ['Synthetic missing page'] }, claims: [], evidenceRefs: [{ path: '/synthetic/readback.json', sha256: records.digest('source') }] };
    const attempt = records.recordPayload(records.parseObservation({ ...common, observedAt: priorAt, tasks: [], effects: [{ key: work.effectKey(definition), status: 'pending' }], dispatch: { phase: 'attempted', correlationKey: definition.dispatch.correlationKey, attemptKey, requestDigest: records.digest('Synthetic request bytes'), dispatcher: readback(selected.threadId, priorAt) } }));
    const observation = records.recordPayload(records.parseObservation({ ...common, observedAt, tasks: phase === 'ready' ? [{ nativeId: 'ready-child', effectKey: work.effectKey(definition), status: 'running' }] : [], effects: phase === 'ready' ? [] : [{ key: work.effectKey(definition), status: phase === 'absent' ? 'absent' : phase === 'uncertain' ? 'uncertain' : 'pending' }], dispatch: { phase, correlationKey: definition.dispatch.correlationKey, dispatcher: readback(selected.threadId, observedAt), ...(phase === 'absent' ? {} : { attemptKey }), ...(phase === 'attempted' ? { requestDigest: records.digest('Synthetic request bytes') } : {}), ...(phase === 'pending' ? { clientThreadId: 'pending-client' } : {}), ...(phase === 'ready' ? { child: readback('ready-child', observedAt) } : {}) }, ...(phase !== 'absent' ? { supersedes: { hash: attempt.hash, reason: 'Explicit same-objective source replacement.' } } : {}) }));
    return { id: definition.id, records: structuredClone(phase === 'absent' ? [definition, observation] : [definition, attempt, observation]), bindings: structuredClone(bindings), catalog: { projects: [] }, machine, asOf, contextNeeded: false, skillVerified: true, repositoryReadback: structuredClone(target), discovery: { schemaVersion: 1, observedAt: asOf, sourceRef: 'Synthetic complete project discovery', coverage: { complete: true, gaps: [] }, projects: [{ projectId: target.nativeProjectId, projectKind: 'local', label: 'Synthetic destination', hostId: target.hostId, path: target.path }, { projectId: selected.nativeProjectId, projectKind: 'local', label: 'Synthetic owner', hostId: selected.hostId, path: '/synthetic/coordinator' }] } };
  };
  const assertAdvice = (label, input, expected) => {
    const actual = dispatch.dispatchDecision(input);
    check('dispatch-recovery', { case: label, expected, actual, input }, expected ? actual.status === 'advice-ready' && actual.next === expected : actual.status !== 'advice-ready' && actual.next !== 'create-via-dispatcher' && actual.next !== 'continue-child', 'Only fresh, correlated, exact native evidence permits the requested bounded advice.');
    const reversed = dispatch.dispatchDecision({ ...input, records: [...input.records].reverse() });
    check('dispatch-recovery', { case: `${label}-permutation` }, records.canonical(actual) === records.canonical(reversed), 'Input record ordering does not change dispatch advice.');
  };
  for (const phase of ['absent', 'attempted', 'pending', 'uncertain', 'ready']) for (const complete of [true, false]) for (const availability of ['available', 'unavailable', 'denied', 'unknown']) for (const age of [0, -1, 86400000, 86400001]) {
    const eligible = complete && availability === 'available' && age >= 0 && age <= 86400000;
    const expected = eligible && phase === 'absent' ? 'create-via-dispatcher' : eligible && phase === 'ready' ? 'read-or-wait' : null;
    assertAdvice(`${phase}-${complete}-${availability}-${age}`, make({ phase, complete, availability, age }), expected);
  }
  const coordinatorPolicy = (input, model = 'gpt-6.1-sol', effort = 'medium') => {
    input.records[0].dispatch.coordinatorRequestedSettings = { model, effort, sourceRef: 'Synthetic explicit owner coordinator policy', scopedOverrideRef: 'Synthetic objective-scoped owner choice', scope: { objectiveId: input.id, role: 'coordinator' } };
    Object.assign(input.records.at(-1).dispatch.dispatcher.recordedSettings, { model, effort });
    return input;
  };
  for (const [model, effort] of [['gpt-6.1-sol', 'medium'], ['gpt-6.1-sol', 'low'], ['gpt-6-luna', 'max'], ['gpt-6.1-sol', 'max']]) {
    for (const phase of ['absent', 'ready']) {
      const input = coordinatorPolicy(make({ phase }), model, effort);
      assertAdvice(`scoped-coordinator-${model}-${effort}-${phase}`, input, phase === 'absent' ? 'create-via-dispatcher' : 'read-or-wait');
    }
  }
  for (const [label, edit] of [
    ['missing-owner-override', input => { delete input.records[0].dispatch.coordinatorRequestedSettings.scopedOverrideRef; }],
    ['wrong-objective-scope', input => { input.records[0].dispatch.coordinatorRequestedSettings.scope.objectiveId = 'another-objective'; }],
    ['wrong-role-scope', input => { input.records[0].dispatch.coordinatorRequestedSettings.scope.role = 'child'; }],
    ['missing-scope', input => { delete input.records[0].dispatch.coordinatorRequestedSettings.scope; }],
    ['stale-coordinator-settings', input => { input.records.at(-1).dispatch.dispatcher.recordedSettings.observedAt = '2000-01-01T00:00:00Z'; }],
    ['future-coordinator-settings', input => { input.records.at(-1).dispatch.dispatcher.recordedSettings.observedAt = '2099-01-01T00:00:00Z'; }],
    ['missing-coordinator-settings', input => { input.records.at(-1).dispatch.dispatcher.recordedSettings = null; }],
    ['mismatched-coordinator-effort', input => { input.records.at(-1).dispatch.dispatcher.recordedSettings.effort = 'high'; }],
    ['mismatched-coordinator-model', input => { input.records.at(-1).dispatch.dispatcher.recordedSettings.model = 'gpt-6-luna'; }],
    ['coordinator-policy-cannot-lower-child', input => { input.records.at(-1).dispatch.child.recordedSettings.effort = 'medium'; }],
    ['unchanged-pin-gate', input => { input.records.at(-1).dispatch.dispatcher.pinned = false; }],
    ['unchanged-authority-gate', input => { input.bindings.projects.fixture.dispatcher.authorityRef.resource = 'foreign'; }]
  ]) { const input = coordinatorPolicy(make()); edit(input); assertAdvice(label, input, null); }
  for (const phase of ['attempted', 'pending', 'uncertain']) {
    const input = coordinatorPolicy(make({ phase }));
    const parent = input.records[0];
    const revised = { ...structuredClone(parent), parents: [parent.hash], hash: records.digest(`coordinator-revision-${phase}`) };
    revised.dispatch.coordinatorRequestedSettings.sourceRef = 'Synthetic later owner correction';
    input.records.push(revised);
    assertAdvice(`coordinator-revision-preserves-${phase}`, input, null);
  }
  const revised = coordinatorPolicy(make({ phase: 'absent' }));
  const parent = structuredClone(revised.records[0]); delete parent.dispatch.coordinatorRequestedSettings;
  parent.hash = records.digest('legacy-coordinator-definition');
  revised.records[0].parents = [parent.hash]; revised.records.push(parent);
  assertAdvice('descendant-policy-is-not-immutable-identity', revised, 'create-via-dispatcher');
  for (const effort of ['high', 'max']) {
    const input = make({ phase: 'absent' }); input.records.at(-1).dispatch.dispatcher.recordedSettings.effort = effort;
    assertAdvice(`legacy-default-floor-${effort}`, input, 'create-via-dispatcher');
  }
  const childOnly = make();
  childOnly.records[0].dispatch.requestedSettings = { model: 'gpt-6.1-sol', effort: 'medium', sourceRef: 'Synthetic child-only owner source', scopedOverrideRef: 'Synthetic child-only choice' };
  childOnly.records.at(-1).dispatch.child.recordedSettings.effort = 'medium';
  assertAdvice('child-only-override-retains-coordinator-high', childOnly, 'read-or-wait');
  childOnly.records.at(-1).dispatch.dispatcher.recordedSettings.effort = 'medium';
  assertAdvice('child-only-override-cannot-lower-coordinator', childOnly, null);
  const cross = make({ phase: 'absent' }); const crossAdvice = dispatch.dispatchDecision(cross);
  check('dispatch-recovery', { case: 'cross-project-request-destination', actual: crossAdvice.nativeCreateRequest }, crossAdvice.nativeCreateRequest?.target.projectId === target.nativeProjectId && crossAdvice.dispatcherProject === 'coordination', 'The child destination is independent of dispatcher project ownership.');
  const crossReverse = dispatch.dispatchDecision({ ...cross, records: [...cross.records].reverse() });
  check('dispatch-recovery', { case: 'cross-project-request-permutation' }, records.canonical(crossAdvice) === records.canonical(crossReverse), 'Input order preserves exact cross-project request.');
  const standaloneEffect = (input, status, prior = null, extra = {}) => {
    const { hash, tasks, dispatch, supersedes, ...base } = input.records.at(-1);
    return records.recordPayload(records.parseObservation({ ...base, category: 'effect', effects: [{ key: work.effectKey(input.records[0]), status }], ...(prior ? { supersedes: { hash: prior.hash, reason: 'Targeted standalone native effect rediscovery.' } } : {}), ...extra }));
  };
  for (const status of ['pending', 'uncertain', 'completed']) {
    const absence = make({ phase: 'absent' }); absence.records.push(standaloneEffect(absence, status)); assertAdvice(`standalone-${status}-blocks-create`, absence, null);
    const ready = make(); ready.contextNeeded = true; ready.records.push(standaloneEffect(ready, status)); assertAdvice(`standalone-${status}-blocks-continuation`, ready, null);
  }
  const partialEffect = make({ phase: 'absent' }); const pendingEffect = standaloneEffect(partialEffect, 'uncertain');
  partialEffect.records.push(pendingEffect, standaloneEffect(partialEffect, 'absent', pendingEffect, { coverage: { complete: false, gaps: ['Synthetic incomplete native readback'] } }));
  assertAdvice('partial-standalone-resolution-cannot-erase-uncertainty', partialEffect, null);
  const resolvedEffect = make({ phase: 'absent' }); const oldEffect = standaloneEffect(resolvedEffect, 'uncertain');
  resolvedEffect.records.push(oldEffect, standaloneEffect(resolvedEffect, 'absent', oldEffect)); assertAdvice('complete-standalone-resolution-restores-create', resolvedEffect, 'create-via-dispatcher');
  const foreignEffect = make({ phase: 'absent' }); foreignEffect.records.push(standaloneEffect(foreignEffect, 'uncertain', null, { effects: [{ key: records.digest('another-effect'), status: 'uncertain' }] }));
  assertAdvice('another-effect-key-does-not-block', foreignEffect, 'create-via-dispatcher');
  const priorRevision = make({ phase: 'absent' }); priorRevision.records.push(standaloneEffect(priorRevision, 'uncertain', null, { subject: { ...target, revision: 'b'.repeat(40) }, observedAt: '2000-01-01T00:00:00Z' }));
  assertAdvice('standalone-uncertainty-survives-revision-and-age', priorRevision, null);
  const change = (label, edit) => { const input = make(); edit(input, input.records.at(-1)); assertAdvice(label, input, null); };
  change('wrong-child-project', (_input, event) => { event.dispatch.child.nativeProjectId = 'foreign-project'; });
  change('missing-child-project', (_input, event) => { event.dispatch.child.nativeProjectId = null; });
  change('wrong-child-host', (_input, event) => { event.dispatch.child.hostId = 'foreign-host'; });
  change('wrong-child-model', (_input, event) => { event.dispatch.child.recordedSettings.model = 'gpt-6-luna'; });
  change('wrong-child-policy', (_input, event) => { event.dispatch.child.recordedSettings.sandboxMode = 'workspace-write'; });
  change('missing-child-settings', (_input, event) => { event.dispatch.child.recordedSettings = null; });
  change('stale-child-settings', (_input, event) => { event.dispatch.child.recordedSettings.observedAt = '2000-01-01T00:00:00Z'; });
  change('wrong-dispatcher-model', (_input, event) => { event.dispatch.dispatcher.recordedSettings.model = 'gpt-6-luna'; });
  change('wrong-dispatcher-policy', (_input, event) => { event.dispatch.dispatcher.recordedSettings.approvalPolicy = 'on-request'; });
  change('dispatcher-unpinned', (_input, event) => { event.dispatch.dispatcher.pinned = false; });
  change('changed-selection', input => { input.bindings.projects.fixture.dispatcher.threadId = 'different-dispatcher'; });
  change('expired-standing-scope', input => { input.bindings.projects.fixture.dispatcher.authorityRef.expiresAt = '2000-01-01T00:00:00Z'; });
  change('wrong-standing-resource', input => { input.bindings.projects.fixture.dispatcher.authorityRef.resource = 'foreign-project'; });
  change('expired-objective-scope', input => { input.records[0] = { ...input.records[0], authorityRef: { ...input.records[0].authorityRef, expiresAt: '2000-01-01T00:00:00Z' } }; });
  change('unverified-installed-skill', input => { input.skillVerified = false; });
  change('uncorrelated-child', (_input, event) => { event.dispatch.child.correlationKey = 'another-objective'; });
  change('uncorrelated-effect', (_input, event) => { delete event.tasks[0].effectKey; });
  change('missing-attempt-chain', (input, event) => { input.records.splice(1, 1); delete event.supersedes; });
  change('conflicting-definition-heads', input => { const { hash, ...body } = definition; input.records.push(records.recordPayload({ ...body, context: 'Concurrent different definition.' })); });
  change('correlation-key-used-by-another-objective', input => { input.records.push({ ...structuredClone(definition), id: 'other-objective', hash: records.digest('other-objective') }); });
  change('child-used-by-another-objective', (input, event) => {
    const other = { ...structuredClone(definition), id: 'other-objective', hash: records.digest('other-definition') }; other.dispatch.correlationKey = 'bounded-objective-two';
    input.records.push(other, { ...structuredClone(event), responsibilityId: other.id, hash: records.digest('other-native-observation') });
  });
  change('child-used-by-legacy-objective', (input, event) => {
    const other = { ...structuredClone(definition), id: 'legacy-objective', hash: records.digest('legacy-definition') }; delete other.dispatch;
    input.records.push(other, { ...structuredClone(event), responsibilityId: other.id, hash: records.digest('legacy-native-observation') });
  });
  change('missing-project-discovery', input => { input.discovery = null; });
  change('stale-project-discovery', input => { input.discovery.observedAt = '2000-01-01T00:00:00Z'; });
  change('future-project-discovery', input => { input.discovery.observedAt = '2099-01-01T00:00:00Z'; });
  change('partial-project-discovery', input => { input.discovery.coverage.complete = false; });
  change('missing-destination-project', input => { input.discovery.projects.shift(); });
  change('missing-dispatcher-own-project', input => { input.discovery.projects.pop(); });
  change('wrong-destination-path', input => { input.discovery.projects[0].path = '/foreign/project'; });
  change('wrong-dispatcher-own-path', input => { input.discovery.projects[1].path = '/foreign/coordinator'; });
  change('missing-dispatcher-owner-selection', input => { delete input.bindings.projects.coordination.dispatcher; });
  change('borrowed-dispatcher-authority', input => { input.bindings.projects.fixture.dispatcher.authorityRef = structuredClone(input.bindings.projects.coordination.dispatcher.authorityRef); });
  change('objective-source-only-authority', input => { input.records[0].resource = 'coordination'; input.records[0].destination = selected.nativeProjectId; input.records[0].authorityRef = { ...input.records[0].authorityRef, resource: 'coordination', destination: selected.nativeProjectId }; });
  change('missing-actual-source', input => { input.repositoryReadback = null; });
  change('changed-actual-source', input => { input.repositoryReadback.dirtyDigest = records.digest('changed source'); });
  change('different-native-creator', (_input, event) => { event.dispatch.child.creatorThreadId = 'another-native-creator'; });
  change('remote-destination-held-for-scope', input => { input.discovery.projects[0].projectKind = 'remote'; });
  change('chatgpt-destination-unsupported', input => { input.discovery.projects[0].projectKind = 'chatgpt'; });
  change('explicit-effort-is-exact', (input, event) => { input.records[0].dispatch.requestedSettings = { model: 'gpt-6.1-sol', effort: 'high', sourceRef: 'Synthetic explicit exact High' }; event.dispatch.child.recordedSettings.effort = 'max'; });
  const remoteInput = () => {
    const input = make({ phase: 'absent' }); const def = input.records[0];
    def.target.hostId = 'remote-host'; input.bindings.hosts['remote-host'] = { label: 'Synthetic remote host', machine: 'not-current-machine' };
    input.bindings.projects.fixture.hostId = 'remote-host';
    const grant = { reference: 'Synthetic host-specific owner source', action: 'dispatch-native-remote-child', resource: target.projectId, destination: 'remote-host' };
    def.dispatch.dispatcher.remoteAuthorityRef = structuredClone(grant); input.bindings.projects.fixture.dispatcher.remoteAuthorityRef = structuredClone(grant);
    input.records.at(-1).subject = structuredClone(def.target); input.discovery.projects[0].hostId = 'remote-host'; input.discovery.projects[0].projectKind = 'remote';
    input.records.push({ type: 'observation', hash: records.digest('remote-repository-source'), responsibilityId: def.id, subject: structuredClone(def.target), category: 'target', origin: 'reported', observedAt: asOf, observer: 'Synthetic supported remote source', availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [{ path: '/synthetic/remote-source.json', sha256: records.digest('remote source') }] });
    input.records[1].effects[0].key = work.effectKey(def);
    input.records[1].dispatch.destinationSkill = { hostId: def.target.hostId, ...def.dispatch.skill, observedAt: asOf, sourceRef: 'Synthetic destination-installed skill bytes' };
    return input;
  };
  assertAdvice('native-remote-route-with-exact-host-grant', remoteInput(), 'create-via-dispatcher');
  for (const [label, edit] of [
    ['missing-destination-skill', input => { delete input.records[1].dispatch.destinationSkill; }],
    ['wrong-destination-skill-host', input => { input.records[1].dispatch.destinationSkill.hostId = 'foreign-host'; }],
    ['stale-destination-skill', input => { input.records[1].dispatch.destinationSkill.observedAt = '2000-01-01T00:00:00Z'; }],
    ['wrong-destination-skill-bytes', input => { input.records[1].dispatch.destinationSkill.sha256 = records.digest('wrong skill'); }],
    ['missing-host-grant', input => { delete input.bindings.projects.fixture.dispatcher.remoteAuthorityRef; }],
    ['wrong-host-grant', input => { input.bindings.projects.fixture.dispatcher.remoteAuthorityRef.destination = 'foreign-host'; }],
    ['expired-host-grant', input => { input.bindings.projects.fixture.dispatcher.remoteAuthorityRef.expiresAt = '2000-01-01T00:00:00Z'; }],
    ['missing-remote-repository-source', input => { input.records.pop(); }],
    ['stale-remote-repository-source', input => { input.records.at(-1).observedAt = '2000-01-01T00:00:00Z'; }],
    ['foreign-remote-repository-source', input => { input.records.at(-1).subject.repository = 'https://example.invalid/foreign'; }],
    ['remote-source-without-bytes', input => { input.records.at(-1).evidenceRefs = []; }]
  ]) { const input = remoteInput(); edit(input); assertAdvice(label, input, null); }
  for (const order of ['earlier', 'later']) {
    const input = remoteInput(); const valid = input.records.at(-1); const invalid = { ...structuredClone(valid), hash: records.digest(`remote-denied-${order}`), availability: 'denied', observedAt: new Date(Date.parse(asOf) - (order === 'earlier' ? 1000 : 0)).toISOString() };
    input.records.push(invalid); assertAdvice(`remote-unsuperseded-denial-${order}`, input, null);
    input.records.push({ ...structuredClone(valid), hash: records.digest(`remote-resolved-${order}`), supersedes: { hash: invalid.hash, reason: 'Explicit supported source replacement.' } });
    assertAdvice(`remote-explicit-denial-resolution-${order}`, input, 'create-via-dispatcher');
  }
  const remoteRestore = remoteInput(); const remoteDef = remoteRestore.records[0]; const epoch = { type: 'epoch', hash: records.digest('remote-epoch'), restoredAt: new Date(Date.parse(asOf) - 1000).toISOString(), priorHashes: [] };
  for (const event of remoteRestore.records.filter(record => record.type === 'observation')) event.homeEpoch = epoch.hash;
  remoteRestore.records.push(epoch);
  for (const category of ['authority', 'schedule']) remoteRestore.records.push({ type: 'observation', hash: records.digest(`remote-${category}`), responsibilityId: remoteDef.id, subject: remoteDef.target, category, observedAt: asOf, origin: 'reported', availability: 'available', coverage: { complete: true, gaps: [] }, homeEpoch: epoch.hash, authority: remoteDef.authorityRef, schedules: [], claims: [], evidenceRefs: [] });
  assertAdvice('remote-restored-with-fresh-reported-source', remoteRestore, 'create-via-dispatcher');
  remoteRestore.records.find(record => record.category === 'target').homeEpoch = 'wrong-epoch';
  assertAdvice('remote-restore-cannot-borrow-pre-epoch-source', remoteRestore, null);
  const continued = make(); continued.contextNeeded = true; assertAdvice('same-objective-context-needed', continued, 'continue-child');
  const completed = make(); completed.records.at(-1).tasks[0].status = 'completed'; assertAdvice('native-completion-is-outcome-inspection', completed, 'inspect-outcome');
  completed.contextNeeded = true; assertAdvice('authorized-completed-context-continuation', completed, 'continue-child');
  for (const resolution of [undefined, 'confirmed-no-effect']) {
    const input = make({ phase: 'uncertain' }); const uncertain = input.records.at(-1); const absence = make({ phase: 'absent' }).records.at(-1);
    absence.supersedes = { hash: uncertain.hash, reason: 'Explicit targeted native no-effect rediscovery.' }; absence.dispatch.resolution = resolution; absence.dispatch.attemptKey = uncertain.dispatch.attemptKey; absence.hash = records.digest({ resolution: resolution ?? null });
    input.records.push(absence); assertAdvice(`lost-response-absence-${resolution ?? 'unconfirmed'}`, input, resolution ? 'create-via-dispatcher' : null);
  }
  const advanced = make({ phase: 'pending' }); const old = advanced.records[0];
  advanced.records.push({ ...old, hash: records.digest('advanced-definition'), parents: [old.hash], target: { ...old.target, revision: 'b'.repeat(40) } });
  assertAdvice('pending-survives-revision-change', advanced, null);
  const masked = make(); const original = masked.records[1]; const ready = masked.records.at(-1);
  const laterAttempt = { ...structuredClone(original), hash: records.digest('later-attempt'), dispatch: { ...structuredClone(original.dispatch), attemptKey: records.digest('another-request') }, supersedes: { hash: original.hash, reason: 'Another native call was attempted.' } };
  ready.supersedes.hash = laterAttempt.hash; masked.records.splice(2, 0, laterAttempt); assertAdvice('ready-cannot-mask-another-unresolved-attempt', masked, null);
  const alias = make(); alias.contextNeeded = true; alias.records.at(-1).tasks[0].nativeId = selected.threadId; alias.records.at(-1).dispatch.child.threadId = selected.threadId;
  assertAdvice('dispatcher-cannot-own-implementation', alias, null);
  for (const field of ['readback', 'settings', 'discovery']) {
    const input = make(); const event = input.records.at(-1); const restoredAt = new Date(Date.parse(asOf) - 1000).toISOString();
    const epoch = { type: 'epoch', hash: records.digest('restored-epoch'), restoredAt, priorHashes: [] }; event.homeEpoch = epoch.hash;
    const beforeRestore = new Date(Date.parse(restoredAt) - 1).toISOString();
    if (field === 'readback') event.dispatch.child.observedAt = beforeRestore;
    else if (field === 'settings') event.dispatch.child.recordedSettings.observedAt = beforeRestore;
    else input.discovery.observedAt = beforeRestore;
    for (const category of ['target', 'authority', 'schedule']) input.records.push({ type: 'observation', hash: records.digest(category), responsibilityId: definition.id, subject: target, category, observedAt: asOf, origin: category === 'target' ? 'observed-local' : 'reported', availability: 'available', coverage: { complete: true, gaps: [] }, homeEpoch: epoch.hash, authority: definition.authorityRef, schedules: [], claims: [], evidenceRefs: [] });
    input.records.push(epoch); assertAdvice(`restored-${field}-must-be-reacquired`, input, null);
  }
}
