import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { refreshInventory } from '../scripts/skill-inventory.mjs';
import { refreshPrivateSkills, preparePrivateCandidate, verifyPrivateCandidate, preparePrivateSelection, preparePrivateSelectorUpdate, completePrivateSelection, checkPrivateSelection } from '../scripts/private-skill-refresh.mjs';
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
  const candidate = async version => {
    let candidateSnapshot = snapshot, candidateBindings = bindings;
    if (version) {
      const replacement = join(root, 'reviewed-source'); await cp(source, replacement, { recursive: true });
      await writeFile(join(replacement, 'plugin.json'), JSON.stringify({ ...metadata, version }));
      policy.sources[0].version = version;
      await writeFile(join(repo, 'registry/skill-sources.json'), JSON.stringify(policy));
      candidateBindings = { fixture: replacement };
      candidateSnapshot = (await refreshInventory(repo, candidateBindings)).snapshot;
      git('add', 'registry', 'vendor'); await rm(source, { recursive: true });
    }
    git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'reviewed candidate fixture');
    const revision = git('rev-parse', 'HEAD');
    const bytes = Buffer.from(`${canonical(buildFoundation(repo, revision))}\n`);
    const path = join(root, 'candidate.json'); await writeFile(path, bytes);
    return { path, revision, bytes: bytes.length, sha256: digest(bytes), snapshot: candidateSnapshot, bindings: candidateBindings, approvalRef: 'synthetic-review-fixture' };
  };
  return { root, source, config, capture, now, raw, rawPath, metadata, run, preserve, candidate };
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

test('new immutable upload request and exact readback never select the candidate or overwrite the accepted capsule', async t => {
  const f = await fixture(t), candidate = await f.candidate(), attempt = join(f.root, 'upload');
  const request = await preparePrivateCandidate(f.config, f.capture, candidate, attempt, f.now);
  assert.equal(request.status, 'awaiting-upload');
  assert.equal(request.upload.parent_folder_id, f.config.cloud.parentId);
  const receipt = { fileId: 'new-file', requestSha256: request.requestSha256 };
  const capture = structuredClone(f.capture);
  capture.rawPath = candidate.path; capture.file.id = receipt.fileId; capture.file.size = String(candidate.bytes);
  const result = await verifyPrivateCandidate(attempt, receipt, capture, f.now);
  assert.equal(result.status, 'candidate-verified');
  assert.equal(result.selectionChanged, false);
  assert.equal(result.activation, 'held-consumer-acceptance');
  assert.deepEqual(await readFile(f.config.capsulePath), f.raw);
  assert.deepEqual(await readFile(f.rawPath), f.raw);
  await assert.rejects(preparePrivateCandidate(f.config, f.capture, candidate, attempt, f.now), /EEXIST/);
});

for (const [name, change, pattern] of [
  ['uncertain upload identity', (receipt) => { receipt.fileId = ''; }, /receipt/],
  ['last-good overwrite', (receipt) => { receipt.fileId = 'accepted-file'; }, /receipt/],
  ['wrong upload request', (receipt) => { receipt.requestSha256 = '0'.repeat(64); }, /receipt/],
  ['wrong raw bytes', (_receipt, capture, f) => { capture.rawPath = f.rawPath; }, /raw hash/],
  ['wrong private parent', (_receipt, capture) => { capture.file.parent_ids = ['other']; }, /parent/],
  ['expanded candidate permissions', (_receipt, capture) => { capture.file.shared = true; }, /identity/],
]) test(`${name} preserves pending upload and accepted cloud consumer`, async t => {
  const f = await fixture(t), candidate = await f.candidate(), attempt = join(f.root, 'upload');
  const request = await preparePrivateCandidate(f.config, f.capture, candidate, attempt, f.now);
  const original = await readFile(join(attempt, 'upload-request.json'));
  const receipt = { fileId: 'new-file', requestSha256: request.requestSha256 };
  const capture = structuredClone(f.capture);
  capture.rawPath = candidate.path; capture.file.id = receipt.fileId; capture.file.size = String(candidate.bytes);
  change(receipt, capture, f);
  await assert.rejects(verifyPrivateCandidate(attempt, receipt, capture, f.now), pattern);
  assert.deepEqual(await readFile(join(attempt, 'upload-request.json')), original);
  assert.deepEqual(await readFile(f.config.capsulePath), f.raw);
  assert.deepEqual(await readFile(f.rawPath), f.raw);
  await assert.rejects(readFile(join(attempt, 'candidate-verified.json')), /ENOENT/);
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

async function selectorFixture(t, version) {
  const f = await fixture(t), candidate = await f.candidate(version), candidateAttempt = join(f.root, 'candidate-attempt');
  const request = await preparePrivateCandidate(f.config, f.capture, candidate, candidateAttempt, f.now);
  const candidateCapture = structuredClone(f.capture);
  candidateCapture.rawPath = candidate.path; candidateCapture.file.id = 'new-capsule'; candidateCapture.file.size = String(candidate.bytes);
  await verifyPrivateCandidate(candidateAttempt, { fileId: 'new-capsule', requestSha256: request.requestSha256 }, candidateCapture, f.now);
  const accepted = { ...f.config.consumer, bytes: f.config.cloud.bytes };
  const old = { schemaVersion: 1, kind: 'emmy-private-skill-selection', generation: 0, selected: accepted, previous: null, approvalRef: 'synthetic-initial' };
  const oldBytes = `${JSON.stringify(old, null, 2)}\n`, oldPath = join(f.root, 'old-selector.json'); await writeFile(oldPath, oldBytes);
  const config = { home: join(f.root, 'selection-home'), bindings: f.config.bindings, parentId: f.config.cloud.parentId, owner: f.config.cloud.owner, accepted, selector: { fileId: 'current-selector', sha256: digest(oldBytes), bytes: Buffer.byteLength(oldBytes), generation: 0 }, history: { fileId: 'initial-history', sha256: digest(oldBytes), bytes: Buffer.byteLength(oldBytes) } };
  await mkdir(config.home); await writeFile(join(config.home, 'current.json'), JSON.stringify(config));
  const capture = (fileId, path, bytes) => ({ ...structuredClone(f.capture), rawPath: path, file: { ...structuredClone(f.capture.file), id: fileId, size: String(bytes) } });
  const captures = { selector: capture(config.selector.fileId, oldPath, config.selector.bytes), history: capture(config.history.fileId, oldPath, config.history.bytes), candidate: candidateCapture };
  const attempt = join(f.root, 'selection-attempt');
  const pending = await preparePrivateSelection(config, captures, candidateAttempt, attempt, f.now);
  const next = capture('new-history', join(attempt, 'selection.json'), pending.bytes);
  const update = await preparePrivateSelectorUpdate(attempt, { fileId: 'new-history' }, next, f.now);
  const finalCaptures = { selector: { ...next, file: { ...next.file, id: config.selector.fileId } }, history: next, candidate: candidateCapture };
  return { ...f, config, captures, finalCaptures, candidateAttempt, attempt, pending, update, oldBytes };
}

test('single writer selects only a fully read-back private capsule and immutable history, then repeat converges', async t => {
  const f = await selectorFixture(t);
  assert.equal(f.update.fileId, f.config.selector.fileId);
  await assert.rejects(preparePrivateSelection(f.config, f.captures, f.candidateAttempt, join(f.root, 'second-writer'), f.now), /EEXIST/);
  const result = await completePrivateSelection(f.attempt, f.finalCaptures, f.now);
  assert.equal(result.binding.accepted.fileId, 'new-capsule');
  assert.deepEqual(result.priorBinding, f.config);
  assert.equal(result.consumer.reads.length, 5);
  assert.deepEqual(await completePrivateSelection(f.attempt, f.finalCaptures, f.now), result);
  assert.equal((await checkPrivateSelection(result.binding, f.finalCaptures, join(f.root, 'daily-check'), f.now)).operation, 'unchanged');
  assert.equal(await readFile(f.captures.selector.rawPath, 'utf8'), f.oldBytes);
  assert.deepEqual(await readFile(f.rawPath), f.raw);
});

test('explicitly reviewed replacement source version selects its new pinned snapshot while the missing old installation stays absent', async t => {
  const f = await selectorFixture(t, '2');
  await assert.rejects(readFile(join(f.source, 'plugin.json')), /ENOENT/);
  const result = await completePrivateSelection(f.attempt, f.finalCaptures, f.now);
  assert.notEqual(result.binding.accepted.snapshot, f.config.accepted.snapshot);
  assert.notEqual(result.binding.bindings.fixture, f.config.bindings.fixture);
  assert.equal((await checkPrivateSelection(result.binding, f.finalCaptures, join(f.root, 'version2-check'), f.now)).status, 'complete');
  assert.deepEqual(await readFile(f.rawPath), f.raw);
});

for (const [name, change, pattern] of [
  ['uncertain selector write still reads old bytes', f => { f.finalCaptures.selector.rawPath = f.captures.selector.rawPath; }, /raw hash/],
  ['candidate transport corruption', f => { f.finalCaptures.candidate.rawPath = f.rawPath; }, /raw hash/],
  ['new history corruption', f => { f.finalCaptures.history.rawPath = f.captures.history.rawPath; }, /raw hash/],
  ['wrong selector identity', f => { f.finalCaptures.selector.file.id = 'other'; }, /identity/],
  ['expanded selector access', f => { f.finalCaptures.selector.file.shared = true; }, /identity/],
  ['source dependency changed before acceptance', f => writeFile(join(f.source, 'skills/leaf/reference.md'), 'Changed'), /Unreviewed/],
]) test(`${name} keeps prior local selection, old capsule and writer claim`, async t => {
  const f = await selectorFixture(t), before = await readFile(join(f.config.home, 'current.json'));
  await change(f);
  await assert.rejects(completePrivateSelection(f.attempt, f.finalCaptures, f.now), pattern);
  assert.deepEqual(await readFile(join(f.config.home, 'current.json')), before);
  assert.deepEqual(await readFile(f.rawPath), f.raw);
  assert.equal(await readFile(f.captures.selector.rawPath, 'utf8'), f.oldBytes);
  assert.equal(JSON.parse(await readFile(join(f.config.home, 'writer.lock/owner.json'))).attempt, f.attempt);
});

test('postselection diagnostic failure resolves by exact readback without a second selector write', async t => {
  const f = await selectorFixture(t);
  const original = fs.promises.writeFile;
  fs.promises.writeFile = async (path, ...args) => {
    if (path === join(f.attempt, 'selection-result.json')) throw new Error('Injected postselection diagnostic failure');
    return original(path, ...args);
  };
  syncBuiltinESMExports();
  try { await assert.rejects(completePrivateSelection(f.attempt, f.finalCaptures, f.now), /Injected postselection/); }
  finally { fs.promises.writeFile = original; syncBuiltinESMExports(); }
  assert.equal(JSON.parse(await readFile(join(f.config.home, 'current.json'))).accepted.fileId, 'new-capsule');
  assert.equal((await completePrivateSelection(f.attempt, f.finalCaptures, f.now)).status, 'selected');
  assert.deepEqual(await readFile(f.rawPath), f.raw);
});
