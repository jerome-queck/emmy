import assert from 'node:assert/strict';

const asOf = '2026-10-22T12:00:00Z';
const bindings = {
  hosts: { studio: { label: 'Studio' }, mini: { label: 'Mini' } },
  projects: {
    alpha: { label: 'Alpha', hostId: 'studio', nativeProjectId: 'native-alpha', path: '/fixture/alpha', cloudEnvironmentId: 'cloud-alpha' },
    beta: { label: 'Beta', hostId: 'mini', nativeProjectId: 'native-beta', path: '/fixture/beta', cloudEnvironmentId: 'cloud-beta' }
  }
};
const catalog = { projects: [{ id: 'alpha', repository: 'https://example.com/alpha' }, { id: 'beta', repository: 'https://example.com/beta' }] };
const criterion = (id, evidence) => ({ id, evidence, description: id });
const baseRequest = projectId => ({ requestId: 'bounded', projectId, goal: 'Bounded proposal', workClass: 'code', revision: 'base', authority: { reference: 'Bounded owner request' }, sources: [], finish: [criterion('artifact', 'local-digest')] });

function* product(domains, values = []) {
  if (!domains.length) { yield values; return; }
  for (const value of domains[0]) yield* product(domains.slice(1), [...values, value]);
}

export const bounds = {
  routing: {
    projects: ['alpha', 'beta'],
    workClasses: ['code', 'research'],
    executors: [null, 'local-work', 'codex-cloud', 'dot-cloud'],
    bindings: ['complete', 'missing-project', 'missing-host', 'missing-path'],
    authorityCloud: [false, true],
    cloudReason: [false, true],
    snapshotProducts: ['codex', 'work', 'codex-cloud', 'dot-cloud'],
    snapshotHosts: ['studio', 'mini', 'cloud-alpha', 'dot-cloud'],
    coverage: ['complete', 'partial'],
    projectObservations: ['exact', 'absent', 'wrong-path', 'wrong-host'],
    availability: ['online', 'offline', 'denied', 'unknown'],
    agesMs: [-1, 0, 86400000, 86400001],
    includesAbsentSnapshot: true
  },
  evidence: {
    projects: ['alpha', 'beta'],
    hosts: ['studio', 'mini'],
    criteria: ['local-digest', 'reported-check', 'both'],
    taskMatch: [true, false],
    projectMatch: [true, false],
    executorMatch: [true, false],
    receiptRevisionMatch: [true, false],
    claimRevisionMatch: [true, false],
    claimModes: ['absent', 'pass', 'fail', 'pass-and-fail', 'unknown', 'foreign-criterion'],
    kindMatch: [true, false],
    artifactStatuses: ['match', 'mismatch', 'unreadable', 'absent'],
    futureReceipt: [false, true],
    maxCriteria: 2,
    maxClaimsPerCriterion: 2,
    receiptsPerAssessment: 1
  },
  assumptions: [
    'Inputs satisfy production boundary parsers. External JSON parsing is exercised by the behavioral driver.',
    'The caller supplies the current result revision and honest scope. Imported reports are not authenticated.',
    'Artifact-check results come from the production byte-reading boundary. The finite domain varies its possible results.',
    'No concurrency, filesystem atomicity, provider authentication, native execution, schedules, or all-size theorem is proved.'
  ]
};

export function verifyProperties(work, selected = null) {
  const counts = {};
  const check = (property, input, predicate, expectation) => {
    if (selected && selected !== property) return;
    counts[property] = (counts[property] ?? 0) + 1;
    if (!predicate) {
      const error = new Error(`${property} violated. ${expectation}`);
      error.property = property;
      error.counterexample = input;
      throw error;
    }
  };
  let routingCases = 0;
  let evidenceCases = 0;
  if (!selected || ['local-first', 'exact-binding', 'scope-freshness', 'proposal-only'].includes(selected)) {
    const snapshots = [null];
    for (const [productName, hostId, coverage, availability, age, projectObservation] of product([bounds.routing.snapshotProducts, bounds.routing.snapshotHosts, bounds.routing.coverage, bounds.routing.availability, bounds.routing.agesMs, bounds.routing.projectObservations])) {
      const projects = projectObservation === 'absent' ? [] : Object.values(bindings.projects).map(binding => ({ id: binding.nativeProjectId, path: projectObservation === 'wrong-path' ? '/wrong/path' : binding.path, hostId: projectObservation === 'wrong-host' ? 'foreign-host' : binding.hostId }));
      snapshots.push({ id: 'snapshot', scope: { product: productName, hostId }, observedAt: new Date(Date.parse(asOf) - age).toISOString(), coverage: { complete: coverage === 'complete', gaps: coverage === 'complete' ? [] : ['missing page'] }, availability, projects });
    }
    for (const [projectId, workClass, executor, bindingMode, authorityCloud, cloudReason, snapshot] of product([bounds.routing.projects, bounds.routing.workClasses, bounds.routing.executors, bounds.routing.bindings, bounds.routing.authorityCloud, bounds.routing.cloudReason, snapshots])) {
      const activeBindings = structuredClone(bindings);
      if (bindingMode === 'missing-project') delete activeBindings.projects[projectId];
      if (bindingMode === 'missing-host') delete activeBindings.hosts[bindings.projects[projectId].hostId];
      if (bindingMode === 'missing-path') delete activeBindings.projects[projectId].path;
      const request = { ...baseRequest(projectId), workClass, ...(executor ? { executor } : {}), authority: { reference: 'Owner', cloud: authorityCloud }, ...(cloudReason ? { cloudReason: 'Prepared environment benefit' } : {}) };
      const context = { catalog, bindings: activeBindings, snapshot, asOf };
      const task = work.planTask(request, context);
      routingCases++;
      const input = { request, bindingMode, snapshot, result: task };
      const expectedKind = executor ?? (workClass === 'code' ? 'local-codex' : 'dot-cloud');
      check('local-first', input, task.executor.kind === expectedKind, `Expected executor ${expectedKind}.`);
      const local = ['local-codex', 'local-work'].includes(expectedKind);
      const expectedHost = local ? activeBindings.projects[projectId]?.hostId ?? null : expectedKind === 'codex-cloud' ? activeBindings.projects[projectId]?.cloudEnvironmentId ?? null : 'dot-cloud';
      check('exact-binding', input, task.executor.hostId === expectedHost, `Expected designated host ${expectedHost}.`);
      if (local) check('exact-binding', input, task.executor.path === (activeBindings.projects[projectId]?.path ?? null) && task.executor.projectId === (activeBindings.projects[projectId]?.nativeProjectId ?? null), 'Local native project identity and absolute path must match the designated binding.');
      check('proposal-only', input, task.execution === 'proposal-only', 'Planning must never label execution dispatched.');
      const expectedProduct = expectedKind === 'local-codex' ? 'codex' : expectedKind === 'local-work' ? 'work' : expectedKind;
      const snapshotUsable = snapshot && snapshot.scope.product === expectedProduct && snapshot.scope.hostId === expectedHost && snapshot.coverage.complete && !snapshot.coverage.gaps.length && snapshot.availability === 'online' && Date.parse(asOf) - Date.parse(snapshot.observedAt) >= 0 && Date.parse(asOf) - Date.parse(snapshot.observedAt) <= 86400000;
      const bound = activeBindings.projects[projectId];
      const localUsable = !local || Boolean(bound?.path && bound.nativeProjectId && activeBindings.hosts[bound.hostId] && snapshot?.projects.some(project => project.id === bound.nativeProjectId && project.path === bound.path && project.hostId === bound.hostId));
      const cloudUsable = expectedKind !== 'codex-cloud' || Boolean(bound?.cloudEnvironmentId && authorityCloud && cloudReason);
      const authorityUsable = workClass !== 'code' || local || (authorityCloud && cloudReason);
      const expectedReady = Boolean(snapshotUsable && localUsable && cloudUsable && authorityUsable);
      check('scope-freshness', input, (task.route.status === 'ready') === expectedReady, `Expected ready=${expectedReady} from exact scope, complete coverage, availability, age, binding and authority.`);
    }
  }
  if (!selected || ['identity', 'revision', 'evidence-required', 'contradictions', 'reported-assurance'].includes(selected)) {
    const domains = bounds.evidence;
    for (const [projectId, hostId, criteriaMode, taskMatch, projectMatch, executorMatch, receiptRevisionMatch, claimRevisionMatch, claimMode, kindMatch, artifactStatus, futureReceipt] of product([domains.projects, domains.hosts, domains.criteria, domains.taskMatch, domains.projectMatch, domains.executorMatch, domains.receiptRevisionMatch, domains.claimRevisionMatch, domains.claimModes, domains.kindMatch, domains.artifactStatuses, domains.futureReceipt])) {
      const finish = criteriaMode === 'both' ? [criterion('bytes', 'local-digest'), criterion('checks', 'reported-check')] : [criterion('result', criteriaMode)];
      const executor = { kind: 'local-codex', product: 'codex', hostId, projectId: `native-${projectId}`, path: `/fixture/${projectId}`, repository: `https://example.com/${projectId}` };
      const task = { id: 'task', request: { ...baseRequest(projectId), finish }, executor };
      const claims = finish.flatMap(item => {
        if (claimMode === 'absent') return [];
        const kind = kindMatch ? item.evidence : item.evidence === 'local-digest' ? 'reported-check' : 'local-digest';
        const base = { criterionId: claimMode === 'foreign-criterion' ? 'foreign' : item.id, revision: claimRevisionMatch ? 'current' : 'old', kind, evidenceId: `${item.id}-pass`, path: `/fixture/${item.id}`, sha256: '0'.repeat(64), evidenceRef: 'Reported native output' };
        return claimMode === 'pass-and-fail' ? [{ ...base, outcome: 'pass' }, { ...base, evidenceId: `${item.id}-fail`, outcome: 'fail' }] : [{ ...base, outcome: claimMode === 'foreign-criterion' ? 'pass' : claimMode }];
      });
      const receipt = { id: 'receipt', taskId: taskMatch ? task.id : 'other-task', projectId: projectMatch ? projectId : 'foreign-project', executor: executorMatch ? executor : { ...executor, hostId: 'foreign-host' }, resultRevision: receiptRevisionMatch ? 'current' : 'old', observedAt: futureReceipt ? '2026-10-22T12:00:01Z' : '2026-10-22T11:00:00Z', claims, limits: [] };
      const artifactChecks = artifactStatus === 'absent' ? [] : claims.filter(claim => claim.kind === 'local-digest').map(claim => ({ evidenceId: claim.evidenceId, status: artifactStatus }));
      const assessment = work.assessOutcome(task, receipt, artifactChecks, 'current', asOf);
      evidenceCases++;
      const input = { task, receipt, artifactChecks, revision: 'current', asOf, result: assessment };
      const matchingIdentity = taskMatch && projectMatch && executorMatch;
      check('identity', input, matchingIdentity || assessment.status !== 'supported', 'Wrong task, project or executor cannot be supported.');
      const matchingRevision = receiptRevisionMatch && (claimRevisionMatch || !claims.length);
      check('revision', input, matchingRevision || assessment.status !== 'supported', 'Wrong current revision cannot be supported.');
      const expectedEvidence = finish.every(item => claims.some(claim => claim.criterionId === item.id && claim.kind === item.evidence && claim.outcome === 'pass' && matchingIdentity && receiptRevisionMatch && claimRevisionMatch && (item.evidence === 'reported-check' || artifactStatus === 'match')));
      check('evidence-required', input, expectedEvidence || assessment.status !== 'supported', 'Missing or wrong-kind passing evidence cannot be supported.');
      const expectedConflict = !matchingIdentity || !receiptRevisionMatch || futureReceipt || claims.some(claim => claim.revision !== 'current' || claim.criterionId === 'foreign') || (matchingIdentity && receiptRevisionMatch && claimRevisionMatch && claims.some(claim => claim.outcome === 'fail')) || artifactChecks.some(value => value.status === 'mismatch');
      check('contradictions', input, !expectedConflict || assessment.status === 'conflict', 'Any identity, revision, future timestamp, failed claim, foreign criterion or byte contradiction is a conflict.');
      const expectedStatus = expectedConflict ? 'conflict' : !expectedEvidence || artifactChecks.some(value => value.status === 'unreadable') ? 'needs-evidence' : 'supported';
      check('evidence-required', input, assessment.status === expectedStatus, `Expected status ${expectedStatus}.`);
      check('reported-assurance', input, assessment.assuranceByClaim.every(value => !finish.some(item => item.id === value.criterionId && item.evidence === 'reported-check') || value.assurance !== 'observed-local-bytes'), 'A reported check must not become observed local bytes.');
    }
  }
  assert.ok(Object.values(counts).every(count => count > 0), 'Properties exercised nonempty domains');
  return { routingCases, evidenceCases, counts };
}
