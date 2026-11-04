#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { studioDiscovery } from '../src/studio-discovery.mjs';
import { discoveryCases, verifyDiscovery } from '../verification/studio-discovery-properties.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const sourcePath = 'src/studio-discovery.mjs';
const evidence = join(root, '.local/verification', `discovery-${randomUUID()}`);
await mkdir(evidence, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'emmy-discovery-'));
const report = { status: 'running', sourceReviewGate: !process.argv.includes('--development'), mutations: [], limits: ['Finite supplied-capture predicates only. No authenticated native truth, atomic snapshot, absence, permissions, execution, scheduler adoption or delivery claim.'] };
const mutations = [
  { id: 'ignore-project', case: 'saved-membership', find: "if (!observations.some(value => value.task.projectId === scope.projectId)) continue;", replacement: 'if (false) continue;' },
  { id: 'ignore-host', case: 'foreign-host', find: "if (task.hostId !== scope.hostId)", replacement: 'if (false)' },
  { id: 'refresh-original-age', case: 'stale-original', find: 'const ageMs = now - instant(acquiredAt);', replacement: 'const ageMs = 0;' },
  { id: 'exclusive-age-boundary', case: 'inclusive-age', find: 'ageMs > maxAgeMs', replacement: 'ageMs >= maxAgeMs' },
  { id: 'ignore-cursor-binding', case: 'cursor-chain', find: "(cursor === null ? Object.hasOwn(args, 'cursor') : args.cursor !== cursor)", replacement: 'false' },
  { id: 'forget-conflicts', case: 'conflicting-duplicate', find: 'const conflict = observations.length > 1;', replacement: 'const conflict = false;' },
  { id: 'forget-overlap', case: 'active-archive-overlap', find: 'const overlap = new Set(observations.flatMap(value => value.captures.map(capture => capture.source))).size > 1;', replacement: 'const overlap = false;' },
  { id: 'accept-error-wrapper', case: 'error-wrapper', find: 'response.isError', replacement: 'false', all: true }
];
try {
  assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--development', 'Use no arguments or --development');
  if (report.sourceReviewGate) {
    const coverage = JSON.parse(await readFile(join(root, 'verification/discovery-coverage.json'), 'utf8'));
    assert.match(coverage.sourceCommit, /^[a-f0-9]{40}$/);
    for (const [file, expected] of Object.entries(coverage.files)) {
      assert.equal(hash(await readFile(join(root, file))), expected, `${file} changed after discovery mapping review`);
      assert.equal(hash(execFileSync('git', ['show', `${coverage.sourceCommit}:${file}`], { cwd: root })), expected);
    }
    assert.deepEqual(coverage.mapping.cases, discoveryCases().map(([name]) => name));
    assert.deepEqual(coverage.mutations, mutations.map(({ id, case: name }) => ({ id, case: name })));
    assert.equal(coverage.mapping.source, sourcePath); assert.equal(coverage.mapping.function, 'studioDiscovery');
    report.coverage = coverage;
  }
  report.baseline = verifyDiscovery(studioDiscovery);
  const original = await readFile(join(root, sourcePath), 'utf8');
  await writeFile(join(scratch, 'strict-json.mjs'), await readFile(join(root, 'src/strict-json.mjs')));
  for (const mutation of mutations) {
    assert.ok(original.includes(mutation.find), mutation.id);
    if (!mutation.all) assert.equal(original.split(mutation.find).length, 2, mutation.id);
    const changed = mutation.all ? original.replaceAll(mutation.find, mutation.replacement) : original.replace(mutation.find, mutation.replacement);
    const file = join(scratch, `${mutation.id}.mjs`); await writeFile(file, changed);
    const candidate = await import(pathToFileURL(file));
    let failure;
    try { verifyDiscovery(candidate.studioDiscovery, mutation.case); } catch (error) { failure = error; }
    assert.ok(failure instanceof assert.AssertionError, `${mutation.id} must cause its intended assertion failure, not an import/runtime exception`);
    assert.equal(failure.discoveryCase, mutation.case);
    report.mutations.push({ id: mutation.id, case: mutation.case, status: 'killed-by-intended-case', assertion: failure.message });
  }
  report.restored = verifyDiscovery(studioDiscovery); assert.deepEqual(report.restored, report.baseline); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  await rm(scratch, { recursive: true, force: true });
  await writeFile(join(evidence, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: report.status, checks: report.baseline?.checks, mutants: report.mutations.length, sourceReviewGate: report.sourceReviewGate, evidence: join(evidence, 'report.json'), error: report.error?.message })}\n`);
}
