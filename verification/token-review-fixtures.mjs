export function tokenCapture(evaluatedAt = '2026-10-29T04:00:00Z') {
  const time = delta => new Date(Date.parse(evaluatedAt) + delta).toISOString();
  return { schemaVersion: 1, reviewWindow: { start: time(-3600000), end: time(-1000), timeZone: 'Asia/Singapore' }, maxEvidenceAgeHours: 24, inventory: { objectives: 'complete', attempts: 'complete' }, evidence: [{ id: 'source', ref: 'synthetic:usage-and-result', observedAt: time(-2000), acquiredAt: time(-1000) }], objectives: [{ id: 'success', outcome: 'verified-success', evidenceIds: ['source'] }, { id: 'failure', outcome: 'failed', evidenceIds: ['source'] }], attempts: [
    { id: 'lead', objectiveId: 'success', workerId: 'lead', kind: 'worker', evidenceIds: ['source'], usage: { basis: 'measured', unit: 'tokens', input: 100, cachedInput: 40, output: 20 }, cost: { basis: 'measured', currency: 'USD', unit: 'microdollar', value: 10 } },
    { id: 'helper', objectiveId: 'success', workerId: 'helper', kind: 'coordination', evidenceIds: ['source'], usage: { basis: 'measured', unit: 'tokens', input: 20, cachedInput: 0, output: 10 }, cost: { basis: 'measured', currency: 'USD', unit: 'microdollar', value: 5 } },
    { id: 'failed-retry', objectiveId: 'failure', workerId: 'lead', kind: 'retry', evidenceIds: ['source'], usage: { basis: 'measured', unit: 'tokens', input: 50, cachedInput: 10, output: 10 }, cost: { basis: 'measured', currency: 'USD', unit: 'microdollar', value: 15 } }
  ], observations: [] };
}
export function terminalReport(generatedAt = '2026-10-29T04:00:00Z') {
  return { schemaVersion: 1, kind: 'maintenance', scheduledFor: '2026-10-29T03:00:00Z', runId: 'synthetic-run', provenance: 'scheduled', status: 'completed', coverage: 'complete', summary: 'Reviewed the complete synthetic source window.', findings: 0, evidenceRefs: ['synthetic:complete-review'], sourceWindow: { start: '2026-10-28T00:00:00Z', end: '2026-10-29T00:00:00Z' }, generatedAt };
}
