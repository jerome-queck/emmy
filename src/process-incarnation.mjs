import * as filesystem from 'node:fs/promises';

const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const pidValue = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const namespace = value => value && decimal(value.dev) && decimal(value.ino) && value.ino !== '0';
const equalNamespace = (left, right) => namespace(left) && namespace(right) && left.dev === right.dev && left.ino === right.ino;
const insist = (condition, message) => { if (!condition) throw new Error(message); };
export function parseProcStat(text) {
  insist(typeof text === 'string' && Buffer.byteLength(text) <= 16384, 'Invalid bounded proc stat');
  const closing = text.lastIndexOf(')'); const opening = text.indexOf('(');
  insist(opening > 0 && closing > opening && /^\d+ $/.test(text.slice(0, opening)), 'Malformed proc stat comm');
  const pid = Number(text.slice(0, opening).trim()); const fields = text.slice(closing + 1).trim().split(/\s+/);
  insist(pidValue(pid) && fields.length >= 20 && /^[A-Za-z]$/.test(fields[0]) && decimal(fields[19]), 'Malformed proc stat field 22');
  return { pid, state: fields[0], startTicks: fields[19] };
}
export function parseProcStatus(text) {
  insist(typeof text === 'string' && Buffer.byteLength(text) <= 65536, 'Invalid bounded proc status');
  const lines = text.split('\n').filter(line => line.startsWith('NSpid:'));
  insist(lines.length === 1 && /^NSpid:\s+[1-9][0-9]*(?:\s+[1-9][0-9]*)*\s*$/.test(lines[0]), 'Missing or malformed proc NSpid');
  const values = lines[0].slice(6).trim().split(/\s+/).map(Number); insist(values.length <= 32 && values.every(pidValue), 'Invalid proc NSpid values'); return values;
}
const unescapeMount = value => value.replace(/\\(040|011|012|134)/g, (_, code) => String.fromCharCode(Number.parseInt(code, 8)));
export function parseProcMount(text) {
  insist(typeof text === 'string' && Buffer.byteLength(text) <= 262144, 'Invalid bounded proc mountinfo');
  const entries = text.trim().split('\n').map(line => {
    const pieces = line.split(' - '); if (pieces.length !== 2) return null;
    const before = pieces[0].split(' '); const after = pieces[1].split(' ');
    if (before.length < 6 || after.length < 3 || unescapeMount(before[4]) !== '/proc') return null;
    return { mountId: before[0], parentId: before[1], device: before[2], root: unescapeMount(before[3]), mountPoint: unescapeMount(before[4]), filesystem: after[0], options: before[5], superOptions: after[2], hiddenPids: [...before[5].split(','), ...after[2].split(',')].some(option => /^hidepid=/.test(option) && option !== 'hidepid=0') };
  }).filter(Boolean);
  insist(entries.length === 1 && decimal(entries[0].mountId) && entries[0].root === '/' && entries[0].filesystem === 'proc' && entries[0].options.length <= 4096 && entries[0].superOptions.length <= 4096, 'Unverified proc mount root'); return entries[0];
}
export function validIncarnation(value) {
  return Boolean(value && value.schemaVersion === 1 && value.kind === 'linux-proc-incarnation' && value.status === 'observed' && pidValue(value.pid) && typeof value.bootId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.bootId) && decimal(value.startTicks) && namespace(value.pidNamespace) && namespace(value.timeNamespace) && namespace(value.mountNamespace) && namespace(value.proc?.root) && value.proc?.filesystemType === '40864' && value.proc.selfLink === String(value.pid) && Array.isArray(value.proc.nspid) && value.proc.nspid.length === 1 && value.proc.nspid[0] === value.pid && (equalNamespace(value.proc.pid1Namespace, value.pidNamespace) || value.proc.pid1Namespace === null && value.proc.pid1NamespaceCheck?.status === 'unavailable') && value.proc.rootedInCallerNamespace === true && value.proc.mount?.root === '/' && value.proc.mount.mountPoint === '/proc' && value.proc.mount.filesystem === 'proc' && value.proc.mount.hiddenPids === false && decimal(value.proc.mount.mountId));
}
export function compareIncarnations(left, right) {
  if (!validIncarnation(left) || !validIncarnation(right)) return { status: 'unknown', reason: 'missing-or-unverified-incarnation' };
  if (left.bootId !== right.bootId) return { status: 'different', reason: 'different-kernel-boot' };
  if (!equalNamespace(left.pidNamespace, right.pidNamespace)) return { status: 'different', reason: 'different-pid-namespace' };
  if (left.pid !== right.pid) return { status: 'different', reason: 'different-pid-in-same-namespace' };
  if (!equalNamespace(left.timeNamespace, right.timeNamespace)) return { status: 'unknown', reason: 'time-namespace-not-comparable' };
  if (left.startTicks !== right.startTicks) return { status: 'different', reason: 'different-kernel-start' };
  return { status: 'same', reason: 'same-or-indistinguishable-kernel-incarnation' };
}
export function ownerDecision(owner, observer, target) {
  if (!validIncarnation(owner) || !validIncarnation(observer)) return { status: 'unknown', reason: 'missing-or-unverified-owner-incarnation' };
  if (owner.bootId !== observer.bootId || !equalNamespace(owner.pidNamespace, observer.pidNamespace) || !equalNamespace(owner.timeNamespace, observer.timeNamespace)) return { status: 'unknown', reason: 'owner-namespace-or-boot-not-comparable' };
  if (target?.status === 'absent') return { status: 'absent', reason: 'owned-incarnation-absent-in-verified-proc-scope' };
  if (target?.status !== 'observed' || target.pid !== owner.pid || !decimal(target.startTicks)) return { status: 'unknown', reason: 'target-unreadable-or-malformed' };
  if (target.startTicks !== owner.startTicks) return { status: 'absent', reason: 'pid-reused-by-different-start-incarnation' };
  return { status: 'alive', reason: 'same-owner-incarnation-present' };
}
async function boundedRead(io, path, maximum) {
  const file = await io.open(path, 'r');
  try { const bytes = Buffer.alloc(maximum + 1); let used = 0; while (used <= maximum) { const result = await file.read(bytes, used, bytes.length - used, null); if (!result.bytesRead) break; used += result.bytesRead; } insist(used <= maximum, 'Proc read exceeds byte bound'); return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used)); }
  finally { await file.close(); }
}
const nsStat = async (io, path) => { const value = await io.stat(path, { bigint: true }); return { dev: String(value.dev), ino: String(value.ino) }; };
async function capture(io, pid) {
  const bootId = (await boundedRead(io, '/proc/sys/kernel/random/boot_id', 128)).trim();
  const stat = parseProcStat(await boundedRead(io, '/proc/self/stat', 16384));
  const nspid = parseProcStatus(await boundedRead(io, '/proc/self/status', 65536));
  const selfLink = await io.readlink('/proc/self');
  const root = await nsStat(io, '/proc'); const mountNamespace = await nsStat(io, '/proc/self/ns/mnt');
  const pidNamespace = await nsStat(io, '/proc/self/ns/pid'); const timeNamespace = await nsStat(io, '/proc/self/ns/time');
  let pid1Namespace = null; let pid1NamespaceCheck;
  try { pid1Namespace = await nsStat(io, '/proc/1/ns/pid'); pid1NamespaceCheck = { status: 'observed' }; } catch (error) { pid1NamespaceCheck = { status: 'unavailable', error: error.code ?? error.message }; }
  const filesystemType = String((await io.statfs('/proc', { bigint: true })).type);
  const mount = parseProcMount(await boundedRead(io, '/proc/self/mountinfo', 262144));
  const value = { schemaVersion: 1, kind: 'linux-proc-incarnation', status: 'observed', observedAt: new Date().toISOString(), pid, bootId, startTicks: stat.startTicks, pidNamespace, timeNamespace, mountNamespace, proc: { root, filesystemType, selfLink, nspid, pid1Namespace, pid1NamespaceCheck, mount, rootedInCallerNamespace: stat.pid === pid && selfLink === String(pid) && nspid.length === 1 && nspid[0] === pid && (pid1Namespace === null || equalNamespace(pid1Namespace, pidNamespace)) } };
  insist(validIncarnation(value), 'Proc is not a verified caller PID-namespace mount'); return value;
}
function sameScope(left, right) {
  return compareIncarnations(left, right).status === 'same' && equalNamespace(left.mountNamespace, right.mountNamespace) && equalNamespace(left.proc.root, right.proc.root) && left.proc.mount.mountId === right.proc.mount.mountId && left.proc.mount.device === right.proc.mount.device && left.proc.mount.options === right.proc.mount.options && left.proc.mount.superOptions === right.proc.mount.superOptions;
}
async function acquireIncarnation({ io, platform, pid, acquisition }) {
  if (platform !== 'linux') return { schemaVersion: 1, kind: 'linux-proc-incarnation', status: 'unknown', reason: 'unsupported-platform', platform, acquisition, observedAt: new Date().toISOString() };
  try {
    const first = await capture(io, pid); const second = await capture(io, pid);
    insist(sameScope(first, second), 'Proc scope changed during capture'); return { ...second, acquisition };
  } catch (error) { return { schemaVersion: 1, kind: 'linux-proc-incarnation', status: 'unknown', reason: 'proc-incarnation-unavailable', error: error.code ?? error.message, platform, acquisition, observedAt: new Date().toISOString() }; }
}
export async function captureProcessIncarnation(options = {}) {
  return acquireIncarnation({ io: options.io ?? filesystem, platform: options.platform ?? process.platform, pid: options.pid ?? process.pid, acquisition: Object.keys(options).length ? 'synthetic-fixture' : 'actual-process' });
}
export async function inspectOwnerIncarnation(owner, options = {}) {
  const io = options.io ?? filesystem; const platform = options.platform ?? process.platform; const pid = options.pid ?? process.pid; const acquisition = Object.keys(options).length ? 'synthetic-fixture' : 'actual-process';
  const observer = await acquireIncarnation({ io, platform, pid, acquisition });
  const preliminary = ownerDecision(owner, observer, null);
  if (!validIncarnation(owner) || !validIncarnation(observer) || preliminary.reason === 'owner-namespace-or-boot-not-comparable') return { ...preliminary, observer };
  let target;
  try { target = { status: 'observed', ...parseProcStat(await boundedRead(io, `/proc/${owner.pid}/stat`, 16384)) }; }
  catch (error) { target = error.code === 'ENOENT' ? { status: 'absent' } : { status: 'unknown', error: error.code ?? error.message }; }
  const after = await acquireIncarnation({ io, platform, pid, acquisition });
  if (!validIncarnation(after) || !sameScope(observer, after)) return { status: 'unknown', reason: 'proc-scope-changed-during-owner-inspection', observer, after, target };
  return { ...ownerDecision(owner, after, target), observer: after, target };
}
