const mutant = (id, before, after, counterexample) => ({ id: `fleet-${id}`, source: 'src/fleet-state.mjs', property: 'fleet-contract', edits: [[before, after]], counterexample });
export const fleetMutations = [
  mutant('ignore-source-age', 'ageMs > (entity.expected.maxAgeMs ?? config.maxAgeMs)', 'false', 'age/300001/true'),
  mutant('ignore-coverage', '!receipt.coverage.complete || receipt.coverage.gaps.length', 'false', 'age/0/false'),
  mutant('ignore-monitor-failure', 'if (entity.expected.monitorId) {', 'if (false) {', 'monitor/failure'),
  mutant('ignore-delivery', 'entity.expected.requiresDelivery && !capture.deliveryRef', 'false', 'schedule/delivery-unverified'),
  mutant('repeat-alert', 'if (fingerprint !== entity.fingerprint) {', 'if (true) {', 'alert/unchanged'),
  mutant('duplicate-job', 'if (existing) {', 'if (false) {', 'job/duplicate'),
  mutant('ignore-reservations', 'pending.length >= capacity', 'false', 'admission/interactive/4'),
  mutant('retry-uncertain', "['attempted', 'uncertain'].includes(job.status)", "['attempted'].includes(job.status)", 'job/uncertain'),
  mutant('skip-checkpoint', "action.checkpoint === job.checkpoint + (['completed', 'checkpoint'].includes(action.outcome) ? 1 : 0)", 'true', 'job/checkpoint'),
  mutant('borrow-result-scope', 'job.input.entityIds.some(id => canonical(entity(id).expected.scope) === canonical(action.receipt.scope))', 'true', 'job/result-scope'),
  mutant('borrow-send-readback', 'action.readbackRef !== action.sendRef', 'true', 'send/readback'),
  mutant('restore-old-green', 'Boolean(epoch && state.epochHash !== epoch.hash)', 'false', 'journal/restore'),
  mutant('ignore-parent-budgets', 'job.usedReads + readDelta <= job.input.maxReads && job.usedBytes + byteDelta <= job.input.maxBytes', 'true', 'job/budget/reads')
];
