import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest } from '../src/content.mjs';
import { refreshInventory, checkInventory } from '../scripts/skill-inventory.mjs';

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
