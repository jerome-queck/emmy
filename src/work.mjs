import { canonical, digest } from './records.mjs';

export const subjectFields = ['projectId', 'repository', 'executor', 'hostId', 'nativeProjectId', 'nativeId', 'path', 'revision', 'dirtyDigest'];
export const subjectKey = subject => Object.fromEntries(subjectFields.map(field => [field, subject[field] ?? null]));
export const sameSubject = (left, right) => canonical(subjectKey(left)) === canonical(subjectKey(right));
export const criterionHash = criterion => digest(criterion);

export function observationStatus(observation, target, asOf, maxAgeMs) {
  const reasons = [];
  const ageMs = Date.parse(asOf) - Date.parse(observation.observedAt);
  if (!sameSubject(observation.subject, target)) reasons.push('foreign-subject');
  if (ageMs < 0) reasons.push('future-observation');
  if (ageMs > maxAgeMs) reasons.push('stale-observation');
  if (!observation.coverage.complete || observation.coverage.gaps.length) reasons.push('partial-observation');
  if (observation.availability !== 'available') reasons.push('unavailable-observation');
  return { hash: observation.hash, eligible: reasons.length === 0, reasons, ageMs, assurance: observation.origin === 'observed-local' ? 'observed-local' : 'reported' };
}

export function routeTarget(definition, { bindings, catalog, machine }) {
  const target = definition.target;
  const binding = Object.hasOwn(bindings.projects, target.projectId) ? bindings.projects[target.projectId] : null;
  const project = catalog.projects.find(item => item.id === target.projectId) ?? (binding ? { id: target.projectId, label: binding.label, repository: binding.repository ?? null, basis: 'reported' } : null);
  const reasons = [];
  if (!project) reasons.push('unknown-project');
  if (target.executor.startsWith('local-')) {
    if (!binding || !Object.hasOwn(bindings.hosts, target.hostId) || binding.hostId !== target.hostId || binding.path !== target.path || binding.nativeProjectId !== target.nativeProjectId) reasons.push('exact-binding-missing');
    if (bindings.localHostId !== target.hostId || !Object.hasOwn(bindings.hosts, target.hostId) || bindings.hosts[target.hostId].machine !== machine) reasons.push('local-host-unverified');
  } else if (target.executor === 'codex-cloud' && (!binding?.cloudEnvironmentId || binding.cloudEnvironmentId !== target.hostId || !definition.cloudReason)) reasons.push('prepared-cloud-needed');
  return { project, executor: target.executor, target: subjectKey(target), reasons, status: reasons.length ? 'needs-observation' : 'bound', execution: 'proposal-only' };
}

export function authorityStatus(definition, asOf) {
  const authority = definition.authorityRef;
  const scoped = Boolean(authority && authority.reference && authority.action === definition.action && authority.resource === definition.resource && authority.destination === definition.destination);
  const current = !authority?.expiresAt || Date.parse(authority.expiresAt) >= Date.parse(asOf);
  return { eligible: scoped && current, reason: !scoped ? 'authority-scope-needed' : !current ? 'authority-expired' : null, assurance: 'reported-reference' };
}

export function effectKey(definition) {
  const { revision, dirtyDigest, ...target } = subjectKey(definition.target);
  return digest({ responsibilityId: definition.id, target, intendedEffect: definition.feature.intendedEffect, occurrence: definition.trigger?.nextWindow.start ?? 'ongoing' });
}

export function definitionHeads(definitions) {
  const parents = new Set(definitions.flatMap(definition => definition.parents));
  return definitions.filter(definition => !parents.has(definition.hash)).sort((left, right) => left.hash.localeCompare(right.hash));
}

export function restoredState(epoch, observations, definition, asOf) {
  if (!epoch) return { suspended: false, needed: [] };
  const needed = ['target', 'authority', 'tasks', 'schedule'].filter(category => !observations.some(observation => observation.category === category && observation.homeEpoch === epoch.hash && Date.parse(observation.observedAt) >= Date.parse(epoch.restoredAt) && observationStatus(observation, definition.target, asOf, definition.freshness.maxAgeMs).eligible && (category !== 'target' || observation.origin === 'observed-local') && (category !== 'authority' || observation.authority?.reference === definition.authorityRef.reference && observation.authority?.action === definition.action && observation.authority?.resource === definition.resource && observation.authority?.destination === definition.destination)));
  return { suspended: needed.length > 0, needed, epoch: epoch.hash };
}

export function repairStatus(repair, finding, observations, definition, asOf) {
  const reasons = [];
  if (repair.findingId !== finding.id || !finding.failureRefs.every(ref => repair.failureRefs.includes(ref))) reasons.push('failure-link-mismatch');
  if (!sameSubject(repair.expectedSubject, definition.target)) reasons.push('repair-subject-mismatch');
  if (Date.parse(repair.observedAt) > Date.parse(asOf)) reasons.push('future-repair');
  const failureTime = Math.max(...observations.filter(observation => finding.failureRefs.includes(observation.hash)).map(observation => Date.parse(observation.observedAt)));
  const rechecks = observations.filter(observation => repair.recheckRefs.includes(observation.hash));
  if (rechecks.length !== repair.recheckRefs.length) reasons.push('missing-recheck');
  for (const criterion of finding.criteria) {
    if (criterion.independentReview) { reasons.push('external-review-needed'); continue; }
    const relevant = rechecks.filter(observation => Date.parse(observation.observedAt) > failureTime && Date.parse(observation.observedAt) <= Date.parse(repair.observedAt) && sameSubject(observation.subject, repair.expectedSubject) && observationStatus(observation, definition.target, asOf, definition.freshness.maxAgeMs).eligible);
    const claims = relevant.flatMap(observation => observation.claims.filter(claim => claim.criterionId === criterion.id && claim.kind === criterion.evidence && claim.specHash === criterionHash(criterion)).map(claim => ({ claim, observation })));
    const passing = claims.some(({ claim, observation }) => claim.outcome === 'pass' && (criterion.evidence === 'reported-check' || observation.origin === 'observed-local'));
    if (!passing || claims.some(({ claim }) => claim.outcome !== 'pass')) reasons.push(`recheck-failed:${criterion.id}`);
  }
  return { repairHash: repair.hash, valid: reasons.length === 0, reasons: [...new Set(reasons)].sort() };
}
