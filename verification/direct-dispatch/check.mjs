import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { canonical, digest } from '../../src/content.mjs';
import { cases, evaluateCase } from './domain.mjs';
import { dispatchGraph, dispatchSpec, dispatchConfig } from './graph.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = join(root, '.local/verification/direct-dispatch', randomUUID());
await mkdir(directory, { recursive: true });
const report = { status: 'running', sourceReviewGate: !process.argv.includes('--development'), cases: cases.length, runs: [] };
const mutations = [
  ['alternative-request', 'src/dispatch.mjs', [["definitionHash: definition.hash, requiredSkill: spec.skill, attemptKey,", "definitionHash: definition.hash, requiredSkill: spec.skill, nativeCreateRequest: { prompt: definition.goal }, attemptKey,"]], 'PreparationHeld'],
  ['wrong-preparation-definition', 'src/dispatch.mjs', [["definitionHash: definition.hash, requiredSkill", "definitionHash: 'foreign', requiredSkill"]], 'PreparationHeld'],
  ['wrong-preparation-skill', 'src/dispatch.mjs', [["requiredSkill: spec.skill, attemptKey", "requiredSkill: { ...spec.skill, path: '/foreign/SKILL.md' }, attemptKey"]], 'PreparationHeld'],
  ['root-selection', 'src/dispatch.mjs', [["!selectedRoot || canonical(selectedRoot) !== canonical(root)", 'false']], 'AuthorityHeld'],
  ['root-authority', 'src/dispatch.mjs', [["!directScope(root, target, asOf) || !directScope(selectedRoot, target, asOf)", 'false']], 'AuthorityHeld'],
  ['root-identity', 'src/dispatch.mjs', [["canonical(readback.principal) !== canonical(root.principal) || readback.hostId !== root.hostId", 'false']], 'AuthorityHeld'],
  ['root-settings', 'src/dispatch.mjs', [["settings?.model !== requested.model || settings?.effort !== requested.effort || settings?.serviceTier !== speed.serviceTier", 'false']], 'AuthorityHeld'],
  ['child-policy', 'src/dispatch.mjs', [["policy ? settings.sandboxMode !== policy.sandboxMode || settings.approvalPolicy !== policy.approvalPolicy", 'policy ? false']], 'AuthorityHeld'],
  ['creation-request', 'src/dispatch.mjs', [["creation.requestDigest !== attempt.dispatch.requestDigest", 'false']], 'ProvenanceHeld'],
  ['creation-principal', 'src/dispatch.mjs', [["canonical(creation.principal) !== canonical(root.principal)", 'false']], 'ProvenanceHeld'],
  ['native-creator', 'src/dispatch.mjs', [["state.child?.creatorThreadId && state.child.creatorThreadId !== creation?.nativeCallerThreadId", 'false']], 'ProvenanceHeld'],
  ['lost-response', 'src/dispatch.mjs', [["!['attempted', 'pending', 'uncertain'].includes(state.phase) && unsettled.size", 'false']], 'HistoryHeld'],
  ['root-immutable', 'src/records.mjs', [["root: value.root, skill: value.skill", 'skill: value.skill']], 'RouteHeld'],
  ['mixed-route', 'src/records.mjs', [["value.dispatcher === undefined", 'true']], 'RouteHeld'],
  ['force-legacy-hop', 'src/dispatch.mjs', [["direct ? 'prepare-direct' : 'prepare-via-dispatcher'", "'prepare-via-dispatcher'"]], 'ViableRoute'],
  ['restored-root', 'src/dispatch.mjs', [["restoredCutoff && Date.parse(readback.observedAt) < Date.parse(restoredCutoff)", 'false'], ["restoredCutoff && Date.parse(settings.observedAt) < Date.parse(restoredCutoff)", 'false']], 'AuthorityHeld'],
  ['restored-creation', 'src/dispatch.mjs', [["epoch && Date.parse(creation.observedAt) < Date.parse(epoch.restoredAt)", 'false']], 'ProvenanceHeld'],
  ['conflicting-original-requests', 'src/dispatch.mjs', [["if (conflictingAttemptKeys.length)", 'if (false)']], 'ExactAttemptRequest'],
  ['order-dependent-original-request', 'src/dispatch.mjs', [["if (conflictingAttemptKeys.length)", 'if (conflictingAttemptKeys.length && !direct)'], ["attempts.some(attempt => creation.requestDigest !== attempt.dispatch.requestDigest)", "creation.requestDigest !== attempts[0]?.dispatch.requestDigest"]], 'ExactAttemptRequest'],
  ['order-dependent-attempt-clock', 'src/dispatch.mjs', [["attempts.some(attempt => Date.parse(creation.observedAt) < Date.parse(attempt.observedAt))", "Date.parse(creation.observedAt) < Date.parse(attempts[0]?.observedAt)"]], 'ProvenanceHeld'],
];
const modules = async path => ({ dispatch: await import(pathToFileURL(join(path, 'src/dispatch.mjs'))), records: await import(pathToFileURL(join(path, 'src/records.mjs'))), work: await import(pathToFileURL(join(path, 'src/work.mjs'))) });
try {
  assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--development');
  if (report.sourceReviewGate) {
    const coverage = JSON.parse(await readFile(join(root, 'verification/direct-dispatch/coverage.json'), 'utf8'));
    for (const [path, expected] of Object.entries(coverage.sourceFiles)) {
      assert.equal(digest(await readFile(join(root, path))), expected, `Review direct dispatch after ${path} changes`);
      assert.equal(digest(execFileSync('git', ['show', `${coverage.sourceCommit}:${path}`], { cwd: root })), expected, 'Sync commit must contain reviewed source');
    }
    for (const [path, expected] of Object.entries(coverage.verificationFiles)) assert.equal(digest(await readFile(join(root, path))), expected, `Review direct dispatch verification after ${path} changes`);
    report.coverage = coverage;
  }
  const java = process.env.EMMY_JAVA_BIN ?? (process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java') : 'java');
  const jar = process.env.EMMY_TLC_JAR ?? join(root, '.local/tools/tla2tools-1.7.4.jar');
  assert.equal(digest(await readFile(jar)), '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88', 'Use existing pinned TLC bytes');
  const version = spawnSync(java, ['-version'], { encoding: 'utf8' }); assert.equal(version.status, 0); assert.match(`${version.stdout}${version.stderr}`, /version "21\./);
  report.tools = { java, jar, javaVersion: version.stderr };
  const run = async (name, module, expectedRule = null) => {
    const path = join(directory, name); await mkdir(path);
    const graph = dispatchGraph(module); assert.ok(graph.states.length <= 500);
    await writeFile(join(path, 'graph.json'), `${canonical(graph)}\n`);
    await writeFile(join(path, 'DirectDispatch.tla'), dispatchSpec(graph));
    await writeFile(join(path, 'DirectDispatch.cfg'), dispatchConfig);
    const labels = graph.states.map(row => row.phase === 'awaiting' ? 'Awaiting scoped evidence' : row.phase === 'supplied' ? 'Scoped evidence supplied' : row.disagrees ? `Contract breaks ${row.rule}` : row.assessed.next === 'preparation-only' ? 'Preparation constraints preserved' : row.assessed.next === 'prepare-direct' ? 'Explicit direct route needs preparation' : row.assessed.next === 'prepare-via-dispatcher' ? 'Selected router needs preparation' : row.assessed.next === null ? 'Hold and inspect same objective' : row.assessed.next === 'parser-refused' || row.assessed.next === 'identity-changed' ? 'Mixed or changed route refused' : 'Inspect or continue same child');
    await writeFile(join(path, 'view.mjs'), `const labels = ${JSON.stringify(labels)};\nexport const title = 'Selected router and optional direct dispatch';\nexport const state = v => labels[v.node - 1];\nimport { step as labelStep } from ${JSON.stringify(pathToFileURL(join(root, 'verification/direct-dispatch/view.mjs')).href)};\nexport const step = (action, from, to) => labelStep(action, labels[to.node - 1]);\n`);
    const child = spawnSync(java, ['-XX:+UseParallelGC', '-Xmx1g', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-fp', '0', '-config', 'DirectDispatch.cfg', 'DirectDispatch.tla'], { cwd: path, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    const output = `${child.stdout ?? ''}${child.stderr ?? ''}`; await writeFile(join(path, 'tlc.out'), output);
    assert.equal(child.signal, null); assert.equal(child.error, undefined);
    if (expectedRule) {
      assert.notEqual(child.status, 0); assert.match(output, new RegExp(`Invariant ${expectedRule} is violated`));
      const trace = [...output.matchAll(/State \d+: <([^>\n]+)>\nnode = (\d+)/g)].map(match => ({ action: match[1].split(' ')[0], node: Number(match[2]) - 1 }));
      assert.equal(trace.length, 3, 'Supply one complete history then execute one synchronous production assessment');
      const selected = cases.find(test => test.name === graph.states[trace[1].node].case); assert.ok(selected);
      const replay = evaluateCase(module, selected);
      assert.deepEqual(replay, graph.states[trace[2].node].assessed);
      assert.notEqual(replay.next, selected.expected, 'Intended behavioral disagreement must occur');
      await writeFile(join(path, 'actual-code-replay.json'), `${canonical({ expectedRule, trace, case: selected.name, expected: selected.expected, replay })}\n`);
    } else { assert.equal(child.status, 0, output); assert.match(output, /Model checking completed\. No error has been found\./); }
    const counts = output.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/); assert.ok(counts);
    if (!expectedRule) { assert.equal(Number(counts[2].replaceAll(',', '')), graph.states.length); assert.equal(Number(counts[3]), 0); }
    report.runs.push({ name, expectedRule, status: expectedRule ? 'intended-counterexample' : 'passed', nodes: graph.states.length, edges: graph.edges.length, counts: counts.slice(1), directory: path });
  };
  const production = await modules(root); await run('baseline', production);
  for (const [name, source, edits, rule] of mutations) {
    const copy = join(directory, `source-${name}`); await cp(join(root, 'src'), join(copy, 'src'), { recursive: true });
    const path = join(copy, source); let text = await readFile(path, 'utf8');
    for (const [find, replacement] of edits) { assert.equal(text.split(find).length, 2, `One anchor for ${name}`); text = text.replace(find, replacement); }
    await writeFile(path, text); await run(name, await modules(copy), rule);
  }
  await run('restored', production); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }
await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, cases: cases.length, runs: report.runs.length, evidence: join(directory, 'report.json'), error: report.error })}\n`);
