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
    const coverage = join(root, 'verification/coverage.json'); const coverageBefore = await readFile(coverage);
    for (const path of ['docs/verification-index.json', 'docs/briefing-guidance.json']) {
      const target = join(root, path); const original = await readFile(target);
      await writeFile(target, Buffer.concat([original, Buffer.from('\n')]));
      const drift = run(root, ['maintain', '--check']); assert.equal(drift.status, 3, drift.stdout);
      assert.ok(JSON.parse(drift.stdout).data.drift.includes(path));
      const repaired = run(root, ['maintain', '--write']); assert.equal(repaired.status, 0, repaired.stdout);
      const data = JSON.parse(repaired.stdout).data; assert.ok(data.changed.includes(path)); assert.equal(data.reviewRecordsChanged, false);
      assert.deepEqual(await readFile(target), original); assert.deepEqual(await readFile(coverage), coverageBefore);
    }
    const generatedIndex = join(root, 'docs/verification-index.json'); const indexBytes = await readFile(generatedIndex);
    await rm(generatedIndex); assert.equal(run(root, ['maintain', '--check']).status, 3);
    assert.equal(run(root, ['maintain', '--write']).status, 0); assert.deepEqual(await readFile(generatedIndex), indexBytes);
    const guidanceInput = join(root, 'docs/briefing.md'); const guidanceBefore = await readFile(guidanceInput);
    await writeFile(guidanceInput, Buffer.concat([guidanceBefore, Buffer.from('\n')]));
    const changedInput = run(root, ['maintain', '--write']); assert.equal(changedInput.status, 2, changedInput.stdout);
    assert.match(JSON.parse(changedInput.stdout).error, /stale mapping docs\/briefing\.md/);
    await writeFile(guidanceInput, guidanceBefore);
    await mkdir(join(root, 'src/new-area'));
    await writeFile(join(root, 'src/new-area/new.mjs'), 'export const newArea = 1;\n');
    check(2, /unmapped src\/new-area\/new\.mjs/);
    await rm(join(root, 'src/new-area'), { recursive: true });
    const target = join(root, 'src/cloud.mjs'); const original = await readFile(target);
    await rm(target); check(2, /cloud\.mjs/); await writeFile(target, original);
    await writeFile(target, Buffer.concat([original, Buffer.from('\n')])); check(2, /stale mapping src\/cloud\.mjs/);
    const refusedWrite = run(root, ['maintain', '--write']); assert.equal(refusedWrite.status, 2, refusedWrite.stdout);
    assert.match(JSON.parse(refusedWrite.stdout).error, /stale mapping src\/cloud\.mjs/);
    await writeFile(target, original);
    await writeFile(join(root, 'verification/unmapped-check.mjs'), 'export const check = true;\n');
    check(2, /unmapped verification\/unmapped-check\.mjs/); await rm(join(root, 'verification/unmapped-check.mjs'));
    const manifest = join(root, 'verification/subsystems.json'); const originalManifest = await readFile(manifest, 'utf8');
    const mutate = async fn => { const value = JSON.parse(originalManifest); fn(value); await writeFile(manifest, JSON.stringify(value)); };
    await mutate(value => { const area = value.subsystems.find(row => row.id === 'orientation-and-checks'); area.files = area.files.filter(file => file.path !== 'docs/briefing.md'); });
    check(2, /unmapped guidance input docs\/briefing\.md/);
    await writeFile(manifest, originalManifest);
    const metadata = join(root, 'src/metadata.mjs'); const metadataBefore = await readFile(metadata, 'utf8');
    const needle = "paths: ['docs/operating-brief.md', 'docs/briefing.md',";
    assert.ok(metadataBefore.includes(needle));
    await writeFile(metadata, metadataBefore.replace(needle, "paths: ['docs/new-guidance.md', 'docs/operating-brief.md', 'docs/briefing.md',"));
    await writeFile(join(root, 'docs/new-guidance.md'), 'Synthetic newly configured guidance.\n');
    const newGuidance = spawnSync(process.execPath, [join(root, 'scripts/agent.mjs'), 'maintain', '--check', '--root', root], { encoding: 'utf8' });
    assert.equal(newGuidance.status, 2, newGuidance.stdout); assert.match(JSON.parse(newGuidance.stdout).error, /unmapped guidance input docs\/new-guidance\.md/);
    await writeFile(metadata, metadataBefore); await rm(join(root, 'docs/new-guidance.md'));
    await mutate(value => { value.subsystems[0].files.shift(); }); check(2, /unmapped src\/records\.mjs/);
    const unmappedWrite = run(root, ['maintain', '--write']); assert.equal(unmappedWrite.status, 2, unmappedWrite.stdout);
    assert.match(JSON.parse(unmappedWrite.stdout).error, /unmapped src\/records\.mjs/);
    await mutate(value => { value.subsystems[0].drivers = ['verification/no-driver.mjs']; }); check(2, /no-driver\.mjs/);
    await mutate(value => { value.subsystems[0].skills = ['.agents/skills/no-skill/SKILL.md']; }); check(2, /no-skill/);
    await mutate(value => { value.subsystems[0].skills = []; }); check(2, /missing formal evidence/);
    await mutate(value => { value.subsystems[0].files[0].callers = ['src/catalog.mjs']; }); check(2, /stale caller/);
    await mutate(value => { const entry = value.subsystems.flatMap(area => area.files).find(file => file.path === 'src/content.mjs'); entry.callers = entry.callers.filter(caller => caller !== 'src/assurance.mjs'); });
    check(2, /unmapped caller src\/assurance\.mjs for src\/content\.mjs/);
    await mutate(value => { const entry = value.subsystems.flatMap(area => area.files).find(file => file.path === 'scripts/github-auto-merge.mjs'); entry.callers = entry.callers.filter(caller => caller !== 'scripts/local-delivery.mjs'); });
    check(2, /unmapped caller scripts\/local-delivery\.mjs for scripts\/github-auto-merge\.mjs/);
    await mutate(value => { const area = value.subsystems.find(row => row.id === 'local-assurance'); area.graph.path = 'verification/local-assurance/chart.mmd'; }); check(2, /unsupported graph/);
    const unsupportedWrite = run(root, ['maintain', '--write']); assert.equal(unsupportedWrite.status, 2, unsupportedWrite.stdout);
    assert.match(JSON.parse(unsupportedWrite.stdout).error, /unsupported graph/);
    await mutate(value => { const area = value.subsystems.find(row => row.id === 'dispatch'); area.graph.kind = 'reachable-reducer'; }); check(2, /unsupported graph/);
    await mutate(value => { delete value.subsystems.find(row => row.id === 'dispatch').graph; }); check(2, /missing or unsupported graph/);
    await mutate(value => { value.foundationReady = true; }); check(2, /invalid schema or readiness/);
    await writeFile(manifest, originalManifest); check(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
