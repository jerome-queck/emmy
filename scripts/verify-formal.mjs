#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { digest, readJson } from '../src/records.mjs';
import { bounds, verifyProperties } from '../verification/properties.mjs';
import { mutations } from '../verification/mutations.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, '.local/verification', `formal-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(evidenceDir, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'emmy-formal-'));
const report = { runtime: process.version, tool: 'Bounded exhaustive JavaScript enumeration of actual production functions', bounds, mutations: [], status: 'running' };
try {
  const coverage = await readJson(join(root, 'verification/coverage.json'));
  assert.match(coverage.sourceCommit, /^[a-f0-9]{40}$/);
  execFileSync('git', ['cat-file', '-e', `${coverage.sourceCommit}^{commit}`], { cwd: root, stdio: 'pipe' });
  const sources = {};
  for (const [path, expected] of Object.entries(coverage.files)) {
    const actual = digest(await readFile(join(root, path)));
    assert.equal(actual, expected, `${path} changed after formal review. Review the diff and mapping before moving coverage.json.`);
    const committed = execFileSync('git', ['show', `${coverage.sourceCommit}:${path}`], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
    assert.equal(digest(committed), expected, `${path} digest does not describe sourceCommit`);
    sources[path] = actual;
  }
  report.coverage = { ...coverage, observedFiles: sources };
  const work = await import(pathToFileURL(join(root, 'src/work.mjs')));
  report.baseline = verifyProperties(work);
  const original = await readFile(join(root, 'src/work.mjs'), 'utf8');
  for (const mutation of mutations) {
    let changed = original;
    for (const [find, replacement] of mutation.edits) {
      assert.equal(changed.split(find).length, 2, `Mutation ${mutation.id} must target exactly one source expression`);
      changed = changed.replace(find, replacement);
    }
    const mutantPath = join(scratch, `${mutation.id}.mjs`);
    await writeFile(mutantPath, changed);
    const mutant = await import(pathToFileURL(mutantPath));
    let counterexample;
    try { verifyProperties(mutant, mutation.property); }
    catch (error) {
      if (error.property !== mutation.property || !error.counterexample) throw error;
      counterexample = { property: error.property, message: error.message, input: error.counterexample };
    }
    assert.ok(counterexample, `Mutation survived ${mutation.id}`);
    await writeFile(join(evidenceDir, `${mutation.id}.json`), `${JSON.stringify({ mutation, counterexample }, null, 2)}\n`);
    report.mutations.push({ id: mutation.id, property: mutation.property, status: 'killed-by-intended-property', evidence: `${mutation.id}.json` });
  }
  report.restored = verifyProperties(work);
  assert.deepEqual(report.restored, report.baseline, 'Original production source passes again');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { message: error.message, stack: error.stack, property: error.property, counterexample: error.counterexample };
  process.exitCode = 1;
} finally {
  await rm(scratch, { recursive: true, force: true });
  report.cleaned = true;
  await writeFile(join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: report.status, cases: report.baseline, mutations: report.mutations.length, evidence: join(evidenceDir, 'report.json'), error: report.error?.message })}\n`);
}
