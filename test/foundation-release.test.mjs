import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFoundation, readFoundation, materializeFoundation } from '../src/foundation-release.mjs';
import { canonical, digest } from '../src/content.mjs';
import { executeBriefing } from '../src/briefing-core.mjs';
import { plan, at } from './fixtures/briefing-policy.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
test('direct source release rebuilds without old capsules and runs exact shared core in a fresh process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emmy-foundation-'));
  try {
    const source = join(directory, 'source'); await mkdir(source);
    await cp(join(root, 'src'), join(source, 'src'), { recursive: true });
    const git = args => execFileSync('git', ['-C', source, ...args], { stdio: 'pipe' }).toString().trim();
    git(['init']); git(['add', 'src']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Synthetic source fixture']);
    const revision = git(['rev-parse', 'HEAD']);
    const first = buildFoundation(source, revision); const second = buildFoundation(source, revision);
    assert.equal(canonical(first), canonical(second));
    assert.ok(first.portable.pure.includes('src/content.mjs'));
    assert.ok(first.portable.acquisition.includes('src/briefing-acquisition.mjs'));
    for (const files of Object.values(first.portable)) for (const name of ['src/records.mjs', 'src/morning.mjs', 'src/fleet.mjs', 'src/bounded-json.mjs', 'src/briefing-cloud-caller.mjs']) assert.ok(!files.includes(name));
    const capsule = join(directory, 'capsule.json'); const bytes = `${canonical(first)}\n`; await writeFile(capsule, bytes);
    const release = await readFoundation(capsule, digest(bytes));
    await assert.rejects(readFoundation(capsule, digest('tampered')), /hash differs/);
    const pure = join(directory, 'pure'); await materializeFoundation(release, pure, 'pure');
    for (const file of release.files.filter(file => release.portable.pure.includes(file.path))) assert.equal(digest(await readFile(join(pure, file.path))), file.sha256);
    assert.equal(executeBriefing({ action: 'foundation', input: {} }).id, 'emmy-operating-foundation');
    const request = { action: 'prepare', input: plan() }; const input = join(directory, 'request.json'); await writeFile(input, JSON.stringify(request));
    const code = `import {readFileSync} from 'node:fs'; import {executeBriefing} from ${JSON.stringify(pathToFileURL(join(pure, release.entries.pure)).href)}; console.log(JSON.stringify(executeBriefing(JSON.parse(readFileSync(process.argv[1])),{now:process.argv[2]})));`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', code, input, at]);
    assert.deepEqual(JSON.parse(output), executeBriefing(request, { now: at }));
    await assert.rejects(materializeFoundation(release, pure, 'pure'), /EEXIST/);
    const tampered = structuredClone(release); tampered.files[0].base64 = Buffer.from('altered').toString('base64');
    await assert.rejects(materializeFoundation(tampered, join(directory, 'tampered'), 'runtime'), /Source bytes differ/);
    const escaped = structuredClone(release); escaped.files[0].path = '../escape';
    await assert.rejects(materializeFoundation(escaped, join(directory, 'escaped'), 'runtime'), /source paths/);
    await writeFile(join(source, 'src/briefing-core.mjs'), 'uncommitted and unrelated to pinned source');
    assert.equal(canonical(buildFoundation(source, revision)), canonical(first));
    const cli = spawnSync(process.execPath, [join(root, 'scripts/foundation-release.mjs'), 'verify', capsule, digest(bytes)], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).revision, revision);
    const loaded = await import(pathToFileURL(join(pure, release.entries.pure)));
    assert.deepEqual(loaded.executeBriefing(request, { now: at }), executeBriefing(request, { now: at }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
