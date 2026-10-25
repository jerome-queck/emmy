import { morningBounds, verifyMorningPolicy } from './morning-properties.mjs';
import { incarnationBounds, legacyBounds, verifyIncarnationPolicy, verifyLegacyPolicy } from './incarnation-properties.mjs';
import { canonical, digest, parseDefinition, parseObservation, recordPayload } from '../src/records.mjs';
import { verifyDispatchPolicy } from './dispatch-properties.mjs';
import { cloudBounds, verifyCloudPolicy } from './cloud-properties.mjs';
import { calendarBounds, verifyCalendarPolicy } from './calendar-properties.mjs';
import { fleetBounds, verifyFleetPolicy } from './fleet-properties.mjs';

const asOf = '2026-10-22T12:00:00.000Z';
const clock = milliseconds => new Date(Date.parse(asOf) + milliseconds).toISOString();
const firstRevision = 'a'.repeat(40);
const secondRevision = 'b'.repeat(40);
const machine = 'fixture-machine';
const criterion = (id = 'artifact', evidence = 'local-digest') => ({ id, description: `Bounded ${id} evidence.`, evidence, ...(evidence === 'local-digest' ? { path: `/fixture/${id}`, sha256: '0'.repeat(64) } : {}) });
const subjects = [
  { projectId: 'alpha', repository: 'https://example.invalid/alpha', executor: 'local-codex', hostId: 'host-alpha', nativeProjectId: 'native-alpha', path: '/fixture/alpha', revision: firstRevision, dirtyDigest: '1'.repeat(64) },
  { projectId: 'beta', repository: 'https://example.invalid/beta', executor: 'local-codex', hostId: 'host-beta', nativeProjectId: 'native-beta', path: '/fixture/beta', revision: firstRevision, dirtyDigest: '2'.repeat(64) }
];
const bindings = { schemaVersion: 1, localHostId: 'host-alpha', hosts: { 'host-alpha': { label: 'Alpha host', machine }, 'host-beta': { label: 'Beta host', machine } }, projects: Object.fromEntries(subjects.map(target => [target.projectId, { label: target.projectId, repository: target.repository, hostId: target.hostId, nativeProjectId: target.nativeProjectId, path: target.path }])) };
const catalog = { projects: subjects.map(target => ({ id: target.projectId, label: target.projectId, repository: target.repository })) };
const definition = (id = 'watch-alpha', target = subjects[0], criteria = [criterion()]) => recordPayload(parseDefinition({ id, parents: [], goal: 'Retain a bounded outcome.', context: 'Bounded synthetic source context.', target, action: 'verify', resource: target.projectId, destination: 'local-evidence', authorityRef: { reference: 'Bounded owner request', action: 'verify', resource: target.projectId, destination: 'local-evidence' }, criteria, freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: clock(3600000), feature: { id: 'bounded-method', method: 'Inspect bounded evidence.', intendedEffect: 'Maintain expected outcome.', reviewAt: clock(3600000) }, lifecycle: { status: criteria.length ? 'active' : 'retired' } }));
const observation = (def, change = {}) => recordPayload({ ...parseObservation({ responsibilityId: def.id, subject: def.target, observedAt: clock(-100), observer: 'Bounded source', category: 'criteria', availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [], ...change }), origin: change.origin ?? 'reported' });
const claim = (def, item = def.criteria[0], outcome = 'pass') => ({ criterionId: item.id, revision: def.target.revision, kind: item.evidence, specHash: digest(item), outcome, evidenceRef: 'Bounded retained output.' });
const localTarget = (def, change = {}) => observation(def, { category: 'target', origin: 'observed-local', ...change });
const tasks = (def, change = {}) => observation(def, { category: 'tasks', tasks: [], ...change });
const evidence = (def, outcome = 'pass', change = {}) => observation(def, { origin: 'observed-local', claims: def.criteria.map(item => claim(def, item, outcome)), ...change });
const context = (def, changes = {}) => ({ definitions: [def], observations: [localTarget(def), tasks(def), evidence(def)], repairs: [], reviews: [], featureReviews: [], bindings: { ...bindings, localHostId: def.target.hostId }, catalog, machine, asOf, ...changes });
const reviewed = (state, inputs) => recordPayload({ ...state, inputHashes: inputs.map(item => item.hash).sort() });
const permutations = values => values.length < 2 ? [values] : values.flatMap((value, index) => permutations(values.filter((_, candidate) => candidate !== index)).map(rest => [value, ...rest]));

export const bounds = {
  processIncarnation: incarnationBounds,
  legacyBaseline: legacyBounds,
  cloudAdmission: cloudBounds,
  responsibilities: ['watch-alpha', 'watch-beta'],
  targets: subjects,
  revisions: [firstRevision, secondRevision],
  criterionCounts: [0, 1, 2],
  observationCounts: [0, 1, 2],
  repairCounts: [0, 1, 2],
  evidenceOutcomes: ['pass', 'fail', 'unknown'],
  availability: ['available', 'unavailable', 'denied', 'unknown'],
  coverage: ['complete', 'partial'],
  agesMs: [-1, 0, 86400000, 86400001],
  heads: [1, 2],
  liveCutoffOffsetsMs: [-172800000, -1, 0, 1, 172800000],
  liveObservationCounts: [0, 1, 2],
  nativeTaskCorrelation: { statuses: ['pending', 'running', 'unknown', 'completed'], keys: ['missing', 'old-effect', 'current-effect'], agesMs: [0, 86400001], coverage: ['complete', 'partial'], maximumObservations: { target: 1, tasks: 2, criteria: 1 } },
  restoredExecutors: ['local-codex', 'dot-cloud', 'codex-cloud'],
  restoredReplacements: ['wrong-scope', 'unavailable', 'denied', 'unknown', 'partial', 'future', 'without-supersession', 'renewed'],
  restoreTemporalMaximum: { observations: 5, target: 1, authority: 2, tasks: 1, schedule: 1, epochs: 1 },
  processGroupCleanup: { syntheticPids: [17, 18], errorTraces: [[null, 'ESRCH'], ['ESRCH', 'ESRCH'], ['EPERM', 'ESRCH'], ['EPERM', 'EPERM']], unexpectedError: 'EIO', realSignals: false },
  triggerStates: ['missing', 'partial', 'unavailable', 'enabled-no-run', 'enabled-no-outcome', 'enabled-no-delivery', 'enabled-complete', 'disabled', 'conflicting-enabled-disabled', 'superseded-enabled'],
  temporalTraces: ['green-unknown', 'fail-pass-repair-fail', 'fail-pass-repair-fail-pass-repair', 'recurrence-before-source-advance', 'weakened-definition', 'two-failed-repairs', 'completed-fail-failed-repair-failed-repair'],
  temporalMaximum: { criteria: 2, criterionObservations: 4, targetObservations: 2, taskObservations: 1, effectObservations: 2, repairs: 2, priorReviews: 3 },
  importGraph: { records: 2, orderings: 2, testedPrefixes: [0, 1, 2], explicitAbstractCycle: true },
  dispatchRecovery: { phases: ['absent', 'attempted', 'pending', 'uncertain', 'ready'], coverage: ['complete', 'partial'], availability: ['available', 'unavailable', 'denied', 'unknown'], agesMs: [-1, 0, 86400000, 86400001], stateCombinations: 160, targetedCases: 107, permutations: ['original', 'reversed'], assumptions: 'Parsed byte-verified journal inputs and symbolic hash identities; native state remains reported.' },
  calendarAcceptance: calendarBounds,
  fleetContract: fleetBounds, morningContract: morningBounds,
  assumptions: [
    'These are finite products and targeted temporal traces, not one full Cartesian product of every field.',
    'Active zero-criterion definitions are rejected by the actual boundary parser. Zero criteria cover retired/merged states.',
    'Observed-local observations model only trusted production inspection output; parser-forced reported imports are tested separately.',
    'Local filesystem, actual git identity, command execution, child cleanup, archive bytes and process interruption require the CLI driver.',
    'No provider authentication, native authority, non-author review, native at-most-once execution, hardware-loss recovery or arbitrary-size theorem is proved.'
  ]
};

export function verifyProperties({ work, responsibilities, records, dispatch, calendar, cloud, incarnation, migration, fleet, morning }, selected = null) {
  const counts = {};
  const check = (property, input, condition, expectation) => {
    if (selected && selected !== property) return;
    counts[property] = (counts[property] ?? 0) + 1;
    if (!condition) { const error = new Error(`${property} violated. ${expectation}`); error.property = property; error.counterexample = input; throw error; }
  };
  const enabled = property => !selected || selected === property;
  const state = (def, changes = {}) => responsibilities.reconcileState(def, context(def, changes));
  const eachSubject = callback => { for (const id of bounds.responsibilities) for (const base of subjects) for (const revision of bounds.revisions) callback(definition(id, { ...base, revision })); };

  if (enabled('exact-binding')) {
    eachSubject(def => {
      for (const mode of ['exact', 'missing-project', 'missing-host', 'missing-path', 'wrong-path', 'wrong-native', 'wrong-host', 'wrong-repository', 'wrong-machine', 'foreign-local-host', 'public-repository-mismatch']) {
        const privateBindings = structuredClone(bindings); privateBindings.localHostId = def.target.hostId;
        const activeCatalog = structuredClone(catalog); const binding = privateBindings.projects[def.target.projectId];
        if (mode === 'missing-project') delete privateBindings.projects[def.target.projectId];
        if (mode === 'missing-host') delete privateBindings.hosts[def.target.hostId];
        if (mode === 'missing-path') delete binding.path;
        if (mode === 'wrong-path') binding.path = '/foreign/path';
        if (mode === 'wrong-native') binding.nativeProjectId = 'foreign-native';
        if (mode === 'wrong-host') binding.hostId = 'foreign-host';
        if (mode === 'wrong-repository') binding.repository = 'https://example.invalid/foreign';
        if (mode === 'wrong-machine') privateBindings.hosts[def.target.hostId].machine = 'foreign-machine';
        if (mode === 'foreign-local-host') privateBindings.localHostId = 'foreign-host';
        if (mode === 'public-repository-mismatch') { delete binding.repository; activeCatalog.projects.find(item => item.id === def.target.projectId).repository = 'https://example.invalid/foreign'; }
        const result = work.routeTarget(def, { bindings: privateBindings, catalog: activeCatalog, machine });
        check('exact-binding', { mode, def, privateBindings, activeCatalog, result }, (result.status === 'bound') === (mode === 'exact'), 'Only exact own bindings and the intended canonical repository may establish a route.');
      }
    });
    const explicit = definition(); const rawDefault = Object.fromEntries(Object.entries(explicit).filter(([key]) => key !== 'hash')); const omitted = { ...rawDefault, target: { ...rawDefault.target } }; delete omitted.target.executor;
    check('exact-binding', { case: 'local-default', parsed: records.parseDefinition(omitted) }, records.parseDefinition(omitted).target.executor === 'local-codex', 'Omitted coding executor defaults to local Codex.');
    let activeEmptyRejected = false; try { records.parseDefinition({ ...rawDefault, criteria: [] }); } catch { activeEmptyRejected = true; }
    check('exact-binding', { case: 'active-empty-criteria' }, activeEmptyRejected, 'An active responsibility requires declared finish evidence.');
    const unknown = definition('inherited-project', { ...subjects[0], projectId: 'constructor' });
    const unknownResult = work.routeTarget(unknown, { bindings: { hosts: {}, projects: {} }, catalog: { projects: [] }, machine });
    check('exact-binding', { case: 'inherited-project', unknownResult }, unknownResult.project === null && unknownResult.status !== 'bound', 'Inherited constructor is not a registered project.');
    const hostDefinition = definition('inherited-host', { ...subjects[0], projectId: 'constructor', hostId: 'constructor' });
    const ownProject = { label: 'Explicit constructor', path: hostDefinition.target.path, hostId: 'constructor', nativeProjectId: hostDefinition.target.nativeProjectId, repository: hostDefinition.target.repository };
    const inheritedHost = work.routeTarget(hostDefinition, { bindings: { localHostId: 'constructor', projects: { constructor: ownProject }, hosts: {} }, catalog: { projects: [] }, machine });
    check('exact-binding', { case: 'inherited-host', inheritedHost }, inheritedHost.reasons.includes('exact-binding-missing'), 'Inherited constructor is not an own host binding.');
  }

  if (enabled('observation-gates')) eachSubject(def => {
    for (const age of bounds.agesMs) for (const complete of [false, true]) for (const availability of bounds.availability) for (const field of ['exact', ...work.subjectFields]) {
      const observedSubject = { ...def.target }; if (field !== 'exact') observedSubject[field] = field === 'revision' ? (def.target.revision === firstRevision ? secondRevision : firstRevision) : field === 'dirtyDigest' ? 'f'.repeat(64) : field === 'path' ? '/foreign/path' : `foreign-${field}`;
      const item = { ...observation(def), subject: observedSubject, observedAt: clock(-age), availability, coverage: { complete, gaps: complete ? [] : ['bounded gap'] } };
      const result = work.observationStatus(item, def.target, asOf, 86400000);
      const expected = field === 'exact' && age >= 0 && age <= 86400000 && complete && availability === 'available';
      check('observation-gates', { def, item, result, expected }, result.eligible === expected, 'Only exact, current, complete and available observations are eligible; 24 hours is inclusive.');
    }
  });

  if (enabled('authority-scope')) eachSubject(def => {
    for (const reference of [false, true]) for (const action of [false, true]) for (const resource of [false, true]) for (const destination of [false, true]) for (const expiry of [null, -1, 0, 1]) {
      const authorityRef = { reference: reference ? 'Bounded owner' : '', action: action ? def.action : 'foreign', resource: resource ? def.resource : 'foreign', destination: destination ? def.destination : 'foreign', ...(expiry === null ? {} : { expiresAt: clock(expiry) }) };
      const result = work.authorityStatus({ ...def, authorityRef }, asOf); const expected = reference && action && resource && destination && (expiry === null || expiry >= 0);
      check('authority-scope', { authorityRef, result, expected }, result.eligible === expected, 'Authority must name the exact action, resource and destination and remain unexpired.');
    }
    check('authority-scope', { case: 'absent' }, !work.authorityStatus({ ...def, authorityRef: null }, asOf).eligible, 'Absent authority cannot authorize work.');
  });

  if (enabled('live-cutoff')) {
    for (const requestOffset of bounds.liveCutoffOffsetsMs) for (const completionOffset of bounds.liveCutoffOffsetsMs) for (const observationCount of bounds.liveObservationCounts) {
      const requested = clock(requestOffset); const completed = clock(completionOffset);
      const observationTimes = [clock(-1), clock(1)].slice(0, observationCount);
      const result = work.reviewAsOf(requested, completed, observationTimes); const inputs = [requested, completed, ...observationTimes];
      check('live-cutoff', { requested, completed, observationTimes, result }, inputs.every(value => Date.parse(result) >= Date.parse(value)) && inputs.includes(result), 'Every live review includes requested time, actual completion and any local observation times, including an empty local inspection result.');
    }
    eachSubject(def => {
      const historical = clock(-172800000);
      const expired = { ...def, authorityRef: { ...def.authorityRef, expiresAt: clock(-169200000) } };
      const inputs = { observations: [localTarget(expired, { observedAt: historical }), tasks(expired, { observedAt: historical }), evidence(expired, 'pass', { observedAt: historical })], asOf: historical };
      const replay = state(expired, inputs);
      const live = state(expired, { ...inputs, asOf: work.reviewAsOf(historical, asOf) });
      check('live-cutoff', { trace: 'historical-replay-live-review', replay, live }, replay.authority.eligible && replay.proposals[0]?.type === 'work' && !live.authority.eligible && live.proposals[0]?.type === 'observe-or-decide' && live.observations.every(item => item.reasons.includes('stale-observation')), 'Fixed historical replay remains valid while live completion expires the same old authority and evidence.');
    });
  }

  if (enabled('process-group-cleanup')) {
    for (const pid of bounds.processGroupCleanup.syntheticPids) for (const codes of bounds.processGroupCleanup.errorTraces) {
      const calls = []; let index = 0;
      const kill = (target, signal) => { calls.push({ target, signal }); const code = codes[index++]; if (code) throw Object.assign(new Error(code), { code }); };
      const first = responsibilities.terminateOwnedProcessGroup(pid, kill); const second = responsibilities.terminateOwnedProcessGroup(pid, kill);
      const expected = codes.map(code => code === 'EPERM' ? 'unverified' : code === 'ESRCH' ? 'absent' : 'signalled');
      check('process-group-cleanup', { pid, codes, calls, first, second }, first.status === expected[0] && second.status === expected[1] && [first, second].every((result, position) => codes[position] !== 'EPERM' || result.error === 'EPERM') && calls.length === 2 && calls.every(call => call.target === -pid && call.signal === 'SIGKILL'), 'Owned-group signal errors distinguish absent groups from explicit cleanup uncertainty, including repeated cleanup.');
    }
    let called = false; const notStarted = responsibilities.terminateOwnedProcessGroup(undefined, () => { called = true; });
    check('process-group-cleanup', { case: 'not-started', notStarted, called }, notStarted.status === 'not-started' && !called, 'An execution that never acquired a PID sends no signal.');
    const unexpected = Object.assign(new Error('Bounded unexpected syscall error.'), { code: bounds.processGroupCleanup.unexpectedError }); let propagated = false;
    try { responsibilities.terminateOwnedProcessGroup(17, () => { throw unexpected; }); } catch (error) { propagated = error === unexpected; }
    check('process-group-cleanup', { case: 'unexpected-error', propagated }, propagated, 'Unexpected errors propagate rather than becoming a cleanup success.');
  }

  if (enabled('effect-stability')) eachSubject(def => {
    const key = work.effectKey(def);
    for (const revision of bounds.revisions) for (const reviewAt of [clock(0), clock(1)]) {
      const changed = { ...def, goal: 'Edited goal text.', context: 'Edited context.', hash: 'f'.repeat(64), reviewAt, target: { ...def.target, revision, dirtyDigest: 'f'.repeat(64) } };
      check('effect-stability', { def, changed, key, changedKey: work.effectKey(changed) }, work.effectKey(changed) === key, 'Time, definition hash, revision and dirty bytes alone do not create a new effect.');
    }
    const laterOccurrence = { ...def, trigger: { nextWindow: { start: clock(0) } } };
    check('effect-stability', { def, laterOccurrence }, work.effectKey(laterOccurrence) !== key && work.effectKey({ ...laterOccurrence, trigger: { nextWindow: { start: clock(1) } } }) !== work.effectKey(laterOccurrence), 'Different due occurrences bind different effect keys.');
  });

  if (enabled('branch-blocking') || enabled('deterministic-replay')) eachSubject(def => {
    for (const criteriaCount of bounds.criterionCounts) for (const observationCount of bounds.observationCounts) for (const repairCount of bounds.repairCounts) for (const headCount of bounds.heads) {
      const shaped = definition(def.id, def.target, Array.from({ length: criteriaCount }, (_, index) => criterion(`criterion-${index}`)));
      const secondHead = recordPayload({ ...Object.fromEntries(Object.entries(shaped).filter(([key]) => key !== 'hash')), context: 'Conflicting concurrent context.' });
      const observations = [localTarget(shaped), tasks(shaped)].slice(0, observationCount);
      const definitions = headCount === 1 ? [shaped] : [shaped, secondHead];
      const repairs = Array.from({ length: repairCount }, (_, index) => ({ hash: String(index + 3).repeat(64), findingId: '0'.repeat(64) }));
      const result = state(shaped, { definitions, observations, repairs });
      check('branch-blocking', { shaped, headCount, observationCount, repairCount, result }, result.heads.length === headCount && (headCount !== 2 || result.proposals.length === 0), 'All definition heads survive and forks block proposals.');
      for (const order of permutations(observations)) {
        const permuted = state(shaped, { definitions: [...definitions].reverse(), observations: order, repairs: [...repairs].reverse() });
        check('deterministic-replay', { shaped, definitions, observations, repairs, result, permuted }, canonical(result) === canonical(permuted), 'Permuting the same manifest does not change the review.');
      }
    }
  });

  if (enabled('deterministic-replay')) eachSubject(def => {
    const inputs = context(def); const actual = responsibilities.reconcileState(def, inputs);
    const manifestRecords = [def, ...inputs.observations];
    const pinned = recordPayload({ ...actual, inputHashes: manifestRecords.map(record => record.hash).sort(), inputContext: { bindings: inputs.bindings, catalog, machine }, requestedAsOf: asOf, ruleDigest: '0'.repeat(64) });
    const replayed = responsibilities.replayReview(pinned, [...manifestRecords].reverse());
    check('deterministic-replay', { pinned, replayed }, canonical(actual) === canonical(replayed), 'The stored manifest/context reconstructs every input to the actual reconciliation function.');
  });

  if (enabled('reported-assurance')) eachSubject(def => {
    for (const origin of ['reported', 'observed-local']) for (const outcome of bounds.evidenceOutcomes) {
      const raw = { responsibilityId: def.id, subject: def.target, observedAt: clock(-10), observer: 'Claimed reviewer', category: 'criteria', availability: 'available', coverage: { complete: true, gaps: [] }, claims: [claim(def, def.criteria[0], outcome)], evidenceRefs: [], origin };
      const parsed = records.parseObservation(raw);
      check('reported-assurance', { raw, parsed }, parsed.origin === 'reported', 'An import cannot grant itself observed-local origin.');
      const item = recordPayload(parsed); const result = state(def, { observations: [localTarget(def), tasks(def), item] });
      check('reported-assurance', { raw, result }, !result.criterionResults[0].supported && result.criterionResults[0].assurance === 'unverified', 'Imported local success cannot satisfy an observed-local criterion.');
    }
    const independent = definition(def.id, def.target, [{ ...def.criteria[0], independentReview: true }]); const result = state(independent);
    check('reported-assurance', { independent, result }, !result.criterionResults[0].supported && result.findings.some(finding => finding.code === 'external-review-needed'), 'A local process cannot authenticate non-author review.');
    const reported = definition(def.id, def.target, [criterion('report', 'reported-check')]); const report = evidence(reported, 'pass', { origin: 'reported' }); const reportedResult = state(reported, { observations: [localTarget(reported), tasks(reported), report] });
    check('reported-assurance', { reportedResult }, reportedResult.criterionResults[0].supported && reportedResult.criterionResults[0].assurance === 'reported', 'Declared attributed criteria may be supported only with reported assurance.');
  });

  if (enabled('current-evidence') || enabled('failure-preservation') || enabled('repair-closure') || enabled('deterministic-replay')) eachSubject(def => {
    const target = localTarget(def, { observedAt: clock(-900) }); const inventory = tasks(def, { observedAt: clock(-900) });
    const fail = evidence(def, 'fail', { observedAt: clock(-800) }); const pass = evidence(def, 'pass', { observedAt: clock(-600) });
    const first = state(def, { observations: [target, inventory, fail], asOf: clock(-700) }); const finding = first.findings.find(item => item.code === 'criterion-failed');
    const firstReview = reviewed(first, [def, target, inventory, fail]);
    const repaired = { type: 'repair', schemaVersion: 1, hash: '3'.repeat(64), responsibilityId: def.id, findingId: finding.id, failureRefs: finding.failureRefs, author: 'Bounded repair author', changeRef: 'Bounded identified correction.', expectedSubject: def.target, recheckRefs: [pass.hash], observedAt: clock(-500) };
    const repairedState = state(def, { observations: [target, inventory, fail, pass], reviews: [firstReview], repairs: [repaired], asOf: clock(-400) });
    check('repair-closure', { def, finding, repaired, repairedState }, repairedState.findings.find(item => item.id === finding.id).status === 'resolved', 'A matching later actual recheck closes the exact ordinary finding.');
    const repairedReview = reviewed(repairedState, [def, target, inventory, fail, pass, repaired, firstReview]);
    const failAgain = evidence(def, 'fail', { observedAt: clock(-300) });
    const recurrent = state(def, { observations: [target, inventory, fail, pass, failAgain], reviews: [firstReview, repairedReview], repairs: [repaired] });
    check('failure-preservation', { trace: 'fail-pass-repair-fail', recurrent }, recurrent.findings.find(item => item.id === finding.id).status === 'open' && recurrent.findings.find(item => item.id === finding.id).failedRepairs === 0, 'Later same-signature failure reopens; the old valid attempt is currently unsupported, not relabeled originally failed.');
    const recurrentReview = reviewed(recurrent, [def, target, inventory, fail, pass, failAgain, repaired, firstReview, repairedReview]);
    const advanced = { ...def, target: { ...def.target, revision: def.target.revision === firstRevision ? secondRevision : firstRevision } };
    const advancedHistory = state(advanced, { observations: [target, inventory, fail, pass, failAgain], reviews: [firstReview, repairedReview, recurrentReview] });
    check('failure-preservation', { trace: 'recurrence-before-source-advance', advancedHistory, failAgain }, advancedHistory.findings.find(item => item.id === finding.id)?.evidenceHistoryRefs.includes(failAgain.hash), 'A descendant target preserves later failure occurrences already retained by prior reviews.');
    const finalPass = evidence(def, 'pass', { observedAt: clock(-200) }); const finalRepair = { ...repaired, hash: '4'.repeat(64), recheckRefs: [finalPass.hash], observedAt: clock(-100), changeRef: 'Bounded later correction.' };
    const finalState = state(def, { observations: [target, inventory, fail, pass, failAgain, finalPass], reviews: [firstReview, repairedReview], repairs: [repaired, finalRepair] });
    check('repair-closure', { trace: 'later-exact-repair', finalState }, finalState.findings.find(item => item.id === finding.id).status === 'resolved', 'A later exact repair can close the reopened finding.');
    const unknown = evidence(def, 'unknown', { observedAt: clock(-100) }); const unknownState = state(def, { observations: [target, inventory, pass, unknown] });
    check('current-evidence', { trace: 'green-unknown', unknownState }, !unknownState.criterionResults[0].supported && unknownState.findings.some(item => item.code === 'criterion-evidence-needed'), 'Current unreadable or unknown bytes cannot borrow an older green pass.');
    const wrongCurrentTarget = localTarget(def, { subject: { ...def.target, revision: secondRevision === def.target.revision ? firstRevision : secondRevision }, observedAt: clock(-50) });
    const wrongTargetState = state(def, { observations: [target, inventory, pass, wrongCurrentTarget] });
    check('current-evidence', { wrongTargetState }, !wrongTargetState.criterionResults[0].supported && wrongTargetState.findings.some(item => item.code === 'current-local-target-mismatch') && !wrongTargetState.proposals.some(item => item.type === 'work'), 'The newest actual repository identity cannot borrow an earlier matching target.');
    const weaker = { ...def, criteria: [{ ...def.criteria[0], sha256: 'f'.repeat(64) }] }; const weakerPass = evidence(weaker, 'pass', { observedAt: clock(-100) });
    const weakened = state(weaker, { observations: [target, inventory, fail, weakerPass], reviews: [firstReview] });
    check('failure-preservation', { trace: 'weakened-definition', weakened }, weakened.findings.some(item => item.id === finding.id && item.status === 'open'), 'A changed criterion cannot silently erase its original failure.');
    const descendant = recordPayload({ ...Object.fromEntries(Object.entries(weaker).filter(([key]) => key !== 'hash')), parents: [def.hash] });
    const manifestInputs = context(descendant, { definitions: [def, descendant], observations: [target, inventory, fail, weakerPass], reviews: [firstReview] });
    const manifestState = responsibilities.reconcileState(descendant, manifestInputs);
    const manifestRecords = [def, descendant, ...manifestInputs.observations, firstReview];
    const pinnedReview = recordPayload({ ...manifestState, inputHashes: manifestRecords.map(record => record.hash).sort(), inputContext: { bindings: manifestInputs.bindings, catalog, machine }, requestedAsOf: asOf, ruleDigest: '0'.repeat(64) });
    const replayedReview = responsibilities.replayReview(pinnedReview, [...manifestRecords].reverse());
    check('deterministic-replay', { trace: 'manifest-with-prior-review', pinnedReview, replayedReview }, canonical(manifestState) === canonical(replayedReview) && replayedReview.findings.some(item => item.id === finding.id && item.status === 'open'), 'Replay must consume pinned prior reviews that retain original failures across descendant criteria.');
    const twoBadRepairs = [0, 1].map(index => ({ ...repaired, hash: String(index + 5).repeat(64), recheckRefs: [fail.hash], observedAt: clock(-500 + index) }));
    const diagnosed = state(def, { observations: [target, inventory, fail], reviews: [firstReview], repairs: twoBadRepairs });
    check('failure-preservation', { trace: 'two-failed-repairs', diagnosed }, diagnosed.proposals[0].type === 'diagnose', 'Two actual repeated failing repairs require diagnosis.');
    const completedNative = observation(def, { category: 'effect', observedAt: clock(-850), effects: [{ key: work.effectKey(def), status: 'completed' }] });
    const continuationInputs = { observations: [target, inventory, completedNative, fail], reviews: [firstReview], repairs: twoBadRepairs };
    const continuation = state(def, continuationInputs);
    check('failure-preservation', { trace: 'completed-fail-failed-repair-failed-repair', continuation }, continuation.proposals[0]?.type === 'diagnose' && continuation.proposals[0].nativeRediscoveryRequired === true && continuation.proposals[0].effectKey === work.effectKey(def), 'A completed earlier effect cannot silence later diagnosis; continuing known native work requires fresh rediscovery.');
    const expiredContinuation = state({ ...def, authorityRef: { ...def.authorityRef, expiresAt: clock(-1) } }, continuationInputs);
    check('failure-preservation', { trace: 'completed-failure-expired-authority', expiredContinuation }, expiredContinuation.proposals[0]?.type === 'observe-or-decide', 'Expired authority retains bounded observation/decision attention without authorizing diagnosis execution.');
    const closedContinuation = state(def, { observations: [target, inventory, completedNative, fail, pass], reviews: [firstReview], repairs: [repaired] });
    check('failure-preservation', { trace: 'completed-exact-closure', closedContinuation }, closedContinuation.proposals.length === 0 && closedContinuation.findings.find(item => item.id === finding.id).status === 'resolved', 'Exact closure suppresses duplicate initial green work after completed native work.');
    for (const status of ['pending', 'uncertain']) {
      const unresolvedNative = observation(def, { category: 'effect', effects: [{ key: work.effectKey(def), status }] });
      const pendingContinuation = state(def, { ...continuationInputs, observations: [...continuationInputs.observations, unresolvedNative] });
      check('failure-preservation', { trace: 'completed-failure-pending', status, pendingContinuation }, pendingContinuation.proposals.length === 1 && pendingContinuation.proposals[0].type === 'rediscover', 'Pending or uncertain native state retains rediscovery-only priority.');
    }
    for (const mode of ['matching', 'wrong-finding', 'wrong-failure', 'wrong-subject', 'no-change', 'missing-recheck', 'before-failure', 'stale', 'future', 'partial', 'reported', 'failed', 'pass-and-fail', 'wrong-criterion', 'wrong-kind', 'wrong-verifier', 'wrong-revision', 'current-target-mismatch', 'independent']) {
      const candidate = { ...repaired, recheckRefs: [pass.hash] }; let linked = pass; let affected = finding;
      if (mode === 'wrong-finding') candidate.findingId = 'f'.repeat(64);
      if (mode === 'wrong-failure') candidate.failureRefs = ['f'.repeat(64)];
      if (mode === 'wrong-subject') candidate.expectedSubject = { ...def.target, hostId: 'foreign-host' };
      if (mode === 'no-change') {
        let rejected = false; try { records.parseRepair({ ...candidate, changeRef: '' }); } catch { rejected = true; }
        check('repair-closure', { mode }, rejected, 'Boundary parsing requires an identified correction.'); continue;
      }
      if (mode === 'missing-recheck') candidate.recheckRefs = [];
      if (mode === 'before-failure') linked = evidence(def, 'pass', { observedAt: clock(-900) });
      if (mode === 'stale') linked = evidence(def, 'pass', { observedAt: clock(-86400001) });
      if (mode === 'future') linked = evidence(def, 'pass', { observedAt: clock(1) });
      if (mode === 'partial') linked = evidence(def, 'pass', { coverage: { complete: false, gaps: ['bounded gap'] } });
      if (mode === 'reported') linked = evidence(def, 'pass', { origin: 'reported' });
      if (mode === 'failed') linked = evidence(def, 'fail');
      if (mode === 'pass-and-fail') linked = evidence(def, 'pass', { claims: [claim(def), claim(def, def.criteria[0], 'fail')] });
      if (mode === 'wrong-criterion') linked = evidence(def, 'pass', { claims: [{ ...claim(def), criterionId: 'foreign' }] });
      if (mode === 'wrong-kind') linked = evidence(def, 'pass', { claims: [{ ...claim(def), kind: 'reported-check' }] });
      if (mode === 'wrong-revision') linked = evidence(def, 'pass', { claims: [{ ...claim(def), revision: def.target.revision === firstRevision ? secondRevision : firstRevision }] });
      if (mode === 'wrong-verifier') linked = evidence(def, 'pass', { claims: [{ ...claim(def), specHash: 'f'.repeat(64) }] });
      if (mode === 'independent') affected = { ...finding, criteria: [{ ...def.criteria[0], independentReview: true }] };
      if (mode !== 'missing-recheck') candidate.recheckRefs = [linked.hash];
      candidate.observedAt = clock(0);
      const currentTarget = mode === 'current-target-mismatch' ? localTarget(def, { subject: { ...def.target, hostId: 'foreign-host' }, observedAt: clock(-10) }) : target;
      const result = work.repairStatus(candidate, affected, [target, currentTarget, fail, linked], def, asOf);
      check('repair-closure', { mode, candidate, affected, linked, result }, result.valid === (mode === 'matching'), 'Every exact failure/change/current subject/original criterion and later eligible local recheck is required.');
    }
  });

  if (enabled('repair-closure')) eachSubject(def => {
    const items = [def.criteria[0], criterion('second', 'reported-check')]; const two = definition(def.id, def.target, items);
    const failed = evidence(two, 'fail', { observedAt: clock(-500) });
    const finding = { id: 'd'.repeat(64), code: 'criterion-failed', criteria: items, failureRefs: [failed.hash], evidenceHistoryRefs: [failed.hash] };
    for (const first of ['absent', ...bounds.evidenceOutcomes]) for (const second of ['absent', ...bounds.evidenceOutcomes]) {
      const outcomes = [first, second]; const claims = items.flatMap((item, index) => outcomes[index] === 'absent' ? [] : [claim(two, item, outcomes[index])]);
      const rechecked = evidence(two, 'pass', { observedAt: clock(-100), claims });
      const repair = { hash: 'f'.repeat(64), findingId: finding.id, failureRefs: finding.failureRefs, changeRef: 'Bounded two-criterion correction.', expectedSubject: two.target, recheckRefs: [rechecked.hash], observedAt: asOf };
      const result = work.repairStatus(repair, finding, [localTarget(two), failed, rechecked], two, asOf);
      check('repair-closure', { first, second, result }, result.valid === (first === 'pass' && second === 'pass'), 'Every original affected criterion needs its own matching passing recheck.');
    }
  });

  if (enabled('native-uncertainty')) eachSubject(def => {
    const key = work.effectKey(def);
    for (const status of ['pending', 'uncertain']) for (const age of [0, 86400001]) for (const complete of [false, true]) {
      const pending = observation(def, { category: 'effect', effects: [{ key, status }], observedAt: clock(-age), coverage: { complete, gaps: complete ? [] : ['bounded gap'] } });
      const revised = { ...def, target: { ...def.target, revision: def.target.revision === firstRevision ? secondRevision : firstRevision } };
      const result = state(revised, { observations: [localTarget(revised), tasks(revised), evidence(revised), pending] });
      check('native-uncertainty', { status, age, complete, result }, result.proposals.length === 1 && result.proposals[0].type === 'rediscover' && result.proposals[0].effectKey === key, 'Known uncertain/pending native effects survive age, coverage and revision edits.');
      const absent = observation(revised, { category: 'effect', effects: [{ key, status: 'absent' }], supersedes: { hash: pending.hash, reason: 'Bounded fresh discovery.' }, coverage: { complete: false, gaps: ['bounded missing page'] } });
      const partial = state(revised, { observations: [localTarget(revised), tasks(revised), evidence(revised), pending, absent] });
      check('native-uncertainty', { result: partial }, partial.proposals[0].type === 'rediscover', 'A partial inventory never establishes absence of a pending effect.');
    }
    const revised = { ...def, feature: { ...def.feature, intendedEffect: 'A different bounded intended outcome.' } };
    const revisedKey = work.effectKey(revised);
    for (const status of bounds.nativeTaskCorrelation.statuses) for (const association of bounds.nativeTaskCorrelation.keys) for (const age of bounds.nativeTaskCorrelation.agesMs) for (const complete of [false, true]) {
      const task = { nativeId: 'bounded-native-task', status, ...(association === 'missing' ? {} : { effectKey: association === 'old-effect' ? key : revisedKey }) };
      const inventory = tasks(revised, { tasks: [task], observedAt: clock(-age), coverage: { complete, gaps: complete ? [] : ['bounded page'] } });
      const result = state(revised, { observations: [localTarget(revised), tasks(revised), evidence(revised), inventory] });
      const expected = association === 'missing' || association === 'current-effect' && status !== 'completed' ? 'rediscover' : association === 'old-effect' ? 'work' : null;
      check('native-uncertainty', { trace: 'task-effect-correlation', status, association, age, complete, result }, result.proposals[0]?.type === (expected ?? undefined) && (association !== 'missing' || result.proposals[0]?.uncorrelatedTaskIds?.includes(task.nativeId)), 'Unkeyed tasks keep visible rediscovery uncertainty; only an explicit current effect completion can suppress green work.');
    }
    const uncorrelated = tasks(revised, { tasks: [{ nativeId: 'bounded-uncorrelated-completion', status: 'completed' }] });
    const failed = state(revised, { observations: [localTarget(revised), uncorrelated, evidence(revised, 'fail')] });
    check('native-uncertainty', { trace: 'uncorrelated-completion-failure', failed }, failed.proposals[0]?.type === 'rediscover' && failed.findings.some(item => item.code === 'criterion-failed' && item.status === 'open'), 'Uncorrelated completion cannot erase a retained failure while native rediscovery remains required.');
  });

  if (enabled('trigger-coverage') || enabled('retirement-closure')) eachSubject(def => {
    const trigger = { nativeId: 'bounded-schedule', promptDigest: '0'.repeat(64), timezone: 'UTC', destination: def.destination, nextWindow: { start: clock(-1000), due: clock(-500), graceMs: 0 } };
    const watching = { ...def, trigger };
    const schedule = { nativeId: trigger.nativeId, status: 'enabled', promptDigest: trigger.promptDigest, timezone: trigger.timezone, destination: trigger.destination };
    for (const mode of ['missing', 'partial', 'unavailable', 'enabled-no-run', 'enabled-no-outcome', 'enabled-no-delivery', 'enabled-complete', 'disabled']) {
      const item = observation(watching, { category: 'schedule', observedAt: clock(-100), schedule: mode === 'disabled' ? { nativeId: trigger.nativeId, status: 'disabled' } : schedule, coverage: { complete: mode !== 'partial', gaps: mode === 'partial' ? ['bounded page'] : [] }, availability: mode === 'unavailable' ? 'unavailable' : 'available', runs: mode === 'enabled-no-run' || mode === 'partial' || mode === 'unavailable' ? [] : [{ nativeId: trigger.nativeId, windowStart: trigger.nextWindow.start, outcomeRefs: mode === 'enabled-no-outcome' ? [] : ['bounded outcome'], deliveryRefs: mode === 'enabled-no-delivery' ? [] : ['bounded delivery'] }] });
      const result = work.triggerStatus(watching, mode === 'missing' ? [] : [item], asOf); const codes = result.findings.map(finding => finding.code);
      const expected = ['missing', 'partial', 'unavailable'].includes(mode) ? 'schedule-observation-needed' : mode === 'enabled-no-run' ? 'missed-run' : mode === 'enabled-no-outcome' ? 'run-no-evidence' : mode === 'enabled-no-delivery' ? 'delivery-unverified' : mode === 'disabled' ? 'schedule-disabled' : null;
      check('trigger-coverage', { mode, item, result }, expected ? codes.includes(expected) : codes.length === 0, 'Only fresh complete post-window native coverage can support its explicit reported state.');
      if (mode === 'partial') check('trigger-coverage', { mode, result }, !codes.includes('missed-run'), 'Partial coverage cannot prove a missing run.');
    }
    const enabledSchedule = observation(watching, { category: 'schedule', observedAt: clock(-200), schedule, runs: [] });
    const disabledSchedule = observation(watching, { category: 'schedule', observedAt: clock(-100), schedule: { nativeId: trigger.nativeId, status: 'disabled' }, runs: [] });
    const retired = { ...watching, lifecycle: { status: 'retired' } };
    const conflicting = work.retirementStatus(retired, [watching, retired], [enabledSchedule, disabledSchedule], asOf);
    check('retirement-closure', { enabledSchedule, disabledSchedule, conflicting }, conflicting.status === 'pending-native-disablement' && conflicting.pendingTriggers.includes(trigger.nativeId), 'An unsuperseded enabled readback prevents claimed shutdown.');
    const replacement = { ...disabledSchedule, supersedes: { hash: enabledSchedule.hash, reason: 'Bounded attributable native disablement.' } };
    const stopped = work.retirementStatus(retired, [watching, retired], [enabledSchedule, replacement], asOf);
    check('retirement-closure', { stopped }, stopped.status === 'disablement-readback-reported' && stopped.assurance === 'reported', 'Explicit complete supersession reports disablement without authenticating native state.');
    check('retirement-closure', { result: state(retired, { definitions: [retired] }) }, state(retired, { definitions: [retired] }).proposals.length === 0, 'Retirement immediately stops work proposals.');
    const expiredTrigger = state({ ...watching, authorityRef: { ...def.authorityRef, expiresAt: clock(-1) } }, { observations: [localTarget(watching), tasks(watching), evidence(watching), enabledSchedule] });
    check('trigger-coverage', { expiredTrigger }, expiredTrigger.proposals[0]?.type === 'observe-or-decide', 'A trigger gap without current scope still proposes bounded observation or decision.');
  });

  if (enabled('restore-suspension')) eachSubject(def => {
    const epoch = { hash: 'e'.repeat(64), restoredAt: clock(-500), priorHashes: [] };
    const categories = ['target', 'authority', 'tasks', 'schedule'];
    const fresh = categories.map(category => observation(def, { category, origin: category === 'target' ? 'observed-local' : 'reported', homeEpoch: epoch.hash, observedAt: clock(-100), ...(category === 'authority' ? { authority: def.authorityRef } : category === 'tasks' ? { tasks: [] } : category === 'schedule' ? { schedules: [] } : {}) }));
    for (let mask = 0; mask < 16; mask++) {
      const chosen = fresh.filter((_, index) => mask & (1 << index)); const result = work.restoredState(epoch, chosen, def, asOf);
      check('restore-suspension', { mask, result }, result.suspended === (mask !== 15), 'All four fresh categories in the new epoch are required.');
    }
    for (const category of categories) for (const mode of ['old-epoch', 'pre-restore', 'partial', 'unavailable', 'foreign', 'future', 'stale', 'reported-target', 'expired-authority', 'wrong-scope']) {
      const changed = fresh.map(item => item.category !== category ? item : { ...item, ...(mode === 'old-epoch' ? { homeEpoch: 'f'.repeat(64) } : mode === 'pre-restore' ? { observedAt: clock(-600) } : mode === 'partial' ? { coverage: { complete: false, gaps: ['bounded page'] } } : mode === 'unavailable' ? { availability: 'unavailable' } : mode === 'foreign' ? { subject: { ...def.target, hostId: 'foreign-host' } } : mode === 'future' ? { observedAt: clock(1) } : mode === 'stale' ? { observedAt: clock(-86400001) } : mode === 'reported-target' ? { origin: 'reported' } : mode === 'wrong-scope' ? { authority: { ...def.authorityRef, action: 'foreign-action' } } : { authority: { ...def.authorityRef, expiresAt: clock(-1) } }) });
      const applicable = !['reported-target', 'expired-authority', 'wrong-scope'].includes(mode) || mode === 'reported-target' && category === 'target' || ['expired-authority', 'wrong-scope'].includes(mode) && category === 'authority';
      if (!applicable) continue;
      const result = work.restoredState(epoch, changed, def, asOf); check('restore-suspension', { category, mode, result }, result.suspended, 'Old, partial, unavailable, unauthenticated local-target or expired authority context cannot activate a restored home.');
    }
    for (const executor of bounds.restoredExecutors) {
      const value = { ...def, target: { ...def.target, executor } };
      const readbacks = categories.map(category => observation(value, { category, origin: category === 'target' && executor.startsWith('local-') ? 'observed-local' : 'reported', homeEpoch: epoch.hash, observedAt: clock(-100), ...(category === 'authority' ? { authority: value.authorityRef } : category === 'tasks' ? { tasks: [] } : category === 'schedule' ? { schedules: [] } : {}) }));
      const complete = work.restoredState(epoch, readbacks, value, asOf);
      check('restore-suspension', { executor, complete }, !complete.suspended && readbacks.every(item => executor.startsWith('local-') || item.origin === 'reported'), 'Cloud exact epoch readbacks can recover with reported assurance; local targets still require actual inspection.');
      for (const category of categories) for (const mode of ['old-epoch', 'pre-restore', 'foreign', 'partial', 'future', 'unavailable', 'missing']) {
        const changed = readbacks.flatMap(item => item.category !== category ? [item] : mode === 'missing' ? [] : [{ ...item, ...(mode === 'old-epoch' ? { homeEpoch: 'f'.repeat(64) } : mode === 'pre-restore' ? { observedAt: clock(-600) } : mode === 'foreign' ? { subject: { ...value.target, hostId: 'foreign-host' } } : mode === 'partial' ? { coverage: { complete: false, gaps: ['bounded gap'] } } : mode === 'future' ? { observedAt: clock(1) } : { availability: 'unavailable' }) }]);
        const refused = work.restoredState(epoch, changed, value, asOf);
        check('restore-suspension', { executor, category, mode, refused }, refused.suspended && refused.needed.includes(category), 'Every executor needs all four exact fresh available complete categories in the new epoch.');
      }
      const original = readbacks.find(item => item.category === 'authority');
      const originalPayload = Object.fromEntries(Object.entries(original).filter(([key]) => key !== 'hash'));
      for (const mode of bounds.restoredReplacements) {
        const replacement = observation(value, { ...originalPayload, observedAt: mode === 'future' ? clock(1) : clock(-50), ...(mode === 'wrong-scope' || mode === 'without-supersession' ? { authority: { ...value.authorityRef, action: 'foreign-scope' } } : ['unavailable', 'denied', 'unknown'].includes(mode) ? { availability: mode } : mode === 'partial' ? { coverage: { complete: false, gaps: ['bounded page'] } } : {}), ...(mode === 'without-supersession' ? {} : { supersedes: { hash: original.hash, reason: 'Bounded current authority correction.' } }) });
        const observations = [...readbacks, replacement];
        const result = work.restoredState(epoch, observations, value, asOf);
        const expected = ['wrong-scope', 'unavailable', 'denied', 'unknown'].includes(mode);
        check('restore-suspension', { executor, mode, result }, result.suspended === expected && (!expected || result.needed.includes('authority')), 'Restore follows canonical explicit supersession, including unavailable corrections, without timestamp last-write-wins.');
        const current = work.currentObservations(value, observations, asOf);
        check('restore-suspension', { executor, mode, order: 'reverse', result }, canonical(work.restoredState(epoch, [...observations].reverse(), value, asOf)) === canonical(result) && current.some(item => item.hash === original.hash) === !['wrong-scope', 'unavailable', 'denied', 'unknown', 'renewed'].includes(mode), 'Restored activation and supersession are independent of input order.');
      }
    }
  });

  if (enabled('import-prefix')) {
    const def = definition(); const predecessor = observation(def, { category: 'effect', effects: [] }); const successor = observation(def, { category: 'effect', effects: [], observedAt: clock(-50), supersedes: { hash: predecessor.hash, reason: 'Bounded predecessor reference.' } });
    for (const incoming of [[predecessor, successor], [successor, predecessor]]) {
      const order = records.importOrder([def], incoming); const known = new Set([def.hash]);
      for (const hash of order) { const record = incoming.find(item => item.hash === hash); check('import-prefix', { incoming, order, prefix: [...known], next: record }, records.references(record).every(reference => known.has(reference)), 'Every published prefix is reference-complete.'); known.add(hash); }
      check('import-prefix', { incoming, order }, order[0] === predecessor.hash && new Set(order).size === 2, 'Forward input order never publishes a successor first.');
    }
    const schedule = observation(def, { category: 'schedule', schedule: { nativeId: 'schedule-one', status: 'disabled' }, runs: [] });
    const foreignSchedule = observation(def, { category: 'schedule', schedule: { nativeId: 'schedule-two', status: 'disabled' }, runs: [], supersedes: { hash: schedule.hash, reason: 'Invalid cross-schedule replacement.' } });
    let scopeRefused = false; try { records.validateReferences([def, schedule, foreignSchedule]); } catch (error) { scopeRefused = /another native schedule/.test(error.message); }
    check('import-prefix', { case: 'foreign-native-supersession' }, scopeRefused, 'A schedule readback cannot supersede a different native schedule.');
    let refused = false;
    try { records.importOrder([], [{ hash: 'a'.repeat(64), type: 'definition', parents: ['b'.repeat(64)] }, { hash: 'b'.repeat(64), type: 'definition', parents: ['a'.repeat(64)] }]); } catch (error) { refused = /cycle/.test(error.message); }
    check('import-prefix', { case: 'abstract-cycle' }, refused, 'An abstract dependency cycle refuses before publication.');
  }
  if (!selected || selected === 'dispatch-recovery') {
    verifyDispatchPolicy({ dispatch, records, work }, check);
    const domain = bounds.dispatchRecovery;
    if (counts['dispatch-recovery'] !== (domain.stateCombinations + domain.targetedCases) * domain.permutations.length) throw new Error('Declared dispatch bounds differ from executed predicates');
  }
  if (enabled('calendar-acceptance')) {
    const calendarResult = verifyCalendarPolicy({ calendar }, check);
    if (counts['calendar-acceptance'] !== bounds.calendarAcceptance.cases || calendarResult.cases !== counts['calendar-acceptance']) throw new Error('Declared calendar bounds differ from executed predicates');
  }
  if (enabled('cloud-admission')) {
    const result = verifyCloudPolicy({ cloud }, check);
    if (result.cases !== bounds.cloudAdmission.cases || counts['cloud-admission'] !== result.cases) throw new Error(`Declared cloud bounds differ from executed predicates ${result.cases}`);
  }
  if (enabled('process-incarnation')) { const result = verifyIncarnationPolicy({ incarnation }, check); if (result.cases !== bounds.processIncarnation.cases || counts['process-incarnation'] !== result.cases) throw new Error(`Incarnation bounds differ ${result.cases}`); }
  if (enabled('legacy-baseline')) { const result = verifyLegacyPolicy({ migration }, check); if (result.cases !== bounds.legacyBaseline.cases || counts['legacy-baseline'] !== result.cases) throw new Error(`Legacy bounds differ ${result.cases}`); }
  if (enabled('morning-contract')) { const result = verifyMorningPolicy({ morning, fleet }, check); if (result.cases !== bounds.morningContract.cases || counts['morning-contract'] !== result.cases) throw new Error(`Morning bounds differ ${result.cases}`); }
  if (enabled('fleet-contract')) { const result = verifyFleetPolicy({ fleet }, check); if (result.cases !== bounds.fleetContract.cases || counts['fleet-contract'] !== result.cases) throw new Error(`Fleet bounds differ ${result.cases}`); }
  return { counts, checks: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}
