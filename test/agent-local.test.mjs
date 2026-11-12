import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
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
    for (const path of ['src', 'scripts', 'verification', 'test', 'registry', 'schemas', 'procedures', 'docs', '.agents', '.github', '.codex', 'AGENTS.md', '.gitignore', 'package.json', 'package-lock.json']) {
      await cp(join(source, path), join(root, path), { recursive: true });
    }
    const check = (status, pattern) => {
      const result = run(root, ['maintain', '--check']);
      assert.equal(result.status, status, result.stdout + result.stderr);
      const data = JSON.parse(result.stdout);
      if (pattern) assert.match(data.error, pattern);
    };
    check(0);
    for (const path of ['.npmrc', '.nvmrc', '.github/CODEOWNERS', '.github/new-policy', '.codex/new-policy', '.agents/new-policy', 'docs/CODEOWNERS', 'src/new-config.ini', 'verification/new-input.txt']) {
      const added = join(root, path); await writeFile(added, 'synthetic unreviewed configuration\n');
      for (const mode of ['--check', '--write']) {
        const refused = run(root, ['maintain', mode]); assert.equal(refused.status, 2, refused.stdout);
        assert.ok(JSON.parse(refused.stdout).error.includes(`unmapped ${path}`));
      }
      await rm(added);
    }
    await writeFile(join(root, 'docs/unconfigured-prose.md'), 'Synthetic unrelated prose.\n');
    check(0); await rm(join(root, 'docs/unconfigured-prose.md'));
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
    const target = join(root, 'src/signin.mjs'); const original = await readFile(target);
    await rm(target); check(2, /signin\.mjs/); await writeFile(target, original);
    await writeFile(target, Buffer.concat([original, Buffer.from('\n')])); check(2, /stale mapping src\/signin\.mjs/);
    const refusedWrite = run(root, ['maintain', '--write']); assert.equal(refusedWrite.status, 2, refusedWrite.stdout);
    assert.match(JSON.parse(refusedWrite.stdout).error, /stale mapping src\/signin\.mjs/);
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
    await mutate(value => { value.subsystems.find(area => area.id === 'publication').drivers = ['verification/fleet-drive.mjs']; }); check(2, /duplicate evidence binding/);
    await mutate(value => { value.subsystems.find(area => area.id === 'publication').skills = ['.agents/skills/local-assurance/SKILL.md']; }); check(2, /duplicate evidence binding/);
    await writeFile(manifest, originalManifest);
    for (const [from, to] of [['verification/publication/drive.mjs','verification/fleet-drive.mjs'],['.agents/skills/publication-contract/SKILL.md','.agents/skills/local-assurance/SKILL.md']]) {
      assert.ok(metadataBefore.includes(`"${from}"`));
      await writeFile(metadata, metadataBefore.replace(`"${from}"`, `"${to}"`));
      await mutate(value => { value.subsystems.flatMap(area => area.files).find(file => file.path === 'src/metadata.mjs').sha256 = digest(metadataBefore.replace(`"${from}"`, `"${to}"`)); });
      const wrong = spawnSync(process.execPath, [join(root, 'scripts/agent.mjs'), 'maintain', '--check', '--root', root], { encoding: 'utf8' });
      assert.equal(wrong.status, 2, wrong.stdout); assert.match(JSON.parse(wrong.stdout).error, /unreviewed evidence registry/);
      const forged = JSON.parse(coverageBefore); forged.files['src/metadata.mjs'] = digest(metadataBefore.replace(`"${from}"`, `"${to}"`));
      const forgedBytes = JSON.stringify(forged); await writeFile(coverage, forgedBytes);
      await mutate(value => { const files = value.subsystems.flatMap(area => area.files); files.find(file => file.path === 'src/metadata.mjs').sha256 = forged.files['src/metadata.mjs']; files.find(file => file.path === 'verification/coverage.json').sha256 = digest(forgedBytes); });
      const wrongRegistered = spawnSync(process.execPath, [join(root, 'scripts/agent.mjs'), 'maintain', '--check', '--root', root], { encoding: 'utf8' });
      assert.equal(wrongRegistered.status, 2, wrongRegistered.stdout); assert.match(JSON.parse(wrongRegistered.stdout).error, /unregistered evidence/);
      const wrongWrite = spawnSync(process.execPath, [join(root, 'scripts/agent.mjs'), 'maintain', '--write', '--root', root], { encoding: 'utf8' });
      assert.equal(wrongWrite.status, 2, wrongWrite.stdout); assert.match(JSON.parse(wrongWrite.stdout).error, /unregistered evidence/);
      await writeFile(coverage, coverageBefore);
      await writeFile(metadata, metadataBefore); await writeFile(manifest, originalManifest);
    }
    const unknownMetadata = metadataBefore.replace('"model": "reachable-history"', '"model": "unknown-history"');
    assert.notEqual(unknownMetadata, metadataBefore);
    await writeFile(metadata, unknownMetadata);
    const unknownRegistry = JSON.parse(coverageBefore); unknownRegistry.files['src/metadata.mjs'] = digest(unknownMetadata);
    const unknownBytes = JSON.stringify(unknownRegistry); await writeFile(coverage, unknownBytes);
    await mutate(value => { const files = value.subsystems.flatMap(area => area.files); files.find(file => file.path === 'src/metadata.mjs').sha256 = digest(unknownMetadata); files.find(file => file.path === 'verification/coverage.json').sha256 = digest(unknownBytes); });
    for (const mode of ['--check', '--write']) { const result = spawnSync(process.execPath, [join(root, 'scripts/agent.mjs'), 'maintain', mode, '--root', root], { encoding: 'utf8' }); assert.equal(result.status, 2, result.stdout); assert.match(JSON.parse(result.stdout).error, /unsupported model in responsibility-closure/); }
    await writeFile(metadata, metadataBefore); await writeFile(coverage, coverageBefore); await writeFile(manifest, originalManifest);
    const historyPath = 'verification/responsibility-closure/graph.mjs'; const history = join(root, historyPath); const historyBytes = await readFile(history, 'utf8');
    const decorativeHistory = historyBytes.split('\n').map(line => `// ${line}`).join('\n'); await writeFile(history, decorativeHistory);
    const historyRecordPath = 'verification/responsibility-closure/coverage.json'; const historyRecord = join(root, historyRecordPath); const historyRecordBytes = await readFile(historyRecord, 'utf8'); const historyRecordChanged = JSON.parse(historyRecordBytes); historyRecordChanged.verificationFiles[historyPath] = digest(decorativeHistory); const changedHistoryRecord = JSON.stringify(historyRecordChanged); await writeFile(historyRecord, changedHistoryRecord);
    await mutate(value => { const files = value.subsystems.flatMap(area => area.files); files.find(file => file.path === historyPath).sha256 = digest(decorativeHistory); files.find(file => file.path === historyRecordPath).sha256 = digest(changedHistoryRecord); });
    for (const mode of ['--check', '--write']) { const result = run(root, ['maintain', mode]); assert.equal(result.status, 2, result.stdout); assert.match(JSON.parse(result.stdout).error, /invalid graph interface/); }
    await writeFile(history, historyBytes); await writeFile(historyRecord, historyRecordBytes); await writeFile(manifest, originalManifest);
    const driver = join(root, 'verification/publication/drive.mjs'); const driverBytes = await readFile(driver); await rm(driver); check(2, /drive\.mjs/); await writeFile(driver, driverBytes);
    const skill = join(root, '.agents/skills/publication-contract/SKILL.md'); const skillBytes = await readFile(skill); await rm(skill); check(2, /SKILL\.md/); await writeFile(skill, skillBytes);
    await mutate(value => { value.subsystems[0].files[0].callers = ['src/catalog.mjs']; }); check(2, /stale caller/);
    const ownerPath = join(root, 'src/responsibilities.mjs'); const ownerBytes = await readFile(ownerPath, 'utf8');
    const commentedOwner = `${ownerBytes}\n// commentOnlyOwner\n`; await writeFile(ownerPath, commentedOwner);
    await mutate(value => { value.subsystems[0].ownerRefs[0].symbol = 'commentOnlyOwner'; value.subsystems.flatMap(area => area.files).find(file => file.path === 'src/responsibilities.mjs').sha256 = digest(commentedOwner); });
    check(2, /missing exported owner commentOnlyOwner/); await writeFile(ownerPath, ownerBytes);
    await mutate(value => { const entry = value.subsystems.flatMap(area => area.files).find(file => file.path === 'src/content.mjs'); entry.callers = entry.callers.filter(caller => caller !== 'src/assurance.mjs'); });
    check(2, /unmapped caller src\/assurance\.mjs for src\/content\.mjs/);
    await mutate(value => { const entry = value.subsystems.flatMap(area => area.files).find(file => file.path === 'scripts/github-auto-merge.mjs'); entry.callers = entry.callers.filter(caller => caller !== 'scripts/local-delivery.mjs'); });
    check(2, /unmapped caller scripts\/local-delivery\.mjs for scripts\/github-auto-merge\.mjs/);
    await mutate(value => { const entry = value.subsystems.flatMap(area => area.files).find(file => file.path === 'src/assurance.mjs'); entry.callers.push('scripts/agent.mjs'); }); check(2, /stale caller scripts\/agent\.mjs for src\/assurance\.mjs/);
    await writeFile(manifest, originalManifest);
    const graphPath = 'verification/local-assurance/graph.mjs'; const graph = join(root, graphPath); const graphBytes = await readFile(graph, 'utf8');
    const commented = graphBytes.split('\n').map(line => `// ${line}`).join('\n'); await writeFile(graph, commented);
    await mutate(value => { value.subsystems.flatMap(area => area.files).find(file => file.path === graphPath).sha256 = digest(commented); });
    check(2, /unregistered graph or checker/);
    const formalPath = join(root, 'verification/local-assurance/coverage.json'); const formalBytes = await readFile(formalPath, 'utf8'); const altered = JSON.parse(formalBytes); altered.verificationFiles[graphPath] = digest(commented); await writeFile(formalPath, JSON.stringify(altered));
    await mutate(value => { const files = value.subsystems.flatMap(area => area.files); files.find(file => file.path === graphPath).sha256 = digest(commented); files.find(file => file.path === 'verification/local-assurance/coverage.json').sha256 = digest(JSON.stringify(altered)); });
    check(2, /invalid graph interface/);
    const unsupportedWrite = run(root, ['maintain', '--write']); assert.equal(unsupportedWrite.status, 2, unsupportedWrite.stdout);
    assert.match(JSON.parse(unsupportedWrite.stdout).error, /invalid graph interface/);
    await writeFile(graph, graphBytes); await writeFile(formalPath, formalBytes);
    const modelPath = 'verification/publication/RecordPublication.tla'; const model = join(root, modelPath); const modelBytes = await readFile(model, 'utf8');
    const commentedModel = modelBytes.split('\n').map(line => `\\* ${line}`).join('\n'); await writeFile(model, commentedModel);
    const publicationRecord = join(root, 'verification/publication/coverage.json'); const publicationBytes = await readFile(publicationRecord, 'utf8'); const changedRecord = JSON.parse(publicationBytes); changedRecord.verificationFiles[modelPath] = digest(commentedModel); const changedBytes = JSON.stringify(changedRecord); await writeFile(publicationRecord, changedBytes);
    await mutate(value => { const files = value.subsystems.flatMap(area => area.files); files.find(file => file.path === modelPath).sha256 = digest(commentedModel); files.find(file => file.path === 'verification/publication/coverage.json').sha256 = digest(changedBytes); });
    check(2, /unreviewed hand-mapped model or checker/);
    const modelWrite = run(root, ['maintain', '--write']); assert.equal(modelWrite.status, 2, modelWrite.stdout); assert.match(JSON.parse(modelWrite.stdout).error, /unreviewed hand-mapped model or checker/);
    await writeFile(model, modelBytes); await writeFile(publicationRecord, publicationBytes);
    const runnerPath = 'scripts/verify-publication.mjs'; const runner = join(root, runnerPath); const runnerBytes = await readFile(runner, 'utf8'); const commentedRunner = runnerBytes.split('\n').map(line => `// ${line}`).join('\n'); await writeFile(runner, commentedRunner);
    const changedRunnerRecord = JSON.parse(publicationBytes); changedRunnerRecord.verificationFiles[runnerPath] = digest(commentedRunner); const changedRunnerBytes = JSON.stringify(changedRunnerRecord); await writeFile(publicationRecord, changedRunnerBytes);
    await mutate(value => { const files = value.subsystems.flatMap(area => area.files); files.find(file => file.path === runnerPath).sha256 = digest(commentedRunner); files.find(file => file.path === 'verification/publication/coverage.json').sha256 = digest(changedRunnerBytes); });
    check(2, /unreviewed hand-mapped model or checker/); await writeFile(runner, runnerBytes); await writeFile(publicationRecord, publicationBytes);
    await mutate(value => { value.foundationReady = true; }); check(2, /invalid schema or readiness/);
    await writeFile(manifest, originalManifest); check(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('behavior CLI retains originals before cleanup and reports finalizer failures', async () => {
  const source = fileURLToPath(new URL('..', import.meta.url));
  const directory = await mkdtemp(join(source, '.local/verification/behavior-faults-'));
  const preload = `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, basename } from 'node:path';
const io = {...fs}; const mode = process.env.EMMY_RETENTION_FAULT; const at = process.env.EMMY_RETENTION_EVIDENCE;
let root, evidence, fired = false, writes = 0;
const log = value => io.appendFile(join(at, 'operations.jsonl'), JSON.stringify({at: new Date().toISOString(), ...value})+'\\n');
const fail = async (operation, code = 'EIO') => { fired = true; await log({fault: true, mode, operation, root, evidence}); const error = new Error('Synthetic retention '+mode); error.code = code; throw error; };
fs.mkdtemp = async (...args) => { const path = await io.mkdtemp(...args); if(basename(path).startsWith('emmy-behavior-')) {root = path; await log({root});} return path; };
fs.cp = async (...args) => {
  const [from, to] = args;
  if(String(to).includes('/.local/verification/behavior-') && basename(to) === 'records') {
    evidence = to.slice(0, -'/records'.length); await log({operation: 'records-copy', root, evidence});
    if(mode === 'relative-link') {const names=await io.readdir(from);await io.symlink(names[0]+'/record.json',join(from,'relative-link'));await log({control:'relative-link',root,evidence});}
    await io.cp(from, join(at, 'original-records'), {recursive: true,verbatimSymlinks:true});
    if(['records-eio','records-enoent','scenario-and-copy'].includes(mode)) return fail('records-copy', mode === 'records-enoent' ? 'ENOENT' : 'EIO');
    await io.cp(...args);
    if(mode === 'corrupt') {fired = true; const names = await io.readdir(to); await io.writeFile(join(to,names[0],'record.json'),'{}'); await log({fault: true, mode, operation: 'corrupt-record',root,evidence});}
    return;
  }
  return io.cp(...args);
};
fs.readFile = async (...args) => {if(mode === 'readback' && !fired && evidence && String(args[0]).startsWith(evidence+'/records/') && String(args[0]).endsWith('/record.json')) return fail('retained-read'); return io.readFile(...args);};
fs.lstat = async (...args) => {if(mode === 'optional-absent' && !fired && args[0] === join(root??'', '.local/briefing')) return fail('optional-stat','ENOENT'); return io.lstat(...args);};
fs.readdir = async (...args) => {const result = await io.readdir(...args); return mode === 'scenario-and-copy' && args[0] === join(root??'', '.local') ? [...result, 'executor-invoked'] : result;};
fs.writeFile = async (...args) => {
  if(String(args[0]).includes('/.local/verification/behavior-') && basename(String(args[0])) === 'report.json') {
    writes++; await log({operation:'report-write',writes,root,evidence});
    if(mode === 'write-always' || mode === 'write-once' && !fired || mode === 'write-final' && writes === 2) return fail('report-write');
  }
  return io.writeFile(...args);
};
fs.rm = async (...args) => {
  if(args[0] === root && ['cleanup-partial','cleanup-kill'].includes(mode)) {
    await io.rm(join(root,'.local/records'),{recursive:true,force:true});
    if(mode === 'cleanup-kill') {await log({fault:true,mode,operation:'SIGKILL-after-partial-cleanup',root,evidence}); process.kill(process.pid,'SIGKILL'); await new Promise(()=>{});}
    return fail('partial-cleanup');
  }
  return io.rm(...args);
};
syncBuiltinESMExports();
`;
  const files = async path => {
    const result = {};
    for (const name of await readdir(path, { recursive: true })) {
      try { result[name] = digest(await readFile(join(path, name))); }
      catch (error) { if (error.code !== 'EISDIR') throw error; }
    }
    return result;
  };
  for (const mode of ['success', 'records-eio', 'records-enoent', 'corrupt', 'readback', 'scenario-and-copy', 'write-once', 'write-always', 'write-final', 'cleanup-partial', 'cleanup-kill', 'optional-absent', 'relative-link']) {
    const at = join(directory, mode); await mkdir(join(at, 'scratch'), { recursive: true });
    const recipe = join(at, 'fault.mjs'); await writeFile(recipe, preload);
    const env = { ...process.env, TMPDIR: join(at, 'scratch'), TMP: join(at, 'scratch'), TEMP: join(at, 'scratch'), EMMY_RETENTION_FAULT: mode, EMMY_RETENTION_EVIDENCE: at };
    const result = spawnSync(process.execPath, ['--import', recipe, join(source, 'scripts/verify-behavior.mjs'), '--focus', 'self-check-repair'], { cwd: source, env, encoding: 'utf8', timeout: 90_000, maxBuffer: 16 * 1024 * 1024 });
    await writeFile(join(at, 'stdout'), result.stdout ?? ''); await writeFile(join(at, 'stderr'), result.stderr ?? '');
    const operations = (await readFile(join(at, 'operations.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const location = operations.findLast(value => value.evidence);
    const record = { mode, code: result.status, signal: result.signal, error: result.error?.message, recipeSha256: digest(preload), root: location?.root, evidence: location?.evidence };
    await writeFile(join(at, 'result.json'), JSON.stringify(record, null, 2));
    assert.equal(result.error, undefined, result.stderr); assert.ok(location, 'Actual copy boundary fired');
    assert.ok(location.root.startsWith(location.evidence+'/emmy-behavior-'), 'Recovery source stays inside normal uploaded run evidence');
    const normal = ['success', 'optional-absent', 'relative-link'].includes(mode);
    assert.equal(operations.some(value => value.fault), !['success', 'relative-link'].includes(mode), mode);
    if (mode === 'cleanup-kill') {
      assert.equal(result.signal, 'SIGKILL');
      const report = JSON.parse(await readFile(join(location.evidence, 'report.json'), 'utf8'));
      assert.equal(report.status, 'running'); assert.equal(report.cleanup.status, 'pending');
      assert.deepEqual(await files(join(location.evidence, 'records')), await files(join(at, 'original-records')));
      continue;
    }
    assert.equal(result.status, normal ? 0 : 1, result.stdout + result.stderr);
    const summary = JSON.parse(result.stdout.trim());
    if (mode === 'relative-link') assert.equal(await readlink(join(location.evidence, 'records/relative-link')), await readlink(join(at, 'original-records/relative-link')));
    assert.equal(summary.status, normal ? 'passed' : 'failed'); assert.equal(summary.source, location.root); assert.equal(summary.evidence, join(location.evidence, 'report.json'));
    if (mode === 'write-always' || mode === 'write-final') assert.equal(summary.reportSaved, false);
    else {
      const report = JSON.parse(await readFile(summary.evidence, 'utf8')); assert.equal(report.status, summary.status);
      if (mode === 'scenario-and-copy') { assert.match(report.error.message, /Expected values/); assert.ok(report.retentionErrors.length); }
      if (mode === 'cleanup-partial') assert.equal(report.cleanup.status, 'failed');
    }
    if (['records-eio', 'records-enoent', 'corrupt', 'readback', 'scenario-and-copy', 'write-once', 'write-always'].includes(mode)) {
      assert.equal(summary.cleaned, false); assert.equal(summary.cleanup, 'preserved');
      assert.deepEqual(await files(join(location.root, '.local/records')), await files(join(at, 'original-records')));
    } else assert.deepEqual(await files(join(location.evidence, 'records')), await files(join(at, 'original-records')));
  }
});
