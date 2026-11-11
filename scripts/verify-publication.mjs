#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drivePublication } from '../verification/publication/drive.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, '.local/publication-model', `run-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(evidenceDir, { recursive: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { kind: 'tlc-bounded-publication-safety', status: 'running', sourceReviewGate: true, runs: [] };

function javaBinary() {
  const candidates = process.env.EMMY_JAVA_BIN ? [process.env.EMMY_JAVA_BIN] : [
    process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin/java'),
    process.env.JAVA_HOME_21_X64 && join(process.env.JAVA_HOME_21_X64, 'bin/java'),
    'java',
  ].filter(Boolean);
  if (!process.env.EMMY_JAVA_BIN && process.platform === 'darwin') {
    const home = spawnSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' });
    if (home.status === 0) candidates.push(join(home.stdout.trim(), 'bin/java'));
    const brew = spawnSync('brew', ['--prefix', 'openjdk@21'], { encoding: 'utf8' });
    if (brew.status === 0) candidates.push(join(brew.stdout.trim(), 'bin/java'));
  }
  for (const binary of candidates) {
    const result = spawnSync(binary, ['-version'], { encoding: 'utf8' });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (result.status === 0 && /version "21\./.test(output)) return { binary, version: output.trim() };
  }
  throw new Error('Java 21 is required. Set EMMY_JAVA_BIN to its java executable.');
}

async function jarFile(tool) {
  const path = process.env.EMMY_TLC_JAR ? resolve(process.env.EMMY_TLC_JAR) : join(root, '.local/tools', tool.filename);
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) {
    if (error.code !== 'ENOENT' || process.env.EMMY_TLC_JAR) throw error;
    const response = await fetch(tool.url, { signal: AbortSignal.timeout(60_000) });
    assert.equal(response.ok, true, `Official TLC download returned HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(sha256(bytes), tool.sha256, 'Downloaded TLC jar differs from the pinned official release');
    await mkdir(dirname(path), { recursive: true });
    const pending = `${path}.pending-${randomUUID()}`;
    await writeFile(pending, bytes, { flag: 'wx' });
    await rename(pending, path);
  }
  assert.equal(sha256(bytes), tool.sha256, 'TLC jar differs from the pinned official release');
  return path;
}

async function tlc(java, jar, config, stage) {
  const directory = join(evidenceDir, `${stage}-${config}`);
  await mkdir(directory, { recursive: true });
  const args = ['-XX:+UseParallelGC', '-Xmx1g', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-fp', '0', '-metadir', join(directory, 'states'), '-config', join(root, 'verification/publication', `${config}.cfg`), join(root, 'verification/publication/RecordPublication.tla')];
  const start = Date.now();
  const child = spawn(java.binary, args, { cwd: directory });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; });
  child.stderr.on('data', bytes => { stderr += bytes; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 90_000);
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code, signal }));
    });
  } finally {
    clearTimeout(timeout);
    await writeFile(join(directory, 'tlc.log'), stdout + stderr);
  }
  const counts = stdout.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/);
  const summary = {
    stage, config, ...result, elapsedMs: Date.now() - start,
    generatedStates: counts && Number(counts[1].replaceAll(',', '')),
    distinctStates: counts && Number(counts[2].replaceAll(',', '')),
    remainingStates: counts && Number(counts[3].replaceAll(',', '')),
    depth: Number(stdout.match(/depth of the complete state graph search is (\d+)/)?.[1]),
    log: `${stage}-${config}/tlc.log`, logSha256: sha256(stdout + stderr),
  };
  report.runs.push(summary);
  assert.match(stdout, /TLC2 Version 2\.19 /, 'The pinned release must identify the expected TLC version');
  return { ...summary, stdout, stderr };
}

function passed(run) {
  assert.equal(run.code, 0, `TLC baseline failed. Read ${run.log}`);
  assert.equal(run.signal, null);
  assert.match(run.stdout, /Model checking completed\. No error has been found\./);
  assert.ok(run.distinctStates > 0);
  assert.equal(run.remainingStates, 0, 'TLC must exhaust its queue');
  return { config: run.config, generatedStates: run.generatedStates, distinctStates: run.distinctStates, depth: run.depth };
}

try {
  assert.equal(process.argv.length, 2, 'Use npm run verify:model without arguments');
  const coverage = JSON.parse(await readFile(join(root, 'verification/publication/coverage.json'), 'utf8'));
  assert.match(coverage.sourceCommit, /^[a-f0-9]{40}$/);
  for (const [path, expected] of Object.entries(coverage.sourceFiles)) {
    assert.equal(sha256(await readFile(join(root, path))), expected, `${path} changed. Review the source diff and model mapping before moving the publication coverage record.`);
    const bytes = execFileSync('git', ['show', `${coverage.sourceCommit}:${path}`], { cwd: root });
    assert.equal(sha256(bytes), expected, `${path} does not describe the reviewed source commit`);
  }
  for (const [path, expected] of Object.entries(coverage.verificationFiles)) {
    assert.equal(sha256(await readFile(join(root, path))), expected, `${path} changed. Review the model, bridge and skill before refreshing verification digests.`);
  }
  report.coverage = coverage;
  const java = javaBinary();
  const jar = await jarFile(coverage.tool);
  report.tool = { ...coverage.tool, jar, java };
  report.baseline = [];
  for (const config of ['same-hash', 'distinct-import']) report.baseline.push(passed(await tlc(java, jar, config, 'baseline')));
  report.modelMutants = [];
  for (const [config, invariant, action] of [
    ['direct-canonical-mutant', 'PublishedComplete', 'CreatePending'],
    ['reversed-import-mutant', 'ImportPrefixSafe', 'Rename'],
  ]) {
    const run = await tlc(java, jar, config, 'mutant');
    assert.equal(run.signal, null);
    assert.notEqual(run.code, 0, `Model mutant survived ${config}`);
    assert.match(run.stdout, new RegExp(`Invariant ${invariant} is violated`));
    assert.match(run.stdout, /The behavior up to this point is/);
    assert.match(run.stdout, new RegExp(`State \\d+: <${action}`));
    report.modelMutants.push({ config, invariant, action, status: 'intended-counterexample', trace: run.log });
  }
  report.filesystem = await drivePublication(root, join(evidenceDir, 'filesystem'));
  report.restored = [];
  for (const config of ['same-hash', 'distinct-import']) report.restored.push(passed(await tlc(java, jar, config, 'restored')));
  assert.deepEqual(report.restored, report.baseline, 'The unchanged model must reproduce the original complete state graph after mutants');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await writeFile(join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: report.status, kind: report.kind, sourceReviewGate: report.sourceReviewGate, baseline: report.baseline, modelMutants: report.modelMutants?.length, filesystemMutants: report.filesystem?.mutants.length, evidence: join(evidenceDir, 'report.json'), error: report.error?.message })}\n`);
}
