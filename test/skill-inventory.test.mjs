import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink, symlink, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from '../src/content.mjs';
import { refreshInventory, checkInventory } from '../scripts/skill-inventory.mjs';

for (const [name, text, pattern] of [
  ['renamed identity', '---\nname: wrong-skill\n---\nAllowed text', /identity changed/],
  ['rights declaration', 'license: Proprietary', /Unclear rights/],
  ['SPDX declaration', 'SPDX-License-Identifier: GPL-3.0-only', /Unclear rights/],
  ['capability declaration', 'tools: [writer]', /capability scope/],
  ['dependency declaration', '[Missing][ref]\n\n[ref]: missing.md', /Undeclared dependency/],
]) test(`offline dynamic snapshot refuses rehashed ${name}`, async t => {
  const f = await fixture(t);
  f.policy.sources[0].refresh = 'installed';
  f.policy.sources[0].skills[0].name = 'leaf';
  await f.save(); await refreshInventory(f.root, f.bindings);
  const index = JSON.parse(await readFile(join(f.root, 'registry/skills.json')));
  const path = 'fixture/skills/leaf/SKILL.md';
  const file = index.files.find(file => file.path === path);
  file.sha256 = digest(text); file.bytes = Buffer.byteLength(text);
  index.sources[0].files.find(file => file.path === 'skills/leaf/SKILL.md').sha256 = file.sha256;
  const { snapshot: old, observedAt, ...body } = index;
  index.snapshot = digest(body);
  await cp(join(f.root, 'vendor/skills', old), join(f.root, 'vendor/skills', index.snapshot), { recursive: true });
  await writeFile(join(f.root, 'vendor/skills', index.snapshot, path), text);
  await writeFile(join(f.root, 'registry/skills.json'), JSON.stringify(index));
  await assert.rejects(checkInventory(f.root), pattern);
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'emmy-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'installed');
  await mkdir(join(source, 'skills/leaf'), { recursive: true });
  await mkdir(join(root, 'registry'));
  const bytes = { 'LICENSE': 'Synthetic MIT fixture, not a rights claim', 'skills/leaf/SKILL.md': '---\nname: leaf\ndescription: fixture\n---\n[Reference](reference.md)\n', 'skills/leaf/reference.md': 'Synthetic dependency\n' };
  for (const [path, text] of Object.entries(bytes)) await writeFile(join(source, path), text);
  const metadata = { name: 'fixture', repository: 'https://github.com/example/fixture', version: '1', license: 'MIT' };
  await writeFile(join(source, 'plugin.json'), JSON.stringify(metadata));
  const policy = { schemaVersion: 1, sources: [{ id: 'fixture', origin: metadata.repository, package: metadata.name, version: '1', revision: null, metadata: 'plugin.json', license: 'MIT', notices: ['LICENSE'], skills: [{ path: 'skills/leaf/SKILL.md', dependencies: ['skills/leaf/reference.md'] }], files: Object.entries(bytes).map(([path, text]) => ({ path, sha256: digest(text) })) }] };
  const save = () => writeFile(join(root, 'registry/skill-sources.json'), JSON.stringify(policy));
  await save();
  const bindings = { fixture: source };
  await refreshInventory(root, bindings);
  const original = await readFile(join(root, 'registry/skills.json'), 'utf8');
  async function refused(pattern) {
    await assert.rejects(refreshInventory(root, bindings), pattern);
    assert.equal(await readFile(join(root, 'registry/skills.json'), 'utf8'), original);
    assert.equal(JSON.parse(await readFile(join(root, '.local/skill-inventory/last-attempt.json'))).status, 'failed');
  }
  return { root, source, bindings, policy, metadata, save, original, refused };
}

test('reviewed pstack root MIT notice is packaged with the identical nested grant', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const policy = JSON.parse(await readFile(join(root, 'registry/skill-sources.json')));
  const source = policy.sources.find(source => source.id === 'pstack');
  assert.ok(source.notices.includes('LICENSE'), 'Reviewed root LICENSE must be explicit');
  const sha256 = '5b1faca8cef6b7433b49c812c5e9e04bb1eb73b67171d67729983e0b46b9bb78';
  assert.equal(source.files.find(file => file.path === 'LICENSE').sha256, sha256);
  const index = JSON.parse(await readFile(join(root, 'registry/skills.json')));
  const directory = join(root, 'vendor/skills', index.snapshot, 'pstack');
  const bytes = await readFile(join(directory, 'LICENSE'));
  assert.equal(digest(bytes), sha256);
  assert.deepEqual(bytes, await readFile(join(directory, 'skills/poteto-mode/references/licenses/LICENSE')));
  assert.equal((await checkInventory(root)).skills, 4);
});

test('reviewed root notice addition retains exact rights and unknown-notice holds', async t => {
  const f = await fixture(t), source = f.policy.sources[0];
  const nested = 'skills/leaf/LICENSE';
  const grant = await readFile(join(f.source, 'LICENSE'));
  await writeFile(join(f.source, nested), grant);
  await unlink(join(f.source, 'LICENSE'));
  source.refresh = 'installed';
  source.notices = [nested]; source.files[0].path = nested;
  await f.save(); await refreshInventory(f.root, f.bindings);
  const old = JSON.parse(await readFile(join(f.root, 'registry/skills.json')));
  await writeFile(join(f.source, 'LICENSE'), grant);
  await assert.rejects(refreshInventory(f.root, f.bindings), /Licence inventory changed/);
  assert.equal(JSON.parse(await readFile(join(f.root, 'registry/skills.json'))).snapshot, old.snapshot);
  source.notices.unshift('LICENSE');
  source.files.unshift({ path: 'LICENSE', sha256: digest(grant) });
  await f.save();
  const approved = await refreshInventory(f.root, f.bindings);
  assert.notEqual(approved.snapshot, old.snapshot);
  assert.deepEqual(await readFile(join(f.root, 'vendor/skills', approved.snapshot, 'fixture/LICENSE')), grant);
  assert.deepEqual(await readFile(join(f.root, 'vendor/skills', old.snapshot, 'fixture', nested)), grant);
  const lastGood = await readFile(join(f.root, 'registry/skills.json'));
  const refuse = async (path, value, pattern) => {
    const original = await readFile(join(f.source, path)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await writeFile(join(f.source, path), value);
    await assert.rejects(refreshInventory(f.root, f.bindings), pattern);
    assert.deepEqual(await readFile(join(f.root, 'registry/skills.json')), lastGood);
    if (original) await writeFile(join(f.source, path), original);
    else await unlink(join(f.source, path));
  };
  await refuse('LICENSE', 'Changed root grant', /Unreviewed bytes or licence/);
  await refuse(nested, 'Changed old grant', /Unreviewed bytes or licence/);
  await refuse('NOTICE', 'Unknown notice', /Licence inventory changed/);
  await refuse('plugin.json', JSON.stringify({ ...f.metadata, license: 'Proprietary' }), /licence changed/);
  await refuse('skills/leaf/SKILL.md', 'license: unclear', /Unclear rights/);
  assert.equal((await checkInventory(f.root)).snapshot, approved.snapshot);
});

test('complete discovery, repeat convergence and offline consumption without installed sources', async t => {
  const f = await fixture(t);
  assert.equal((await checkInventory(f.root)).skills, 1);
  await refreshInventory(f.root, f.bindings);
  assert.equal(await readFile(join(f.root, 'registry/skills.json'), 'utf8'), f.original);
  await rm(f.source, { recursive: true });
  assert.equal((await checkInventory(f.root)).registration, 'unverified');
});
for (const [name, change, error] of [
  ['missing root', f => rm(f.source, { recursive: true }), /ENOENT/],
  ['deleted approved entry', f => unlink(join(f.source, 'skills/leaf/SKILL.md')), /deleted/],
  ['missing dependency', f => unlink(join(f.source, 'skills/leaf/reference.md')), /ENOENT/],
  ['missing licence', f => unlink(join(f.source, 'LICENSE')), /Licence inventory/],
  ['new overriding licence', f => writeFile(join(f.source, 'skills/leaf/LICENSE'), 'Restricted'), /Licence inventory/],
  ['new dependency file', f => writeFile(join(f.source, 'skills/leaf/new.md'), 'Unreviewed'), /Unreviewed closure/],
  ['licence bytes changed', f => writeFile(join(f.source, 'LICENSE'), 'All rights reserved'), /Unreviewed/],
  ['same version changed bytes', f => writeFile(join(f.source, 'skills/leaf/SKILL.md'), 'changed'), /Unreviewed/],
  ['wrong source identity', f => writeFile(join(f.source, 'plugin.json'), JSON.stringify({ ...f.metadata, repository: 'https://github.com/other/repo' })), /identity/],
  ['version changed', f => writeFile(join(f.source, 'plugin.json'), JSON.stringify({ ...f.metadata, version: '2' })), /version/],
  ['incomplete discovery', f => symlink('/missing-fixture-only', join(f.source, 'skills/unreadable')), /Unsupported/],
  ['nonordinary file', async f => { await unlink(join(f.source, 'skills/leaf/reference.md')); await mkdir(join(f.source, 'skills/leaf/reference.md')); }, /ordinary/],
  ['licence metadata changed', f => writeFile(join(f.source, 'plugin.json'), JSON.stringify({ ...f.metadata, license: 'Proprietary' })), /licence/],
]) test(`${name} preserves last complete snapshot and reports failure`, async t => {
  const f = await fixture(t); await change(f); await f.refused(error);
});
test('new dependency is held even after entry bytes have been reviewed', async t => {
  const f = await fixture(t);
  const text = '[New](missing.md)';
  await writeFile(join(f.source, 'skills/leaf/SKILL.md'), text);
  f.policy.sources[0].files.find(file => file.path.endsWith('SKILL.md')).sha256 = digest(text);
  await f.save();
  await f.refused(/Undeclared dependency/);
});
test('reviewed update and complete policy removal select a new snapshot; old bytes survive', async t => {
  const f = await fixture(t);
  const old = JSON.parse(f.original);
  const text = 'Reviewed updated reference';
  await writeFile(join(f.source, 'skills/leaf/reference.md'), text);
  f.policy.sources[0].files.find(file => file.path.endsWith('reference.md')).sha256 = digest(text);
  await f.save();
  const updated = await refreshInventory(f.root, f.bindings);
  assert.notEqual(updated.snapshot, old.snapshot);
  assert.equal(await readFile(join(f.root, 'vendor/skills', old.snapshot, 'fixture/skills/leaf/reference.md'), 'utf8'), 'Synthetic dependency\n');
  await unlink(join(f.source, 'skills/leaf/reference.md'));
  f.policy.sources[0].skills[0].dependencies = [];
  f.policy.sources[0].files = f.policy.sources[0].files.filter(file => !file.path.endsWith('reference.md'));
  await writeFile(join(f.source, 'skills/leaf/SKILL.md'), 'Reviewed independent skill');
  f.policy.sources[0].files.find(file => file.path.endsWith('SKILL.md')).sha256 = digest('Reviewed independent skill');
  await f.save();
  await refreshInventory(f.root, f.bindings);
  const current = JSON.parse(await readFile(join(f.root, 'registry/skills.json')));
  assert.equal(current.files.some(file => file.path.endsWith('reference.md')), false);
});
test('traversal, corrupted copy, changed policy and forged index fail offline validation', async t => {
  const f = await fixture(t);
  const index = JSON.parse(f.original);
  await writeFile(join(f.root, 'vendor/skills', index.snapshot, index.files[0].path), 'corrupt');
  await assert.rejects(checkInventory(f.root), /Corrupt/);
  index.files[0].path = '../escape';
  const { snapshot, observedAt, ...body } = index;
  index.snapshot = digest(body);
  await writeFile(join(f.root, 'registry/skills.json'), JSON.stringify(index));
  await assert.rejects(checkInventory(f.root), /closure/);
  f.policy.sources[0].files[0].path = '../escape';
  await f.save();
  await assert.rejects(refreshInventory(f.root, f.bindings), /Unsafe/);
});
test('writer lock and interrupted staging never select incomplete data', async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, '.local/skill-inventory/writer.lock'));
  await mkdir(join(f.root, 'vendor/skills/.staging-interrupted'));
  await assert.rejects(refreshInventory(f.root, f.bindings), /EEXIST/);
  assert.equal(await readFile(join(f.root, 'registry/skills.json'), 'utf8'), f.original);
  assert.equal((await checkInventory(f.root)).status, 'complete');
});
test('a partial file read is refused before promotion', async t => {
  const f = await fixture(t);
  const { execFileSync } = await import('node:child_process');
  const script = new URL('../scripts/skill-inventory.mjs', import.meta.url).href;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const original = fs.promises.readFile;
    fs.promises.readFile = async (...args) => {
      const bytes = await original(...args);
      return String(args[0]).endsWith('reference.md') ? bytes.subarray(0, 1) : bytes;
    };
    syncBuiltinESMExports();
    const { refreshInventory } = await import(${JSON.stringify(script)});
    try { await refreshInventory(${JSON.stringify(f.root)}, ${JSON.stringify(f.bindings)}); process.exitCode = 1; }
    catch (error) { if (error.message !== 'Incomplete read') throw error; console.log(error.message); }
  `], { encoding: 'utf8' });
  assert.match(output, /Incomplete read/);
  assert.equal(await readFile(join(f.root, 'registry/skills.json'), 'utf8'), f.original);
});
test('actual fresh CLI check succeeds without registration claims', async t => {
  const { execFileSync } = await import('node:child_process');
  const output = execFileSync(process.execPath, [new URL('../scripts/skill-inventory.mjs', import.meta.url).pathname, 'check'], { encoding: 'utf8' });
  const result = JSON.parse(output);
  assert.equal(result.status, 'complete');
  assert.equal(result.registration, 'unverified');
});
