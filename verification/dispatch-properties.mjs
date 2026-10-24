export function verifyDispatchPolicy({ dispatch, records, work }, check) {
  const asOf = '2026-10-24T12:00:00.000Z'; const machine = 'synthetic-host';
  const target = { projectId: 'fixture', repository: 'https://example.invalid/fixture', executor: 'local-codex', hostId: 'local', nativeProjectId: 'native-project', path: '/synthetic/project', revision: 'a'.repeat(40), dirtyDigest: records.digest('clean') };
  const selected = { threadId: 'selected-dispatcher', hostId: target.hostId, nativeProjectId: target.nativeProjectId, selectionRef: 'Synthetic selected dispatcher', childAccessIntent: 'full-access-inherit', authorityRef: { reference: 'Synthetic standing human scope', action: 'dispatch-native-child', resource: target.projectId, destination: target.nativeProjectId } };
  const bindings = { schemaVersion: 1, localHostId: 'local', hosts: { local: { label: 'Synthetic local', machine } }, projects: { fixture: { label: 'Synthetic project', hostId: 'local', nativeProjectId: target.nativeProjectId, path: target.path, repository: target.repository, dispatcher: selected } } };
  const definition = records.recordPayload(records.parseDefinition({ id: 'dispatch-objective', parents: [], goal: 'Complete one synthetic coding objective.', context: 'Bounded dispatch domain.', target, action: 'implement', resource: 'fixture', destination: 'native-project', authorityRef: { reference: 'Synthetic human objective', action: 'implement', resource: 'fixture', destination: 'native-project' }, criteria: [{ id: 'outcome', description: 'Separate actual outcome review.', evidence: 'reported-check' }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: asOf, feature: { id: 'dispatch', method: 'Recover context.', intendedEffect: 'Finish this objective.', reviewAt: asOf }, lifecycle: { status: 'active' }, dispatch: { correlationKey: 'bounded-objective-one', dispatcher: selected, skill: { path: '/synthetic/SKILL.md', sha256: records.digest('skill') } } }));
  const readback = (threadId, observedAt) => ({ threadId, hostId: 'local', nativeProjectId: 'native-project', pinned: true, correlationKey: definition.dispatch.correlationKey, observedAt, sourceRef: 'Synthetic supported readback', recordedSettings: { model: 'gpt-6.1-sol', effort: 'high', sandboxMode: 'danger-full-access', approvalPolicy: 'never', observedAt, sourceRef: 'Synthetic recorded session' } });
  const make = ({ phase = 'ready', complete = true, availability = 'available', age = 0 } = {}) => {
    const observedAt = new Date(Date.parse(asOf) - age).toISOString();
    const priorAt = new Date(Math.min(Date.parse(asOf) - 1, Date.parse(observedAt) - 1)).toISOString();
    const attemptKey = records.digest('Synthetic exact native request');
    const common = { type: 'observation', responsibilityId: definition.id, subject: target, category: 'tasks', observer: 'Synthetic bounded native source', availability, coverage: { complete, gaps: complete ? [] : ['Synthetic missing page'] }, claims: [], evidenceRefs: [{ path: '/synthetic/readback.json', sha256: records.digest('source') }] };
    const attempt = records.recordPayload(records.parseObservation({ ...common, observedAt: priorAt, tasks: [], effects: [{ key: work.effectKey(definition), status: 'pending' }], dispatch: { phase: 'attempted', correlationKey: definition.dispatch.correlationKey, attemptKey, requestDigest: records.digest('Synthetic request bytes'), dispatcher: readback(selected.threadId, priorAt) } }));
    const observation = records.recordPayload(records.parseObservation({ ...common, observedAt, tasks: phase === 'ready' ? [{ nativeId: 'ready-child', effectKey: work.effectKey(definition), status: 'running' }] : [], effects: phase === 'ready' ? [] : [{ key: work.effectKey(definition), status: phase === 'absent' ? 'absent' : phase === 'uncertain' ? 'uncertain' : 'pending' }], dispatch: { phase, correlationKey: definition.dispatch.correlationKey, dispatcher: readback(selected.threadId, observedAt), ...(phase === 'absent' ? {} : { attemptKey }), ...(phase === 'attempted' ? { requestDigest: records.digest('Synthetic request bytes') } : {}), ...(phase === 'pending' ? { clientThreadId: 'pending-client' } : {}), ...(phase === 'ready' ? { child: readback('ready-child', observedAt) } : {}) }, ...(phase !== 'absent' ? { supersedes: { hash: attempt.hash, reason: 'Explicit same-objective source replacement.' } } : {}) }));
    return { id: definition.id, records: phase === 'absent' ? [definition, observation] : [definition, attempt, observation], bindings: structuredClone(bindings), catalog: { projects: [] }, machine, asOf, contextNeeded: false, skillVerified: true };
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
  for (const field of ['readback', 'settings']) {
    const input = make(); const event = input.records.at(-1); const restoredAt = new Date(Date.parse(asOf) - 1000).toISOString();
    const epoch = { type: 'epoch', hash: records.digest('restored-epoch'), restoredAt, priorHashes: [] }; event.homeEpoch = epoch.hash;
    const beforeRestore = new Date(Date.parse(restoredAt) - 1).toISOString();
    if (field === 'readback') event.dispatch.child.observedAt = beforeRestore;
    else event.dispatch.child.recordedSettings.observedAt = beforeRestore;
    for (const category of ['target', 'authority', 'schedule']) input.records.push({ type: 'observation', hash: records.digest(category), responsibilityId: definition.id, subject: target, category, observedAt: asOf, origin: category === 'target' ? 'observed-local' : 'reported', availability: 'available', coverage: { complete: true, gaps: [] }, homeEpoch: epoch.hash, authority: definition.authorityRef, schedules: [], claims: [], evidenceRefs: [] });
    input.records.push(epoch); assertAdvice(`restored-${field}-must-be-reacquired`, input, null);
  }
}
