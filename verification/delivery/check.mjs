import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import * as production from '../../scripts/github-auto-merge.mjs';
import { canonical, digest } from '../../src/content.mjs';
import { observeAssurance } from '../../src/local-assurance.mjs';
import { localSpecimen } from './fixtures.mjs';
import { deliveryGraph, deliverySpec, deliveryConfig } from './graph.mjs';
import { label } from './view.mjs';

export async function verifyDelivery({ development = false } = {}) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const directory = join(root, '.local/verification/delivery', randomUUID()); await mkdir(directory, { recursive: true });
  const report = { status: 'running', sourceReviewGate: !development, directory, finiteCases: 0, runs: [], admissionMutants: [] };
  const source = await readFile(join(root, 'scripts/github-auto-merge.mjs'), 'utf8');
  try {
    if (!development) {
      const coverage = JSON.parse(await readFile(join(root, 'verification/delivery/coverage.json'), 'utf8'));
      for (const [path, expected] of Object.entries(coverage.sourceFiles)) {
        assert.equal(digest(await readFile(join(root, path))), expected, `Review delivery mapping after ${path} changes`);
        assert.equal(digest(execFileSync('git', ['show', `${coverage.sourceCommit}:${path}`], { cwd: root })), expected, 'Delivery sync commit must contain actual reviewed source');
      }
      for (const [path, expected] of Object.entries(coverage.verificationFiles)) assert.equal(digest(await readFile(join(root, path))), expected, `Review delivery verification after ${path} changes`);
      report.coverage = coverage;
    }
    const changes = [
      l => { l.assurance.head = 'f'.repeat(40); }, l => { l.assurance.base = 'f'.repeat(40); },
      l => { l.assurance.tree = 'f'.repeat(40); }, l => { l.assurance.clean = false; },
      l => { l.assurance.status = 'refused'; }, l => { l.review.reviewer = l.review.author; },
      l => { l.review.receiptDigest = 'f'.repeat(64); }, l => { l.review.contextDigest = 'f'.repeat(64); },
      l => { l.review.practical = false; }, l => { l.authorization.actions = []; },
      l => { l.authorization.base = 'f'.repeat(40); }, l => { l.authorization.expiresAt = new Date(l.now).toISOString(); },
    ];
    for (let bits = 0; bits < 2 ** changes.length; bits++) {
      const local = localSpecimen();
      changes.forEach((change, index) => { if (bits & (1 << index)) change(local); });
      assert.equal(production.evaluateLocalEvidence(local).eligible, bits === 0, `Local admission ${bits}`); report.finiteCases++;
    }
    const copied = text => import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
    for (const [name, find, replacement, change] of [
      ['same-author', 'r.reviewer !== r.author', 'true', changes[5]],
      ['source-head', 'a.status === \'current-local-reported\' && same(a)', "a.status === 'current-local-reported'", changes[0]],
      ['review-receipt', 'r.receiptDigest === a.receiptDigest', 'true', changes[6]],
      ['authorization', 'now < Date.parse(grant.expiresAt)', 'true', changes[11]],
    ]) {
      assert.equal(source.split(find).length, 2, `Unique admission mutation ${name}`);
      const module = await copied(source.replace(find, replacement));
      assert.equal(module.evaluateLocalEvidence(localSpecimen()).eligible, true);
      const local = localSpecimen(); change(local);
      assert.equal(production.evaluateLocalEvidence(local).eligible, false);
      assert.equal(module.evaluateLocalEvidence(local).eligible, true, `Intended forbidden admission ${name}`);
      report.admissionMutants.push({ name, local, original: production.evaluateLocalEvidence(local), mutantEligible: true });
    }
    const { context } = await observeAssurance(root);
    report.tools = context.formal;
    const run = async (name, module, rule = null) => {
      const path = join(directory, name); await mkdir(path);
      let valid = module.beginDelivery();
      const validPath = [{ kind: 'check-start' }, { kind: 'check-result', valid: true }, { kind: 'review', valid: true }, { kind: 'ready', valid: true }];
      for (const action of ['publish', 'open-pr', 'attest', 'merge']) {
        if (action === 'merge') validPath.push({ kind: 'authorize-merge', valid: true });
        validPath.push({ kind: 'intent', action, valid: true }, { kind: 'observe', action, exact: true, confirmed: true });
      }
      for (const event of validPath) valid = module.deliveryTransition(valid, event);
      assert.equal(valid.phase, 'merged', 'Every source variant must execute the complete valid journey');
      const graph = deliveryGraph(module);
      await writeFile(join(path, 'graph.json'), `${canonical(graph)}\n`);
      await writeFile(join(path, 'Delivery.tla'), deliverySpec(graph)); await writeFile(join(path, 'Delivery.cfg'), deliveryConfig);
      const labels = graph.states.map(row => label(row.state));
      await writeFile(join(path, 'view.mjs'), `const labels=${JSON.stringify(labels)};\nexport const title='Local verified delivery';\nexport const state=v=>labels[v.node-1];\nexport { step } from ${JSON.stringify(pathToFileURL(join(root, 'verification/delivery/view.mjs')).href)};\n`);
      const result = spawnSync(context.formal.java.path, ['-XX:+UseParallelGC', '-Xmx1g', '-cp', context.formal.tlc.path, 'tlc2.TLC', '-workers', '1', '-fp', '0', '-config', 'Delivery.cfg', 'Delivery.tla'], { cwd: path, encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`; await writeFile(join(path, 'tlc.out'), output);
      assert.equal(result.signal, null); assert.equal(result.error, undefined);
      if (rule) {
        assert.notEqual(result.status, 0); assert.match(output, new RegExp(`Invariant ${rule} is violated`));
        const trace = [...output.matchAll(/State \d+: <([^>\n]+)>\nnode = (\d+)/g)].map(match => ({ action: match[1].split(' ')[0], node: Number(match[2]) - 1 }));
        assert.ok(trace.length > 1 && trace[0].node === 0);
        let state = module.beginDelivery(); const replay = [];
        for (let index = 1; index < trace.length; index++) {
          const edge = graph.edges.find(row => row.from === trace[index - 1].node && row.to === trace[index].node && row.action === trace[index].action);
          assert.ok(edge, 'Every TLC step must replay a real source event'); state = module.deliveryTransition(state, edge.event);
          assert.deepEqual(state, graph.states[trace[index].node].state); replay.push({ event: edge.event, state });
        }
        const last = graph.states[trace.at(-1).node];
        assert.ok(rule === 'EffectSafe' ? last.unsafe : rule === 'NoDuplicate' ? Object.values(last.attempts).some(n => n > 1) : last.lostUnknown, 'Intended harm must replay against actual copied source');
        await writeFile(join(path, 'actual-code-replay.json'), `${canonical(replay)}\n`);
      } else { assert.equal(result.status, 0, output); assert.match(output, /Model checking completed\. No error has been found\./); }
      report.runs.push({ name, rule, states: graph.states.length, edges: graph.edges.length, directory: path });
    };
    await run('baseline', production);
    for (const [name, find, replacement, rule] of [
      ['fake-review', "state.phase === 'checked' && event.valid", "state.phase === 'checked'", 'EffectSafe'],
      ['denied-effect', "state.phase === allowed[event.action] && event.valid", 'state.phase === allowed[event.action]', 'EffectSafe'],
      ['unknown-readback', 'if (event.confirmed === true)', 'if (true)', 'UnknownPreserved'],
      ['wrong-readback', 'event.exact === true', 'true', 'UnknownPreserved'],
      ['duplicate-attest', '!state.completed.includes(event.action)', 'true', 'NoDuplicate'],
    ]) {
      assert.equal(source.split(find).length, 2, `Unique lifecycle mutation ${name}`);
      await run(name, await copied(source.replace(find, replacement)), rule);
    }
    await run('restored', production); report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; }
  await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(report.status, 'passed', `Delivery formal failed. ${report.error?.message}. Read ${directory}/report.json`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyDelivery({ development: process.argv.includes('--development') }).then(report => process.stdout.write(`${JSON.stringify({ status: report.status, finiteCases: report.finiteCases, runs: report.runs.length, directory: report.directory })}\n`)).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}
