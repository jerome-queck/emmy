#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { digest, readJson } from '../src/records.mjs';
import { bounds, verifyProperties } from '../verification/properties.mjs';
import { mutations } from '../verification/mutations.mjs';
import { verification } from '../src/metadata.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, '.local/verification', `formal-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(evidenceDir, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'emmy-formal-'));
const report = { runtime: process.version, tool: 'Bounded enumeration and temporal traces of actual production functions', bounds, mutations: [], status: 'running', sourceReviewGate: !process.argv.includes('--development') };
const modules = async path => ({ work: await import(pathToFileURL(join(path, 'src/work.mjs'))), responsibilities: await import(pathToFileURL(join(path, 'src/responsibilities.mjs'))), records: await import(pathToFileURL(join(path, 'src/records.mjs'))), dispatch: await import(pathToFileURL(join(path, 'src/dispatch.mjs'))), cloud: await import(pathToFileURL(join(path, 'src/cloud.mjs'))), incarnation: await import(pathToFileURL(join(path, 'src/process-incarnation.mjs'))), migration: await import(pathToFileURL(join(path, 'src/cloud-migration.mjs'))), calendar: await import(pathToFileURL(join(path, 'src/calendar.mjs'))), fleet: await import(pathToFileURL(join(path, 'src/fleet-state.mjs'))) });
try {
  assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--development', 'Use no arguments or --development');
  if (report.sourceReviewGate) {
    const coverage = await readJson(join(root, 'verification/coverage.json')); assert.match(coverage.sourceCommit, /^[a-f0-9]{40}$/);
    execFileSync('git', ['cat-file', '-e', `${coverage.sourceCommit}^{commit}`], { cwd: root, stdio: 'pipe' });
    const observedFiles = {};
    for (const [path, expected] of Object.entries(coverage.files)) {
      const actual = digest(await readFile(join(root, path))); assert.equal(actual, expected, `${path} changed after formal review. Review the diff/mapping before moving coverage.json.`);
      const committed = execFileSync('git', ['show', `${coverage.sourceCommit}:${path}`], { cwd: root, maxBuffer: 10 * 1024 * 1024 }); assert.equal(digest(committed), expected, `${path} digest does not describe sourceCommit`); observedFiles[path] = actual;
    }
    report.coverage = { ...coverage, observedFiles };
    assert.deepEqual([...new Set(coverage.mapping.flatMap(value => value.properties))].sort(), verification.properties.map(value => value.id).sort(), 'Mapping must include every property');
  } else report.limits = ['Development mode skips reviewed source pins. It cannot satisfy npm run check or a release gate.'];
  const production = await modules(root); report.baseline = verifyProperties(production);
  assert.deepEqual(Object.keys(report.baseline.counts).sort(), verification.properties.map(value => value.id).sort(), 'Every metadata property executes');
  for (const mutation of mutations) {
    const candidateRoot = join(scratch, mutation.id); await mkdir(join(candidateRoot, 'src'), { recursive: true });
    for (const name of ['records.mjs', 'work.mjs', 'responsibilities.mjs', 'dispatch.mjs', 'calendar.mjs', 'cloud.mjs', 'cloud-schema.mjs', 'process-incarnation.mjs', 'cloud-migration.mjs', 'fleet.mjs', 'fleet-schema.mjs', 'fleet-state.mjs', 'bounded-json.mjs']) await cp(join(root, 'src', name), join(candidateRoot, 'src', name));
    const target = join(candidateRoot, mutation.source); let source = await readFile(target, 'utf8');
    for (const [find, replacement] of mutation.edits) { assert.equal(source.split(find).length, 2, `Mutant ${mutation.id} must target one production expression`); source = source.replace(find, replacement); }
    await writeFile(target, source); const candidate = await modules(candidateRoot); let counterexample;
    try { verifyProperties(candidate, mutation.property); }
    catch (error) { if (error.property !== mutation.property || !error.counterexample) throw error; counterexample = { property: error.property, message: error.message, input: error.counterexample }; }
    assert.ok(counterexample, `Mutation survived ${mutation.id}`);
    if (mutation.counterexample) assert.equal(counterexample.input.case, mutation.counterexample, `Mutant ${mutation.id} must fail its designated calendar case`);
    await writeFile(join(evidenceDir, `${mutation.id}.json`), `${JSON.stringify({ mutation, counterexample }, null, 2)}\n`);
    report.mutations.push({ id: mutation.id, source: mutation.source, property: mutation.property, status: 'killed-by-intended-property', evidence: `${mutation.id}.json` });
  }
  report.restored = verifyProperties(production); assert.deepEqual(report.restored, report.baseline, 'Unmodified production passes again'); report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = { message: error.message, stack: error.stack, property: error.property, counterexample: error.counterexample }; process.exitCode = 1;
} finally {
  await rm(scratch, { recursive: true, force: true }); report.cleaned = true;
  await writeFile(join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: report.status, sourceReviewGate: report.sourceReviewGate, checks: report.baseline?.checks, counts: report.baseline?.counts, mutations: report.mutations.length, evidence: join(evidenceDir, 'report.json'), error: report.error?.message })}\n`);
}
