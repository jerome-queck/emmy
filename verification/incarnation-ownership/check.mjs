import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as original from '../../src/process-incarnation.mjs';
import { incarnationFixture } from '../process-incarnation-fixtures.mjs';
import { graph, spec, cfg, replay } from './graph.mjs';

const root = process.cwd();
const evidence = join(root, '.local/verification/incarnation-ownership', randomUUID());
const scratch = await mkdtemp('/tmp/emmy-incarnation-check-');
await mkdir(evidence, { recursive: true });
const report = { status: 'running', scratch, node: process.version, platform: process.platform, runs: [] };
const digest = x => createHash('sha256').update(x).digest('hex');
const clean = x => JSON.parse(JSON.stringify(x, (key, value) => key === 'observedAt' ? undefined : value));
const mutations = [
  ['capture', "insist(sameScope(first, second), 'Proc scope changed during capture');", '', 'CaptureScope'],
  ['inspection', 'if (!validIncarnation(after) || !sameScope(observer, after))', 'if (false)', 'InspectionScope'],
  ['owner', 'owner.bootId !== observer.bootId || !equalNamespace(owner.pidNamespace, observer.pidNamespace) || !equalNamespace(owner.timeNamespace, observer.timeNamespace)', 'false', 'OwnerComparable'],
  ['target', "if (target?.status === 'absent')", "if (target?.status !== 'observed')", 'TargetEvidence'],
];
try {
  assert.equal(process.argv.length, 2, 'No bypass is accepted');
  const pins = JSON.parse(await readFile('verification/incarnation-ownership/coverage.json'));
  for (const [path, expected] of Object.entries(pins.sourceFiles)) {
    assert.equal(digest(await readFile(path)), expected, `Review source: ${path}`);
    assert.equal(digest(execFileSync('git', ['show', `${pins.sourceCommit}:${path}`])), expected, `Review source sync: ${path}`);
  }
  for (const [path, expected] of Object.entries(pins.verificationFiles)) assert.equal(digest(await readFile(path)), expected, `Review verification: ${path}`);
  const jar = join(root, '.local/tools/tla2tools-1.7.4.jar');
  assert.equal(digest(await readFile(jar)), '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88');
  const java = process.env.EMMY_JAVA_BIN || execFileSync('which', ['java'], { encoding: 'utf8' }).trim();
  const version = spawnSync(java, ['-version'], { encoding: 'utf8' });
  assert.equal(version.status, 0); assert.match(version.stderr, /version "21[."]/);
  report.java = { path: java, version: version.stderr, jarSha256: digest(await readFile(jar)) };
  if (process.platform === 'darwin') {
    const capture = await original.captureProcessIncarnation();
    const inspection = await original.inspectOwnerIncarnation(incarnationFixture());
    assert.equal(capture.status, 'unknown'); assert.equal(capture.reason, 'unsupported-platform'); assert.equal(capture.acquisition, 'actual-process');
    assert.equal(inspection.status, 'unknown'); assert.equal(inspection.observer.reason, 'unsupported-platform'); assert.equal(inspection.observer.acquisition, 'actual-process');
    report.actualDarwin = { capture, inspection };
  }
  const run = async (name, api, rule) => {
    const dir = join(scratch, name); const retained = join(evidence, name);
    await mkdir(dir); await mkdir(retained);
    const g = await graph(api); const tla = spec(g);
    await writeFile(join(dir, 'IncarnationOwnership.tla'), tla);
    await writeFile(join(dir, 'IncarnationOwnership.cfg'), cfg);
    await writeFile(join(retained, 'graph.json'), JSON.stringify(g));
    await writeFile(join(retained, 'IncarnationOwnership.tla'), tla);
    await writeFile(join(retained, 'IncarnationOwnership.cfg'), cfg);
    const env = { ...process.env, TMPDIR: dir, JAVA_TOOL_OPTIONS: `-Djava.io.tmpdir=${dir}` };
    const tlc = spawnSync(java, ['-XX:+UseParallelGC', '-Xmx1g', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-fp', '0', '-config', 'IncarnationOwnership.cfg', 'IncarnationOwnership.tla'], { cwd: dir, env, encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
    const output = (tlc.stdout ?? '') + (tlc.stderr ?? ''); await writeFile(join(retained, 'tlc.out'), output);
    assert.equal(tlc.error, undefined); assert.equal(tlc.signal, null);
    if (!rule) {
      assert.equal(tlc.status, 0, output); assert.match(output, /Model checking completed\. No error has been found/);
      const counts = output.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/);
      assert.ok(counts, 'TLC exploration counts missing');
      assert.equal(Number(counts[2].replaceAll(',', '')), g.states.length, 'TLC must reach every retained graph node');
      assert.equal(Number(counts[3].replaceAll(',', '')), 0, 'TLC exploration must finish');
      for (const [target, status] of [['same', 'alive'], ['reused', 'absent'], ['absent', 'absent'], ['denied', 'unknown']]) assert.ok(g.histories.some(h => h.schedule.kind === 'inspect' && h.schedule.target === target && h.schedule.changeAt === null && !h.schedule.denied && h.result.status === status));
      assert.ok(g.histories.some(h => h.schedule.denied && h.result.status === 'alive'));
      assert.ok(g.histories.some(h => h.result.reason === 'proc-scope-changed-during-owner-inspection'));
      assert.ok(g.histories.some(h => h.result.error === 'Proc scope changed during capture'));
      assert.ok(g.histories.some(h => h.schedule.malformed === 'target' && h.result.status === 'unknown'));
      assert.ok(g.histories.some(h => h.schedule.malformed === 'self' && h.result.status === 'unknown'));
      assert.ok(g.histories.some(h => h.schedule.denied === '/proc/sys/kernel/random/boot_id' && h.result.status === 'unknown'));
    } else {
      assert.notEqual(tlc.status, 0); assert.match(output, new RegExp(`Invariant ${rule} is violated`));
      const trace = [...output.matchAll(/State \d+: <[^>\n]+>\nnode = (\d+)/g)].map(m => Number(m[1]) - 1);
      assert.ok(trace.length > 1 && trace[0] === 0, 'TLC counterexample path missing');
      for (let i = 1; i < trace.length; i++) assert.ok(g.edges.some(e => e.from === trace[i - 1] && e.to === trace[i]), 'TLC path is not a recorded I/O edge');
      const history = g.histories.find(h => h.leaf === trace.at(-1) && h.properties[rule] === false); assert.ok(history, 'Counterexample is not a retained bad result');
      const brokenReplay = await replay(api, history.schedule, g.owner);
      const restoredReplay = await replay(original, history.schedule, g.owner);
      assert.deepEqual(clean(brokenReplay), clean({ schedule: history.schedule, events: history.events, result: history.result, properties: history.properties }));
      assert.deepEqual(brokenReplay.events.slice(0, restoredReplay.events.length), restoredReplay.events, 'Restored refusal must preserve the reached I/O prefix');
      assert.equal(brokenReplay.properties[rule], false); assert.equal(restoredReplay.properties[rule], true);
      await writeFile(join(retained, 'replay.json'), JSON.stringify({ rule, trace, brokenReplay, restoredReplay }, null, 2));
    }
    report.runs.push({ name, rule: rule ?? null, states: g.states.length, histories: g.histories.length, evidence: retained, tmpdir: dir, javaToolOptions: env.JAVA_TOOL_OPTIONS });
  };
  await run('baseline', original);
  const source = await readFile('src/process-incarnation.mjs', 'utf8');
  for (const [name, find, replace, rule] of mutations) {
    assert.equal(source.split(find).length, 2, `Unique semantic mutation: ${name}`);
    const path = join(scratch, `mutant-${name}.mjs`); await writeFile(path, source.replace(find, replace));
    await run(name, await import(pathToFileURL(path)), rule);
  }
  await run('restored', original);
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, runs: report.runs.length, evidence, error: report.error?.message }));
