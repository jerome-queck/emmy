import { ordinary, directory, publishSlot } from './immutable-slot.mjs';
import { strictJson } from './bounded-json.mjs';
import { lstat, open, mkdir, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const kinds = ['maintenance', 'suggestions', 'token-optimisation', 'project-chat-cleanup', 'weekly-upkeep', 'lifecycle-check'];
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
function shape(value, fields) { need(value && typeof value === 'object' && !Array.isArray(value) && fields.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => fields.includes(key)), `Expected members ${fields.join(', ')}`); }
function canonical(value) { return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item); }
const hash = value => createHash('sha256').update(value).digest('hex');

function report(value) {
  shape(value, ['schemaVersion', 'kind', 'scheduledFor', 'runId', 'provenance', 'status', 'coverage', 'summary', 'findings', 'evidenceRefs', 'sourceWindow', 'generatedAt']);
  need(value.schemaVersion === 1 && kinds.includes(value.kind) && stamp(value.scheduledFor) && stamp(value.generatedAt), 'Invalid report identity or time');
  need(text(value.runId) && value.runId.length <= 120 && ['manual', 'scheduled'].includes(value.provenance), 'Invalid run provenance');
  need(['completed', 'failed', 'skipped'].includes(value.status) && ['complete', 'partial', 'unavailable'].includes(value.coverage), 'Invalid terminal status or coverage');
  need(typeof value.summary === 'string' && value.summary.length <= 1600 && Number.isSafeInteger(value.findings) && value.findings >= 0, 'Invalid compact summary or finding count');
  need(Array.isArray(value.evidenceRefs) && value.evidenceRefs.length <= 20 && value.evidenceRefs.every(ref => text(ref) && ref.length <= 400) && new Set(value.evidenceRefs).size === value.evidenceRefs.length, 'Invalid evidence references');
  shape(value.sourceWindow, ['start', 'end']);
  need(stamp(value.sourceWindow.start) && stamp(value.sourceWindow.end) && Date.parse(value.sourceWindow.start) < Date.parse(value.sourceWindow.end) && Date.parse(value.sourceWindow.end) <= Date.parse(value.generatedAt), 'Invalid original source window');
  need(Buffer.byteLength(canonical(value)) + 1 <= 16384, 'Report exceeds 16 KiB');
  need(value.provenance !== 'scheduled' || Date.parse(value.generatedAt) >= Date.parse(value.scheduledFor), 'Scheduled report cannot predate its occurrence');
  return value;
}
async function conflictReport(path, slot, original) {
  const value = report(strictJson(await ordinary(path, 16384)));
  need(hash(canonical([value.kind, new Date(value.scheduledFor).toISOString(), value.provenance])) === slot, 'Conflict marker slot identity mismatch');
  need(canonical(value) !== canonical(original), 'Conflict marker must retain a different report');
  return value;
}

function readResult(request, result) {
  const { kind, scheduledFor, provenance, minimumSourceEnd, maxAgeSeconds } = request;
  const snapshot = { query: { kind, scheduledFor: new Date(scheduledFor).toISOString(), provenance, minimumSourceEnd: new Date(minimumSourceEnd).toISOString(), maxAgeSeconds }, status: result.status, slot: result.slot, report: result.report ?? null, conflictingReport: result.conflictingReport ?? null, sourceWindowCurrent: result.sourceWindowCurrent ?? null };
  return { ...result, handover: {
    snapshotDigest: hash(canonical(snapshot)),
    reportAvailability: result.status === 'missing' ? 'missing' : result.status === 'conflict' ? 'conflict' : 'available',
    execution: result.status === 'conflict' ? 'conflicting' : result.report?.status ?? 'unknown',
    evidenceCoverage: result.status === 'conflict' ? 'conflicting' : result.report?.coverage ?? 'unavailable',
    parentReceipt: 'parent-owned', userDelivery: 'parent-owned'
  } };
}

export async function improvementReport(request, { evaluatedAt = new Date().toISOString() } = {}) {
  need(request && typeof request === 'object' && ['claim', 'release', 'publish', 'read'].includes(request.action), 'Unknown report action');
  const fields = { claim: ['action', 'directory', 'kind', 'runId'], release: ['action', 'directory', 'ownerToken'], publish: ['action', 'directory', 'report'], read: ['action', 'directory', 'kind', 'scheduledFor', 'maxAgeSeconds', 'provenance', 'minimumSourceEnd'] };
  shape(request, fields[request.action]); need(stamp(evaluatedAt), 'Invalid evaluation time');
  const selected = await directory(request.directory); const guard = join(selected, 'guard');
  if (['claim', 'release'].includes(request.action)) {
    const gate = join(selected, 'guard-operation');
    try { await mkdir(gate, { mode: 0o700 }); } catch (error) { if (error.code === 'EEXIST') return { status: 'held', execution: 'skip', limits: ['A cooperative guard operation is held; explicit orphan recovery is required.'] }; throw error; }
    try {
      if (request.action === 'claim') {
        need(kinds.includes(request.kind) && text(request.runId) && request.runId.length <= 120, 'Invalid job identity');
        try { await mkdir(guard, { mode: 0o700 }); } catch (error) { if (error.code === 'EEXIST') return { status: 'held', execution: 'skip', limits: ['No holder was killed, removed or stolen.'] }; throw error; }
        const ownerToken = randomUUID();
        const handle = await open(join(guard, 'owner.json'), 'wx', 0o600);
        try { await handle.writeFile(canonical({ ownerToken, kind: request.kind, runId: request.runId, claimedAt: evaluatedAt })); } finally { await handle.close(); }
        return { status: 'claimed', ownerToken };
      }
      if (request.action === 'release') {
        need(typeof request.ownerToken === 'string' && /^[a-f0-9-]{36}$/.test(request.ownerToken), 'Exact owner token required');
        need((await lstat(guard)).isDirectory(), 'Guard directory required');
        const owner = strictJson(await ordinary(join(guard, 'owner.json'), 1024));
        need(owner.ownerToken === request.ownerToken, 'Owner token mismatch');
        await unlink(join(guard, 'owner.json'));
        await rmdir(guard);
        return { status: 'released' };
      }
    } finally { await rmdir(gate); }
  }
  if (request.action === 'publish') {
    const value = report(request.report);
    need(Date.parse(value.generatedAt) <= Date.parse(evaluatedAt), 'Future report cannot be published');
    const slot = hash(canonical([value.kind, new Date(value.scheduledFor).toISOString(), value.provenance]));
    return { status: await publishSlot(selected, `${slot}.json`, `${canonical(value)}\n`, { maximum: 16384, validateConflict: (path, identity, original) => conflictReport(path, identity, report(strictJson(original))) }), slot, assurance: 'declared-terminal-report' };
  }
  need(kinds.includes(request.kind) && stamp(request.scheduledFor) && ['scheduled', 'manual'].includes(request.provenance) && Number.isSafeInteger(request.maxAgeSeconds) && request.maxAgeSeconds >= 0 && request.maxAgeSeconds <= 31536000, 'Expected exact occurrence, provenance and bounded maximum age');
  need(stamp(request.minimumSourceEnd), 'Expected minimum original source end required');
  const slot = hash(canonical([request.kind, new Date(request.scheduledFor).toISOString(), request.provenance]));
  let value;
  try { value = report(strictJson(await ordinary(join(selected, `${slot}.json`), 16384))); } catch (error) { if (error.code === 'ENOENT') return readResult(request, { status: 'missing', slot }); throw error; }
  need(value.kind === request.kind && Date.parse(value.scheduledFor) === Date.parse(request.scheduledFor) && value.provenance === request.provenance, 'Report slot identity mismatch');
  let conflictingReport;
  try { conflictingReport = await conflictReport(join(selected, `conflict-${slot}.json`), slot, value); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (conflictingReport) return readResult(request, { status: 'conflict', slot, report: value, conflictingReport, evaluatedAt, assurance: 'declared-terminal-report', limits: ['Different reports are retained for this occurrence. The first report is unchanged; the dispute requires explicit review. Reads inspect only the canonical slot and its conflict marker and may precede a concurrent marker publication.'] });
  const now = Date.parse(evaluatedAt); const generated = Date.parse(value.generatedAt);
  const sourceWindowCurrent = Date.parse(value.sourceWindow.end) >= Date.parse(request.minimumSourceEnd);
  const status = generated > now || Date.parse(value.scheduledFor) > now ? 'future' : now - generated > request.maxAgeSeconds * 1000 || now - Date.parse(value.sourceWindow.end) > request.maxAgeSeconds * 1000 ? 'stale' : value.status === 'failed' ? 'failed' : value.status === 'skipped' ? 'skipped' : !sourceWindowCurrent || value.coverage !== 'complete' || !value.evidenceRefs.length ? 'partial' : value.findings ? 'completed-findings' : 'completed-empty';
  return readResult(request, { status, slot, report: value, sourceWindowCurrent, evaluatedAt, assurance: 'declared-terminal-report', limits: ['This cooperative guard and supplied report do not authenticate execution, evidence completeness, schedule firing or delivery. No automatic orphan recovery is provided.'] });
}

export async function readImprovementRequest(file) { return strictJson(await ordinary(file, 32768)); }
