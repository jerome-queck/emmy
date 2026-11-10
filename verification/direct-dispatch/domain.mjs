export const clock = '2026-11-10T12:00:00.000Z';

export function fixture({ records, work }, mode = 'direct-root', phase = 'ready') {
  const target = { projectId: 'fixture', repository: 'https://example.invalid/direct', executor: 'local-codex', hostId: 'local', nativeProjectId: 'saved-target', path: '/synthetic/direct', revision: 'a'.repeat(40), dirtyDigest: records.digest('clean') };
  const principal = { kind: 'coordination-agent', id: 'actual-control-principal' };
  const root = { principal, hostId: 'local', selectionRef: 'Synthetic owner direct selection', authorityRef: { reference: 'Synthetic exact direct owner authority', action: 'dispatch-native-child-direct', resource: target.projectId, destination: target.nativeProjectId }, childAccessIntent: 'supported-policy', childPolicy: { sandboxMode: 'workspace-write', approvalPolicy: 'on-request' } };
  const dispatcher = { threadId: 'legacy-dispatcher', hostId: 'local', nativeProjectId: 'saved-owner', selectionRef: 'Synthetic historical selection', authorityRef: { ...root.authorityRef, action: 'dispatch-native-child' }, childAccessIntent: 'full-access-inherit' };
  const direct = mode === 'direct-root';
  const binding = { label: 'Synthetic project', hostId: target.hostId, nativeProjectId: target.nativeProjectId, path: target.path, repository: target.repository, ...(direct ? { directRoot: root } : { dispatcher }) };
  const owner = { label: 'Synthetic owner', hostId: 'local', nativeProjectId: dispatcher.nativeProjectId, path: '/synthetic/owner', dispatcher: { ...dispatcher, authorityRef: { ...dispatcher.authorityRef, resource: 'owner', destination: dispatcher.nativeProjectId } } };
  const definition = records.recordPayload(records.parseDefinition({ id: 'direct-objective', parents: [], goal: 'Finish one explicitly authorized objective.', context: 'Separate direct provenance from historical coordinator identity.', target, action: 'implement', resource: target.projectId, destination: target.nativeProjectId, authorityRef: { reference: 'Synthetic objective owner scope', action: 'implement', resource: target.projectId, destination: target.nativeProjectId }, criteria: [{ id: 'outcome', description: 'Independent exact outcome inspection.', evidence: 'reported-check' }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: clock, feature: { id: 'direct-dispatch', method: 'Read source and actual native receipts.', intendedEffect: 'Finish exact objective once.', reviewAt: clock }, lifecycle: { status: 'active' }, dispatch: { correlationKey: 'exact-direct-objective', ...(direct ? { mode, root } : { dispatcher }), skill: { path: '/synthetic/SKILL.md', sha256: records.digest('skill') } } }));
  const settings = { model: 'gpt-6.1-sol', effort: 'medium', serviceTier: 'default', sourceRef: 'Synthetic actual settings', observedAt: clock };
  const rootReadback = { principal, hostId: 'local', sourceRef: 'Synthetic actual root observation', observedAt: clock, recordedSettings: settings };
  const native = (threadId, projectId, policy) => ({ threadId, hostId: 'local', nativeProjectId: projectId, sourceRef: 'Synthetic saved membership and settings', observedAt: clock, recordedSettings: { ...settings, ...policy } });
  const coordinatorReadback = { ...native(dispatcher.threadId, dispatcher.nativeProjectId, { sandboxMode: 'danger-full-access', approvalPolicy: 'never' }), pinned: true };
  const base = { type: 'observation', responsibilityId: definition.id, subject: target, category: 'tasks', observer: 'Synthetic bounded direct source', observedAt: clock, availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [{ path: '/synthetic/receipt.json', sha256: records.digest('raw evidence') }] };
  const attemptKey = records.digest('exact launch attempt'); const requestDigest = records.digest('exact original create request');
  const routeReadback = direct ? { root: rootReadback } : { dispatcher: coordinatorReadback };
  const attempt = records.recordPayload(records.parseObservation({ ...base, observedAt: '2026-11-10T11:59:59.999Z', tasks: [], effects: [{ key: work.effectKey(definition), status: 'pending' }], dispatch: { phase: 'attempted', correlationKey: definition.dispatch.correlationKey, attemptKey, requestDigest, ...routeReadback } }));
  const child = { ...native('fresh-child', target.nativeProjectId, direct ? root.childPolicy : { sandboxMode: 'danger-full-access', approvalPolicy: 'never' }), correlationKey: definition.dispatch.correlationKey, creatorThreadId: direct ? 'actual-native-caller' : dispatcher.threadId };
  const observation = records.recordPayload(records.parseObservation({ ...base, tasks: phase === 'ready' ? [{ nativeId: child.threadId, status: 'running', effectKey: work.effectKey(definition) }] : [], effects: phase === 'ready' ? [] : [{ key: work.effectKey(definition), status: phase === 'absent' ? 'absent' : phase === 'uncertain' ? 'uncertain' : 'pending' }], dispatch: { phase, correlationKey: definition.dispatch.correlationKey, ...routeReadback, ...(phase !== 'absent' ? { attemptKey } : {}), ...(phase === 'attempted' ? { requestDigest } : {}), ...(phase === 'pending' ? { clientThreadId: 'pending-client' } : {}), ...(phase === 'ready' ? { child, ...(direct ? { creation: { principal, attemptKey, requestDigest, childThreadId: child.threadId, sourceRef: 'Synthetic retained exact native invocation and result', observedAt: clock, nativeCallerThreadId: 'actual-native-caller' } } : {}) } : {}) }, ...(phase !== 'absent' ? { supersedes: { hash: attempt.hash, reason: 'Exact same-objective native acquisition.' } } : {}) }));
  return JSON.parse(JSON.stringify({ id: definition.id, records: phase === 'absent' ? [definition, observation] : [definition, attempt, observation], bindings: { schemaVersion: 1, localHostId: 'local', hosts: { local: { label: 'Local', machine: 'synthetic-machine' } }, projects: { fixture: binding, ...(!direct ? { owner } : {}) } }, catalog: { projects: [] }, machine: 'synthetic-machine', asOf: clock, skillVerified: true, repositoryReadback: target, discovery: { schemaVersion: 1, observedAt: clock, sourceRef: 'Synthetic complete saved project discovery', coverage: { complete: true, gaps: [] }, projects: [{ projectId: target.nativeProjectId, projectKind: 'local', label: 'Synthetic project', hostId: 'local', path: target.path }, ...(!direct ? [{ projectId: owner.nativeProjectId, projectKind: 'local', label: owner.label, hostId: 'local', path: owner.path }] : [])] } }));
}

const def = input => input.records[0];
const state = input => input.records.at(-1).dispatch;
function remote(input, modules) {
  const target = def(input).target; Object.assign(target, { hostId: 'remote', path: '/synthetic/remote' });
  const grant = { reference: 'Synthetic exact remote host authority', action: 'dispatch-native-remote-child', resource: target.projectId, destination: target.hostId };
  def(input).dispatch.root.remoteAuthorityRef = grant;
  Object.assign(input.bindings.projects.fixture, { hostId: target.hostId, path: target.path });
  input.bindings.projects.fixture.directRoot.remoteAuthorityRef = { ...grant };
  input.bindings.hosts.remote = { label: 'Remote', machine: 'other-machine' };
  Object.assign(input.discovery.projects[0], { hostId: target.hostId, path: target.path, projectKind: 'remote' });
  const key = modules.work.effectKey(def(input));
  for (const record of input.records.filter(record => record.type === 'observation')) {
    record.subject = { ...target };
    for (const effect of record.effects ?? []) effect.key = key;
    for (const task of record.tasks ?? []) task.effectKey = key;
  }
  state(input).child.hostId = target.hostId;
  state(input).destinationSkill = { hostId: target.hostId, ...def(input).dispatch.skill, observedAt: clock, sourceRef: 'Synthetic installed remote skill' };
  const source = modules.records.recordPayload(modules.records.parseObservation({ type: 'observation', responsibilityId: input.id, subject: { ...target }, category: 'target', observer: 'Synthetic complete remote source', observedAt: clock, availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [{ path: '/synthetic/remote-source.json', sha256: modules.records.digest('source') }] }));
  input.records.splice(1, 0, source);
}

function repeatedAttempt(input, modules, { conflict = true, reverse = false, absent = false, response = 'earlier', creationBetween = false } = {}) {
  let original = input.records.find(record => record.dispatch?.phase === 'attempted');
  if (creationBetween) {
    const { hash, fileDigests, ...body } = original;
    const replacement = modules.records.recordPayload(modules.records.parseObservation({ ...body, observedAt: '2026-11-10T11:59:59.997Z' }));
    input.records[input.records.indexOf(original)] = replacement; original = replacement;
  }
  const { hash, fileDigests, ...body } = structuredClone(original);
  body.dispatch.requestDigest = conflict ? modules.records.digest('different original request under reused attempt key') : original.dispatch.requestDigest;
  body.supersedes = { hash: original.hash, reason: 'Retained acquisition under this declared attempt key.' };
  if (creationBetween) body.observedAt = '2026-11-10T11:59:59.999Z';
  const later = modules.records.recordPayload(modules.records.parseObservation(body));
  const current = input.records.at(-1);
  current.supersedes = { hash: later.hash, reason: 'Current result retains the whole original request chain.' };
  if (absent) {
    current.tasks = []; current.effects = [{ key: modules.work.effectKey(def(input)), status: 'absent' }];
    Object.assign(current.dispatch, { phase: 'absent', resolution: 'confirmed-no-effect' });
    delete current.dispatch.child; delete current.dispatch.creation;
  } else if (response === 'later' && current.dispatch.creation) current.dispatch.creation.requestDigest = later.dispatch.requestDigest;
  if (creationBetween) current.dispatch.creation.observedAt = '2026-11-10T11:59:59.998Z';
  input.records.splice(input.records.length - 1, 0, later);
  if (reverse) input.records.reverse();
}
export const cases = [
  ...['direct-root', 'legacy'].flatMap(mode => [false, true].flatMap(reverse => [
    { name: `conflicting-attempt-${mode}-${reverse}-ready`, mode, edit: (i, m) => repeatedAttempt(i, m, { reverse }), expected: null, rule: 'ExactAttemptRequest' },
    { name: `conflicting-attempt-${mode}-${reverse}-absence`, mode, edit: (i, m) => repeatedAttempt(i, m, { reverse, absent: true }), expected: null, rule: 'ExactAttemptRequest' },
    { name: `identical-attempt-${mode}-${reverse}`, mode, edit: (i, m) => repeatedAttempt(i, m, { conflict: false, reverse }), expected: 'read-or-wait', rule: 'ViableRoute' },
  ])),
  ...[false, true].map(reverse => ({ name: `conflicting-attempt-direct-later-response-${reverse}`, edit: (i, m) => repeatedAttempt(i, m, { reverse, response: 'later' }), expected: null, rule: 'ExactAttemptRequest' })),
  ...[false, true].map(reverse => ({ name: `identical-attempt-creation-between-clocks-${reverse}`, edit: (i, m) => repeatedAttempt(i, m, { reverse, conflict: false, creationBetween: true }), expected: null, rule: 'ProvenanceHeld' })),
  ...['absent', 'attempted', 'pending', 'uncertain', 'ready'].flatMap(phase => [true, false].flatMap(complete => ['available', 'unavailable', 'denied', 'unknown'].map(availability => ({ name: `direct-product-${phase}-${complete}-${availability}`, phase, edit: i => { i.records.at(-1).coverage = { complete, gaps: complete ? [] : ['missing page'] }; i.records.at(-1).availability = availability; }, expected: complete && availability === 'available' ? phase === 'absent' ? 'create-direct' : phase === 'ready' ? 'read-or-wait' : null : null, rule: complete && availability === 'available' && ['ready', 'absent'].includes(phase) ? 'ViableRoute' : 'HistoryHeld' })))),
  ...['direct-root', 'legacy'].flatMap(mode => ['absent', 'attempted', 'pending', 'uncertain', 'ready'].map(phase => ({ name: `${mode}-${phase}`, mode, phase, expected: phase === 'absent' ? mode === 'direct-root' ? 'create-direct' : 'create-via-dispatcher' : phase === 'ready' ? 'read-or-wait' : null, rule: phase === 'ready' || phase === 'absent' ? 'ViableRoute' : 'HistoryHeld' }))),
  ...[
    ['selection', i => { delete i.bindings.projects.fixture.directRoot; }],
    ['selection-binding', i => { i.bindings.projects.fixture.directRoot.selectionRef = 'different-selection'; }],
    ['wrong-root', i => { state(i).root.principal.id = 'foreign'; }],
    ['wrong-root-kind', i => { state(i).root.principal.kind = 'chatgpt-control'; }],
    ['root-host', i => { i.bindings.hosts.local.machine = 'foreign'; }],
    ['root-stale', i => { state(i).root.observedAt = '2020-01-01T00:00:00Z'; }],
    ['root-settings-stale', i => { state(i).root.recordedSettings.observedAt = '2020-01-01T00:00:00Z'; }],
    ['root-settings-missing', i => { state(i).root.recordedSettings = null; }],
    ['root-model', i => { state(i).root.recordedSettings.model = 'foreign'; }],
    ['root-tier', i => { state(i).root.recordedSettings.serviceTier = 'priority'; }],
    ['root-authority', i => { def(i).dispatch.root.authorityRef.resource = 'foreign'; i.bindings.projects.fixture.directRoot.authorityRef.resource = 'foreign'; }],
    ['root-authority-expired', i => { def(i).dispatch.root.authorityRef.expiresAt = '2020-01-01T00:00:00Z'; i.bindings.projects.fixture.directRoot.authorityRef.expiresAt = '2020-01-01T00:00:00Z'; }],
    ['objective-authority', i => { def(i).authorityRef.resource = 'foreign'; }],
    ['source-drift', i => { i.repositoryReadback.revision = 'b'.repeat(40); }],
    ['skill-drift', i => { i.skillVerified = false; }],
    ['project-partial', i => { i.discovery.coverage.complete = false; }],
    ['project-stale', i => { i.discovery.observedAt = '2020-01-01T00:00:00Z'; }],
    ['project-membership', i => { state(i).child.nativeProjectId = null; }],
    ['child-policy', i => { state(i).child.recordedSettings.sandboxMode = 'danger-full-access'; }],
    ['child-model', i => { state(i).child.recordedSettings.model = 'foreign'; }],
    ['child-tier', i => { delete state(i).child.recordedSettings.serviceTier; }],
  ].map(([name, edit]) => ({ name, edit, expected: null, rule: 'AuthorityHeld' })),
  ...[
    ['creation-missing', i => { delete state(i).creation; }],
    ['creation-principal', i => { state(i).creation.principal.id = 'foreign'; }],
    ['creation-attempt', i => { state(i).creation.attemptKey = 'f'.repeat(64); }],
    ['creation-request', i => { state(i).creation.requestDigest = 'f'.repeat(64); }],
    ['creation-child', i => { state(i).creation.childThreadId = 'foreign'; }],
    ['creation-stale', i => { state(i).creation.observedAt = '2020-01-01T00:00:00Z'; }],
    ['native-creator', i => { state(i).child.creatorThreadId = def(i).dispatch.root.principal.id; }],
    ['native-root-alias', i => { def(i).dispatch.root.principal.kind = 'native-thread'; i.bindings.projects.fixture.directRoot.principal.kind = 'native-thread'; state(i).root.principal.kind = 'native-thread'; state(i).creation.principal.kind = 'native-thread'; }],
  ].map(([name, edit]) => ({ name, edit, expected: null, rule: 'ProvenanceHeld' })),
  { name: 'no-native-creator-exposed', edit: i => { delete state(i).child.creatorThreadId; delete state(i).creation.nativeCallerThreadId; }, expected: 'read-or-wait', rule: 'ViableRoute' },
  { name: 'chatgpt-root', edit: i => { def(i).dispatch.root.principal.kind = 'chatgpt-control'; i.bindings.projects.fixture.directRoot.principal.kind = 'chatgpt-control'; state(i).root.principal.kind = 'chatgpt-control'; state(i).creation.principal.kind = 'chatgpt-control'; }, expected: 'read-or-wait', rule: 'ViableRoute' },
  { name: 'missing-membership-same-child', edit: i => { state(i).child.nativeProjectId = null; }, expected: null, rule: 'HistoryHeld' },
  { name: 'completed-outcome', edit: i => { i.records.at(-1).tasks[0].status = 'completed'; }, expected: 'inspect-outcome', rule: 'ViableRoute' },
  { name: 'completed-context', edit: i => { i.records.at(-1).tasks[0].status = 'completed'; i.contextNeeded = true; }, expected: 'continue-child', rule: 'ViableRoute' },
  { name: 'lost-response-then-absence', phase: 'uncertain', edit: (i, m) => { const prior = i.records.at(-1); const absent = fixture(m, 'direct-root', 'absent').records.at(-1); absent.supersedes = { hash: prior.hash, reason: 'Absence does not settle uncertain launch.' }; absent.hash = m.records.digest('new absence'); i.records.push(absent); }, expected: null, rule: 'HistoryHeld' },
  { name: 'same-id-membership-correction', edit: i => { state(i).child.nativeProjectId = def(i).target.nativeProjectId; }, expected: 'read-or-wait', rule: 'ViableRoute' },
  { name: 'mixed-mode', parseOnly: true, edit: i => { def(i).dispatch.dispatcher = { threadId: 'invented' }; }, expected: 'parser-refused', rule: 'RouteHeld' },
  { name: 'unknown-mode', parseOnly: true, edit: i => { def(i).dispatch.mode = 'other'; }, expected: 'parser-refused', rule: 'RouteHeld' },
  { name: 'changed-immutable-root', identityOnly: true, edit: i => { def(i).dispatch.root.principal.id = 'different'; }, expected: 'identity-changed', rule: 'RouteHeld' },
  { name: 'legacy-to-direct-immutable', identityOnly: true, mode: 'legacy', edit: (i, m) => { def(i).dispatch = fixture(m).records[0].dispatch; }, expected: 'identity-changed', rule: 'RouteHeld' },
  ...['absent', 'attempted', 'pending', 'uncertain', 'ready'].flatMap(phase => [
    { name: `root-revision-${phase}`, phase, revisionOnly: true, edit: i => { def(i).dispatch.root.principal.id = 'another-root'; }, expected: 'revision-refused', rule: 'RouteHeld' },
    { name: `mode-revision-${phase}`, phase, mode: 'legacy', revisionOnly: true, edit: (i, m) => { def(i).dispatch = fixture(m).records[0].dispatch; }, expected: 'revision-refused', rule: 'RouteHeld' },
  ]),
  { name: 'remote-direct-ready', edit: remote, expected: 'read-or-wait', rule: 'ViableRoute' },
  { name: 'remote-direct-scope', edit: (i, m) => { remote(i, m); delete def(i).dispatch.root.remoteAuthorityRef; delete i.bindings.projects.fixture.directRoot.remoteAuthorityRef; }, expected: null, rule: 'AuthorityHeld' },
  { name: 'remote-direct-source', edit: (i, m) => { remote(i, m); i.records.splice(1, 1); }, expected: null, rule: 'AuthorityHeld' },
  { name: 'remote-direct-skill', edit: (i, m) => { remote(i, m); delete state(i).destinationSkill; }, expected: null, rule: 'AuthorityHeld' },
  { name: 'restored-direct-current', restored: true, expected: 'read-or-wait', rule: 'ViableRoute' },
  { name: 'restored-root-readback', restored: true, edit: i => { state(i).root.observedAt = '2026-11-10T11:59:58.999Z'; }, expected: null, rule: 'AuthorityHeld' },
  { name: 'restored-root-settings', restored: true, edit: i => { state(i).root.recordedSettings.observedAt = '2026-11-10T11:59:58.999Z'; }, expected: null, rule: 'AuthorityHeld' },
  { name: 'restored-creation', restored: true, edit: i => { i.records.find(record => record.dispatch?.phase === 'attempted').observedAt = '2026-11-10T11:59:58.998Z'; state(i).creation.observedAt = '2026-11-10T11:59:58.999Z'; }, expected: null, rule: 'ProvenanceHeld' },
];

export function evaluateCase(modules, test) {
  const input = fixture(modules, test.mode ?? 'direct-root', test.phase ?? 'ready');
  const original = structuredClone(def(input));
  if (test.restored) {
    const epoch = { type: 'epoch', hash: modules.records.digest('direct-restored-epoch'), restoredAt: '2026-11-10T11:59:59.000Z', priorHashes: [] };
    for (const record of input.records.filter(record => record.type === 'observation')) record.homeEpoch = epoch.hash;
    input.records.splice(1, 0, epoch, ...['target', 'authority', 'schedule'].map(category => ({ type: 'observation', hash: modules.records.digest(`direct-restored-${category}`), responsibilityId: input.id, subject: { ...def(input).target }, category, observedAt: clock, origin: category === 'target' ? 'observed-local' : 'reported', availability: 'available', coverage: { complete: true, gaps: [] }, homeEpoch: epoch.hash, authority: def(input).authorityRef, schedules: [], claims: [], evidenceRefs: [] })));
  }
  const before = modules.records.canonical(modules.records.dispatchIdentity(def(input).dispatch));
  test.edit?.(input, modules);
  if (test.revisionOnly) {
    const { hash, fileDigests, ...body } = def(input);
    const revised = modules.records.recordPayload(modules.records.parseDefinition({ ...body, parents: [original.hash] }));
    try { modules.records.validateReferences([original, revised]); return { next: 'revision-accepted' }; }
    catch (error) { return { next: 'revision-refused', error: error.message }; }
  }
  if (test.identityOnly) return { next: modules.records.canonical(modules.records.dispatchIdentity(def(input).dispatch)) === before ? 'identity-same' : 'identity-changed' };
  if (test.parseOnly) {
    try { modules.records.parseDefinition(def(input)); return { next: 'parser-accepted' }; }
    catch (error) { return { next: 'parser-refused', error: error.message }; }
  }
  const result = modules.dispatch.dispatchDecision(input);
  return { next: result.status === 'advice-ready' ? result.next : null, result };
}
