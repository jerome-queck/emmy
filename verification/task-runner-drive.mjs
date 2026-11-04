import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm, symlink, readlink, realpath, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixtureTarget, fixtureCaller, hash } from './task-runner-fixtures.mjs';
import { taskWorkflowFixture } from './task-workflow-drive.mjs';

export async function driveTaskRunner({ sourceRoot, home, scenario, report, evidenceDir }) {
  await mkdir(join(home, 'task-caller-drive')); const root = await realpath(join(home, 'task-caller-drive'));
  const privateHome = join(root, 'home'); await mkdir(privateHome);
  const evidence = join(evidenceDir, 'task-runner'); await mkdir(evidence); report.retainedTaskRunner = evidence;
  const baseline = await fixtureTarget(root, 'baseline', privateHome, { sourceRoot });
  const selected = await fixtureTarget(root, 'selected', privateHome, { sourceRoot, revision: '2'.repeat(40) });
  const caller = await fixtureCaller(root, sourceRoot, baseline);
  await mkdir(join(privateHome, 'installed-runners'));
  await symlink('independent-shared-release', join(privateHome, 'installed-runners/current'));
  const protectedFiles = ['bindings.json', 'guidance-pin.json', 'reporting-deployment.json'];
  for (const name of protectedFiles) await writeFile(join(privateHome, name), name === 'bindings.json' ? '{"schemaVersion":1,"hosts":{},"projects":{}}\n' : '{"schemaVersion":1}\n');
  const before = Object.fromEntries(await Promise.all(protectedFiles.map(async name => [name, hash(await readFile(join(privateHome, name)))])));
  let counter = 0;
  async function run(name, args, exit) {
    const result = spawnSync(caller.launcher, args, { encoding: 'utf8' });
    const retained = { args, stdout: result.stdout, stderr: result.stderr, exit: result.status, signal: result.signal, error: result.error?.message };
    await writeFile(join(evidence, `${++counter}-${name}.json`), `${JSON.stringify(retained, null, 2)}\n`);
    assert.equal(result.status, exit, `${name}: ${result.stderr}`); return result;
  }
  const health = await run('baseline-doctor', ['doctor'], 0);
  assert.equal(JSON.parse(health.stdout).data.runtimeSupported, true);
  assert.equal(JSON.parse(health.stderr).selection, 'baseline');
  const original = taskWorkflowFixture(); const envelope = join(evidence, 'original-envelope.json'); await writeFile(envelope, JSON.stringify(original));
  const fallback = await run('baseline-task', ['task-workflow', '--file', envelope], 0); assert.equal(JSON.parse(fallback.stdout).data.status, 'prepared');
  await writeFile(caller.selection, JSON.stringify({ schemaVersion: 1, target: selected }));
  const consumed = await run('selected-task', ['task-workflow', '--file', envelope], 0);
  assert.equal(JSON.parse(consumed.stderr).revision, selected.revision); assert.equal(JSON.parse(consumed.stderr).sourceRoot, selected.sourceRoot);
  assert.equal(JSON.parse(consumed.stdout).data.status, 'prepared'); assert.equal(JSON.parse(consumed.stdout).data.accepted, false);
  assert.equal(consumed.stdout, fallback.stdout);
  original.record.native.state = 'uncertain'; await writeFile(envelope, JSON.stringify(original));
  const uncertain = await run('selected-uncertainty', ['task-workflow', '--file', envelope], 3);
  assert.equal(JSON.parse(uncertain.stdout).data.status, 'rediscovery-only'); assert.equal(JSON.parse(uncertain.stdout).data.automaticRetry, false);
  await run('override-refusal', ['task-workflow', '--file', envelope, '--home', privateHome], 2);
  await writeFile(caller.selection, '{'); const invalid = await run('invalid-active-refusal', ['doctor'], 2); assert.equal(invalid.stdout, '');
  await rm(caller.selection); const restored = await run('baseline-restored', ['task-workflow', '--file', envelope], 3); assert.equal(JSON.parse(restored.stderr).selection, 'baseline');
  const after = Object.fromEntries(await Promise.all(protectedFiles.map(async name => [name, hash(await readFile(join(privateHome, name)))])));
  assert.deepEqual(after, before); assert.equal(await readlink(join(privateHome, 'installed-runners/current')), 'independent-shared-release');
  await writeFile(join(evidence, 'fixture-identity.json'), JSON.stringify({ baseline, selected, sourceIdentities: 'synthetic supplied revisions; actual local source snapshots', before, after, sharedCurrent: 'independent-shared-release' }, null, 2));
  await writeFile(join(evidence, 'task-caller.json'), await readFile(caller.binding)); await writeFile(join(evidence, 'run-task-agent'), await readFile(caller.launcher));
  await writeFile(join(evidence, 'baseline-manifest.json'), await readFile(baseline.sourceManifest)); await writeFile(join(evidence, 'selected-manifest.json'), await readFile(selected.sourceManifest));
  const retainedFiles = await Promise.all((await readdir(evidence)).map(async name => ({ path: name, sha256: hash(await readFile(join(evidence, name))) })));
  report.taskRunner = { commands: counter, nativeCalls: 0, accepted: false, protectedFiles: before, retainedFiles };
  scenario('task-runner-selection', 'Same stable task caller consumes verified baseline/selected real task-workflow, retains uncertainty and refusal, and leaves shared selections unchanged. Synthetic source identities only.');
}
