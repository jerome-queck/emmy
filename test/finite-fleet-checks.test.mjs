import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { digest } from '../src/content.mjs';

const source = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const area of ['fleet-health', 'morning-send']) test(`${area} actual checker refuses incomplete verification and needs no Java or TLC`, async () => {
  const root = join(source, '.local/verification/finite-fleet-cli', area, randomUUID());
  await mkdir(root, { recursive: true });
  for (const path of ['src', 'verification', '.agents', 'test/fixtures']) await cp(join(source, path), join(root, path), { recursive: true });
  await writeFile(join(root, '.gitignore'), '.local/\n');
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Synthetic checker']); git(['config', 'user.email', 'fixture@example.invalid']);
  git(['add', '.']); git(['commit', '-qm', 'Synthetic checker inputs']);
  const checker = join(root, 'verification', area, 'check.mjs');
  const original = await readFile(checker, 'utf8');
  const coverageFile = join(root, 'verification', area, 'coverage.json');
  const coverage = JSON.parse(await readFile(coverageFile));
  coverage.sourceCommit = git(['rev-parse', 'HEAD']);
  for (const [key, files] of Object.entries(coverage)) if (['sourceFiles', 'verificationFiles'].includes(key)) {
    for (const path of Object.keys(files)) files[path] = digest(await readFile(join(root, path)));
  }
  const saveCoverage = () => writeFile(coverageFile, JSON.stringify(coverage));
  await saveCoverage();
  const commands = [];
  const run = async (name, passed, pattern) => {
    const result = spawnSync(process.execPath, [`verification/${area}/check.mjs`], {
      cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, EMMY_JAVA_BIN: '/unavailable/java', JAVA: '/unavailable/java', EMMY_TLC_JAR: '/unavailable/tlc.jar', TLA2TOOLS: '/unavailable/tlc.jar' }
    });
    commands.push({ name, code: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr });
    await writeFile(join(root, '.local', 'commands.json'), JSON.stringify(commands, null, 2));
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    assert.equal(result.status, passed ? 0 : 1, result.stdout + result.stderr);
    if (pattern) assert.match(result.stdout + result.stderr, pattern);
    if (!result.stdout.trim()) return;
    const summary = JSON.parse(result.stdout.trim().split('\n').at(-1));
    const report = JSON.parse(await readFile(join(summary.evidence, 'report.json')));
    assert.equal(report.status, passed ? 'passed' : 'failed');
    assert.equal(report.java, undefined);
    if (passed) {
      assert.equal(report.runs.length, area === 'fleet-health' ? 9 : 13);
      for (const run of report.runs) {
        const files = await readdir(run.evidence);
        assert.ok(files.includes('graph.json') && files.includes('chart.mmd'));
        assert.ok(!files.some(name => /\.tla$|\.cfg$|^tlc\.out$/.test(name)));
        const graph = JSON.parse(await readFile(join(run.evidence, 'graph.json')));
        assert.equal(graph.states.length, run.states ?? run.nodes);
        if (run.expected) assert.ok(JSON.parse(await readFile(join(run.evidence, 'replay.json'))).steps.length > 0);
      }
    }
  };
  await mkdir(join(root, '.local'), { recursive: true });
  await run('no-tools', true);
  const sourcePath = join(root, 'src/fleet-state.mjs'); const bytes = await readFile(sourcePath);
  await writeFile(sourcePath, Buffer.concat([bytes, Buffer.from('\n')]));
  await run('source-pin', false, /Review source/); await writeFile(sourcePath, bytes);
  const change = async (name, from, to, pattern) => {
    assert.equal(original.split(from).length, 2);
    await writeFile(checker, original.replace(from, to));
    coverage.verificationFiles[`verification/${area}/check.mjs`] = digest(await readFile(checker)); await saveCoverage();
    await run(name, false, pattern);
  };
  if (area === 'fleet-health') {
    await change('survivor', 'source.replace(find,replace)', 'source', /Mutation survived/);
    await change('wrong-rule', "'StableEpisode']", "'Admission']", /Mutation survived Admission/);
    await change('graph-write', "writeFile(join(outdir,'graph.json'),bytes)", "writeFile(join(outdir,'missing','graph.json'),bytes)", /ENOENT/);
    await change('report-write', "writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2))", "writeFile(join(evidence,'missing','report.json'),JSON.stringify(report,null,2))", /ENOENT/);
  } else {
    await change('survivor', 'mutant=mutant.replace(from,to)', 'mutant=mutant', /Mutation survived/);
    await change('wrong-rule', "['pending-duplicate','IntentSafe'", "['pending-duplicate','DeliveryExact'", /Mutation survived DeliveryExact/);
    await change('graph-write', "writeFile(join(out,'graph.json'),bytes)", "writeFile(join(out,'missing','graph.json'),bytes)", /ENOENT/);
    await change('report-write', "writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2))", "writeFile(join(evidence,'missing','report.json'),JSON.stringify(report,null,2))", /ENOENT/);
  }
});
