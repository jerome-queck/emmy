#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { driveSlot } from '../verification/briefing-slot/drive.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const selected = join(root, '.local/deterministic-sop-refactor-20261103-v1/slot-verification', `run-${Date.now()}-${randomUUID().slice(0, 8)}`);
await mkdir(selected, { recursive: true });
const report = { kind: 'bounded-immutable-slot-safety', status: 'running', runs: [] };
try {
  assert.equal(process.argv.length, 2, 'No options supported');
  const coverage = JSON.parse(await readFile(join(root, 'verification/briefing-slot/coverage.json')));
  for (const [path, expected] of Object.entries({ ...coverage.sourceFiles, ...coverage.verificationFiles })) assert.equal(sha(await readFile(join(root, path))), expected, `Reviewed source/model drift: ${path}`);
  report.coverage = coverage;
  const old = JSON.parse(await readFile(join(root, 'verification/publication/coverage.json')));
  const tool = old.tool;
  assert.equal(tool.javaMajor, 21);
  const jar = process.env.EMMY_TLC_JAR ? resolve(process.env.EMMY_TLC_JAR) : join(root, '.local/tools', tool.filename);
  assert.equal(sha(await readFile(jar)), tool.sha256, 'Use the existing pinned TLC jar');
  const candidates = [process.env.EMMY_JAVA_BIN, process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin/java'), 'java', '/opt/homebrew/opt/openjdk@21/bin/java'].filter(Boolean);
  const java = candidates.find(binary => { const run = spawnSync(binary, ['-version'], { encoding: 'utf8', timeout: 10000 }); return run.status === 0 && /version "21\./.test(run.stderr + run.stdout); });
  assert.ok(java, 'Java 21 unavailable'); report.tool = { ...tool, java, jar };
  async function tlc(config, stage, expectedInvariant = null) {
    const directory = join(selected, `${stage}-${config}`); await mkdir(directory);
    const args = ['-XX:+UseParallelGC', '-Xmx1g', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-fp', '0', '-metadir', join(directory, 'states'), '-config', join(root, 'verification/briefing-slot', `${config}.cfg`), join(root, 'verification/briefing-slot/BriefingSlot.tla')];
    const start = Date.now(); const run = spawnSync(java, args, { cwd: directory, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const log = `${run.stdout ?? ''}${run.stderr ?? ''}`; await writeFile(join(directory, 'tlc.log'), log);
    const counts = log.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/);
    const result = { config, stage, code: run.status, signal: run.signal, elapsedMs: Date.now() - start, log: join(directory, 'tlc.log'), generated: counts && Number(counts[1].replaceAll(',', '')), distinct: counts && Number(counts[2].replaceAll(',', '')), remaining: counts && Number(counts[3].replaceAll(',', '')) };
    report.runs.push(result);
    assert.ifError(run.error); assert.equal(run.signal, null); assert.match(log, /TLC2 Version 2\.19 /);
    if (expectedInvariant) { assert.notEqual(run.status, 0); assert.match(log, new RegExp(`Invariant ${expectedInvariant} is violated`)); assert.match(log, /The behavior up to this point is/); }
    else { assert.equal(run.status, 0, `Read ${result.log}`); assert.match(log, /Model checking completed\. No error has been found\./); assert.ok(result.distinct > 0); assert.equal(result.remaining, 0); }
    return { config, generated: result.generated, distinct: result.distinct };
  }
  report.baseline = [];
  for (const config of ['same', 'distinct']) report.baseline.push(await tlc(config, 'baseline'));
  report.modelMutants = [];
  for (const [config, invariant] of [['early-mutant', 'PublishedComplete'], ['overwrite-mutant', 'CanonicalImmutable'], ['omit-marker-mutant', 'ConflictRetained']]) {
    await tlc(config, 'mutant', invariant); report.modelMutants.push({ config, invariant });
  }
  const source = await readFile(join(root, 'src/immutable-slot.mjs'), 'utf8');
  report.filesystem = await driveSlot(root, join(selected, 'filesystem'), source);
  report.restored = [];
  for (const config of ['same', 'distinct']) report.restored.push(await tlc(config, 'restored'));
  assert.deepEqual(report.restored, report.baseline);
  assert.equal(sha(await readFile(join(root, 'src/immutable-slot.mjs'))), coverage.sourceFiles['src/immutable-slot.mjs']);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  await writeFile(join(selected, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: report.status, evidence: join(selected, 'report.json'), modelMutants: report.modelMutants?.length, filesystemMutants: report.filesystem?.mutants?.length, crashes: report.filesystem?.crashes?.length, error: report.error?.message })}\n`);
}
