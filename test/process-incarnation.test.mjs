import test from 'node:test';
import assert from 'node:assert/strict';

const module = () => import('../src/process-incarnation.mjs');
const namespace = ino => ({ dev: '4', ino });
const incarnation = (changes = {}) => ({ schemaVersion: 1, kind: 'linux-proc-incarnation', status: 'observed', pid: 2, bootId: '00000000-0000-4000-8000-000000000001', startTicks: '100', pidNamespace: namespace('10'), timeNamespace: namespace('20'), mountNamespace: namespace('30'), proc: { root: { dev: '0', ino: '42' }, filesystemType: '40864', selfLink: '2', nspid: [2], pid1Namespace: namespace('10'), rootedInCallerNamespace: true, mount: { mountId: '30', root: '/', mountPoint: '/proc', filesystem: 'proc', hiddenPids: false } }, ...changes });

test('equal namespace-local PID with a changed kernel start witness is a different incarnation', async () => {
  const api = await module(); assert.equal(api.compareIncarnations(incarnation(), incarnation({ startTicks: '101' })).status, 'different');
});
test('an unchanged kernel witness is same or indistinguishable, never fresh', async () => {
  const api = await module(); assert.equal(api.compareIncarnations(incarnation(), incarnation()).status, 'same');
});
test('time namespace ambiguity and missing legacy identities fail closed', async () => {
  const api = await module(); assert.equal(api.compareIncarnations(incarnation(), incarnation({ timeNamespace: namespace('21') })).status, 'unknown'); assert.equal(api.compareIncarnations({ process: 2 }, incarnation()).status, 'unknown');
});
test('a PID-namespace change can distinguish acceptance invocations but cannot prove owner absence', async () => {
  const api = await module(); const changed = incarnation({ pidNamespace: namespace('11'), proc: { ...incarnation().proc, pid1Namespace: namespace('11') } }); assert.equal(api.compareIncarnations(incarnation(), changed).status, 'different'); assert.equal(api.ownerDecision(incarnation(), changed, null).status, 'unknown');
});
test('owner absence requires comparable kernel scope and never hostname/PID fallback', async () => {
  const api = await module(); assert.equal(api.ownerDecision(undefined, incarnation(), { status: 'absent' }).status, 'unknown'); assert.equal(api.ownerDecision(incarnation(), incarnation(), { status: 'absent' }).status, 'absent'); assert.equal(api.ownerDecision(incarnation(), incarnation(), { status: 'observed', pid: 2, startTicks: '101' }).status, 'absent');
});
test('live owner stays busy independently of sleeping or stopped process labels', async () => {
  const api = await module(); for (const state of ['R', 'S', 'T', 'D']) assert.equal(api.ownerDecision(incarnation(), incarnation(), { status: 'observed', pid: 2, startTicks: '100', state }).status, 'alive');
});
test('proc stat field22 parsing respects parentheses in process comm', async () => {
  const api = await module(); const fields = ['S', ...Array(18).fill('0'), '123456', '0']; const result = api.parseProcStat(`2 (name (nested) ending) ${fields.join(' ')}`); assert.equal(result.pid, 2); assert.equal(result.startTicks, '123456'); assert.throws(() => api.parseProcStat('2 (bad) S 0'));
});
test('incomplete proc mount visibility is unknown', async () => {
  const api = await module(); const hidden = incarnation({ proc: { ...incarnation().proc, mount: { ...incarnation().proc.mount, hiddenPids: true } } }); assert.equal(api.compareIncarnations(incarnation(), hidden).status, 'unknown'); assert.equal(api.ownerDecision(incarnation(), hidden, { status: 'absent' }).status, 'unknown');
});

test('fixed proc acquisition rejects missing, denied, malformed and foreign mount visibility', async () => {
  const api = await module(); const { procIOFixture } = await import('../verification/process-incarnation-fixtures.mjs');
  for (const options of [{ missing: '/proc/sys/kernel/random/boot_id' }, { denied: '/proc/self/ns/pid' }, { status: 'NSpid:\t9\t4\n' }, { selfLink: '99' }, { filesystemType: 123 }, { selfStat: 'broken' }, { mount: '30 1 0:5 / /proc rw - proc proc rw,hidepid=2\n' }]) {
    const result = await api.captureProcessIncarnation({ platform: 'linux', pid: 4, io: procIOFixture(options) }); assert.equal(result.status, 'unknown', JSON.stringify(options));
  }
});
test('descriptor-based owner inspection distinguishes absent, denied, reused and changing scopes', async () => {
  const api = await module(); const { procIOFixture } = await import('../verification/process-incarnation-fixtures.mjs');
  for (const [options, expected] of [[{}, 'alive'], [{ target: 'absent' }, 'absent'], [{ target: 'denied' }, 'unknown'], [{ target: 'reused' }, 'absent'], [{ targetText: 'malformed' }, 'unknown'], [{ changedScope: true }, 'unknown']]) {
    const result = await api.inspectOwnerIncarnation(incarnation(), { platform: 'linux', pid: 4, io: procIOFixture(options) }); assert.equal(result.status, expected, JSON.stringify(options));
  }
});
test('unsupported platforms report unknown without hostname or PID inference', async () => {
  const api = await module(); const result = await api.captureProcessIncarnation({ platform: 'darwin' }); assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'unsupported-platform');
});
test('actual Linux capture distinguishes same-process and a fresh Node process', { skip: process.platform !== 'linux' }, async () => {
  const api = await module(); const first = await api.captureProcessIncarnation(); const second = await api.captureProcessIncarnation(); assert.equal(first.status, 'observed'); assert.equal(api.compareIncarnations(first, second).status, 'same');
  const { spawnSync } = await import('node:child_process'); const url = new URL('../src/process-incarnation.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {captureProcessIncarnation} from ${JSON.stringify(url)}; process.stdout.write(JSON.stringify(await captureProcessIncarnation()));`], { encoding: 'utf8' }); assert.equal(child.status, 0, child.stderr); assert.equal(api.compareIncarnations(first, JSON.parse(child.stdout)).status, 'different');
});
test('denied PID1 corroboration retains the independently verified own proc namespace', async () => {
  const api = await module(); const { procIOFixture } = await import('../verification/process-incarnation-fixtures.mjs');
  const result = await api.captureProcessIncarnation({ platform: 'linux', pid: 4, io: procIOFixture({ denied: '/proc/1/ns/pid' }) }); assert.equal(result.status, 'observed'); assert.equal(result.proc.pid1Namespace, null); assert.equal(result.proc.pid1NamespaceCheck.error, 'EACCES'); assert.equal(result.acquisition, 'synthetic-fixture');
});
