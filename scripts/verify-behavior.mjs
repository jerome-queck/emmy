#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { digest } from '../src/records.mjs';
import { inspectRepository } from '../src/responsibilities.mjs';
import { commands, verification } from '../src/metadata.mjs';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(sourceRoot, '.local/verification', `behavior-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(evidenceDir, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'emmy-behavior-'));
const home = join(root, '.local');
const report = { runtime: process.version, evidenceDir, temporaryRoot: root, commands: [], scenarios: [], status: 'running', focus: process.argv.includes('--focus') ? process.argv[process.argv.indexOf('--focus') + 1] : null };
const children = new Set();
const now = () => new Date().toISOString();
const fixture = async (name, value) => {
  const path = join(home, 'inbox', name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value)); return path;
};
const run = async (args, expected = 0, selectedHome = home, env = {}) => {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(sourceRoot, 'scripts/agent.mjs'), ...args, '--root', root, '--home', selectedHome], { env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, ...env } });
    children.add(child); let stdout = ''; let stderr = '';
    child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; }); child.on('error', reject);
    child.on('close', (code, signal) => { children.delete(child); resolve({ args, home: selectedHome, code, signal, stdout, stderr }); });
  });
  report.commands.push(output); assert.equal(output.code, expected, `${args[0]} exit. ${output.stdout} ${output.stderr}`);
  const parsed = JSON.parse(output.stdout); assert.equal(parsed.ok, expected !== 2, output.stdout); return parsed.data ?? parsed;
};
const scenario = (name, detail) => report.scenarios.push({ name, detail, status: 'passed' });
const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const review = data => data.responsibilities[0].record;
const reconcile = async (id, expected = 0, imports = null, selectedHome = home, asOf = now()) => run(['reconcile', '--id', id, '--as-of', asOf, ...(imports ? ['--import', await fixture(`import-${randomUUID()}.json`, { schemaVersion: 1, records: imports })] : [])], expected, selectedHome);
try {
  for (const path of ['registry', 'docs', '.agents']) await cp(join(sourceRoot, path), join(root, path), { recursive: true });
  await mkdir(home, { recursive: true }); await mkdir(join(root, 'bin'));
  for (const name of ['gh', 'codex', 'curl', 'ssh']) await writeFile(join(root, 'bin', name), `#!/bin/sh\necho invoked >> '${join(home, 'executor-invoked')}'\nexit 99\n`, { mode: 0o755 });
  await writeFile(join(root, '.gitignore'), '.local/\nbin/\n');
  git(['init', '-q']); git(['config', 'user.email', 'fixture@example.invalid']); git(['config', 'user.name', 'Synthetic fixture']); git(['remote', 'add', 'origin', 'https://example.invalid/fixture']); git(['add', '.']); git(['commit', '-qm', 'Synthetic fixture baseline']);
  const actual = await inspectRepository(root);
  const target = { projectId: 'fixture', repository: actual.repository, executor: 'local-codex', hostId: 'fixture-host', nativeProjectId: 'native-fixture', ...actual };
  const bindings = { schemaVersion: 1, localHostId: target.hostId, hosts: { [target.hostId]: { label: 'Synthetic host', machine: hostname() } }, projects: { fixture: { label: 'Synthetic project', hostId: target.hostId, nativeProjectId: target.nativeProjectId, path: target.path, repository: target.repository } } };
  await writeFile(join(home, 'bindings.json'), JSON.stringify(bindings));
  assert.equal((await run(['help', '--json'])).commands.length, 9);
  assert.deepEqual((await run(['help'])).commands.map(item => item.name), commands.map(item => item.name));
  await run(['doctor']); await run(['catalog']); await run(['snapshot'], 2); await run(['help', '--bogus'], 2);
  scenario('orientation', 'Nine commands, doctor in isolated repository, catalog and rejected legacy/unknown options.');
  const artifact = join(home, 'artifact.txt'); const original = 'Expected fixture bytes\n'; await writeFile(artifact, original);
  const definition = { id: 'self-check', parents: [], goal: 'Retain the expected local artifact and detect damage.', context: 'Synthetic responsibility survives a fresh process without a prior conversation.', action: 'verify', resource: 'fixture', destination: 'local-evidence', target, authorityRef: { reference: 'Synthetic owner request', action: 'verify', resource: 'fixture', destination: 'local-evidence' }, criteria: [{ id: 'artifact', description: 'Actual bytes match the retained expectation.', evidence: 'local-digest', path: artifact, sha256: digest(original) }], freshness: { maxAgeMs: 86400000, sources: [] }, reviewAt: '2099-01-01T00:00:00Z', feature: { id: 'artifact-watch', method: 'Compare expected local bytes.', intendedEffect: 'Maintain expected artifact bytes.', reviewAt: '2099-01-01T00:00:00Z' }, lifecycle: { status: 'active' } };
  const adopted = await run(['responsibility', '--file', await fixture('definition.json', definition)]);
  assert.equal((await run(['responsibility', '--file', await fixture('definition-replay.json', definition)])).hash, adopted.hash);
  const nativeReport = { type: 'observation', responsibilityId: definition.id, subject: target, observedAt: now(), observer: 'Synthetic native readback', category: 'tasks', availability: 'available', coverage: { complete: true, gaps: [] }, claims: [], evidenceRefs: [] };
  const first = review(await reconcile(definition.id, 0, [nativeReport]));
  const restart = review(await reconcile(definition.id, 0, [nativeReport]));
  assert.equal(first.goal, definition.goal); assert.equal(restart.context, definition.context);
  assert.equal(first.proposals[0].effectKey, restart.proposals[0].effectKey);
  assert.equal(new Set(restart.findings.map(item => item.id)).size, restart.findings.length);
  assert.ok(Date.parse(restart.asOf) >= Date.parse(restart.requestedAsOf));
  assert.equal(restart.observations.filter(item => item.category === 'tasks').length, 1);
  scenario('persistent-context', 'Adopt, immutable repeat import, fresh processes and same retained context/effect key. Actual live completion determines effective cutoff.');
  await writeFile(artifact, 'Corrupted fixture bytes\n');
  const detected = review(await reconcile(definition.id, 3));
  const finding = detected.findings.find(item => item.code === 'criterion-failed'); assert.ok(finding); assert.equal(finding.status, 'open');
  assert.equal(detected.corrections.some(item => item.kind === 'regression' && item.priorReviewHash === first.hash), true);
  const failedObservation = finding.failureRefs[0];
  const repair = { type: 'repair', responsibilityId: definition.id, findingId: finding.id, failureRefs: finding.failureRefs, author: 'Synthetic repair author', changeRef: 'Attempted correction one left bytes damaged.', expectedSubject: target, recheckRefs: [failedObservation], observedAt: now() };
  const failed = review(await reconcile(definition.id, 3, [repair]));
  assert.equal(failed.findings.find(item => item.id === finding.id).status, 'open');
  const repeated = review(await reconcile(definition.id, 3, [{ ...repair, changeRef: 'Attempted correction two still left bytes damaged.', observedAt: now() }]));
  assert.equal(repeated.proposals[0].type, 'diagnose');
  assert.equal(repeated.findings.find(item => item.id === finding.id).failedRepairs, 2);
  await writeFile(artifact, original);
  const rechecked = review(await reconcile(definition.id, 3));
  const passingRef = rechecked.observations.filter(item => item.category === 'criteria').sort((left, right) => left.ageMs - right.ageMs)[0].hash;
  const corrected = review(await reconcile(definition.id, 0, [{ ...repair, changeRef: 'Restored the exact retained artifact bytes.', recheckRefs: [passingRef], observedAt: now() }]));
  assert.equal(corrected.findings.find(item => item.id === finding.id).status, 'resolved');
  assert.equal(corrected.repairs.filter(item => !item.valid).length, 2);
  assert.equal(corrected.repairs.filter(item => item.valid).length, 1);
  const recovered = review(await reconcile(definition.id));
  assert.equal(recovered.context, definition.context); assert.equal(recovered.findings.find(item => item.id === finding.id).status, 'resolved');
  report.selfCheck = { adopted: adopted.hash, firstReview: first.hash, detectedReview: detected.hash, finding, failedRepairReview: failed.hash, diagnosisReview: repeated.hash, correctedReview: corrected.hash, recoveredReview: recovered.hash, actualArtifact: await readFile(artifact, 'utf8') };
  scenario('self-check-repair', 'Actual corruption discovered without supplied failure; two failed repairs survive restart and trigger diagnosis; matching current recheck closes exact retained finding.');
  assert.equal((await readdir(home)).includes('executor-invoked'), false);
  await cp(join(home, 'records'), join(evidenceDir, 'records'), { recursive: true });
  if (!report.focus) assert.deepEqual(report.scenarios.map(item => item.name).sort(), verification.features.flatMap(feature => feature.scenarios).sort(), 'Every mapped CLI scenario must execute');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  for (const child of children) child.kill('SIGKILL');
  try { await cp(join(home, 'records'), join(evidenceDir, 'retained-records'), { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') report.evidenceCopyError = error.message; }
  await rm(root, { recursive: true, force: true }); report.cleaned = !await readdir(tmpdir()).then(names => names.includes(basename(root)));
  await writeFile(join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: report.status, scenarios: report.scenarios.length, commands: report.commands.length, cleaned: report.cleaned, evidence: join(evidenceDir, 'report.json'), error: report.error?.message })}\n`);
}
