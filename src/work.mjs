export const maximumSnapshotAgeMs = 24 * 60 * 60 * 1000;

export function snapshotStatus(snapshot, target, asOf) {
  if (!snapshot) return { status: 'needs-observation', reasons: ['No snapshot for the designated executor.'] };
  const reasons = [];
  const ageMs = Date.parse(asOf) - Date.parse(snapshot.observedAt);
  if (snapshot.scope.product !== target.product || snapshot.scope.hostId !== target.hostId) reasons.push('Snapshot belongs to a different executor scope.');
  if (!snapshot.coverage.complete || snapshot.coverage.gaps.length) reasons.push('Snapshot coverage is partial.');
  if (ageMs < 0 || ageMs > maximumSnapshotAgeMs) reasons.push('Snapshot is future-dated or stale.');
  if (snapshot.availability !== 'online') reasons.push(`Designated executor is ${snapshot.availability}.`);
  return { status: reasons.length ? (snapshot.availability === 'offline' || snapshot.availability === 'denied' ? 'unavailable' : 'needs-observation') : 'ready', reasons, ageMs };
}

export function planTask(request, { catalog, bindings, snapshot, asOf }) {
  const binding = bindings.projects[request.projectId];
  const project = catalog.projects.find(value => value.id === request.projectId) ?? (binding ? { id: request.projectId, label: binding.label, repository: binding.repository ?? null, basis: 'reported' } : null);
  const kind = request.executor ?? (request.workClass === 'code' ? 'local-codex' : 'dot-cloud');
  const local = kind === 'local-codex' || kind === 'local-work';
  const cloud = kind === 'codex-cloud';
  const target = {
    kind,
    product: kind === 'local-codex' ? 'codex' : kind === 'local-work' ? 'work' : kind,
    hostId: local ? binding?.hostId ?? null : cloud ? binding?.cloudEnvironmentId ?? null : 'dot-cloud',
    projectId: local ? binding?.nativeProjectId ?? null : cloud ? binding?.cloudEnvironmentId ?? null : request.projectId,
    path: local ? binding?.path ?? null : null,
    repository: project?.repository ?? null
  };
  const reasons = [];
  if (!project) reasons.push('Unknown project. Add public metadata or a private project binding.');
  if (local && (!binding?.path || !binding?.nativeProjectId || !bindings.hosts[binding?.hostId])) reasons.push('Exact local project and host binding is missing.');
  if (cloud && (!binding?.cloudEnvironmentId || !request.cloudReason || !request.authority.cloud)) reasons.push('Codex Cloud requires a prepared environment, reason, and explicit cloud authority.');
  if (request.workClass === 'code' && !local && (!request.cloudReason || !request.authority.cloud)) reasons.push('Cloud coding requires an explicit reason and cloud authority.');
  const observation = snapshotStatus(snapshot, target, asOf);
  if (snapshot && local && !snapshot.projects.some(value => value.id === target.projectId && value.path === target.path && value.hostId === target.hostId)) reasons.push('Snapshot does not contain the exact designated project host, path, and identity.');
  return {
    schemaVersion: 1,
    request,
    project,
    executor: target,
    asOf,
    route: { status: reasons.length ? 'needs-observation' : observation.status, reasons: [...reasons, ...observation.reasons] },
    snapshotId: snapshot?.id ?? null,
    observationBasis: snapshot ? 'reported' : 'unverified',
    execution: 'proposal-only',
    limits: ['No task was dispatched. Native task identity and actual execution require readback.', 'Imported inventories are attributed reports, not authenticated access.']
  };
}

export function assessOutcome(task, receipt, artifactChecks, revision, asOf) {
  const conflicts = [];
  const missing = [];
  const assuranceByClaim = [];
  const sameExecutor = JSON.stringify(Object.entries(receipt.executor).sort()) === JSON.stringify(Object.entries(task.executor).sort());
  if (receipt.taskId !== task.id || receipt.projectId !== task.request.projectId || !sameExecutor) conflicts.push('Receipt task, project, or executor does not match the proposal.');
  if (receipt.resultRevision !== revision) conflicts.push('Receipt revision does not match the current result revision.');
  if (Date.parse(receipt.observedAt) > Date.parse(asOf)) conflicts.push('Receipt is future-dated.');
  const identityMatches = receipt.taskId === task.id && receipt.projectId === task.request.projectId && sameExecutor;
  for (const criterion of task.request.finish) {
    const claims = receipt.claims.filter(claim => claim.criterionId === criterion.id);
    const matched = claims.filter(claim => identityMatches && receipt.resultRevision === revision && claim.revision === revision);
    if (claims.some(claim => claim.revision !== revision)) conflicts.push(`Claim ${criterion.id} has a different revision.`);
    if (matched.some(claim => claim.outcome === 'fail')) conflicts.push(`Criterion ${criterion.id} has a failed claim.`);
    const passing = matched.filter(claim => claim.outcome === 'pass');
    const checked = passing.some(claim => claim.kind === 'local-digest' && artifactChecks.some(check => check.evidenceId === claim.evidenceId && check.status === 'match'));
    const reported = passing.some(claim => claim.kind === 'reported-check' && claim.evidenceRef?.trim());
    const supported = criterion.evidence === 'local-digest' ? checked : reported;
    if (!supported) missing.push(`Criterion ${criterion.id} needs passing ${criterion.evidence} evidence.`);
    assuranceByClaim.push({ criterionId: criterion.id, assurance: supported ? (criterion.evidence === 'local-digest' ? 'observed-local-bytes' : 'reported') : 'unverified' });
  }
  for (const check of artifactChecks) {
    if (check.status === 'mismatch') conflicts.push(`Local digest ${check.evidenceId} mismatched actual bytes.`);
    if (check.status === 'unreadable') missing.push(`Local artifact ${check.evidenceId} was unreadable.`);
  }
  if (receipt.claims.some(claim => !task.request.finish.some(criterion => criterion.id === claim.criterionId))) conflicts.push('Receipt names an unknown criterion.');
  return {
    schemaVersion: 1,
    taskId: task.id,
    receiptId: receipt.id,
    revision,
    asOf,
    status: conflicts.length ? 'conflict' : missing.length ? 'needs-evidence' : 'supported',
    assuranceByClaim,
    missing,
    conflicts,
    limits: [...receipt.limits, 'Supported means these criteria and evidence kinds matched. Reports do not authenticate native execution or provider state.']
  };
}

export function taskPacket(task) {
  return `# PROPOSAL. NOT DISPATCHED.\n\n${task.request.goal}\n\nProject ${task.request.projectId}. Revision ${task.request.revision}.\nExecutor ${task.executor.kind}. Host or environment ${task.executor.hostId ?? 'unbound'}.\nNative project ${task.executor.projectId ?? 'unbound'}. Path ${task.executor.path ?? 'none'}.\nAuthority ${task.request.authority.reference}.\nRoute ${task.route.status}.\n\n## Sources\n\n${task.request.sources.map(value => `- ${value}`).join('\n')}\n\n## Finish criteria\n\n${task.request.finish.map(value => `- ${value.id}. ${value.description} Require ${value.evidence}.`).join('\n')}\n\n## Missing observations and limits\n\n${[...task.route.reasons, ...task.limits].map(value => `- ${value}`).join('\n')}\n`;
}
