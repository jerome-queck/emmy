import assert from 'node:assert/strict';
import { instrument } from './explore.mjs';
import { validIncarnation } from '../../src/process-incarnation.mjs';

const limit = { histories: 1200, nodes: 100000, calls: 160 };
const roots = events => events.filter(e => e.op === 'stat' && e.path === '/proc' && e.result?.ino).map(e => e.result.ino);
const stablePair = (values, a, b) => values[a] === values[b];

export async function replay(api, schedule, owner) {
  const io = instrument({ ...schedule, changeAt: schedule.changeAt ?? Infinity });
  const options = { io: io.io, platform: 'linux', pid: schedule.pid };
  const result = schedule.kind === 'capture' ? await api.captureProcessIncarnation(options) : await api.inspectOwnerIncarnation(owner, options);
  assert.equal((schedule.kind === 'capture' ? result : result.observer).acquisition, 'synthetic-fixture');
  const values = roots(io.events);
  const captureChanged = schedule.kind === 'capture' && values.length === 2 && values[0] !== values[1];
  const inspectionChanged = schedule.kind === 'inspect' && values.length === 4 && stablePair(values, 0, 1) && stablePair(values, 2, 3) && values[0] !== values[2];
  const denied = io.events.some(e => e.op === 'open' && e.path === '/proc/2/stat' && e.result === 'EACCES');
  const observed = result.observer;
  const comparable = validIncarnation(owner) && validIncarnation(observed) && owner.bootId === observed.bootId && owner.pidNamespace.dev === observed.pidNamespace.dev && owner.pidNamespace.ino === observed.pidNamespace.ino && owner.timeNamespace.dev === observed.timeNamespace.dev && owner.timeNamespace.ino === observed.timeNamespace.ino;
  const known = result.status === 'alive' || result.status === 'absent';
  const target = result.target;
  const eligible = result.status === 'alive' ? target?.status === 'observed' && target.pid === owner.pid && target.startTicks === owner.startTicks : result.status === 'absent' ? target?.status === 'absent' || target?.status === 'observed' && target.pid === owner.pid && /^(0|[1-9][0-9]*)$/.test(target.startTicks) && target.startTicks !== owner.startTicks : true;
  const properties = {
    CaptureScope: !captureChanged || result.status === 'unknown',
    InspectionScope: !inspectionChanged || result.status === 'unknown',
    OwnerComparable: !known || comparable,
    TargetEvidence: (!denied || result.status === 'unknown') && eligible,
  };
  assert.ok(io.events.filter(e => e.op !== 'change-view').length <= limit.calls, 'I/O bound exceeded');
  return { schedule, events: io.events, result, properties };
}

export async function graph(api) {
  const ownerTrace = instrument({ pid: 2 });
  const owner = await api.captureProcessIncarnation({ io: ownerTrace.io, platform: 'linux', pid: 2 });
  assert.equal(owner.status, 'observed', 'Owner precondition');
  assert.equal(owner.acquisition, 'synthetic-fixture');
  const histories = [];
  async function run(schedule) {
    histories.push(await replay(api, schedule, owner));
    assert.ok(histories.length <= limit.histories, 'History bound exceeded');
  }
  for (const kind of ['capture', 'inspect']) {
    const targets = kind === 'capture' ? ['same'] : ['same', 'reused', 'absent', 'denied'];
    for (const target of targets) {
      const schedule = { kind, pid: 4, target, changeAt: null, changeKind: 'none' };
      await run(schedule);
      const length = histories.at(-1).events.length;
      for (const changeKind of ['pid-namespace', 'proc-root']) {
        for (let changeAt = 0; changeAt < length; changeAt++) await run({ ...schedule, changeKind, changeAt });
      }
    }
  }
  await run({ kind: 'inspect', pid: 4, target: 'same', changeAt: null, changeKind: 'none', denied: '/proc/1/ns/pid' });
  await run({ kind: 'inspect', pid: 4, target: 'same', changeAt: null, changeKind: 'none', malformed: 'target' });
  await run({ kind: 'capture', pid: 4, target: 'same', changeAt: null, changeKind: 'none', malformed: 'self' });
  await run({ kind: 'capture', pid: 4, target: 'same', changeAt: null, changeKind: 'none', denied: '/proc/sys/kernel/random/boot_id' });
  const states = [{}]; const edges = []; const seen = new Map();
  for (const history of histories) {
    let from = 0;
    const context = { kind: history.schedule.kind, target: history.schedule.target, denied: history.schedule.denied ?? null, malformed: history.schedule.malformed ?? null };
    const events = [{ op: 'fixture', ...context }, ...(history.schedule.kind === 'inspect' ? [...ownerTrace.events, { op: 'owner-captured', status: owner.status }] : []), ...history.events, { op: 'decision', status: history.result.status, reason: history.result.reason, ...history.properties }];
    for (const event of events) {
      const key = `${from}:${JSON.stringify(event)}`;
      if (!seen.has(key)) {
        const to = states.length;
        states.push({ event }); edges.push({ from, to }); seen.set(key, to);
        assert.ok(states.length <= limit.nodes, 'Graph bound exceeded');
      }
      from = seen.get(key);
    }
    history.leaf = from;
  }
  return { owner, ownerEvents: ownerTrace.events, histories, states, edges, limit };
}

export function spec(g) {
  const successors = g.states.map(() => []);
  for (const e of g.edges) successors[e.from].push(e.to + 1);
  const next = successors.map((s, i) => `{${(s.length ? s : [i + 1]).join(',')}}`).join(',');
  const violations = name => g.states.flatMap((s, i) => s.event?.[name] === false ? [i + 1] : []);
  return `---- MODULE IncarnationOwnership ----\nEXTENDS Naturals, Sequences\nVARIABLE node\nSuccessors == <<${next}>>\nInit == node = 1\nStep == node' \\in Successors[node]\nNext == Step\n${['CaptureScope', 'InspectionScope', 'OwnerComparable', 'TargetEvidence'].map(name => `${name} == node \\notin {${violations(name).join(',')}}`).join('\n')}\n====\n`;
}
export const cfg = 'INIT Init\nNEXT Next\nINVARIANT CaptureScope\nINVARIANT InspectionScope\nINVARIANT OwnerComparable\nINVARIANT TargetEvidence\n';
