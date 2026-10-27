import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, symlink, mkdir, rename, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { briefing, guidancePin } from '../src/briefing.mjs';
import { digest } from '../src/records.mjs';
import { guidanceReleaseFixture } from '../verification/guidance-pin-fixtures.mjs';

async function setup(t) {
  const home = await mkdtemp(join(tmpdir(), 'emmy-guidance-pin-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const fixture = await guidanceReleaseFixture(home);
  let sequence = 0;
  const command = async request => { const file = join(home, `request-${++sequence}.json`); await writeFile(file, JSON.stringify(request)); return guidancePin(home, { file }); };
  return { home, fixture, command };
}
const status = { schemaVersion: 1, action: 'status' };

test('an exact installed local pin drives ordinary briefing without network or canonical source claims', async t => {
  const { home, fixture, command } = await setup(t);
  let fetches = 0; t.mock.method(globalThis, 'fetch', async () => { fetches++; throw new Error('Unexpected network'); });
  assert.equal((await command(status)).status, 'remote-default');
  const active = await command(fixture.request); assert.equal(active.status, 'pinned');
  const output = await briefing(home);
  assert.equal(output.guidance.state, 'pinned'); assert.equal(output.guidance.source, 'approved-local-release');
  assert.equal(output.guidance.digest, fixture.bundle.digest); assert.equal(output.guidance.revision, fixture.request.revision);
  assert.equal(output.guidance.pinDigest, active.pinDigest); assert.equal(fetches, 0);
  for (const key of ['commit', 'tree', 'blob', 'sourceCheckedAt']) assert.equal(Object.hasOwn(output.guidance, key), false);
  assert.ok(output.guidance.verifiedAt); assert.match(output.guidance.text, /emmy-fixture-one/);
  assert.equal((await command(status)).pinDigest, active.pinDigest);
  const draftFile = join(home, 'pinned-draft.json');
  await writeFile(draftFile, JSON.stringify({ schemaVersion: 1, authoredUnder: fixture.bundle.digest, sources: [], coverage: { selection: 'Synthetic empty scoped draft', catalogListed: [], chatsRead: [], repositoriesInspected: [], otherSourcesRead: [], gaps: [] }, correctionReadback: [], entries: [] }));
  const draft = await briefing(home, { file: draftFile });
  assert.equal(draft.status, 'checked');
  const assessment = JSON.parse(await readFile(join(draft.evidence.directory, 'assessment.json'), 'utf8'));
  assert.equal(assessment.guidance.source, 'approved-local-release'); assert.equal(assessment.guidance.sourceCheckedAt, null); assert.equal(assessment.guidance.revision, fixture.request.revision); assert.equal(fetches, 0);
});

test('invalid active source blocks all remote/cache fallback and deactivation still permits recovery', async t => {
  const { home, fixture, command } = await setup(t);
  const active = await command(fixture.request);
  await writeFile(join(fixture.root, 'source.txt'), 'changed source');
  let fetches = 0; t.mock.method(globalThis, 'fetch', async () => { fetches++; throw Error('No fallback'); });
  const blocked = await briefing(home); assert.equal(blocked.guidance.state, 'unavailable');
  assert.equal(blocked.guidance.source, 'approved-local-release'); assert.equal(fetches, 0);
  assert.equal((await command(status)).status, 'unavailable');
  const cleared = await command({ schemaVersion: 1, action: 'deactivate', expectedPinDigest: active.pinDigest });
  assert.equal(cleared.status, 'remote-default'); assert.equal((await command(status)).status, 'remote-default');
  assert.equal(digest(await readFile(join(home, 'guidance-pins', `${active.pinDigest}.json`))), active.pinDigest);
});

test('pin changes compare original state, retain history and support exact release rollback', async t => {
  const { home, fixture, command } = await setup(t);
  const first = await command(fixture.request);
  const other = await guidanceReleaseFixture(home, 'emmy-fixture-two');
  await assert.rejects(command(other.request), /changed/);
  const second = await command({ ...other.request, expectedPinDigest: first.pinDigest });
  assert.match((await briefing(home)).guidance.text, /emmy-fixture-two/);
  await assert.rejects(command({ schemaVersion: 1, action: 'deactivate', expectedPinDigest: first.pinDigest }), /changed/);
  await command({ ...fixture.request, expectedPinDigest: second.pinDigest });
  assert.match((await briefing(home)).guidance.text, /emmy-fixture-one/);
  const archived = await readdir(join(home, 'guidance-pins')); assert.ok(archived.includes(`${first.pinDigest}.json`) && archived.includes(`${second.pinDigest}.json`));
});

test('untrusted release paths, aliases and symlink targets cannot activate', async t => {
  const { home, fixture, command } = await setup(t);
  for (const release of ['../outside', fixture.root, 'current', 'emmy-fixture-one/../other']) await assert.rejects(command({ ...fixture.request, release }));
  await symlink(fixture.root, join(home, 'installed-runners', 'emmy-alias'));
  await assert.rejects(command({ ...fixture.request, release: 'emmy-alias' }), /ordinary/);
  await rename(join(fixture.root, 'docs'), join(fixture.root, 'real-docs'));
  await symlink(join(fixture.root, 'real-docs'), join(fixture.root, 'docs'));
  await assert.rejects(command(fixture.request), /ordinary/);
  assert.equal((await command(status)).status, 'remote-default');
});

test('revision, manifest, bundle and semantic mismatches never replace a valid pin', async t => {
  const { fixture, command } = await setup(t);
  const active = await command(fixture.request);
  for (const key of ['revision', 'installationSha256', 'bundleSha256', 'guidanceDigest']) {
    await assert.rejects(command({ ...fixture.request, expectedPinDigest: active.pinDigest, [key]: 'c'.repeat(key === 'revision' ? 40 : 64) }));
    assert.equal((await command(status)).pinDigest, active.pinDigest);
  }
  await writeFile(join(fixture.root, 'run-agent'), 'modified launcher');
  await assert.rejects(command({ ...fixture.request, expectedPinDigest: active.pinDigest }), /launcher integrity/);
});

test('unsafe manifest paths, foreign private homes and corrupted bundle encoding are refused', async t => {
  for (const mutate of [m => { m.privateHome = '/untrusted'; }, m => { m.files.push({ ...m.files[0] }); }, m => { m.files[0].path = '../outside'; }]) {
    const { fixture, command } = await setup(t); mutate(fixture.manifest);
    const bytes = `${JSON.stringify(fixture.manifest, null, 2)}\n`; await writeFile(join(fixture.root, 'installation.json'), bytes);
    await assert.rejects(command({ ...fixture.request, installationSha256: digest(bytes) }));
  }
  const { fixture, command } = await setup(t);
  const bytes = JSON.stringify(fixture.bundle);
  await writeFile(join(fixture.root, 'docs/briefing-guidance.json'), bytes);
  Object.assign(fixture.manifest.files.find(f => f.path === 'docs/briefing-guidance.json'), { bytes: Buffer.byteLength(bytes), sha256: digest(bytes) });
  const manifest = `${JSON.stringify(fixture.manifest, null, 2)}\n`; await writeFile(join(fixture.root, 'installation.json'), manifest);
  await assert.rejects(command({ ...fixture.request, installationSha256: digest(manifest), bundleSha256: digest(bytes) }), /generated encoding/);
});

test('a symbolic installed-release root is rejected before activation', async t => {
  const { home, fixture, command } = await setup(t);
  await rename(join(home, 'installed-runners'), join(home, 'real-installed-runners'));
  await symlink(join(home, 'real-installed-runners'), join(home, 'installed-runners'));
  await assert.rejects(command(fixture.request), /ordinary/);
  assert.equal((await command(status)).status, 'remote-default');
});

test('pending files and stale administration locks do not activate or silently steal a pin', async t => {
  const { home, fixture, command } = await setup(t);
  await writeFile(join(home, '.pending-guidance-pin-interrupted'), JSON.stringify(fixture.request));
  assert.equal((await command(status)).status, 'remote-default');
  await mkdir(join(home, '.guidance-pin.lock'));
  await assert.rejects(command(fixture.request), /locked/);
  assert.ok((await readdir(home)).includes('.guidance-pin.lock'));
});
