export const cloudMutations = [
  { id: 'cloud-multiple-home-controllers', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["if (allRoots.length > 1)", 'if (false)'], ["const roots = allRoots;", "const roots = allRoots.filter(record => record.responsibilityId === responsibilityId);"]] },
  { id: 'cloud-ignore-pending-bytes', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["bytes > config.maxPendingBytes", 'false']] },
  { id: 'cloud-ignore-capacity-age', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["age < 0 || age > config.maxSampleAgeMs", 'false']] },
  { id: 'cloud-run-under-pressure', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["eligible: sample.state === 'available'", 'eligible: true']] },
  { id: 'cloud-ignore-reservations', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["config.maxPending - reserved", 'config.maxPending']] },
  { id: 'cloud-duplicate-executes-again', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["if (existing) return", 'if (false) return']] },
  { id: 'cloud-fifo-ignores-priority', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["cloudPriorities.indexOf(a.input.priority) - cloudPriorities.indexOf(b.input.priority) || a.order - b.order", 'a.order - b.order']] },
  { id: 'cloud-checkpoint-skips-unit', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["job.completedUnits += 1;", 'job.completedUnits += 2;']] },
  { id: 'cloud-unbounded-retry', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["job.failures >= config.maxAttempts", 'false']] },
  { id: 'cloud-no-retry-delay', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["Math.min(config.maxBackoffMs, config.backoffMs * 2 ** (job.failures - 1))", '0']] },
  { id: 'cloud-alert-storm', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["if (!state.escalations.some(entry => entry.id === id))", 'if (true)']] },
  { id: 'cloud-runs-while-suspended', property: 'cloud-admission', source: 'src/cloud.mjs', edits: [["state.lifecycle !== 'active'", 'false']] },
];
