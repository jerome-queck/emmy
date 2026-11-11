import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupHome, canonical, digest, readStore, recordPayload, restoreHome } from '../src/records.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inventory = async directory => {
  const rows = [];
  const walk = async (path, prefix = '') => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), `${name}/`);
      else rows.push([name, digest(await readFile(join(path, entry.name)))]);
    }
  };
  await walk(directory);
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
};

test('unsupported cloud command has no home or process effects and no engine import', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emmy-runtime-'));
  try {
    const home = join(directory, 'home'); await mkdir(home);
    await writeFile(join(home, 'preserved.bin'), 'Original private bytes.');
    const before = await inventory(home);
    const preload = join(directory, 'load.mjs'); const log = join(directory, 'loads.jsonl');
    await writeFile(preload, `import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
import child from 'node:child_process';
const log = ${JSON.stringify(log)};
for (const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) child[key] = () => { appendFileSync(log, JSON.stringify({process:key})+'\\n'); throw new Error('Unexpected process'); };
syncBuiltinESMExports();
registerHooks({load(url,context,next) { appendFileSync(log,JSON.stringify({url})+'\\n'); return next(url,context); }});
`);
    const run = args => spawnSync(process.execPath, ['--import', preload, 'scripts/agent.mjs', ...args, '--home', home], { cwd: root, encoding: 'utf8' });
    const help = run(['help', '--json']); assert.equal(help.status, 0, help.stderr);
    assert.ok(!JSON.parse(help.stdout).data.commands.some(command => command.name === 'cloud'));
    const refused = run(['cloud', '--file', join(directory, 'missing.json')]);
    assert.equal(refused.status, 2, refused.stderr); assert.match(JSON.parse(refused.stdout).error, /Unknown command cloud/);
    assert.deepEqual(await inventory(home), before);
    const rows = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(rows.some(row => row.url?.endsWith('/src/records.mjs')));
    assert.ok(rows.some(row => row.url?.endsWith('/src/responsibilities.mjs')));
    assert.ok(rows.every(row => !row.process));
    assert.ok(rows.every(row => !/\/(?:cloud|cloud-schema|cloud-migration|process-incarnation)\.mjs$/.test(row.url ?? '')));
    for (const path of ['src/cloud.mjs', 'src/cloud-schema.mjs', 'src/cloud-migration.mjs', 'src/process-incarnation.mjs', 'scripts/cloud-acceptance.mjs']) await assert.rejects(access(join(root, path)), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('retired record and archive refuse without dropping original bytes or creating destinations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emmy-retired-history-'));
  try {
    const body = { schemaVersion: 1, type: 'cloud-request', retainedUnknown: { completed: true, nativeId: 'original-id' } };
    assert.throws(() => recordPayload(body), /Unsupported record type/);
    const record = { ...body, hash: digest(body) }; const bytes = `${canonical(record)}\n`;
    const home = join(directory, 'home'); const path = `records/${record.hash}/record.json`;
    await mkdir(join(home, 'records', record.hash), { recursive: true }); await writeFile(join(home, path), bytes);
    const before = await inventory(home);
    await assert.rejects(readStore(home), /Unsupported record type/);
    await assert.rejects(backupHome(home, join(directory, 'backup')), /Unsupported record type/);
    await assert.rejects(access(join(directory, 'backup')), { code: 'ENOENT' });
    assert.deepEqual(await inventory(home), before);
    const manifest = { schemaVersion: 1, files: [{ path, sha256: digest(bytes) }] };
    await writeFile(join(home, 'manifest.json'), canonical({ ...manifest, hash: digest(manifest) }));
    const archived = await inventory(home);
    await assert.rejects(restoreHome(home, join(directory, 'restored')), /Unsupported record type/);
    await assert.rejects(access(join(directory, 'restored')), { code: 'ENOENT' });
    assert.deepEqual(await inventory(home), archived);
    await writeFile(join(home, path), `${bytes}corrupt`);
    await assert.rejects(restoreHome(home, join(directory, 'corrupt-restored')), /Archive byte digest mismatch/);
    await assert.rejects(access(join(directory, 'corrupt-restored')), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
