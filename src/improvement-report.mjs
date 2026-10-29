import { strictJson } from './bounded-json.mjs';
import { constants } from 'node:fs';
import { lstat, open, mkdir, link, unlink, realpath, rmdir } from 'node:fs/promises';
import { isAbsolute, resolve, join, dirname, parse } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const kinds = ['maintenance', 'suggestions', 'token-optimisation'];
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
function shape(value, fields) { need(value && typeof value === 'object' && !Array.isArray(value) && fields.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => fields.includes(key)), `Expected members ${fields.join(', ')}`); }
function canonical(value) { return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item); }
const hash = value => createHash('sha256').update(value).digest('hex');
async function ordinary(path, maximum) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat(); need(stat.isFile() && stat.size <= maximum, 'Expected bounded ordinary file');
    const bytes = Buffer.alloc(maximum + 1); let count = 0;
    while (count < bytes.length) { const read = await handle.read(bytes, count, bytes.length - count, null); if (!read.bytesRead) break; count += read.bytesRead; }
    need(count <= maximum, 'File exceeds size bound');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally { await handle.close(); }
}
async function directory(path) {
  need(isAbsolute(path) && !path.split(/[\\/]/).includes('..'), 'Select an absolute private directory without traversal');
  const selected = resolve(path);
  need((await lstat(selected)).isDirectory(), 'Private directory must already exist and cannot be a symlink');
  const actual = await realpath(selected);
  let current = selected;
  while (current !== parse(current).root) {
    need(!(await lstat(current)).isSymbolicLink(), 'Symlinked private directory paths are unsupported'); current = dirname(current);
  }
  need(actual === selected, 'Private directory must be canonical');
  return actual;
}
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
async function publish(directory, name, bytes) {
  const temporary = join(directory, `.pending-${randomUUID()}`); const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
  try {
    try { await link(temporary, join(directory, name)); return 'published'; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await ordinary(join(directory, name), 16384) === bytes) return 'identical';
      const conflict = `conflict-${name.slice(0, -5)}-${hash(bytes)}.json`;
      try { await link(temporary, join(directory, conflict)); } catch (other) { if (other.code !== 'EEXIST') throw other; need(await ordinary(join(directory, conflict), 16384) === bytes, 'Conflict evidence collision'); }
      return 'conflict';
    }
  } finally { await unlink(temporary); }
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
    const slot = hash(canonical([value.kind, value.scheduledFor, value.provenance]));
    return { status: await publish(selected, `${slot}.json`, `${canonical(value)}\n`), slot, assurance: 'declared-terminal-report' };
  }
  need(kinds.includes(request.kind) && stamp(request.scheduledFor) && ['scheduled', 'manual'].includes(request.provenance) && Number.isSafeInteger(request.maxAgeSeconds) && request.maxAgeSeconds >= 0 && request.maxAgeSeconds <= 31536000, 'Expected exact occurrence, provenance and bounded maximum age');
  need(stamp(request.minimumSourceEnd), 'Expected minimum original source end required');
  const slot = hash(canonical([request.kind, request.scheduledFor, request.provenance]));
  let value;
  try { value = report(strictJson(await ordinary(join(selected, `${slot}.json`), 16384))); } catch (error) { if (error.code === 'ENOENT') return { status: 'missing', slot }; throw error; }
  need(value.kind === request.kind && value.scheduledFor === request.scheduledFor && value.provenance === request.provenance, 'Report slot identity mismatch');
  const now = Date.parse(evaluatedAt); const generated = Date.parse(value.generatedAt);
  const sourceWindowCurrent = Date.parse(value.sourceWindow.end) >= Date.parse(request.minimumSourceEnd);
  const status = generated > now || Date.parse(value.scheduledFor) > now ? 'future' : now - generated > request.maxAgeSeconds * 1000 || now - Date.parse(value.sourceWindow.end) > request.maxAgeSeconds * 1000 ? 'stale' : value.status === 'failed' ? 'failed' : value.status === 'skipped' ? 'skipped' : !sourceWindowCurrent || value.coverage !== 'complete' || !value.evidenceRefs.length ? 'partial' : value.findings ? 'completed-findings' : 'completed-empty';
  return { status, slot, report: value, sourceWindowCurrent, evaluatedAt, assurance: 'declared-terminal-report', limits: ['This cooperative guard and supplied report do not authenticate execution, evidence completeness, schedule firing or delivery. No automatic orphan recovery is provided.'] };
}

export async function readImprovementRequest(file) { return strictJson(await ordinary(file, 32768)); }
