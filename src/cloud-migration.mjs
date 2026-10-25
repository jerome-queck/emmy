import { lstat, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { canonical, digest, readStore, timestamp } from './records.mjs';
import { cloudStatus } from './cloud.mjs';
import { captureProcessIncarnation, compareIncarnations, validIncarnation } from './process-incarnation.mjs';

const insist = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4096;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export async function readAcceptanceJson(path, maxBytes) {
  const info = await lstat(path); insist(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= maxBytes, 'Acceptance evidence must be a bounded ordinary file');
  const bytes = await readFile(path); insist(bytes.length === info.size && bytes.length <= maxBytes, 'Acceptance evidence changed during read');
  return { path: resolve(path), bytes, sha256: digest(bytes), value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
}
export function assessLegacyAttestation(attestation, files, responsibilityId) {
  insist(attestation?.schemaVersion === 1 && attestation.kind === 'parent-reviewed-legacy-process-attestation' && attestation.responsibilityId === responsibilityId, 'Legacy attestation responsibility or schema mismatch');
  const { checkpoint, prepare, failedResume } = files; const value = checkpoint.value;
  insist(!value.incarnation && Number.isSafeInteger(value.process) && value.process > 0 && hash(value.headHash) && Number.isSafeInteger(value.completedUnits) && value.completedUnits >= 0 && Number.isSafeInteger(value.terminalEffects) && value.terminalEffects >= 0, 'Checkpoint is not the supported legacy shape');
  for (const name of ['checkpoint', 'prepare', 'failedResume']) {
    const binding = attestation[name]; insist(binding && binding.path === files[name].path && binding.sha256 === files[name].sha256, `Legacy ${name} bytes or path differ from reviewed attestation`);
  }
  insist(attestation.checkpoint.headHash === value.headHash && attestation.checkpoint.completedUnits === value.completedUnits && attestation.checkpoint.terminalEffects === value.terminalEffects, 'Legacy checkpoint facts differ from reviewed attestation');
  insist(text(attestation.prepare.toolCallRef) && text(attestation.failedResume.toolCallRef) && attestation.prepare.toolCallRef !== attestation.failedResume.toolCallRef, 'Legacy tool-call references must be distinct and attributable');
  insist(text(attestation.parentReview?.reference) && text(attestation.parentReview?.statement) && typeof attestation.parentReview.reviewedAt === 'string' && Number.isFinite(Date.parse(attestation.parentReview.reviewedAt)), 'Explicit parent review is required');
  timestamp(attestation.parentReview.reviewedAt, 'parentReview.reviewedAt');
  const first = prepare.value; const failed = failedResume.value;
  insist(first.phase === 'prepare' && first.status === 'prepared' && first.process === value.process && first.logicalSubmissions === 12 && Array.isArray(first.calls) && first.calls.length === 16, 'Legacy prepare receipt does not match its checkpoint');
  const adoption = first.calls.find(call => call.command === 'responsibility');
  const adopted = adoption ? JSON.parse(adoption.stdout).data?.record : null;
  insist(adopted?.id === responsibilityId, 'Legacy prepare does not retain the intended responsibility');
  const last = JSON.parse(first.calls.at(-1).stdout).data;
  insist(last?.responsibilityId === responsibilityId && last.headHash === value.headHash && last.counts?.finished === value.terminalEffects && last.state?.jobs.find(job => job.input.id === 'job-1')?.completedUnits === value.completedUnits, 'Legacy prepare final readback differs from checkpoint');
  insist(failed.process === value.process && text(first.host) && failed.host === first.host && adopted.target?.hostId === first.host, 'Legacy failed receipt PID or host differs from the original guard trigger');
  insist(failed.phase === 'resume' && failed.status === 'failed' && Array.isArray(failed.calls) && failed.calls.length === 0 && failed.error?.message === 'Resume must use a genuinely fresh acceptance process', 'Legacy failed resume must be the retained pre-work PID-guard failure');
  const chronology = [first.startedAt, value.preparedAt, first.completedAt, failed.startedAt, failed.completedAt, attestation.parentReview.reviewedAt];
  insist(chronology.every(value => typeof value === 'string' && Number.isFinite(Date.parse(value))) && chronology.every((value, index) => index === 0 || Date.parse(value) >= Date.parse(chronology[index - 1])), 'Legacy receipt chronology is incomplete or inconsistent');
  return { historicalFreshness: 'reported-parent-attestation', authenticatedParentAuthority: false, responsibilityId, headHash: value.headHash, completedUnits: value.completedUnits, terminalEffects: value.terminalEffects, originalFiles: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, { path: file.path, sha256: file.sha256 }])), toolCallRefs: { prepare: attestation.prepare.toolCallRef, failedResume: attestation.failedResume.toolCallRef }, parentReview: attestation.parentReview };
}
async function currentCheckpoint(home, id, checkpoint) {
  const { records } = await readStore(home); const status = await cloudStatus(home, records, id);
  insist(status.headHash === checkpoint.headHash && status.state?.jobs.find(job => job.input.id === 'job-1')?.completedUnits === checkpoint.completedUnits && status.counts.finished === checkpoint.terminalEffects, 'Current journal differs from the exact reviewed checkpoint');
  insist(status.turn?.status === 'available', 'Legacy migration refuses an unresolved current owner claim');
  insist(!['suspended', 'conflict', 'unconfigured', 'wrong-controller'].includes(status.status) && status.scope?.eligible !== false, 'Legacy migration requires the current scoped controller');
  return status;
}
export async function migrateLegacyAcceptance(home, id, attestationPath) {
  const directory = join(home, 'cloud-acceptance', id); const attested = await readAcceptanceJson(attestationPath, 65536); const attestation = attested.value;
  const files = {};
  for (const name of ['checkpoint', 'prepare', 'failedResume']) { insist(text(attestation[name]?.path), `Missing ${name} original file path`); files[name] = await readAcceptanceJson(resolve(attestation[name].path), name === 'checkpoint' ? 65536 : 2097152); }
  insist(files.checkpoint.path === resolve(directory, 'checkpoint.json'), 'Migration must use the original saved acceptance checkpoint');
  const assessment = assessLegacyAttestation(attestation, files, id); insist(Date.parse(attestation.parentReview.reviewedAt) <= Date.now(), 'Declared parent review is in the future'); await currentCheckpoint(home, id, files.checkpoint.value);
  const baseline = await captureProcessIncarnation(); insist(validIncarnation(baseline), `Observed migration baseline unavailable: ${baseline.reason ?? 'unknown'}`);
  await currentCheckpoint(home, id, files.checkpoint.value);
  const body = { schemaVersion: 1, kind: 'legacy-process-baseline', assessment, attestation: { path: attested.path, sha256: attested.sha256 }, checkpoint: { sha256: files.checkpoint.sha256, headHash: assessment.headHash, completedUnits: assessment.completedUnits, terminalEffects: assessment.terminalEffects }, baseline, baselineAssurance: 'observed-linux-kernel-incarnation', status: 'baseline-established', execution: 'none', limits: ['Original prepare freshness remains reported parent evidence.', 'This sidecar establishes a new baseline only; a later different observed incarnation is required.', 'Reported review and tool-call references do not authenticate authority.'] };
  const bytes = `${canonical(body)}\n`; const key = digest(bytes); const path = join(directory, 'legacy-baselines', `${key}.json`); await mkdir(dirname(path), { recursive: true });
  for (const file of [...Object.values(files), attested]) insist(digest(await readFile(file.path)) === file.sha256, 'Original legacy evidence changed before baseline publication');
  await currentCheckpoint(home, id, files.checkpoint.value);
  try { await writeFile(path, bytes, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; insist((await readFile(path)).equals(Buffer.from(bytes)), 'Existing migration sidecar differs'); }
  for (const file of [...Object.values(files), attested]) insist(digest(await readFile(file.path)) === file.sha256, 'Original legacy evidence changed after baseline publication');
  await currentCheckpoint(home, id, files.checkpoint.value);
  return { status: 'baseline-established', path, sha256: key, ...body };
}
export async function acceptanceRestartEvidence(home, id, checkpoint, baselinePath = null) {
  const current = await captureProcessIncarnation();
  if (!checkpoint.incarnation) {
    insist(baselinePath, 'Legacy checkpoint lacks an observed incarnation. Run --phase migrate-legacy --attestation <parent-reviewed-local-file>, then a later --phase resume --baseline <returned-sidecar>.');
    const file = await readAcceptanceJson(resolve(baselinePath), 131072); const baseline = file.value;
    insist(resolve(dirname(file.path)) === resolve(home, 'cloud-acceptance', id, 'legacy-baselines') && basename(file.path) === `${file.sha256}.json`, 'Migration baseline path or content address differs');
    insist(baseline.kind === 'legacy-process-baseline' && baseline.status === 'baseline-established' && baseline.execution === 'none' && baseline.assessment?.responsibilityId === id && baseline.checkpoint?.sha256 === digest((await readAcceptanceJson(join(home, 'cloud-acceptance', id, 'checkpoint.json'), 65536)).bytes) && baseline.checkpoint.headHash === checkpoint.headHash && baseline.checkpoint.completedUnits === checkpoint.completedUnits && baseline.checkpoint.terminalEffects === checkpoint.terminalEffects, 'Migration baseline does not bind the original checkpoint');
    const attested = await readAcceptanceJson(baseline.attestation.path, 65536); insist(attested.sha256 === baseline.attestation.sha256, 'Migration attestation changed');
    const files = {}; for (const name of ['checkpoint', 'prepare', 'failedResume']) files[name] = await readAcceptanceJson(baseline.assessment.originalFiles[name].path, name === 'checkpoint' ? 65536 : 2097152);
    const assessment = assessLegacyAttestation(attested.value, files, id); insist(canonical(assessment) === canonical(baseline.assessment), 'Migration original evidence changed');
    const comparison = compareIncarnations(baseline.baseline, current); insist(comparison.status === 'different', `Resume incarnation is ${comparison.status}: ${comparison.reason}`);
    return { historicalPrepare: 'reported-parent-attestation', baseline: 'observed-linux-kernel-incarnation', resume: 'observed-different-incarnation', comparison, baselineRef: { path: file.path, sha256: file.sha256 }, prior: baseline.baseline, current };
  }
  insist(!baselinePath, 'Modern checkpoint does not accept a legacy migration baseline');
  const comparison = compareIncarnations(checkpoint.incarnation, current); insist(comparison.status === 'different', `Resume incarnation is ${comparison.status}: ${comparison.reason}`);
  return { historicalPrepare: 'observed-linux-kernel-incarnation', resume: 'observed-different-incarnation', comparison, prior: checkpoint.incarnation, current };
}
