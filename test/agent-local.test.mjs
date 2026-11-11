import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { digest } from '../src/content.mjs';
import { planAutomation } from '../src/automation-plan.mjs';
import { automationProcedureFixture, automationConfigurationFixture } from '../verification/automation-fixtures.mjs';

const cli = fileURLToPath(new URL('../scripts/agent.mjs', import.meta.url));
const run = (root, args) => spawnSync(process.execPath, [cli, ...args, '--root', root], { encoding: 'utf8' });

test('local CLI plans read only explicit pinned inputs without a public catalog or private register', async () => {
  const root = await mkdtemp(join(tmpdir(), 'emmy-local-cli-'));
  try {
    const configuration = automationConfigurationFixture();
    const procedurePath = join(root, 'procedure.json'); const configurationPath = join(root, 'configuration.json');
    const procedureBytes = JSON.stringify(automationProcedureFixture); const configurationBytes = JSON.stringify(configuration);
    await writeFile(procedurePath, procedureBytes); await writeFile(configurationPath, configurationBytes);
    const request = { action: 'plan', procedure: { path: procedurePath, sha256: digest(procedureBytes) }, configuration: { path: configurationPath, sha256: digest(configurationBytes) } };
    const requestPath = join(root, 'request.json'); await writeFile(requestPath, JSON.stringify(request));
    const expected = planAutomation(automationProcedureFixture, configuration, { procedureRef: procedurePath, procedureSha256: request.procedure.sha256, configurationRef: configurationPath, configurationSha256: request.configuration.sha256 });
    for (const catalogState of ['absent', 'corrupt']) {
      if (catalogState === 'corrupt') { await mkdir(join(root, 'registry')); await writeFile(join(root, 'registry/catalog.json'), 'not-json'); }
      const before = await readdir(root, { recursive: true });
      const help = run(root, ['help', '--json']); assert.equal(help.status, 0, help.stdout);
      assert.ok(JSON.parse(help.stdout).data.commands.some(command => command.name === 'dispatch'));
      const plan = run(root, ['automation', '--file', requestPath]); assert.equal(plan.status, 0, plan.stdout);
      assert.equal(JSON.parse(plan.stdout).data.planDigest, expected.planDigest);
      assert.equal(JSON.parse(plan.stdout).data.effectsAuthorized, false);
      assert.deepEqual(await readdir(root, { recursive: true }), before);
      assert.equal(await readFile(procedurePath, 'utf8'), procedureBytes);
      assert.equal(await readFile(configurationPath, 'utf8'), configurationBytes);
    }
    request.configuration.sha256 = digest('changed'); await writeFile(requestPath, JSON.stringify(request));
    const refused = run(root, ['automation', '--file', requestPath]); assert.equal(refused.status, 2, refused.stdout);
    assert.match(JSON.parse(refused.stdout).error, /bytes changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('catalog consumers still refuse missing public inventory before proposing work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'emmy-catalog-cli-'));
  try {
    for (const args of [
      ['catalog'], ['doctor'], ['maintain', '--check'], ['probe', '--nonce', 'synthetic-local'],
      ['reconcile', '--as-of', '2026-11-10T00:00:00Z'], ['dispatch', '--project', 'synthetic', '--as-of', '2026-11-10T00:00:00Z']
    ]) {
      const result = run(root, args); assert.equal(result.status, 2, result.stdout);
      assert.match(JSON.parse(result.stdout).error, /registry\/catalog\.json/);
    }
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('maintain CLI rejects missing, stale and unsupported subsystem coverage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'emmy-subsystem-admission-'));
  const source = fileURLToPath(new URL('..', import.meta.url));
  try {
    for (const path of ['src', 'scripts', 'verification', 'test', 'registry', 'procedures', 'docs', '.agents', '.github', '.codex', 'package.json', 'package-lock.json']) {
      await cp(join(source, path), join(root, path), { recursive: true });
    }
    const check = (status, pattern) => {
      const result = run(root, ['maintain', '--check']);
      assert.equal(result.status, status, result.stdout + result.stderr);
      const data = JSON.parse(result.stdout);
      if (pattern) assert.match(data.error, pattern);
    };
    check(0);
    await mkdir(join(root, 'src/new-area'));
    await writeFile(join(root, 'src/new-area/new.mjs'), 'export const newArea = 1;\n');
    check(2, /unmapped src\/new-area\/new\.mjs/);
    await rm(join(root, 'src/new-area'), { recursive: true });
    const target = join(root, 'src/cloud.mjs'); const original = await readFile(target);
    await rm(target); check(2, /cloud\.mjs/); await writeFile(target, original);
    await writeFile(target, Buffer.concat([original, Buffer.from('\n')])); check(2, /stale mapping src\/cloud\.mjs/);
    await writeFile(target, original);
    await writeFile(join(root, 'verification/unmapped-check.mjs'), 'export const check = true;\n');
    check(2, /unmapped verification\/unmapped-check\.mjs/); await rm(join(root, 'verification/unmapped-check.mjs'));
    const manifest = join(root, 'verification/subsystems.json'); const originalManifest = await readFile(manifest, 'utf8');
    const mutate = async fn => { const value = JSON.parse(originalManifest); fn(value); await writeFile(manifest, JSON.stringify(value)); };
    await mutate(value => { value.subsystems[0].files.shift(); }); check(2, /unmapped src\/records\.mjs/);
    await mutate(value => { value.subsystems[0].drivers = ['verification/no-driver.mjs']; }); check(2, /no-driver\.mjs/);
    await mutate(value => { value.subsystems[0].skills = ['.agents/skills/no-skill/SKILL.md']; }); check(2, /no-skill/);
    await mutate(value => { value.subsystems[0].skills = []; }); check(2, /missing formal evidence/);
    await mutate(value => { value.subsystems[0].files[0].callers = ['src/catalog.mjs']; }); check(2, /stale caller/);
    await mutate(value => { const area = value.subsystems.find(row => row.id === 'local-assurance'); area.graph.path = 'verification/local-assurance/chart.mmd'; }); check(2, /unsupported graph/);
    await mutate(value => { const area = value.subsystems.find(row => row.id === 'dispatch'); area.graph.kind = 'reachable-reducer'; }); check(2, /unsupported graph/);
    await mutate(value => { delete value.subsystems.find(row => row.id === 'dispatch').graph; }); check(2, /missing or unsupported graph/);
    await mutate(value => { value.foundationReady = true; }); check(2, /invalid schema or readiness/);
    await writeFile(manifest, originalManifest); check(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
