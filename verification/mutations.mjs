export const mutations = [
  { id: 'cloud-default', property: 'local-first', edits: [["request.workClass === 'code' ? 'local-codex' : 'dot-cloud'", "request.workClass === 'code' ? 'codex-cloud' : 'dot-cloud'"]] },
  { id: 'substitute-host', property: 'exact-binding', edits: [["local ? binding?.hostId ?? null", "local ? 'substitute-mac'"]] },
  { id: 'accept-foreign-scope', property: 'scope-freshness', edits: [["snapshot.scope.product === target.product && snapshot.scope.hostId === target.hostId", 'true']] },
  { id: 'accept-partial-scope', property: 'scope-freshness', edits: [['!snapshot.coverage.complete || snapshot.coverage.gaps.length', 'false']] },
  { id: 'accept-stale-scope', property: 'scope-freshness', edits: [['ageMs < 0 || ageMs > maximumSnapshotAgeMs', 'false']] },
  { id: 'accept-offline-host', property: 'scope-freshness', edits: [["snapshot.availability !== 'online'", 'false']] },
  { id: 'accept-foreign-project', property: 'scope-freshness', edits: [["!snapshot.projects.some(value => value.id === target.projectId && value.path === target.path && value.hostId === target.hostId)", 'false']] },
  { id: 'claim-dispatch', property: 'proposal-only', edits: [["execution: 'proposal-only'", "execution: 'dispatched'"]] },
  { id: 'ignore-task-identity', property: 'identity', edits: [['receipt.taskId !== task.id', 'false'], ['receipt.taskId === task.id', 'true']] },
  { id: 'ignore-project-identity', property: 'identity', edits: [['receipt.projectId !== task.request.projectId', 'false'], ['receipt.projectId === task.request.projectId', 'true']] },
  { id: 'ignore-executor-identity', property: 'identity', edits: [["JSON.stringify(Object.entries(receipt.executor).sort()) === JSON.stringify(Object.entries(task.executor).sort())", 'true']] },
  { id: 'ignore-receipt-revision', property: 'revision', edits: [['receipt.resultRevision !== revision', 'false'], ['receipt.resultRevision === revision', 'true']] },
  { id: 'ignore-claim-revision', property: 'revision', edits: [['claim.revision === revision', 'true'], ['claim.revision !== revision', 'false']] },
  { id: 'accept-missing-evidence', property: 'evidence-required', edits: [["const supported = criterion.evidence === 'local-digest' ? checked : reported;", 'const supported = true;']] },
  { id: 'ignore-failed-claim', property: 'contradictions', edits: [["matched.some(claim => claim.outcome === 'fail')", 'false']] },
  { id: 'upgrade-reported-success', property: 'reported-assurance', edits: [["criterion.evidence === 'local-digest' ? 'observed-local-bytes' : 'reported'", "criterion.evidence === 'local-digest' ? 'observed-local-bytes' : 'observed-local-bytes'"]] }
];
