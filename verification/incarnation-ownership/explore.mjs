import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { captureProcessIncarnation, inspectOwnerIncarnation } from '../../src/process-incarnation.mjs';
import { procIOFixture, procStatFixture } from '../process-incarnation-fixtures.mjs';

// A file handle retains the bytes selected at open; namespace stats use the
// view at the stat call. All values are symbolic synthetic fixture data.
export function instrument({ pid, target, changeAt = Infinity, denied, changeKind = 'pid-namespace', malformed }) {
  const base = procIOFixture({ pid, target, denied, ...(malformed === 'self' ? { selfStat: 'malformed' } : {}), ...(malformed === 'target' ? { targetText: 'malformed' } : {}), ...(pid === 2 ? { selfStat: procStatFixture(2, '100') } : {}) });
  const events = []; let count = 0; let changed = false;
  function step(op, path) {
    if (count === changeAt) { changed = true; events.push({ op: 'change-view', scope: changeKind }); }
    count++; const event = { op, path }; events.push(event); return event;
  }
  async function call(op, path, fn) {
    const event = step(op, path);
    try { const value = await fn(); event.result = value === undefined ? 'ok' : JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v)); return value; }
    catch (error) { event.result = error.code ?? error.message; throw error; }
  }
  return { events, io: {
    async open(path, flags) {
      const file = await call('open', path, () => base.open(path, flags));
      return {
        async read(buffer, offset, length, position) {
          const result = await call('read', path, () => file.read(buffer, offset, length, position));
          events.at(-1).bytes = buffer.subarray(offset, offset + result.bytesRead).toString('utf8');
          return result;
        },
        async close() { return call('close', path, () => file.close()); },
      };
    },
    async readlink(path) { return call('readlink', path, () => base.readlink(path)); },
    async stat(path, options) {
      return call('stat', path, () => changed && changeKind === 'proc-root' && path === '/proc' ? { dev: 0n, ino: 43n } : changed && changeKind === 'pid-namespace' && (path === '/proc/self/ns/pid' || path === '/proc/1/ns/pid') ? { dev: 4n, ino: 11n } : base.stat(path, options));
    },
    async statfs(path, options) { return call('statfs', path, () => base.statfs(path, options)); },
  } };
}

async function main() {
const ownerIO = instrument({ pid: 2 });
const owner = await captureProcessIncarnation({ io: ownerIO.io, platform: 'linux', pid: 2 });
if (owner.status !== 'observed') throw new Error('Owner fixture did not capture');
const histories = [];
for (const target of ['same', 'reused', 'absent', 'denied']) {
  const sample = instrument({ pid: 4, target });
  const outcome = await inspectOwnerIncarnation(owner, { io: sample.io, platform: 'linux', pid: 4 });
  histories.push({ target, changeAt: null, events: sample.events, outcome });
  for (const changeKind of ['pid-namespace', 'proc-root']) {
    for (let changeAt = 0; changeAt < sample.events.length; changeAt++) {
      const run = instrument({ pid: 4, target, changeAt, changeKind });
      const result = await inspectOwnerIncarnation(owner, { io: run.io, platform: 'linux', pid: 4 });
      histories.push({ target, changeAt, changeKind, events: run.events, outcome: result });
    }
  }
}
for (const [target, status] of [['same', 'alive'], ['reused', 'absent'], ['absent', 'absent'], ['denied', 'unknown']]) {
  assert.equal(histories.find(h => h.target === target && h.changeAt === null).outcome.status, status);
}
assert.ok(histories.some(h => h.events.some(e => e.op === 'change-view') && h.outcome.reason === 'proc-scope-changed-during-owner-inspection'));
const pid1 = instrument({ pid: 4, target: 'same', denied: '/proc/1/ns/pid' });
const pid1Outcome = await inspectOwnerIncarnation(owner, { io: pid1.io, platform: 'linux', pid: 4 });
assert.equal(pid1Outcome.status, 'alive');
histories.push({ target: 'same-pid1-denied', changeAt: null, events: pid1.events, outcome: pid1Outcome });
for (const history of histories) {
  const roots = history.events.filter(e => e.op === 'stat' && e.path === '/proc' && e.result?.ino).map(e => e.result.ino);
  const scopeDiff = roots.length === 4 && roots[0] === roots[1] && roots[2] === roots[3] && roots[0] !== roots[2];
  history.scopeSafe = !scopeDiff || history.outcome.status === 'unknown';
  history.targetSafe = history.target !== 'denied' || history.outcome.status === 'unknown';
  assert.ok(history.scopeSafe, 'Comparable capture scopes changed without refusal');
  assert.ok(history.targetSafe, 'Denied target was promoted to knowledge');
}
assert.ok(histories.some(h => h.changeKind === 'proc-root' && h.outcome.reason === 'proc-scope-changed-during-owner-inspection'));
const dir = `.local/verification/incarnation-ownership/${randomUUID()}`;
await mkdir(dir, { recursive: true });
const nodes = [{}]; const edges = []; const paths = new Map();
for (const history of histories) {
  let from = 0;
  const steps = [{ op: 'choose-target', target: history.target }, ...ownerIO.events, { op: 'owner-captured', status: owner.status }, ...history.events, { op: 'decision', status: history.outcome.status, reason: history.outcome.reason, scopeSafe: history.scopeSafe, targetSafe: history.targetSafe }];
  for (const event of steps) {
    const key = `${from}:${JSON.stringify(event)}`;
    if (!paths.has(key)) { const to = nodes.length; nodes.push({ event }); edges.push({ from, to, event }); paths.set(key, to); }
    from = paths.get(key);
  }
}
await writeFile(`${dir}/histories.json`, JSON.stringify({ ownerEvents: ownerIO.events, owner, histories, graph: { nodes, edges } }, null, 2));
console.log(JSON.stringify({ evidence: dir, histories: histories.length, nodes: nodes.length, edges: edges.length, outcomes: Object.fromEntries([...new Set(histories.map(h => h.outcome.status))].map(s => [s, histories.filter(h => h.outcome.status === s).length])) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
