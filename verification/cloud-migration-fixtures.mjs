import { digest } from '../src/records.mjs';
export function legacyAttestationFixture() {
  const id = 'legacy-fixture'; const checkpoint = { process: 2, headHash: 'a'.repeat(64), completedUnits: 1, terminalEffects: 2, preparedAt: '2026-01-01T00:00:00.000Z' };
  const calls = Array.from({ length: 16 }, () => ({ command: 'cloud', stdout: JSON.stringify({ ok: true, data: {} }) }));
  calls[0] = { command: 'responsibility', stdout: JSON.stringify({ ok: true, data: { record: { id, target: { hostId: 'synthetic-host' } } } }) };
  calls[15] = { command: 'cloud', stdout: JSON.stringify({ ok: true, data: { responsibilityId: id, headHash: checkpoint.headHash, counts: { finished: 2 }, state: { jobs: [{ input: { id: 'job-1' }, completedUnits: 1 }] } } }) };
  const prepare = { host: 'synthetic-host', startedAt: '2025-12-31T23:59:59.000Z', completedAt: '2026-01-01T00:00:00.500Z', phase: 'prepare', status: 'prepared', process: 2, logicalSubmissions: 12, calls };
  const failedResume = { host: 'synthetic-host', completedAt: '2026-01-01T00:00:01.500Z', phase: 'resume', status: 'failed', process: 2, startedAt: '2026-01-01T00:00:01.000Z', calls: [], error: { message: 'Resume must use a genuinely fresh acceptance process' } };
  const files = Object.fromEntries(Object.entries({ checkpoint, prepare, failedResume }).map(([name, value]) => { const bytes = Buffer.from(JSON.stringify(value)); return [name, { path: `/synthetic/${name}.json`, value, bytes, sha256: digest(bytes) }]; }));
  const attestation = { schemaVersion: 1, kind: 'parent-reviewed-legacy-process-attestation', responsibilityId: id, checkpoint: { path: files.checkpoint.path, sha256: files.checkpoint.sha256, headHash: checkpoint.headHash, completedUnits: 1, terminalEffects: 2 }, prepare: { path: files.prepare.path, sha256: files.prepare.sha256, toolCallRef: 'synthetic-distinct-call-a' }, failedResume: { path: files.failedResume.path, sha256: files.failedResume.sha256, toolCallRef: 'synthetic-distinct-call-b' }, parentReview: { reference: 'Synthetic fixture review; not a real owner grant.', reviewedAt: '2026-01-01T00:00:02.000Z', statement: 'Synthetic parent-review declaration of the two original file references.' } };
  return { id, files, attestation };
}
