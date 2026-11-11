import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, readFileSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm, realpath, rename, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { automationReporting, canonical, recordDigest } from '../src/automation-reporting.mjs';
import { sanitizeRecords } from '../src/automation-reporting-transport.mjs';
import { applyUpkeep } from '../src/automation-reporting-upkeep.mjs';
const namespace = 'owner';
const record = { schemaVersion: 1, namespace, automationId: 'daily', kind: 'issue', key: 'gap', revision: 0, previous: null, recordedAt: '2026-10-31T00:00:00Z', data: { title: 'Review gap', state: 'open', evidenceRefs: ['private-observation'] } };
const projected = sanitizeRecords([record], { namespace }).records[0];
const content = canonical(projected) + '\n';
const filename = recordDigest(projected) + '.json';
const cliPath = resolve('scripts/automation-reporting-upkeep.mjs');
function cli(...args) {
  let temporary;
  if (args[0] === 'plan' && !args.includes('--to')) {
    temporary = mkdtempSync(join(realpathSync(tmpdir()), 'emmy-upkeep-test-plan-'));
    args.push('--to', join(temporary, 'plan.json'));
  }
  try {
    const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
    assert.equal(result.stderr, '');
    const output = { code: result.status, ...JSON.parse(result.stdout) };
    if (args[0] === 'plan' && result.status !== 2) output.plan = JSON.parse(readFileSync(args[args.indexOf('--to') + 1], 'utf8'));
    return output;
  } finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
}

async function fixture(fn) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'emmy-upkeep-'));
  const sourceDirectory = join(root, 'fallback'); const directory = join(root, 'primary'); const to = join(root, 'plan.json');
  await mkdir(sourceDirectory); await mkdir(directory); await mkdir(join(directory, namespace));
  await automationReporting({ action: 'publish-own-record', directory: sourceDirectory, namespace, record });
  const options = ['--source-directory', sourceDirectory, '--directory', directory, '--namespace', namespace];
  try { await fn({ root, sourceDirectory, directory, to, options, own: join(directory, namespace) }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('actual CLI plan is read-only; exact known wrongname repairs and retries converge', async () => fixture(async ({ directory, own, options, to, sourceDirectory }) => {
  await writeFile(join(own, 'wrong.json'), content);
  const sourceBefore = await readFile(join(sourceDirectory, namespace, recordDigest(record) + '.json'));
  const result = cli('plan', ...options);
  assert.equal(result.code, 3); assert.equal(result.plan.moves.length, 1); assert.deepEqual(await readdir(own), ['wrong.json']);
  assert.equal(cli('plan', ...options, '--to', join(directory, 'bad-plan.json')).code, 2);
  assert.deepEqual(await readdir(directory), [namespace]);
  assert.equal(cli('plan', ...options, '--to', to).code, 3);
  const applied = cli('apply', '--file', to);
  assert.equal(applied.status, 'repaired'); assert.equal(applied.code, 0);
  assert.deepEqual(await readdir(own), [filename]); assert.equal(await readFile(join(own, filename), 'utf8'), content);
  assert.equal(cli('apply', '--file', to).status, 'noop');
  assert.deepEqual(await readFile(join(sourceDirectory, namespace, recordDigest(record) + '.json')), sourceBefore);
}));

test('duplicate identical target converges; differing target refuses all moves before writes', async () => fixture(async ({ own, options, to }) => {
  await writeFile(join(own, filename), content); await writeFile(join(own, 'duplicate.json'), content);
  cli('plan', ...options, '--to', to); assert.equal(cli('apply', '--file', to).status, 'repaired');
  assert.deepEqual(await readdir(own), [filename]);
  await rm(to); await writeFile(join(own, 'wrong.json'), content); await writeFile(join(own, filename), '{}\n');
  cli('plan', ...options, '--to', to); assert.equal(cli('apply', '--file', to).code, 2);
  assert.equal(await readFile(join(own, filename), 'utf8'), '{}\n'); assert.equal(await readFile(join(own, 'wrong.json'), 'utf8'), content);
}));

test('unknown changed JSON, pending and corrupt bytes preserved; missing is finding only', async () => fixture(async ({ own, options, to }) => {
  const changed = canonical({ ...projected, data: { ...projected.data, title: 'Unapproved edit' } }) + '\n';
  await writeFile(join(own, 'changed.json'), changed); await writeFile(join(own, '.pending-known'), content); await writeFile(join(own, 'corrupt'), '{');
  const planned = cli('plan', ...options, '--to', to); assert.equal(planned.plan.moves.length, 0);
  const applied = cli('apply', '--file', to); assert.equal(applied.status, 'needs-attention');
  assert.equal(await readFile(join(own, 'changed.json'), 'utf8'), changed); assert.equal(await readFile(join(own, 'corrupt'), 'utf8'), '{');
  assert.equal(await readFile(join(own, '.pending-known'), 'utf8'), content);
  assert.ok(applied.findings.some(finding => finding.reason === 'missing'));
}));

test('explicit managed alias repairs path drift without changing bytes or unknown files', async () => fixture(async ({ directory, own, options, to }) => {
  await mkdir(join(directory, 'old_owner'));
  await writeFile(join(directory, 'old_owner', 'misplaced.json'), content); await writeFile(join(directory, 'old_owner', 'unknown'), 'keep');
  const planned = cli('plan', ...options, '--from-namespace', 'old_owner', '--to', to);
  assert.equal(planned.plan.moves.length, 1); assert.equal(cli('apply', '--file', to).status, 'needs-attention');
  assert.equal(await readFile(join(own, filename), 'utf8'), content); assert.equal(await readFile(join(directory, 'old_owner', 'unknown'), 'utf8'), 'keep');
  assert.equal(cli('apply', '--file', to).repaired, 0);
}));

test('symlinked roots, namespaces and files cannot cause outside writes', async () => fixture(async ({ root, directory, own, options, to }) => {
  const outside = join(root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'evidence'), content);
  await symlink(join(outside, 'evidence'), join(own, 'wrong.json'));
  const planned = cli('plan', ...options, '--to', to); assert.equal(planned.plan.moves.length, 0);
  assert.equal(cli('apply', '--file', to).status, 'needs-attention'); assert.deepEqual(await readdir(outside), ['evidence']);
  await rm(own, { recursive: true }); await symlink(outside, own);
  assert.equal(cli('plan', ...options).code, 2);
  await symlink(directory, join(root, 'alias'));
  assert.equal(cli('plan', ...options.map(value => value === directory ? join(root, 'alias') : value)).code, 2);
}));

test('stale source and fallback or root identity changes refuse without repairs', async () => fixture(async ({ root, own, options, to, sourceDirectory }) => {
  await writeFile(join(own, 'wrong.json'), content); cli('plan', ...options, '--to', to);
  await writeFile(join(own, 'wrong.json'), 'changed'); assert.equal(cli('apply', '--file', to).code, 2);
  await writeFile(join(own, 'wrong.json'), content);
  const additional = { ...record, key: 'another' }; await automationReporting({ action: 'publish-own-record', directory: sourceDirectory, namespace, record: additional });
  assert.equal(cli('apply', '--file', to).code, 2); assert.deepEqual(await readdir(own), ['wrong.json']);
  await rename(sourceDirectory, join(root, 'old-fallback')); await mkdir(sourceDirectory);
  assert.equal(cli('apply', '--file', to).code, 2);
}));

test('interruption after exclusive link retains both byte-identical names and CLI retry converges', async () => fixture(async ({ own, options, to }) => {
  await writeFile(join(own, 'wrong.json'), content); const { plan } = cli('plan', ...options, '--to', to);
  await assert.rejects(applyUpkeep(plan, { checkpoint: async stage => { if (stage === 'linked') throw new Error('simulated-stop'); } }), /simulated-stop/);
  assert.deepEqual((await readdir(own)).sort(), [filename, 'wrong.json'].sort());
  assert.equal(await readFile(join(own, filename), 'utf8'), content); assert.equal(await readFile(join(own, 'wrong.json'), 'utf8'), content);
  assert.equal(cli('apply', '--file', to).status, 'repaired'); assert.equal(cli('apply', '--file', to).status, 'noop');
}));

test('interruption after old-name removal retries noop and stale missing stays findings', async () => fixture(async ({ own, options, to }) => {
  await writeFile(join(own, 'wrong.json'), content); const { plan } = cli('plan', ...options, '--to', to);
  await assert.rejects(applyUpkeep(plan, { checkpoint: async stage => { if (stage === 'moved') throw new Error('simulated-stop'); } }), /simulated-stop/);
  assert.equal(cli('apply', '--file', to).status, 'noop');
  await rm(join(own, filename)); const result = cli('apply', '--file', to);
  assert.equal(result.status, 'needs-attention'); assert.equal(result.writes, false); assert.deepEqual(await readdir(own), []);
}));

test('actual CLI killed after link leaves complete canonical bytes and repeat apply converges', async () => fixture(async ({ root, own, options, to }) => {
  await writeFile(join(own, 'wrong.json'), content); cli('plan', ...options, '--to', to);
  const preload = join(root, 'stop-after-link.cjs');
  await writeFile(preload, "const fs = require('node:fs'); const original = fs.promises.link; fs.promises.link = async (...args) => { await original(...args); process.kill(process.pid, 'SIGKILL'); }; require('node:module').syncBuiltinESMExports();\n");
  const stopped = spawnSync(process.execPath, ['--require', preload, cliPath, 'apply', '--file', to], { encoding: 'utf8' });
  assert.equal(stopped.signal, 'SIGKILL'); assert.equal(await readFile(join(own, filename), 'utf8'), content); assert.equal(await readFile(join(own, 'wrong.json'), 'utf8'), content);
  assert.equal(cli('apply', '--file', to).status, 'repaired'); assert.deepEqual(await readdir(own), [filename]);
}));

test('source replacement after link preserves new source evidence and exact canonical bytes', async () => fixture(async ({ root, own, options, to }) => {
  await writeFile(join(own, 'wrong.json'), content); const { plan } = cli('plan', ...options, '--to', to);
  const changed = join(root, 'replacement'); await writeFile(changed, 'new evidence');
  await assert.rejects(applyUpkeep(plan, { checkpoint: async stage => { if (stage === 'linked') await rename(changed, join(own, 'wrong.json')); } }), /Source changed/);
  assert.equal(await readFile(join(own, 'wrong.json'), 'utf8'), 'new evidence'); assert.equal(await readFile(join(own, filename), 'utf8'), content);
  assert.equal(cli('apply', '--file', to).code, 2);
}));

test('all target conflicts are checked before any independent planned move', async () => fixture(async ({ own, sourceDirectory, options, to }) => {
  const other = { ...record, key: 'second' };
  await automationReporting({ action: 'publish-own-record', directory: sourceDirectory, namespace, record: other });
  const target = sanitizeRecords([other], { namespace }).records[0]; const otherContent = canonical(target) + '\n'; const otherName = recordDigest(target) + '.json';
  await writeFile(join(own, 'a.json'), content); await writeFile(join(own, 'z.json'), otherContent);
  cli('plan', ...options, '--to', to); await writeFile(join(own, otherName), 'conflicting bytes');
  assert.equal(cli('apply', '--file', to).code, 2);
  assert.equal(await readFile(join(own, 'a.json'), 'utf8'), content); assert.equal(await readFile(join(own, 'z.json'), 'utf8'), otherContent);
  assert.ok(!(await readdir(own)).includes(filename));
}));

test('traversal, nonordinary plan, oversized plan, and fallback aliases refuse', async () => fixture(async ({ root, directory, sourceDirectory, own, options, to }) => {
  await writeFile(join(own, 'wrong.json'), content); const { plan } = cli('plan', ...options);
  plan.moves[0].sourceFilename = '../escape'; await writeFile(to, JSON.stringify(plan));
  assert.equal(cli('apply', '--file', to).code, 2); assert.deepEqual(await readdir(own), ['wrong.json']);
  const alias = join(root, 'alias-source'); await symlink(sourceDirectory, alias);
  assert.equal(cli('plan', '--source-directory', alias, '--directory', directory, '--namespace', namespace).code, 2);
  const planAlias = join(root, 'plan-alias.json'); await symlink(to, planAlias); assert.equal(cli('apply', '--file', planAlias).code, 2);
  await writeFile(to, ' '.repeat(2097153)); assert.equal(cli('apply', '--file', to).code, 2);
}));


test('case-equivalent digest filenames are retained by plan and legacy apply', async () => fixture(async ({ own, options, to }) => {
  const uppercase = filename.toUpperCase(); await writeFile(join(own, 'wrong.json'), content);
  const legacy = cli('plan', ...options).plan; await rename(join(own, 'wrong.json'), join(own, uppercase));
  const planned = cli('plan', ...options); assert.equal(planned.plan.moves.length, 0);
  assert.ok(planned.plan.findings.some(finding => finding.startsWith('filename-case-alias:')));
  legacy.moves[0].sourceFilename = uppercase; await writeFile(to, JSON.stringify(legacy));
  const applied = cli('apply', '--file', to); assert.equal(applied.status, 'needs-attention'); assert.equal(applied.writes, false);
  assert.deepEqual(await readdir(own), [uppercase]); assert.equal(await readFile(join(own, uppercase), 'utf8'), content);
}));

test('real case-insensitive filesystem filename alias cannot remove sole artifact', async t => fixture(async ({ own, options, to }) => {
  const uppercase = filename.toUpperCase(); await writeFile(join(own, uppercase), content);
  try { await readFile(join(own, filename)); } catch (error) { if (error.code === 'ENOENT') { t.skip('Fixture filesystem is case-sensitive'); return; } throw error; }
  assert.deepEqual(await readdir(own), [uppercase]);
  const planned = cli('plan', ...options, '--to', to); assert.equal(planned.plan.moves.length, 0);
  assert.equal(cli('apply', '--file', to).writes, false);
  assert.deepEqual(await readdir(own), [uppercase]); assert.equal(await readFile(join(own, filename), 'utf8'), content);
}));

test('real case-insensitive namespace alias cannot remove sole artifact, including legacy plan', async t => fixture(async ({ directory, own, options, to }) => {
  await writeFile(join(own, filename), content); const uppercase = namespace.toUpperCase();
  await rename(own, join(directory, uppercase));
  try { await readFile(join(own, filename)); } catch (error) { if (error.code === 'ENOENT') { t.skip('Fixture filesystem is case-sensitive'); return; } throw error; }
  assert.deepEqual(await readdir(directory), [uppercase]);
  const planned = cli('plan', ...options, '--from-namespace', uppercase); assert.equal(planned.plan.moves.length, 0);
  assert.ok(planned.plan.findings.some(finding => finding.startsWith('namespace-case-alias:')));
  planned.plan.moves.push({ sourceNamespace: uppercase, sourceFilename: filename, byteSha256: createHash('sha256').update(content).digest('hex'), targetFilename: filename });
  await writeFile(to, JSON.stringify(planned.plan));
  const applied = cli('apply', '--file', to); assert.equal(applied.status, 'blocked'); assert.equal(applied.code, 2);
  assert.deepEqual(await readdir(join(directory, uppercase)), [filename]); assert.equal(await readFile(join(own, filename), 'utf8'), content);
}));

test('bounded directory inventory refuses excess root and namespace entries before repair', async () => fixture(async ({ root, directory, own, options, to }) => {
  await writeFile(join(own, 'wrong.json'), content); cli('plan', ...options, '--to', to);
  for (let index = 0; index < 200; index++) await mkdir(join(directory, `extra-${index}`));
  assert.equal(cli('plan', ...options).code, 2); assert.equal(cli('apply', '--file', to).code, 2);
  assert.equal(await readFile(join(own, 'wrong.json'), 'utf8'), content);
  for (let index = 0; index < 200; index++) await rm(join(directory, `extra-${index}`), { recursive: true });
  for (let index = 0; index < 5000; index++) await writeFile(join(own, `entry-${index}`), 'unknown');
  assert.equal(cli('plan', ...options).code, 2); assert.equal(cli('apply', '--file', to).code, 2);
  assert.equal(await readFile(join(own, 'wrong.json'), 'utf8'), content); assert.ok(!(await readdir(own)).includes(filename));
  assert.deepEqual((await readdir(root)).sort(), ['fallback', 'plan.json', 'primary']);
}));


test('real case-insensitive duplicate source spelling refuses every move before any write', async t => fixture(async ({ own, options, to }) => {
  await writeFile(join(own, 'wrong.json'), content);
  try { await readFile(join(own, 'WRONG.JSON')); } catch (error) { if (error.code === 'ENOENT') { t.skip('Fixture filesystem is case-sensitive'); return; } throw error; }
  const { plan } = cli('plan', ...options);
  plan.moves.push({ ...plan.moves[0], sourceFilename: 'WRONG.JSON' }); await writeFile(to, JSON.stringify(plan));
  const applied = cli('apply', '--file', to); assert.equal(applied.code, 2); assert.equal(applied.reason, 'invalid-or-unsafe-request');
  assert.deepEqual(await readdir(own), ['wrong.json']); assert.equal(await readFile(join(own, 'wrong.json'), 'utf8'), content);
}));

test('two genuine distinct wrongname hardlinks converge after exact entry preflight', async () => fixture(async ({ own, options, to }) => {
  await writeFile(join(own, 'first.json'), content); await link(join(own, 'first.json'), join(own, 'second.json'));
  const { plan } = cli('plan', ...options, '--to', to); assert.equal(plan.moves.length, 2);
  const applied = cli('apply', '--file', to); assert.equal(applied.status, 'repaired'); assert.equal(applied.repaired, 2);
  assert.deepEqual(await readdir(own), [filename]); assert.equal(await readFile(join(own, filename), 'utf8'), content);
}));


test('real case-insensitive existing target alias retains independent wrongname duplicate', async t => fixture(async ({ own, options, to }) => {
  const uppercase = filename.toUpperCase(); await writeFile(join(own, uppercase), content); await writeFile(join(own, 'wrong.json'), content);
  try { await readFile(join(own, filename)); } catch (error) { if (error.code === 'ENOENT') { t.skip('Fixture filesystem is case-sensitive'); return; } throw error; }
  cli('plan', ...options, '--to', to); const applied = cli('apply', '--file', to);
  assert.equal(applied.status, 'needs-attention'); assert.equal(applied.writes, false);
  assert.deepEqual((await readdir(own)).sort(), [uppercase, 'wrong.json'].sort());
}));


test('default CLI prints bounded hashed findings, with raw names only in explicit private plan', async () => fixture(async ({ root, own, options, to }) => {
  const credential = 'sk-proj-' + 'a'.repeat(32); const secretName = credential + '.json';
  await writeFile(join(own, secretName), '{}');
  const before = (await readdir(root)).sort();
  const preview = spawnSync(process.execPath, [cliPath, 'plan', ...options], { encoding: 'utf8' });
  assert.equal(preview.status, 3); assert.equal(preview.stderr, '');
  assert.ok(!preview.stdout.includes(credential)); assert.ok(!preview.stdout.includes(root));
  const summary = JSON.parse(preview.stdout); assert.equal(summary.plan, undefined); assert.equal(summary.namespace, namespace); assert.match(summary.expectedFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(summary.counts.findings, 2); assert.ok(summary.findings.every(finding => Object.keys(finding).sort().join(',') === 'reason,reference' && /^[a-f0-9]{64}$/.test(finding.reference)));
  assert.deepEqual((await readdir(root)).sort(), before);
  const saved = spawnSync(process.execPath, [cliPath, 'plan', ...options, '--to', to], { encoding: 'utf8' });
  assert.equal(saved.status, 3); assert.equal(JSON.parse(saved.stdout).planFile, to); assert.ok(!saved.stdout.includes(credential));
  assert.ok((await readFile(to, 'utf8')).includes(secretName));
  const applied = spawnSync(process.execPath, [cliPath, 'apply', '--file', to], { encoding: 'utf8' });
  assert.equal(applied.status, 3); assert.ok(!applied.stdout.includes(credential)); assert.ok(!applied.stdout.includes(root));
  assert.deepEqual(await readdir(own), [secretName]);
}));

test('CLI malformed arguments and filesystem errors never echo credential-like input', async () => fixture(async ({ root, options }) => {
  const credential = 'sk-proj-' + 'b'.repeat(32);
  const requests = [
    ['plan', ...options, '--' + credential, credential],
    [credential],
    ['apply', '--file', join(root, credential + '.json')],
    ['plan', '--source-directory', join(root, credential), '--directory', join(root, 'primary'), '--namespace', namespace],
  ];
  for (const args of requests) {
    const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert.equal(result.stderr, ''); assert.ok(!result.stdout.includes(credential)); assert.ok(!result.stdout.includes(root));
    assert.equal(JSON.parse(result.stdout).status, 'blocked');
  }
  const to = join(root, credential + '-plan.json');
  const saved = spawnSync(process.execPath, [cliPath, 'plan', ...options, '--to', to], { encoding: 'utf8' });
  assert.equal(saved.status, 3); assert.ok(!saved.stdout.includes(credential)); assert.equal(JSON.parse(saved.stdout).planFile, 'withheld');
  assert.equal(JSON.parse(await readFile(to, 'utf8')).schemaVersion, 1);
}));


test('missing target mapping plans no repairs and cannot create a namespace, including legacy plans', async () => fixture(async ({ directory, own, options, to }) => {
  await mkdir(join(directory, 'old_owner')); await writeFile(join(directory, 'old_owner', 'wrong.json'), content);
  const legacy = cli('plan', ...options, '--from-namespace', 'old_owner').plan;
  assert.equal(legacy.moves.length, 1); await rm(own, { recursive: true });
  const planned = cli('plan', ...options, '--from-namespace', 'old_owner', '--to', to);
  assert.equal(planned.status, 'needs-attention'); assert.equal(planned.mappingAvailable, false); assert.equal(planned.plan.moves.length, 0);
  assert.ok(planned.findings.some(finding => finding.reason === 'target-namespace-unavailable'));
  assert.deepEqual(await readdir(directory), ['old_owner']);
  assert.equal(cli('apply', '--file', to).code, 2); assert.deepEqual(await readdir(directory), ['old_owner']);
  await writeFile(to, JSON.stringify(legacy)); assert.equal(cli('apply', '--file', to).code, 2);
  assert.deepEqual(await readdir(directory), ['old_owner']); assert.equal(await readFile(join(directory, 'old_owner', 'wrong.json'), 'utf8'), content);
  legacy.directories.find(item => item.namespace === namespace).identity = null;
  await mkdir(own);
  await writeFile(to, JSON.stringify(legacy)); assert.equal(cli('apply', '--file', to).code, 2);
  assert.deepEqual(await readdir(own), []);
  assert.equal(await readFile(join(directory, 'old_owner', 'wrong.json'), 'utf8'), content);
}));
