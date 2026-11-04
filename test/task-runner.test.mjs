import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { selectTaskRunner, taskCallerArguments, taskCallerLauncher } from '../src/task-runner.mjs';
import { fixtureTarget, fixtureCaller, hash } from '../verification/task-runner-fixtures.mjs';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
async function fixture(t, options) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'emmy-task-caller-'))); t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'); await mkdir(home);
  const baseline = await fixtureTarget(root, 'baseline', home, options); const caller = await fixtureCaller(root, sourceRoot, baseline);
  const selected = await fixtureTarget(root, 'selected', home, { revision: '2'.repeat(40) });
  const activate = () => writeFile(caller.selection, JSON.stringify({ schemaVersion: 1, target: selected }));
  const run = args => spawnSync(caller.launcher, args, { encoding: 'utf8' });
  return { root, baseline, selected, ...caller, activate, run };
}

test('same ordinary launcher consumes selected source and fixed home; absence returns verified baseline', async t => {
  const f = await fixture(t); const first = f.run(['doctor']); assert.equal(first.status, 0);
  assert.equal(JSON.parse(first.stderr).selection, 'baseline');
  assert.equal(JSON.parse(first.stdout).source, 'baseline');
  await f.activate(); const second = f.run(['doctor']); assert.equal(second.status, 0);
  assert.equal(JSON.parse(second.stderr).revision, f.selected.revision);
  assert.equal(JSON.parse(second.stderr).selection, 'selected');
  assert.equal(JSON.parse(second.stdout).source, 'selected');
  assert.deepEqual(JSON.parse(second.stdout).args, ['doctor', '--home', f.home, '--root', f.selected.sourceRoot]);
  await rm(f.selection); assert.equal(JSON.parse(f.run(['doctor']).stderr).selection, 'baseline');
});

test('an older baseline unknown-command refusal remains until selected executable is consumed', async t => {
  const f = await fixture(t, { source: 'process.stdout.write("Unknown command task-workflow\\n");process.exitCode=2;\n' });
  const before = f.run(['task-workflow', '--file', '/synthetic-envelope.json']); assert.equal(before.status, 2); assert.equal(before.stdout, 'Unknown command task-workflow\n');
  assert.equal(JSON.parse(before.stderr).selection, 'baseline');
  await f.activate(); const after = f.run(['task-workflow', '--file', '/synthetic-envelope.json']); assert.equal(after.status, 0); assert.equal(JSON.parse(after.stdout).source, 'selected');
});

test('invalid active selection never falls back, including selected missing dependencies', async t => {
  const f = await fixture(t);
  for (const bytes of ['', '{', JSON.stringify({ schemaVersion: 2, target: f.selected }), JSON.stringify({ schemaVersion: 1, target: f.selected, extra: true })]) {
    await writeFile(f.selection, bytes); const result = f.run(['doctor']); assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.equal(JSON.parse(result.stderr).execution, 'none');
  }
  await f.activate(); await rm(f.selected.sourceManifest); const missing = f.run(['doctor']); assert.equal(missing.status, 2); assert.equal(missing.stdout, '');
});

test('source/runtime/home identity mismatches refuse before any child output', async t => {
  const f = await fixture(t);
  for (const target of [{ ...f.selected, revision: '3'.repeat(40) }, { ...f.selected, sourceManifestSha256: '0'.repeat(64) }, { ...f.selected, runtimeSha256: '0'.repeat(64) }]) {
    await writeFile(f.selection, JSON.stringify({ schemaVersion: 1, target })); assert.equal(f.run(['doctor']).stdout, ''); assert.equal(f.run(['doctor']).status, 2);
  }
  const manifest = JSON.parse(await readFile(f.selected.sourceManifest)); manifest.privateHome = f.root;
  const bytes = Buffer.from(JSON.stringify(manifest)); await writeFile(f.selected.sourceManifest, bytes); f.selected.sourceManifestSha256 = hash(bytes);
  await f.activate(); await assert.rejects(selectTaskRunner(f.binding), /private-home/);
});

test('source corruption, entry omission and omitted executable dependency refuse', async t => {
  const f = await fixture(t); await f.activate();
  const entry = join(f.selected.sourceRoot, 'scripts/agent.mjs'); const original = await readFile(entry);
  await writeFile(entry, 'process.exit(0)'); await assert.rejects(selectTaskRunner(f.binding), /integrity/); await writeFile(entry, original);
  await writeFile(join(f.selected.sourceRoot, 'src/hidden.mjs'), 'export default 1'); await assert.rejects(selectTaskRunner(f.binding), /omits executable/); await rm(join(f.selected.sourceRoot, 'src/hidden.mjs'));
  const manifest = JSON.parse(await readFile(f.selected.sourceManifest)); manifest.files = [{ path: 'src/empty.mjs', bytes: 0, sha256: hash('') }];
  await writeFile(join(f.selected.sourceRoot, 'src/empty.mjs'), ''); const bytes = Buffer.from(JSON.stringify(manifest)); await writeFile(f.selected.sourceManifest, bytes); f.selected.sourceManifestSha256 = hash(bytes); await f.activate();
  await assert.rejects(selectTaskRunner(f.binding), /omits entry/);
});

test('symbolic selections, source directories and executable files refuse', async t => {
  const f = await fixture(t); await f.activate(); const selectionBytes = await readFile(f.selection); await rm(f.selection);
  const other = join(f.root, 'other.json'); await writeFile(other, selectionBytes); await symlink(other, f.selection); await assert.rejects(selectTaskRunner(f.binding)); await rm(f.selection);
  const alias = join(f.root, 'alias'); await symlink(f.selected.sourceRoot, alias); f.selected.sourceRoot = alias; await f.activate(); await assert.rejects(selectTaskRunner(f.binding), /ordinary ancestors/);
  f.selected.sourceRoot = join(f.root, 'selected'); const entry = join(f.selected.sourceRoot, 'scripts/agent.mjs'); const content = await readFile(entry); await rm(entry); await writeFile(join(f.root, 'entry.mjs'), content); await symlink(join(f.root, 'entry.mjs'), entry); await f.activate(); await assert.rejects(selectTaskRunner(f.binding));
});

test('catalog and doctor runtime data cannot be omitted or changed outside manifest', async t => {
  const f = await fixture(t); await f.activate();
  const original = await readFile(f.selected.sourceManifest); const manifest = JSON.parse(original);
  for (const path of ['registry/catalog.json', 'docs/operating-brief.md', '.agents/skills/sign-in/SKILL.md', 'package.json']) {
    const changed = { ...manifest, files: manifest.files.filter(row => row.path !== path) }; const raw = Buffer.from(JSON.stringify(changed));
    await writeFile(f.selected.sourceManifest, raw); f.selected.sourceManifestSha256 = hash(raw); await f.activate(); await assert.rejects(selectTaskRunner(f.binding), /required runtime data/);
  }
  await writeFile(f.selected.sourceManifest, original); f.selected.sourceManifestSha256 = hash(original); await f.activate();
  await writeFile(join(f.selected.sourceRoot, 'registry/catalog.json'), 'changed task behavior'); await assert.rejects(selectTaskRunner(f.binding), /integrity/);
});

test('all home/root/binding overrides and non-task commands refuse', async t => {
  const f = await fixture(t);
  for (const args of [['briefing'], ['reconcile'], ['doctor', '--home', f.root], ['doctor', '--home=x'], ['doctor', '--root', f.root], ['doctor', '--root=x'], ['doctor', '--binding', f.binding], ['doctor', '--json', '--json'], ['task-workflow', '--file']]) {
    assert.throws(() => taskCallerArguments(args)); const result = f.run(args); assert.equal(result.status, 2); assert.equal(result.stdout, '');
  }
});

test('child stdout and nonzero exit survive; no fallback after child failure or signal', async t => {
  const f = await fixture(t, { source: 'process.stdout.write("original-byte-output\\n"); process.exitCode=3;\n' });
  const result = f.run(['doctor']); assert.equal(result.status, 3); assert.equal(result.stdout, 'original-byte-output\n');
  const signalled = await fixtureTarget(f.root, 'signalled', f.home, { source: 'process.kill(process.pid,"SIGTERM");\n' });
  await writeFile(f.selection, JSON.stringify({ schemaVersion: 1, target: signalled })); const stopped = f.run(['doctor']);
  assert.equal(stopped.status, 143); assert.equal(stopped.stdout, ''); assert.equal(JSON.parse(stopped.stderr.trim().split('\n').at(-1)).signal, 'SIGTERM');
});

test('child preload environment is cleared and launcher shell-quotes paths', async t => {
  const f = await fixture(t, { source: 'process.stdout.write(JSON.stringify([process.env.NODE_OPTIONS,process.env.NODE_PATH]));\n' });
  const launcher = taskCallerLauncher({ runtime: f.baseline.runtime, caller: join(sourceRoot, 'scripts/task-agent.mjs'), binding: f.binding }); assert.match(launcher, /--binding/);
  assert.match(taskCallerLauncher({ runtime: "/a'b", caller: '/c', binding: '/d' }), /a'\\''b/);
  const result = spawnSync(f.launcher, ['doctor'], { encoding: 'utf8', env: { ...process.env, NODE_PATH: '/untrusted', NODE_OPTIONS: '--require /missing-untrusted-preload' } }); assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout), ['', '']);
});

test('spawn error is retained without running the valid baseline', async t => {
  const f = await fixture(t); const runtime = join(f.root, 'missing-interpreter'); await writeFile(runtime, '#!/nonexistent-task-runtime\n', { mode: 0o700 });
  f.selected.runtime = runtime; f.selected.runtimeSha256 = hash(await readFile(runtime)); await f.activate();
  const result = f.run(['doctor']); assert.equal(result.status, 2); assert.equal(result.stdout, '');
  const receipts = result.stderr.trim().split('\n').map(row => JSON.parse(row)); assert.equal(receipts[0].selection, 'selected'); assert.equal(receipts[1].status, 'spawn-error'); assert.equal(receipts[1].automaticRetry, false);
});
