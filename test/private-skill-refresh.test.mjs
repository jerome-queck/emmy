import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { refreshInventory } from '../scripts/skill-inventory.mjs';
import { refreshPrivateSkills } from '../scripts/private-skill-refresh.mjs';
import { buildFoundation } from '../src/foundation-release.mjs';
import { canonical, digest } from '../src/content.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'emmy-private-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), source = join(root, 'source');
  for (const path of [repo, join(repo, 'registry'), join(repo, 'src'), join(repo, 'scripts'), join(source, 'skills/leaf')]) await mkdir(path, { recursive: true });
  const sourceFiles = { 'LICENSE': 'Synthetic MIT notice', 'skills/leaf/SKILL.md': '[Dependency](reference.md)', 'skills/leaf/reference.md': 'Synthetic dependency' };
  for (const [path, bytes] of Object.entries(sourceFiles)) await writeFile(join(source, path), bytes);
  const metadata = { name: 'fixture', repository: 'https://github.com/example/fixture', version: '1', license: 'MIT' };
  await writeFile(join(source, 'plugin.json'), JSON.stringify(metadata));
  const policy = { schemaVersion: 1, sources: [{ id: 'fixture', origin: metadata.repository, package: 'fixture', version: '1', revision: null, metadata: 'plugin.json', license: 'MIT', notices: ['LICENSE'], skills: [{ path: 'skills/leaf/SKILL.md', dependencies: ['skills/leaf/reference.md'] }], files: Object.entries(sourceFiles).map(([path, bytes]) => ({ path, sha256: digest(bytes) })) }] };
  await writeFile(join(repo, 'registry/skill-sources.json'), JSON.stringify(policy));
  const bindings = { fixture: source };
  const { snapshot } = await refreshInventory(repo, bindings);
  for (const path of ['src/automation-plan.mjs', 'src/briefing-core.mjs', 'src/briefing-acquisition.mjs', 'src/operating-contract.mjs', 'scripts/agent.mjs']) await writeFile(join(repo, path), 'export const fixture = true;\n');
  await writeFile(join(repo, 'LICENSE'), 'Synthetic Emmy licence, separately scoped');
  await writeFile(join(repo, 'THIRD_PARTY_NOTICES.md'), 'Synthetic upstream notices');
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' }).toString().trim();
  git('init', '-q'); git('add', 'src', 'scripts', 'registry', 'vendor', 'LICENSE', 'THIRD_PARTY_NOTICES.md');
  git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  const revision = git('rev-parse', 'HEAD');
  const raw = Buffer.from(`${canonical(buildFoundation(repo, revision))}\n`);
  const capsulePath = join(root, 'accepted.json'), rawPath = join(root, 'cloud.json');
  await writeFile(capsulePath, raw); await writeFile(rawPath, raw);
  const owner = 'fixture@example.invalid', fileId = 'accepted-file', parentId = 'private-parent';
  const permissions = [{ type: 'user', role: 'owner', emailAddress: owner }];
  const config = { schemaVersion: 1, revision, snapshot, capsulePath, bindings, cloud: { fileId, parentId, owner, sha256: digest(raw), bytes: raw.length }, consumer: { fileId, sha256: digest(raw), revision, snapshot } };
  const now = new Date('2026-11-04T15:00:00Z');
  const capture = { observedAt: now.toISOString(), rawPath, file: { id: fileId, shared: false, permissions, parent_ids: [parentId], mime_type: 'application/json', size: String(raw.length) }, parent: { id: parentId, shared: null, mime_type: 'application/vnd.google-apps.folder', permissions } };
  const index = await readFile(join(repo, 'registry/skills.json'));
  let n = 0;
  const run = () => refreshPrivateSkills(config, capture, join(root, `attempt-${++n}`), now);
  const preserve = async () => {
    assert.deepEqual(await readFile(capsulePath), raw);
    assert.deepEqual(await readFile(join(repo, 'registry/skills.json')), index);
    const result = JSON.parse(await readFile(join(root, `attempt-${n}`, 'result.json')));
    assert.equal(result.remoteWrite, false);
    return result;
  };
  return { root, source, config, capture, now, raw, rawPath, metadata, run, preserve };
}

test('repeat refresh validates exact private bytes, preserves source clocks and notices without a remote write', async t => {
  const f = await fixture(t);
  const first = await f.run(), second = await f.run();
  assert.equal(first.operation, 'unchanged');
  assert.equal(first.snapshot, second.snapshot);
  assert.equal(first.sourceObservedAt, second.sourceObservedAt);
  assert.equal(first.reads.length, 5);
  assert.equal((await f.preserve()).status, 'complete');
  assert.deepEqual(await readFile(f.rawPath), f.raw);
});

for (const [name, change, pattern] of [
  ['identity drift', f => writeFile(join(f.source, 'plugin.json'), JSON.stringify({ ...f.metadata, name: 'other' })), /identity/],
  ['version drift', f => writeFile(join(f.source, 'plugin.json'), JSON.stringify({ ...f.metadata, version: '2' })), /version/],
  ['hash drift', f => writeFile(join(f.source, 'skills/leaf/SKILL.md'), 'changed'), /Unreviewed/],
  ['missing source', f => rm(f.source, { recursive: true }), /ENOENT/],
  ['deleted entry', f => unlink(join(f.source, 'skills/leaf/SKILL.md')), /deleted/],
  ['missing dependency', f => unlink(join(f.source, 'skills/leaf/reference.md')), /ENOENT/],
  ['new licence', f => writeFile(join(f.source, 'skills/leaf/LICENSE'), 'Restricted'), /Licence inventory/],
  ['changed notice', f => writeFile(join(f.source, 'LICENSE'), 'Unclear'), /Unreviewed/],
  ['missing notice', f => unlink(join(f.source, 'LICENSE')), /Licence inventory/],
  ['new discovered skill', async f => { await mkdir(join(f.source, 'skills/new')); await writeFile(join(f.source, 'skills/new/SKILL.md'), 'New unselected skill'); }, /Inventory changed/],
  ['wrong cloud id', f => { f.capture.file.id = 'other'; }, /identity/],
  ['wrong parent', f => { f.capture.file.parent_ids = ['other']; }, /parent/],
  ['expanded sharing', f => { f.capture.file.permissions = [...f.capture.file.permissions, { type: 'anyone', role: 'reader' }]; }, /Owner-only/],
  ['shared parent', f => { f.capture.parent.shared = true; }, /identity/],
  ['unknown sharing', f => { f.capture.file.shared = null; }, /identity/],
  ['stale read', f => { f.capture.observedAt = '2026-11-03T15:00:00Z'; }, /Fresh/],
  ['future read', f => { f.capture.observedAt = '2026-11-05T15:00:00Z'; }, /Fresh/],
  ['incomplete raw download', f => writeFile(f.rawPath, f.raw.subarray(0, 10)), /raw hash/],
  ['changed cloud bytes', f => writeFile(f.rawPath, Buffer.alloc(f.raw.length, 32)), /raw hash/],
  ['unknown consumer', f => { f.config.consumer = null; }, /consumer/],
  ['changed consumer pin', f => { f.config.consumer.sha256 = '0'.repeat(64); }, /consumer/],
]) test(`${name} holds and preserves both last-good selections`, async t => {
  const f = await fixture(t); await change(f);
  const cloudBefore = await readFile(f.rawPath);
  await assert.rejects(f.run(), pattern);
  assert.equal((await f.preserve()).status, 'held');
  assert.deepEqual(await readFile(f.rawPath), cloudBefore);
});
