import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { canonical, digest } from '../../src/content.mjs';
import { observeAssurance } from '../../src/local-assurance.mjs';
import * as production from '../../src/assurance.mjs';
import { assuranceGraph, graphSpec, graphConfig } from './graph.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = join(root, '.local/verification/local-assurance-formal', randomUUID());
await mkdir(directory, { recursive: true });
const report = { status: 'running', sourceReviewGate: !process.argv.includes('--development'), runs: [] };
const mutations = [
  ['context', "if (event.contextDigest !== state.contextDigest)", 'if (false)', 'PassedClean'],
  ['suite-order', "state.phase !== 'prepared' || event.id !== plan[state.completed]?.id", "state.phase !== 'prepared'", 'PassedClean'],
  ['exit', 'event.code !== 0 || event.signal !== null || event.error !== null', 'event.signal !== null || event.error !== null', 'PassedClean'],
  ['output', 'if (event.evidenceValid !== true)', 'if (false)', 'PassedClean'],
  ['coverage', 'completed === plan.length', 'completed >= 1', 'PassedComplete'],
  ['result-id', "state.phase !== 'running' || event.id !== state.active", "state.phase !== 'running'", 'PassedClean'],
  ['resurrection', "if (state.phase === 'refused') return state;", "if (state.phase === 'refused') state = { ...state, phase: 'prepared', reason: null };", 'RefusalTerminal'],
];
try {
  assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--development');
  if (report.sourceReviewGate) {
    const coverage = JSON.parse(await readFile(join(root, 'verification/local-assurance/coverage.json'), 'utf8'));
    for (const [path, expected] of Object.entries(coverage.sourceFiles)) {
      assert.equal(digest(await readFile(join(root, path))), expected, `Review local assurance mapping after ${path} changes`);
      assert.equal(digest(execFileSync('git', ['show', `${coverage.sourceCommit}:${path}`], { cwd: root })), expected, 'Local assurance sync commit must contain reviewed bytes');
    }
    for (const [path, expected] of Object.entries(coverage.verificationFiles)) assert.equal(digest(await readFile(join(root, path))), expected, `Review local assurance verification after ${path} changes`);
    report.coverage = coverage;
  }
  const { context } = await observeAssurance(root);
  const java = context.formal.java.path; const jar = context.formal.tlc.path;
  report.tools = context.formal;
  const run = async (name, module, expectedRule = null) => {
    const path = join(directory, name); await mkdir(path);
    const graph = assuranceGraph(module);
    await writeFile(join(path, 'graph.json'), `${canonical(graph)}\n`);
    await writeFile(join(path, 'Assurance.tla'), graphSpec(graph));
    await writeFile(join(path, 'Assurance.cfg'), graphConfig);
    const reasons = { 'context-changed': 'Source or environment changed', 'unexpected-suite': 'Wrong check requested', 'unmatched-result': 'No matching running check', 'suite-failed': 'Check failed or was interrupted', 'output-unverified': 'Output was not verified', 'unexpected-event': 'Unknown event' };
    const labels = graph.states.map(row => row.refusalBroken ? 'Resumed after refusal' : row.state.phase === 'refused' ? reasons[row.state.reason] : row.state.phase === 'passed' ? row.state.completed !== graph.suiteCount ? 'Accepted with missing checks' : row.bad ? 'Accepted invalid evidence' : 'All required checks passed' : row.state.phase === 'running' ? row.bad ? 'Check running after invalid evidence' : 'Required check running' : row.state.completed === 0 ? 'Ready to begin' : 'More checks remain');
    await writeFile(join(path, 'view.mjs'), `const labels = ${JSON.stringify(labels)};\nexport const title = 'Local assurance';\nexport const state = v => labels[v.node-1];\nexport { step } from ${JSON.stringify(pathToFileURL(join(root, 'verification/local-assurance/view.mjs')).href)};\n`);
    const result = spawnSync(java, ['-XX:+UseParallelGC', '-Xmx1g', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-fp', '0', '-config', 'Assurance.cfg', 'Assurance.tla'], { cwd: path, encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    await writeFile(join(path, 'tlc.out'), output);
    assert.equal(result.signal, null); assert.equal(result.error, undefined);
    if (expectedRule) {
      assert.notEqual(result.status, 0); assert.match(output, new RegExp(`Invariant ${expectedRule} is violated`)); assert.match(output, /The behavior up to this point is/);
      const trace = [...output.matchAll(/State \d+: <([^>\n]+)>\nnode = (\d+)/g)].map(match => ({ action: match[1].split(' ')[0], node: Number(match[2]) - 1 }));
      assert.ok(trace.length > 1 && trace[0].node === 0, 'A real TLC path is required');
      let replay = module.beginAssurance('same'); const replayed = [];
      for (let index = 1; index < trace.length; index++) {
        const edge = graph.edges.find(row => row.from === trace[index - 1].node && row.to === trace[index].node && row.action === trace[index].action);
        assert.ok(edge, 'Every TLC action must map to a production event');
        replay = module.assuranceTransition(replay, edge.event);
        assert.deepEqual(replay, graph.states[trace[index].node].state, 'Replay actual copied code at every TLC step');
        replayed.push({ action: edge.action, event: edge.event, state: replay });
      }
      const last = graph.states[trace.at(-1).node];
      assert.ok(expectedRule === 'PassedComplete' ? replay.phase === 'passed' && replay.completed !== graph.suiteCount : expectedRule === 'PassedClean' ? replay.phase === 'passed' && last.bad : last.refusalBroken, 'The intended harm must occur in actual code');
      await writeFile(join(path, 'actual-code-replay.json'), `${canonical({ expectedRule, steps: replayed })}\n`);
    }
    else { assert.equal(result.status, 0, output); assert.match(output, /Model checking completed\. No error has been found\./); }
    const counts = output.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/);
    assert.ok(counts, 'TLC must report actual state exploration');
    report.runs.push({ name, expectedRule, status: expectedRule ? 'intended-counterexample' : 'passed', nodes: graph.states.length, edges: graph.edges.length, counts: counts.slice(1), directory: path });
  };
  await run('baseline', production);
  const source = await readFile(join(root, 'src/assurance.mjs'), 'utf8');
  for (const [name, find, replacement, rule] of mutations) {
    const copied = join(directory, `source-${name}`); await mkdir(copied);
    assert.equal(source.split(find).length, 2, `Unique real-source mutation ${name}`);
    await writeFile(join(copied, 'assurance.mjs'), source.replace(find, replacement));
    await writeFile(join(copied, 'content.mjs'), await readFile(join(root, 'src/content.mjs')));
    const module = await import(pathToFileURL(join(copied, 'assurance.mjs')));
    let valid = module.beginAssurance('same');
    for (const suite of module.assurancePlan) { valid = module.assuranceTransition(valid, { kind: 'start', id: suite.id, contextDigest: 'same' }); valid = module.assuranceTransition(valid, { kind: 'finish', id: suite.id, contextDigest: 'same', code: 0, signal: null, error: null, evidenceValid: true }); }
    if (name !== 'coverage') assert.equal(valid.phase, 'passed', 'Mutation must still execute valid production behavior');
    await run(name, module, rule);
  }
  await run('restored', production);
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, sourceReviewGate: report.sourceReviewGate, runs: report.runs.length, evidence: join(directory, 'report.json'), error: report.error?.message })}\n`);
