import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { digest } from '../../src/content.mjs';
import { parseCloudRecord } from '../../src/cloud-schema.mjs';
import * as production from '../../src/cloud.mjs';
import { graph, spec, cfg } from './graph.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = join(root, '.local/verification/cooperative-cloud', randomUUID());
const scratch = await mkdtemp('/tmp/emmy-cloud-');
await mkdir(evidence, { recursive: true });
const report = { status: 'running', scratch, runs: [] };
const mutations = [
  ['duplicate', 'if (existing) return', 'if (false) return', 'Stable'],
  ['lost-progress', "if (job.status === 'running') job.status = 'queued';", "if (job.status === 'running') { job.status = 'queued'; job.completedUnits = 0; }", 'Progress'],
  ['resurrection', "if (job.status === 'running') job.status = 'queued';", "if (['running', 'finished', 'dead'].includes(job.status)) job.status = 'queued';", 'Terminal'],
];
try {
  assert.equal(process.argv.length, 2, 'No bypass is accepted');
  const pins = JSON.parse(await readFile(join(root, 'verification/cooperative-cloud/coverage.json')));
  for (const [path, expected] of Object.entries(pins.sourceFiles)) {
    assert.equal(digest(await readFile(join(root, path))), expected, `Review changed source ${path}`);
    assert.equal(digest(execFileSync('git', ['show', `${pins.sourceCommit}:${path}`], { cwd: root })), expected, `Sync commit differs: ${path}`);
  }
  for (const [path, expected] of Object.entries(pins.verificationFiles)) assert.equal(digest(await readFile(join(root, path))), expected, `Review changed verification ${path}`);
  const jar = join(root, '.local/tools/tla2tools-1.7.4.jar');
  assert.equal(digest(await readFile(jar)), '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88');
  const java = execFileSync('/usr/bin/env', ['which', 'java'], { encoding: 'utf8' }).trim();
  const javaVersion = spawnSync(java, ['-version'], { encoding: 'utf8' });
  assert.equal(javaVersion.status, 0); assert.match(javaVersion.stderr, /version "21[.\"]/);
  const run = async (name, module, rule) => {
    const dir = join(scratch, name); const retained = join(evidence, name); await mkdir(dir); await mkdir(retained);
    const g = graph(module); const tla = spec(g);
    if (!rule) {
      const statuses = new Set(g.states.flatMap(row => row.state.jobs.map(job => job.status)));
      for (const status of ['queued', 'running', 'retry-wait', 'finished', 'dead']) assert.ok(statuses.has(status), `Missing ${status}`);
      for (const outcome of ['accepted', 'coalesced', 'identity-conflict', 'checkpoint-recovered', 'retry-scheduled', 'dead', 'finished', 'suspended', 'resumed', 'deferred']) assert.ok(g.edges.some(edge => edge.outcome === outcome), `Missing ${outcome}`);
      assert.ok(g.edges.some(edge => edge.action === 'Recover' && g.states[edge.from].state.jobs[0]?.status === 'running' && g.states[edge.to].state.jobs[0]?.status === 'queued'), 'Recovery of a real checkpoint is required');
    }
    await writeFile(join(dir, 'CooperativeCloud.tla'), tla); await writeFile(join(dir, 'CooperativeCloud.cfg'), cfg);
    await writeFile(join(retained, 'graph.json'), JSON.stringify(g)); await writeFile(join(retained, 'CooperativeCloud.tla'), tla); await writeFile(join(retained, 'CooperativeCloud.cfg'), cfg);
    const result = spawnSync(java, ['-XX:+UseParallelGC', '-Xmx1g', '-Djava.io.tmpdir=' + dir, '-cp', jar, 'tlc2.TLC', '-workers', '1', '-fp', '0', '-config', 'CooperativeCloud.cfg', 'CooperativeCloud.tla'], { cwd: dir, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    const out = (result.stdout ?? '') + (result.stderr ?? ''); await writeFile(join(retained, 'tlc.out'), out);
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    if (!rule) { assert.equal(result.status, 0, out); assert.match(out, /Model checking completed\. No error has been found/); }
    else {
      assert.notEqual(result.status, 0); assert.match(out, new RegExp(`Invariant ${rule} is violated`));
      const trace = [...out.matchAll(/State \d+: <([^>\n]+)>\nnode = (\d+)/g)].map(m => ({ action: m[1].split(' ')[0], node: Number(m[2]) - 1 }));
      assert.ok(trace.length > 1 && trace[0].node === 0, 'TLC must yield an actual path');
      let state = module.emptyCloudState(); const replay = [];
      for (let i = 1; i < trace.length; i++) {
        const edge = g.edges.find(e => e.from === trace[i - 1].node && e.to === trace[i].node && e.action === trace[i].action); assert.ok(edge);
        const actual = module.cloudTransition(structuredClone(state), edge.input, (await import('../../src/cloud-schema.mjs')).cloudConfig({ maxAttempts: 2, backoffMs: 100, maxBackoffMs: 100 }), edge.at, 'a'.repeat(64));
        state = actual.state; assert.deepEqual(state, g.states[edge.to].state); replay.push({ edge, state });
      }
      assert.equal(g.states[trace.at(-1).node][rule.toLowerCase()], false);
      let wrapperShape = 'accepted'; try { parseCloudRecord({ schemaVersion: 1, type: 'cloud-step', responsibilityId: 'one', definitionHash: 'a'.repeat(64), rootHash: 'a'.repeat(64), parentHash: 'a'.repeat(64), seq: 1, at: replay.at(-1).edge.at, operation: 'tick', state }); } catch (error) { wrapperShape = `rejected: ${error.message}`; }
      await writeFile(join(retained, 'replay.json'), JSON.stringify({ rule, wrapperShape, replay }, null, 2));
    }
    report.runs.push({ name, rule: rule ?? null, states: g.states.length, edges: g.edges.length, evidence: retained });
  };
  await run('baseline', production);
  const source = await readFile(join(root, 'src/cloud.mjs'), 'utf8');
  for (const [name, find, replacement, rule] of mutations) {
    assert.equal(source.split(find).length, 2, `Unique mutation ${name}`);
    const copied = join(scratch, `source-${name}`); await cp(join(root, 'src'), copied, { recursive: true });
    await writeFile(join(copied, 'cloud.mjs'), source.replace(find, replacement));
    await run(name, await import(pathToFileURL(join(copied, 'cloud.mjs')).href), rule);
  }
  await run('restored', production); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, runs: report.runs.length, evidence, error: report.error?.message }));
