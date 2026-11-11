import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { history, graphSpec, config, evaluate, fixtures } from './graph.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = join(root, '.local/verification/restoration-suspension', randomUUID());
const sha = b => createHash('sha256').update(b).digest('hex');
const sourceCommit = '8b07ac2a83f502c386f1c0373c3189e74057f4af';
const jar = join(root, '.local/tools/tla2tools-1.7.4.jar');
const java = process.env.EMMY_JAVA_BIN || 'java';
const names = ['work', 'records', 'responsibilities'];
const report = { status: 'running', sourceCommit, runs: [] };
const mutations = [
  ['epoch', 'work', 'observation.homeEpoch === epoch.hash && ', '', 'EpochEvidence'],
  ['missing-category', 'work', "['target', 'authority', 'tasks', 'schedule'].filter", "['target', 'authority', 'tasks'].filter", 'EpochEvidence'],
  ['supersession', 'work', 'const current = currentObservations(definition, observations, asOf);', 'const current = observations;', 'CurrentEvidence'],
  ['expiry', 'work', 'if (ageMs > maxAgeMs)', 'if (false)', 'FreshEvidence'],
  ['local-provenance', 'work', "observation.origin === 'observed-local' || nativeRemote", "true || nativeRemote", 'CategoryEvidence'],
  ['reconcile-gate', 'responsibilities', "definition.lifecycle.status === 'active' && heads.length === 1 && !restore.suspended", "definition.lifecycle.status === 'active' && heads.length === 1", 'ReconcileGate'],
];
const moduleSet = async path => Object.fromEntries(await Promise.all(names.map(async name => [name, await import(pathToFileURL(join(path, `${name}.mjs`)).href)])));
await mkdir(directory, { recursive: true });
try {
  assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--development', 'Only --development is supported');
  assert.equal(sha(await readFile(jar)), '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88', 'Pinned TLC jar');
  if (!process.argv.includes('--development')) {
    const coverage = JSON.parse(await readFile(join(root, 'verification/restoration-suspension/coverage.json'), 'utf8'));
    assert.equal(coverage.sourceCommit, sourceCommit);
    for (const [path, expected] of Object.entries(coverage.sourceFiles)) {
      assert.equal(sha(await readFile(join(root, path))), expected, `Review source change in ${path}`);
      assert.equal(sha(execFileSync('git', ['show', `${sourceCommit}:${path}`], { cwd: root })), expected, `Source sync mismatch in ${path}`);
    }
    for (const [path, expected] of Object.entries(coverage.verificationFiles)) assert.equal(sha(await readFile(join(root, path))), expected, `Review verification change in ${path}`);
  }
  const run = async (name, modules, expected = null) => {
    const path = join(directory, name); await mkdir(path, { recursive: true });
    const probeTmp = await mkdtemp('/tmp/emmy-restore-probe-'); const tmp = await mkdtemp('/tmp/emmy-restore-tlc-');
    const graph = history(modules); await writeFile(join(path, 'graph.json'), JSON.stringify(graph));
    await writeFile(join(path, 'Restoration.tla'), graphSpec(graph)); await writeFile(join(path, 'Restoration.cfg'), config);
    const labels = graph.nodes.map(n => !n.result ? 'Evidence changed, reconciliation pending' : n.result.restored.suspended ? n.state.expired ? 'Evidence expired' : n.state.revocations[n.state.epoch] === 1 ? 'Evidence unavailable' : 'Restoration suspended' : 'Restoration ready');
    await writeFile(join(path, 'view.mjs'), `const labels = ${JSON.stringify(labels)};\nexport const title = 'Restoration evidence';\nexport const state = v => labels[v.node - 1];\nexport const step = action => action;\n`);
    if (!expected) {
      assert.ok(graph.nodes.some(n => n.result?.restored.suspended && n.state.masks[n.state.epoch] === 0));
      assert.ok(graph.nodes.some(n => n.result && !n.result.restored.suspended && n.state.revocations[n.state.epoch] === 0));
      assert.ok(graph.nodes.some(n => n.result?.restored.suspended && n.state.revocations[n.state.epoch] === 1));
      assert.ok(graph.nodes.some(n => n.result && !n.result.restored.suspended && n.state.revocations[n.state.epoch] === 2));
      assert.ok(graph.nodes.some(n => n.result?.restored.suspended && n.state.expired));
    }
    const env = { ...process.env }; delete env.JAVA_TOOL_OPTIONS; delete env._JAVA_OPTIONS; delete env.JDK_JAVA_OPTIONS;
    const probe = spawnSync(java, [`-Djava.io.tmpdir=${probeTmp}`, '-XshowSettings:properties', '-version'], { encoding: 'utf8', env });
    assert.equal(probe.status, 0); assert.ok(probe.stderr.includes(`java.io.tmpdir = ${probeTmp}`), 'Actual Java tmpdir');
    const result = spawnSync(java, [`-Djava.io.tmpdir=${tmp}`, '-XX:+UseParallelGC', '-Xmx1g', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-config', 'Restoration.cfg', 'Restoration.tla'], { cwd: path, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, env });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`; await writeFile(join(path, 'tlc.out'), output);
    assert.equal(result.signal, null); assert.equal(result.error, undefined);
    if (expected) {
      assert.notEqual(result.status, 0); assert.match(output, new RegExp(`Invariant ${expected} is violated`));
      const trace = [...output.matchAll(/State \d+: <([^>\n]+)>\nnode = (\d+)/g)].map(m => ({ action: m[1].split(' ')[0], node: Number(m[2]) - 1 }));
      assert.ok(trace.length > 1 && trace[0].node === 0, 'TLC counterexample path');
      const replay = [];
      for (let i = 1; i < trace.length; i++) {
        const edge = graph.edges.find(e => e.from === trace[i - 1].node && e.to === trace[i].node && e.action === trace[i].action); assert.ok(edge, 'Every step maps to the generated history');
        const node = graph.nodes[edge.to]; if (node.result) assert.deepEqual(evaluate(modules, fixtures(modules.records), node.state), node.result, 'Replay actual copied functions');
        replay.push({ action: edge.action, state: node.state, result: node.result });
      }
      const last = graph.nodes[trace.at(-1).node]; assert.ok(last.result, 'Counterexample ends at actual reconciliation');
      await writeFile(join(path, 'replay.json'), JSON.stringify({ invariant: expected, steps: replay }, null, 2));
    } else { assert.equal(result.status, 0, output); assert.match(output, /Model checking completed\. No error has been found\./); }
    report.runs.push({ name, expected, probeTmp, tmp, nodes: graph.nodes.length, edges: graph.edges.length, status: expected ? 'counterexample-replayed' : 'passed' });
  };
  const production = await moduleSet(join(root, 'src')); await run('baseline', production);
  for (const [name, file, find, replacement, expected] of mutations) {
    const copied = join(directory, `source-${name}`); await cp(join(root, 'src'), copied, { recursive: true });
    const source = await readFile(join(copied, `${file}.mjs`), 'utf8'); assert.equal(source.split(find).length, 2, `Unique mutation ${name}`);
    await writeFile(join(copied, `${file}.mjs`), source.replace(find, replacement)); await run(name, await moduleSet(copied), expected);
  }
  await run('restored', production); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, evidence: join(directory, 'report.json'), runs: report.runs.length, error: report.error?.message }));
