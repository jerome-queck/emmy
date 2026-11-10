import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { canonical, digest } from '../../src/content.mjs';
import { observeAssurance } from '../../src/local-assurance.mjs';
import { planningGraph, planningSpec, planningConfig } from './graph.mjs';
import { evaluateCase } from './domain.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = join(root, '.local/verification/planning-policy', randomUUID());
await mkdir(directory, { recursive: true });
const report = { status: 'running', sourceReviewGate: !process.argv.includes('--development'), runs: [] };
const mutations = [
  ['unsupported', 'src/planning-policy.mjs', [["if (rule.predicate !== 'booking-rounded-up' || !parametersValid(rule.parameters)) add('planning-predicate-unsupported');", "if (false) add('planning-predicate-unsupported');"]], 'ResolvedAdmission'],
  ['rounding', 'src/planning-policy.mjs', [['Math.ceil(actual / parameters.incrementMinutes)', 'Math.floor(actual / parameters.incrementMinutes)']], 'ResolvedAdmission'],
  ['missing-timing', 'src/planning-policy.mjs', [["else if (!nonapplicable(context.timing, context)) add('planning-timing-unresolved');", "else if (false) add('planning-timing-unresolved');"]], 'ResolvedAdmission'],
  ['supersession-digest', 'src/planning-policy.mjs', [['ref.digest !== hash(prior) || ', '']], 'ResolvedAdmission'],
  ['supersession-overlap', 'src/planning-policy.mjs', [[' || !scopesOverlap(prior, rule)', '']], 'ResolvedAdmission'],
  ['supersession-scope', 'src/planning-policy.mjs', [["statuses.get(ruleKey(next)) === 'applicable' && ", '']], 'ViableAdmission'],
  ['duplicate-version', 'src/planning-policy.mjs', [[' || rules.has(ruleKey(rule))', '']], 'ResolvedAdmission'],
  ['selected-version', 'src/planning-policy.mjs', [['selected.push(version(rule));', 'selected.push({ ...version(rule), revision: 1 });']], 'ScopedSelection'],
  ['hard-conflict', 'src/planning-policy.mjs', [["if (new Set(hard.map(rule => canonical(rule.parameters))).size > 1) add('planning-hard-conflict');", "if (false) add('planning-hard-conflict');"]], 'ResolvedAdmission'],
  ['source-scope', 'src/planning-policy.mjs', [["if (scope.source !== '*' && scope.source !== context.source) return 'outside';", "if (false) return 'outside';"]], 'ViableAdmission'],
  ['preference-strength', 'src/planning-policy.mjs', [["rule.strength === 'hard' && rule.predicate", "rule.predicate"]], 'ViableAdmission'],
  ['native-caller', 'src/calendar-register.mjs', [['for (const finding of policy.findings) add(finding.code, finding.target);', 'for (const finding of []) add(finding.code, finding.target);'], ['for (const code of ruleAssessment?.findings ?? []) refuse(code);', 'for (const code of []) refuse(code);']], 'ResolvedAdmission'],
  ['api-caller', 'src/academic-os-task-plan.mjs', [['for (const row of semantic.findings) add(row.code);', 'for (const row of []) add(row.code);']], 'ResolvedAdmission'],
];
const modules = async path => ({ planning: await import(pathToFileURL(join(path, 'src/planning-policy.mjs'))), native: await import(pathToFileURL(join(path, 'src/calendar-register.mjs'))), api: await import(pathToFileURL(join(path, 'src/academic-os-task-plan.mjs'))) });
try {
  assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--development');
  if (report.sourceReviewGate) {
    const coverage = JSON.parse(await readFile(join(root, 'verification/planning-policy/coverage.json'), 'utf8'));
    for (const [path, expected] of Object.entries(coverage.sourceFiles)) {
      assert.equal(digest(await readFile(join(root, path))), expected, `Review planning policy mapping after ${path} changes`);
      assert.equal(digest(execFileSync('git', ['show', `${coverage.sourceCommit}:${path}`], { cwd: root })), expected, 'Planning sync commit must contain reviewed source');
    }
    for (const [path, expected] of Object.entries(coverage.verificationFiles)) assert.equal(digest(await readFile(join(root, path))), expected, `Review planning verification after ${path} changes`);
    report.coverage = coverage;
  }
  const { context } = await observeAssurance(root);
  const java = context.formal.java.path; const jar = context.formal.tlc.path; report.tools = context.formal;
  const run = async (name, module, expectedRule = null) => {
    const path = join(directory, name); await mkdir(path);
    const graph = planningGraph(module);
    assert.ok(graph.states.length <= 500, 'Keep every code-derived state visible within the chart budget');
    await writeFile(join(path, 'graph.json'), `${canonical(graph)}\n`);
    await writeFile(join(path, 'PlanningPolicy.tla'), planningSpec(graph));
    await writeFile(join(path, 'PlanningPolicy.cfg'), planningConfig);
    const labels = graph.states.map(row => row.phase === 'awaiting' ? 'Awaiting scoped operation' : row.phase === 'supplied' ? 'Rules and evidence supplied' : row.accepted && row.shouldRefuse ? 'Accepted unresolved or invalid policy' : !row.accepted && row.shouldAccept ? 'Refused valid scoped operation' : row.roundedWrong ? 'Accepted wrong booking duration' : row.selectionWrong ? 'Selected wrong rule version' : row.accepted ? 'Exact rules satisfied or evidenced inapplicable' : 'Dependent application refused');
    await writeFile(join(path, 'view.mjs'), `const labels = ${JSON.stringify(labels)};\nexport const title = 'Shared planning policy';\nexport const state = v => labels[v.node - 1];\nexport { step } from ${JSON.stringify(pathToFileURL(join(root, 'verification/planning-policy/view.mjs')).href)};\n`);
    const child = spawnSync(java, ['-XX:+UseParallelGC', '-Xmx1g', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-fp', '0', '-config', 'PlanningPolicy.cfg', 'PlanningPolicy.tla'], { cwd: path, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    const output = `${child.stdout ?? ''}${child.stderr ?? ''}`; await writeFile(join(path, 'tlc.out'), output);
    assert.equal(child.signal, null); assert.equal(child.error, undefined);
    if (expectedRule) {
      assert.notEqual(child.status, 0); assert.match(output, new RegExp(`Invariant ${expectedRule} is violated`));
      const trace = [...output.matchAll(/State \d+: <([^>\n]+)>\nnode = (\d+)/g)].map(match => ({ action: match[1].split(' ')[0], node: Number(match[2]) - 1 }));
      assert.equal(trace.length, 3, 'Counterexample must supply input then execute one actual synchronous assessment');
      const selected = graph.states[trace[1].node].case; const replay = evaluateCase(module, selected);
      assert.deepEqual(replay, graph.states[trace[2].node].assessed, 'Replay actual copied-source assessment, including caller adapter');
      if (expectedRule === 'ScopedSelection') assert.notDeepEqual(replay.resolution.selected.map(row => row.revision), selected.revisions, 'The intended selected-version disagreement must occur');
      else assert.equal(replay.ready, !selected.expected, 'The intended refusal/admission disagreement must occur, not an exception');
      await writeFile(join(path, 'actual-code-replay.json'), `${canonical({ expectedRule, trace, case: selected, replay })}\n`);
    } else { assert.equal(child.status, 0, output); assert.match(output, /Model checking completed\. No error has been found\./); }
    const counts = output.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/); assert.ok(counts);
    report.runs.push({ name, expectedRule, status: expectedRule ? 'intended-counterexample' : 'passed', nodes: graph.states.length, edges: graph.edges.length, counts: counts.slice(1), directory: path });
  };
  const production = await modules(root); await run('baseline', production);
  for (const [name, source, edits, rule] of mutations) {
    const copied = join(directory, `source-${name}`); await mkdir(copied); await cp(join(root, 'src'), join(copied, 'src'), { recursive: true });
    const target = join(copied, source); let bytes = await readFile(target, 'utf8');
    for (const [find, replacement] of edits) { assert.equal(bytes.split(find).length, 2, `Unique actual-source edit ${name}`); bytes = bytes.replace(find, replacement); }
    await writeFile(target, bytes); await run(name, await modules(copied), rule);
  }
  await run('restored', production); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: report.status, sourceReviewGate: report.sourceReviewGate, runs: report.runs.length, evidence: join(directory, 'report.json'), error: report.error?.message })}\n`);
