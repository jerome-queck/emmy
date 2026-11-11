import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as original from '../../src/automation-reporting.mjs';
import { graph, spec, cfg, step } from './graph.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const root = process.cwd(), output = join(root, '.local/verification/automation-lineage', randomUUID());
const scratch = await mkdtemp('/tmp/emmy-lineage-');
await mkdir(output, { recursive: true });
const report = { status: 'running', scratch, runs: [] };
const mutants = [
  ['initial-revision', 'InitialExact', [["revision: previous ? previous.revision + 1 : 0, previous:", "revision: previous ? previous.revision + 1 : 1, previous:"]]],
  ['chain-link', 'ChainExact', [["record.revision === (previous ? previous.revision + 1 : 0) && record.previous === (previous ? recordDigest(previous) : null) && (!previous || Date.parse(record.recordedAt) >= Date.parse(previous.recordedAt))", 'true']]],
  ['occurrence-terminal', 'OccurrenceTerminal', [["!previous || previous.data.occurrenceKey === occurrenceKey && (!terminal.includes(previous.data.execution) || input.execution === previous.data.execution)", 'true']]],
  ['historical-occurrence-terminal', 'OccurrenceTerminal', [["!previous || record.data.occurrenceKey === previous.data.occurrenceKey && (!terminal.includes(previous.data.execution) || record.data.execution === previous.data.execution)", 'true']]],
  ['terminal-null', 'NullTerminal', [["!previous || !terminal.includes(previous.data.execution) || previous.data.report !== null", 'true']]],
];
try {
  assert.equal(process.argv.length, 2);
  const coverage = JSON.parse(await readFile('verification/automation-lineage/coverage.json'));
  for (const [file, digest] of Object.entries(coverage.sourceFiles)) {
    assert.equal(hash(await readFile(file)), digest, `source drift ${file}`);
    assert.equal(hash(execFileSync('git', ['show', `${coverage.sourceCommit}:${file}`])), digest, `source sync ${file}`);
  }
  for (const [file, digest] of Object.entries(coverage.verificationFiles)) assert.equal(hash(await readFile(file)), digest, `verification drift ${file}`);
  const jar = join(root, '.local/tools/tla2tools-1.7.4.jar');
  assert.equal(hash(await readFile(jar)), '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88');
  const java = execFileSync('which', ['java'], { encoding: 'utf8' }).trim();
  const version = spawnSync(java, ['-version'], { encoding: 'utf8' });
  assert.equal(version.status, 0); assert.match(version.stderr, /version "21[.\"]/);
  report.java = { path: java, version: version.stderr, jar, jarSha256: hash(await readFile(jar)) };
  async function run(name, api, expected) {
    const g = graph(api), dir = join(scratch, name), retained = join(output, name);
    await mkdir(dir); await mkdir(retained);
    const config = expected ? `INIT Init\nNEXT Next\nINVARIANT ${expected}\n` : cfg;
    for (const [file, content] of Object.entries({ 'AutomationLineage.tla': spec(g), 'AutomationLineage.cfg': config, 'graph.json': JSON.stringify(g, null, 2) })) {
      await writeFile(join(retained, file), content); if (file !== 'graph.json') await writeFile(join(dir, file), content);
    }
    const env = { ...process.env, TMPDIR: dir }; delete env.JAVA_TOOL_OPTIONS; delete env.JDK_JAVA_OPTIONS; delete env._JAVA_OPTIONS;
    const argv = [`-Djava.io.tmpdir=${dir}`, '-XX:+UseParallelGC', '-Xmx1g', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-fp', '0', '-config', 'AutomationLineage.cfg', 'AutomationLineage.tla'];
    const result = spawnSync(java, argv, { cwd: dir, env, encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
    const text = (result.stdout ?? '') + (result.stderr ?? ''); await writeFile(join(retained, 'tlc.out'), text);
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    if (!expected) {
      assert.equal(result.status, 0, text); assert.match(text, /Model checking completed\. No error has been found/);
      assert.ok(g.states.every(state => Object.values(state.rules).every(Boolean)));
    } else {
      assert.notEqual(result.status, 0); assert.match(text, new RegExp(`Invariant ${expected} is violated`));
      const trace = [...text.matchAll(/State \d+: <[^>\n]+>\nnode = (\d+)/g)].map(match => Number(match[1]) - 1);
      assert.ok(trace.length > 1 && trace[0] === 0); let broken = g.states[0], restored = g.states[0]; const steps = [];
      for (let i = 1; i < trace.length; i++) {
        const edge = g.edges.find(e => e.from === trace[i - 1] && e.to === trace[i]); assert.ok(edge);
        broken = step(api, broken, edge.choice); restored = step(original, restored, edge.choice);
        assert.deepEqual(broken, g.states[edge.to]);
        steps.push({ choice: edge.choice, broken, restored });
      }
      assert.equal(broken.rules[expected], false); assert.equal(restored.rules[expected], true);
      await writeFile(join(retained, 'replay.json'), JSON.stringify({ trace, steps }, null, 2));
    }
    report.runs.push({ name, expected, nodes: g.states.length, edges: g.edges.length, argv, tmpdir: dir });
  }
  await run('baseline', original, null);
  const source = await readFile('src/automation-reporting.mjs', 'utf8');
  for (const [name, rule, edits] of mutants) {
    const dir = join(scratch, `source-${name}`); await cp('src', dir, { recursive: true });
    const file = join(dir, 'automation-reporting.mjs'); let changed = source;
    for (const [from, to] of edits) { assert.equal(changed.split(from).length, 2, name); changed = changed.replace(from, to); }
    await writeFile(file, changed); await run(name, await import(pathToFileURL(file)), rule);
  }
  await run('restored', original, null); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, output, runs: report.runs.length, error: report.error?.message }));
